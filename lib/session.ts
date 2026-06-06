import 'server-only';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import type { Credentials } from 'google-auth-library';
import fs from 'node:fs/promises';
import { loadConfig } from './config';

export const SESSION_COOKIE = 'halketon_session';

export interface SessionState {
  creds: Credentials;
  acumenFolderId?: string;
}

function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(secret, 'utf8').digest();
}

function encryptJSON(value: unknown): string {
  const key = deriveKey(loadConfig().authSecret);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    'v1',
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

function decryptJSON(token: string): unknown {
  const [version, ivB64, tagB64, dataB64] = token.split('.');
  if (version !== 'v1' || !ivB64 || !tagB64 || !dataB64) return null;
  const key = deriveKey(loadConfig().authSecret);
  const iv = Buffer.from(ivB64, 'base64url');
  const tag = Buffer.from(tagB64, 'base64url');
  const data = Buffer.from(dataB64, 'base64url');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8'));
}

function looksLikeCredentials(v: unknown): v is Credentials {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.access_token === 'string' ||
    typeof o.refresh_token === 'string' ||
    typeof o.id_token === 'string' ||
    typeof o.expiry_date === 'number'
  );
}

function parseSessionState(raw: unknown): SessionState | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.creds && typeof o.creds === 'object') {
    const acumen = typeof o.acumenFolderId === 'string' ? o.acumenFolderId : undefined;
    return { creds: o.creds as Credentials, acumenFolderId: acumen };
  }
  // Legacy: cookie or token file stored bare Credentials.
  if (looksLikeCredentials(raw)) {
    return { creds: raw };
  }
  return null;
}

export function encryptCredentials(creds: Credentials): string {
  return encryptJSON({ creds });
}

export function decryptCredentials(token: string): Credentials | null {
  try {
    const raw = decryptJSON(token);
    const state = parseSessionState(raw);
    return state?.creds ?? null;
  } catch {
    return null;
  }
}

interface CookieOptions {
  httpOnly: true;
  sameSite: 'lax';
  secure: boolean;
  path: '/';
  maxAge?: number;
}

function cookieOptions(maxAge?: number): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: loadConfig().isProduction,
    path: '/',
    ...(maxAge !== undefined ? { maxAge } : {}),
  };
}

export async function readSessionState(): Promise<SessionState | null> {
  const store = await cookies();
  const value = store.get(SESSION_COOKIE)?.value;
  if (value) {
    try {
      const raw = decryptJSON(value);
      const state = parseSessionState(raw);
      if (state) return state;
    } catch {
      // fall through to file fallback
    }
  }
  return readTokenFileFallback();
}

export async function writeSessionState(state: SessionState): Promise<void> {
  const store = await cookies();
  // 30 days. Refresh tokens last longer but cookie size + privacy: rotate often.
  store.set(SESSION_COOKIE, encryptJSON(state), cookieOptions(60 * 60 * 24 * 30));

  // Best-effort: mirror credentials to local token file if configured (dev convenience).
  const cfg = loadConfig();
  if (cfg.google.tokenPath) {
    try {
      await fs.writeFile(cfg.google.tokenPath, JSON.stringify(state.creds, null, 2), {
        mode: 0o600,
      });
    } catch {
      // Non-fatal: cookie is authoritative.
    }
  }
}

export async function readSessionCredentials(): Promise<Credentials | null> {
  const state = await readSessionState();
  return state?.creds ?? null;
}

export async function writeSessionCredentials(creds: Credentials): Promise<void> {
  const existing = await readSessionState();
  await writeSessionState({
    creds,
    acumenFolderId: existing?.acumenFolderId,
  });
}

export async function readAcumenFolderId(): Promise<string | null> {
  const state = await readSessionState();
  return state?.acumenFolderId ?? null;
}

export async function writeAcumenFolderId(folderId: string): Promise<void> {
  const existing = await readSessionState();
  if (!existing) return;
  await writeSessionState({ ...existing, acumenFolderId: folderId });
}

export async function clearSessionCredentials(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, '', cookieOptions(0));
}

async function readTokenFileFallback(): Promise<SessionState | null> {
  const cfg = loadConfig();
  if (!cfg.google.tokenPath) return null;
  try {
    const raw = await fs.readFile(cfg.google.tokenPath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    return parseSessionState(parsed);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    return null;
  }
}
