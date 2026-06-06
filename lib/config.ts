import 'server-only';
import path from 'node:path';

function pickEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const v = process.env[name];
    if (v && v.trim() !== '') return v.trim();
  }
  return undefined;
}

function requireEnv(name: string): string {
  const v = pickEnv(name);
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

function requireEnvWithAliases(primary: string, aliases: string[]): string {
  const v = pickEnv(primary, ...aliases);
  if (v) return v;
  throw new Error(
    `Missing required environment variable: ${[primary, ...aliases].join(' or ')}`,
  );
}

function isVercel(): boolean {
  return Boolean(process.env.VERCEL);
}

function defaultRedirectUri(): string {
  if (isVercel() && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}/api/auth/google/callback`;
  }
  return 'http://localhost:3000/api/auth/google/callback';
}

function deriveDevAuthSecret(): string {
  // Stable per-machine insecure fallback, ONLY for local dev. Warn loudly.
  if (process.env.NODE_ENV === 'production' || isVercel()) {
    throw new Error(
      'AUTH_SECRET (or OAUTH_COOKIE_SECRET) must be set in production. ' +
        'Generate one with: openssl rand -base64 48',
    );
  }
  // eslint-disable-next-line no-console
  console.warn(
    '[halketon] AUTH_SECRET not set — using insecure dev fallback. ' +
      'Do NOT use this in production. Set AUTH_SECRET in .env.',
  );
  return 'halketon-dev-only-insecure-fallback-secret-do-not-use-in-prod';
}

export interface AppConfig {
  google: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    scopes: string[];
    tokenPath: string | null;
  };
  authSecret: string;
  isProduction: boolean;
}

let cached: AppConfig | undefined;

export function loadConfig(): AppConfig {
  if (cached) return cached;

  const scopesRaw =
    pickEnv('GOOGLE_DRIVE_SCOPES') ?? 'https://www.googleapis.com/auth/drive.file';
  const scopes = scopesRaw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const tokenPathRaw = pickEnv('GOOGLE_TOKEN_PATH');
  const tokenPath =
    tokenPathRaw && !isVercel()
      ? path.resolve(/* turbopackIgnore: true */ process.cwd(), tokenPathRaw)
      : null;

  const authSecret = pickEnv('AUTH_SECRET', 'OAUTH_COOKIE_SECRET') ?? deriveDevAuthSecret();

  cached = {
    google: {
      clientId: requireEnv('GOOGLE_CLIENT_ID'),
      clientSecret: requireEnvWithAliases('GOOGLE_CLIENT_SECRET', [
        'GOOGLE_API_CLIENT_SECRET',
      ]),
      redirectUri: pickEnv('GOOGLE_REDIRECT_URI') ?? defaultRedirectUri(),
      scopes,
      tokenPath,
    },
    authSecret,
    isProduction: process.env.NODE_ENV === 'production',
  };

  return cached;
}

// Defence-in-depth: never echo token-shaped strings back in error messages.
export function scrubMessage(msg: string): string {
  return msg
    .replace(/ya29\.[A-Za-z0-9_\-]+/g, '<redacted-token>')
    .replace(/1\/\/[A-Za-z0-9_\-]+/g, '<redacted-token>');
}
