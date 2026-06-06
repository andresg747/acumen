# halketon

A minimal TypeScript + Express backend that wraps Google Drive: OAuth 2.0 sign-in, plus list / read / upload / replace / patch file endpoints. Built for hackathon speed — single-user, local token storage, no database.

> **This is not production-grade auth.** Tokens are stored in a local JSON file. Use it for a demo or a single-developer integration, not a multi-tenant service.

## Quick start

```bash
cp .env.example .env
# Fill in GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (see Google Cloud setup below)

npm install
npm run dev
# → http://localhost:3000

# In a browser, kick off the OAuth dance:
open http://localhost:3000/auth/google
```

After Google bounces you back to `/auth/google/callback`, a `google-token.json` file appears at the repo root. The server can now make Drive calls on your behalf.

## Google Cloud setup

1. Go to <https://console.cloud.google.com/> and create (or pick) a project.
2. **Enable the Google Drive API** under *APIs & Services → Library*.
3. **Configure the OAuth consent screen** (External is fine for testing). Add your Google account as a **Test user** so you don't need app verification.
4. **Create OAuth credentials**: *APIs & Services → Credentials → Create Credentials → OAuth client ID → Web application*.
   - Authorized redirect URI: `http://localhost:3000/auth/google/callback`
5. Copy the **Client ID** and **Client secret** into `.env`.

### Scope choice — drive.file vs drive

The default scope is `https://www.googleapis.com/auth/drive.file`. With that scope your app **can only see files it created or that the user explicitly opened via a Picker**. That's the right choice for a hackathon: it's a *non-sensitive* scope and Google won't make you go through verification.

If you need to read arbitrary files already in the user's Drive, set:

```env
GOOGLE_DRIVE_SCOPES=https://www.googleapis.com/auth/drive
```

…but be aware this is a **restricted** scope and Google requires app verification + (for some org types) a CASA security assessment before allowing production users. Fine for test users on your own Google account; not fine for a real launch without doing the homework.

## Environment variables

| Name | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Server port |
| `GOOGLE_CLIENT_ID` | *(required)* | OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | *(required)* | OAuth client secret. `GOOGLE_API_CLIENT_SECRET` is accepted as a fallback alias. |
| `GOOGLE_REDIRECT_URI` | `http://localhost:3000/auth/google/callback` | Must match the redirect URI registered in Google Cloud |
| `GOOGLE_DRIVE_SCOPES` | `https://www.googleapis.com/auth/drive.file` | Space- or comma-separated scopes |
| `GOOGLE_TOKEN_PATH` | `./google-token.json` | Where the refresh/access tokens are persisted |

## App environment flag (`NEXT_PUBLIC_APP_ENV`)

The Next.js frontend uses a single flag to switch between a credential-free demo
mode and a real, authenticated mode. It is read in `lib/app-env.ts`:

```ts
export const APP_ENV =
  process.env.NEXT_PUBLIC_APP_ENV?.toLowerCase() === 'prod' ? 'prod' : 'dev';

export const isProd = APP_ENV === 'prod';
export const isDev = !isProd;
```

| Value | Authentication | Data | Demo toggle |
| --- | --- | --- | --- |
| `dev` *(default)* | **Bypassed** — clicking *Iniciar sesión* / *Crear una cuenta* simulates success and routes straight into the app | Dashboard shows **mock/sample data** | "Ver con datos / Ver estado vacío" toggle is visible |
| `prod` | **Real Google OAuth** — buttons call `/api/auth/google`, the session is verified via `/api/auth/status`, and `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are required | **No mock data** — only real data is rendered | Toggle is hidden |

### How it works

- **`NEXT_PUBLIC_` prefix:** the value is inlined at build time, so the same flag
  works in both Server and Client Components (the onboarding buttons and the
  dashboard read it in the browser).
- **Default is `dev`:** if the variable is unset or anything other than `prod`,
  the app falls back to `dev`. This keeps local previews working without Google
  credentials.
- **Where it branches:**
  - `app/components/onboarding.tsx` — in `dev` it fakes a successful sign-in; in
    `prod` it kicks off the real OAuth redirect.
  - `app/page.tsx` — in `prod` it checks `/api/auth/status` on load (and clears
    the session through `/api/auth/logout` on sign-out); in `dev` it skips the
    check entirely.
  - `app/components/dashboard.tsx` — the mock data and the demo toggle only
    exist in `dev`.

### Setting it

- **Local / preview:** leave it unset (defaults to `dev`) or set `NEXT_PUBLIC_APP_ENV=dev`.
- **Production deployment:** set `NEXT_PUBLIC_APP_ENV=prod` and make sure
  `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are also configured.

