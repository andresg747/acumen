// Client-safe environment flag.
//
// Set NEXT_PUBLIC_APP_ENV to "prod" or "dev" (defaults to "dev").
//   - dev:  auth is bypassed and the UI shows mock/sample data.
//   - prod: real Google OAuth is used (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)
//           and no mock data is shown.
//
// NEXT_PUBLIC_* vars are inlined at build time, so this works in both Server
// and Client Components.

export type AppEnv = 'dev' | 'prod';

export const APP_ENV: AppEnv =
  process.env.NEXT_PUBLIC_APP_ENV?.toLowerCase() === 'prod' ? 'prod' : 'dev';

export const isProd = APP_ENV === 'prod';
export const isDev = !isProd;
