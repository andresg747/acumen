import 'server-only';
import fs from 'node:fs/promises';
import { google, drive_v3 } from 'googleapis';
import type { Credentials, OAuth2Client } from 'google-auth-library';
import { loadConfig } from './config';
import { ensureAcumenFolder } from './drive';
import {
  readSessionCredentials,
  readSessionState,
  writeSessionCredentials,
  writeSessionState,
} from './session';

export class AuthRequiredError extends Error {
  readonly status = 401;
  constructor(message = 'Authentication required') {
    super(message);
    this.name = 'AuthRequiredError';
  }
}

function newOAuthClient(): OAuth2Client {
  const cfg = loadConfig();
  return new google.auth.OAuth2(
    cfg.google.clientId,
    cfg.google.clientSecret,
    cfg.google.redirectUri,
  );
}

/**
 * Return an OAuth2 client with no credentials attached. Use for kicking off
 * the consent flow or exchanging an authorization code.
 */
export function getAnonymousOAuthClient(): OAuth2Client {
  return newOAuthClient();
}

export function getAuthUrl(): string {
  const cfg = loadConfig();
  return getAnonymousOAuthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: cfg.google.scopes,
    include_granted_scopes: true,
  });
}

export async function exchangeCodeForTokens(code: string): Promise<Credentials> {
  const client = getAnonymousOAuthClient();
  const { tokens } = await client.getToken(code);
  return tokens;
}

/**
 * Return a Drive client wired to the credentials in the current request's
 * session cookie. If the access token gets refreshed during the call, the
 * fresh credentials are persisted back to the cookie.
 *
 * Throws AuthRequiredError if no usable credentials are present.
 */
export async function getDriveClient(): Promise<drive_v3.Drive> {
  const stored = await readSessionCredentials();
  if (!stored || (!stored.access_token && !stored.refresh_token)) {
    throw new AuthRequiredError('Not authenticated. Visit /api/auth/google first.');
  }
  const client = newOAuthClient();
  client.setCredentials(stored);

  client.on('tokens', (next) => {
    const merged: Credentials = { ...stored, ...next };
    if (!merged.refresh_token && stored.refresh_token) {
      merged.refresh_token = stored.refresh_token;
    }
    // Best-effort: fire-and-forget the cookie write. cookies() must be
    // called inside a request scope; refresh during a request is fine.
    void writeSessionCredentials(merged).catch(() => {
      // Cookie write failure is non-fatal — next request will refresh again.
    });
  });

  return google.drive({ version: 'v3', auth: client });
}

export async function hasSessionCredentials(): Promise<boolean> {
  const creds = await readSessionCredentials();
  return !!(creds && (creds.access_token || creds.refresh_token));
}

/**
 * Build a Drive client directly from a set of credentials, without reading
 * from the session cookie. Useful immediately after token exchange when the
 * cookie has not yet been written to the response.
 */
export function getDriveClientForCredentials(creds: Credentials): drive_v3.Drive {
  const client = newOAuthClient();
  client.setCredentials(creds);
  return google.drive({ version: 'v3', auth: client });
}

/**
 * Resolve credentials for the service path used by background workers (e.g.
 * the Kapso webhook). Reads from GOOGLE_REFRESH_TOKEN first (production-style,
 * paste once into env and forget), then falls back to GOOGLE_TOKEN_PATH (dev
 * convenience, populated by the OAuth callback when the user OAuths via
 * browser). NEVER touches cookies.
 */
async function resolveServiceCredentials(): Promise<Credentials> {
  const fromEnv = process.env.GOOGLE_REFRESH_TOKEN?.trim();
  if (fromEnv) {
    return { refresh_token: fromEnv };
  }
  const cfg = loadConfig();
  if (!cfg.google.tokenPath) {
    throw new AuthRequiredError(
      'No service credentials available. Set GOOGLE_REFRESH_TOKEN or configure GOOGLE_TOKEN_PATH and OAuth via /api/auth/google.',
    );
  }
  let raw: string;
  try {
    raw = await fs.readFile(cfg.google.tokenPath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new AuthRequiredError(
        `Service token file missing at ${cfg.google.tokenPath}. OAuth via /api/auth/google first.`,
      );
    }
    throw err;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AuthRequiredError('Service token file is not valid JSON.');
  }
  const creds = unwrapCredentials(parsed);
  if (!creds || (!creds.refresh_token && !creds.access_token)) {
    throw new AuthRequiredError('Service token file does not contain usable credentials.');
  }
  return creds;
}

function unwrapCredentials(value: unknown): Credentials | null {
  if (!value || typeof value !== 'object') return null;
  const o = value as Record<string, unknown>;
  if (typeof o.refresh_token === 'string' || typeof o.access_token === 'string') {
    return o as Credentials;
  }
  if (o.creds && typeof o.creds === 'object') {
    const inner = o.creds as Record<string, unknown>;
    if (typeof inner.refresh_token === 'string' || typeof inner.access_token === 'string') {
      return inner as Credentials;
    }
  }
  return null;
}

/**
 * Drive client for server-to-server use (no cookie, no session state).
 * Auth comes from GOOGLE_REFRESH_TOKEN env or GOOGLE_TOKEN_PATH file. Access
 * tokens are refreshed in-memory per request — there is intentionally no
 * persistence of refreshed tokens, so the source of truth stays in env/file.
 */
export async function getServiceDriveClient(): Promise<drive_v3.Drive> {
  const creds = await resolveServiceCredentials();
  const client = newOAuthClient();
  client.setCredentials(creds);
  return google.drive({ version: 'v3', auth: client });
}

/**
 * Return the ACUMEN folder id for the current session, ensuring it exists
 * in Drive if necessary and persisting the id to the session cookie.
 */
export async function getOrCreateAcumenFolderId(): Promise<string> {
  const state = await readSessionState();
  if (!state || (!state.creds.access_token && !state.creds.refresh_token)) {
    throw new AuthRequiredError();
  }
  const drive = await getDriveClient();
  const folderId = await ensureAcumenFolder(drive);
  if (state.acumenFolderId !== folderId) {
    await writeSessionState({ ...state, acumenFolderId: folderId });
  }
  return folderId;
}