```env
# .env (frontend mode)
NEXT_PUBLIC_APP_ENV=dev   # or "prod"
```

## Endpoints

### Health & auth

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/health` | Liveness probe |
| `GET` | `/auth/google` | Redirects to Google consent. Append `?redirect=0` to receive `{ url }` as JSON instead. |
| `GET` | `/auth/google/callback` | OAuth callback. Stores tokens locally. |
| `GET` | `/auth/status` | `{ authenticated: boolean }` — no token values leaked. |

### Drive

All Drive endpoints return `401 { "error": "Not authenticated…" }` if you haven't completed `/auth/google` yet.

| Method | Path | Body / Query |
| --- | --- | --- |
| `GET` | `/drive/files?query=&pageSize=&pageToken=` | `query` uses [Drive search syntax](https://developers.google.com/drive/api/guides/search-files) |
| `GET` | `/drive/files/:fileId` | Returns metadata |
| `GET` | `/drive/files/:fileId/content` | Streams binary content. Google Docs/Sheets/Slides are auto-exported (docx/xlsx/pptx by default; override with `?mimeType=…`) |
| `POST` | `/drive/files` | `multipart/form-data` with `file` (binary), optional `name`, `parentId` |
| `PUT` | `/drive/files/:fileId` | `multipart/form-data` with `file`, optional `name` — replaces content |
| `PATCH` | `/drive/files/:fileId/metadata` | JSON body with any of `name`, `description`, `starred`, `mimeType`, `appProperties`, `addParents`, `removeParents` |

## curl examples

```bash
# 1. Check auth state
curl -s http://localhost:3000/auth/status

# 2. List the 10 most-recently-modified files this app can see
curl -s "http://localhost:3000/drive/files?pageSize=10"

# 3. Search for files by name
curl -s --get http://localhost:3000/drive/files \
  --data-urlencode "query=name contains 'hackathon'"

# 4. Get metadata
curl -s http://localhost:3000/drive/files/FILE_ID

# 5. Download content
curl -s -o ./out.bin http://localhost:3000/drive/files/FILE_ID/content

# 6. Upload a new file
curl -s -X POST http://localhost:3000/drive/files \
  -F "file=@./demo.txt" \
  -F "name=demo-from-halketon.txt"

# 7. Replace file content
curl -s -X PUT http://localhost:3000/drive/files/FILE_ID \
  -F "file=@./demo-v2.txt"

# 8. Patch metadata (rename + star)
curl -s -X PATCH http://localhost:3000/drive/files/FILE_ID/metadata \
  -H "Content-Type: application/json" \
  -d '{"name":"renamed.txt","starred":true}'
```

## Scripts

```bash
npm run dev         # tsx watch
npm run build       # tsc -> dist/
npm start           # node dist/index.js
npm run typecheck   # tsc --noEmit
npm test            # node --test smoke test (no Google credentials required)
```

## Notes

- **Single-user.** The token file is shared across all callers of this server. Anyone who can hit the server can act as the user who authenticated.
- **Refresh tokens.** `prompt=consent` is forced so Google always returns a `refresh_token` on first sign-in. The `googleapis` client auto-refreshes access tokens and persists them via the `tokens` event handler in `src/google.ts`.
- **Token safety.** `.gitignore` excludes both `.env` and `google-token.json`. Error responses scrub any obvious access/refresh token shapes before going out.
- **File size cap.** Multer is configured with a 50 MB cap for uploads; raise it in `src/routes/drive.ts` if you need more.
