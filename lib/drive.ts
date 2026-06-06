import 'server-only';
import type { drive_v3 } from 'googleapis';

export const DEFAULT_FILE_FIELDS =
  'id, name, mimeType, size, modifiedTime, createdTime, parents, owners, webViewLink, iconLink, starred, description';

export const ACUMEN_FOLDER_NAME = 'ACUMEN';
export const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

/** Folders inside ACUMEN whose names start with this prefix are system folders, not projects. */
export const SYSTEM_FOLDER_PREFIX = '_';
/** Canonical name of the system folder where inbound questions are archived. */
export const PREGUNTAS_FOLDER_NAME = '_PREGUNTAS';

export function isSystemFolderName(name: string | null | undefined): boolean {
  return typeof name === 'string' && name.startsWith(SYSTEM_FOLDER_PREFIX);
}

export interface AcumenFolder {
  id: string;
  name?: string | null;
}

/** Escape a string for safe use inside a Drive v3 query literal. */
export function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * Find every root-level, non-trashed ACUMEN folder visible to this OAuth grant.
 * Multiple folders can exist if an earlier drive.file grant created an app-owned
 * ACUMEN folder while a user-created ACUMEN folder was invisible to the app.
 */
export async function findAcumenFolders(drive: drive_v3.Drive): Promise<AcumenFolder[]> {
  const name = escapeDriveQueryValue(ACUMEN_FOLDER_NAME);
  const q = `name = '${name}' and mimeType = '${FOLDER_MIME_TYPE}' and 'root' in parents and trashed = false`;
  const result = await drive.files.list({
    q,
    fields: 'files(id, name, createdTime)',
    pageSize: 100,
    spaces: 'drive',
    // Oldest first — keeps the canonical ACUMEN choice stable when duplicates
    // exist (e.g., after an OAuth scope change made a previous folder invisible).
    orderBy: 'createdTime',
  });
  const folders = (result.data.files ?? [])
    .filter((file): file is drive_v3.Schema$File & { id: string } => !!file.id)
    .map((file) => ({ id: file.id, name: file.name }));
  if (folders.length > 1) {
    // eslint-disable-next-line no-console
    console.warn(
      `[halketon] Found ${folders.length} root-level ACUMEN folders. Using the oldest (${folders[0].id}). Consider trashing duplicates in Drive.`,
    );
  }
  return folders;
}

/**
 * Find the user's root-level, non-trashed ACUMEN folder, if any.
 * Returns the folder id, or null if it does not exist.
 */
export async function findAcumenFolder(drive: drive_v3.Drive): Promise<string | null> {
  return (await findAcumenFolders(drive))[0]?.id ?? null;
}

/**
 * Ensure a root-level ACUMEN folder exists for the authenticated user.
 * Returns the folder id, creating it if necessary.
 */
export async function ensureAcumenFolder(drive: drive_v3.Drive): Promise<string> {
  const existing = await findAcumenFolder(drive);
  if (existing) return existing;
  const created = await drive.files.create({
    requestBody: {
      name: ACUMEN_FOLDER_NAME,
      mimeType: FOLDER_MIME_TYPE,
      parents: ['root'],
    },
    fields: 'id',
  });
  const id = created.data.id;
  if (!id) throw new Error('Drive did not return an id for the new ACUMEN folder');
  return id;
}

/**
 * Ensure at least one ACUMEN folder exists, then return all root-level ACUMEN
 * folders visible to the app. Listing across all visible root ACUMEN folders
 * avoids the stale-cookie/duplicate-folder trap after upgrading from drive.file
 * to full Drive scope during a demo.
 */
export async function ensureAcumenFolders(drive: drive_v3.Drive): Promise<AcumenFolder[]> {
  const existing = await findAcumenFolders(drive);
  if (existing.length > 0) return existing;
  const id = await ensureAcumenFolder(drive);
  return [{ id, name: ACUMEN_FOLDER_NAME }];
}

/**
 * Ensure the `_PREGUNTAS` system folder exists as a direct child of ACUMEN.
 * Returns its id. Idempotent.
 */
export async function ensurePreguntasFolder(
  drive: drive_v3.Drive,
  acumenFolderId: string,
): Promise<string> {
  const safeName = escapeDriveQueryValue(PREGUNTAS_FOLDER_NAME);
  const safeParent = escapeDriveQueryValue(acumenFolderId);
  const q = `name = '${safeName}' and mimeType = '${FOLDER_MIME_TYPE}' and '${safeParent}' in parents and trashed = false`;
  const res = await drive.files.list({
    q,
    fields: 'files(id)',
    pageSize: 1,
    spaces: 'drive',
  });
  const existing = res.data.files?.[0]?.id;
  if (existing) return existing;
  const created = await drive.files.create({
    requestBody: {
      name: PREGUNTAS_FOLDER_NAME,
      mimeType: FOLDER_MIME_TYPE,
      parents: [acumenFolderId],
    },
    fields: 'id',
  });
  const id = created.data.id;
  if (!id) throw new Error('Drive did not return an id for the _PREGUNTAS folder');
  return id;
}

/**
 * List the direct child folders of ACUMEN (each represents a project).
 * Nested folders are intentionally NOT returned — Hermes only files one level
 * deep, and the app's contract is "everything stays inside ACUMEN".
 *
 * NOTE: includes system folders (those starting with `_`). Filter with
 * `isSystemFolderName()` for project routing.
 */
export async function listAcumenChildFolders(
  drive: drive_v3.Drive,
  acumenFolderId: string,
): Promise<AcumenFolder[]> {
  const parent = escapeDriveQueryValue(acumenFolderId);
  const q = `'${parent}' in parents and mimeType = '${FOLDER_MIME_TYPE}' and trashed = false`;
  const res = await drive.files.list({
    q,
    fields: 'files(id, name)',
    pageSize: 500,
    spaces: 'drive',
    orderBy: 'name',
  });
  return (res.data.files ?? [])
    .filter((file): file is drive_v3.Schema$File & { id: string } => !!file.id)
    .map((file) => ({ id: file.id, name: file.name }));
}

export function buildAcumenParentsClause(folderIds: string[]): string {
  const ids = [...new Set(folderIds)].filter(Boolean);
  if (ids.length === 0) throw new Error('No ACUMEN folder ids available');
  const parentChecks = ids.map((id) => `'${escapeDriveQueryValue(id)}' in parents`);
  const parentClause = parentChecks.length === 1 ? parentChecks[0] : `(${parentChecks.join(' or ')})`;
  return `${parentClause} and trashed = false`;
}

/**
 * Throws a 403-style error if the given file is not parented under the
 * ACUMEN folder. Reads only the `parents` field for efficiency.
 */
export async function assertFileInAcumen(
  drive: drive_v3.Drive,
  fileId: string,
  acumenFolderId: string | string[],
): Promise<void> {
  const result = await drive.files.get({ fileId, fields: 'id, parents' });
  const parents = result.data.parents ?? [];
  const allowedFolderIds = Array.isArray(acumenFolderId) ? acumenFolderId : [acumenFolderId];
  if (!allowedFolderIds.some((id) => parents.includes(id))) {
    const err = new Error('File is not inside the ACUMEN folder') as Error & {
      status: number;
    };
    err.status = 403;
    throw err;
  }
}

export const EXPORT_MAP: Record<string, { mime: string; ext: string }> = {
  'application/vnd.google-apps.document': {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ext: 'docx',
  },
  'application/vnd.google-apps.spreadsheet': {
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ext: 'xlsx',
  },
  'application/vnd.google-apps.presentation': {
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ext: 'pptx',
  },
  'application/vnd.google-apps.drawing': {
    mime: 'image/png',
    ext: 'png',
  },
  'application/vnd.google-apps.script': {
    mime: 'application/vnd.google-apps.script+json',
    ext: 'json',
  },
};

export function parsePageSize(raw: string | null): number {
  const fallback = 25;
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(1000, n));
}

export function nonEmpty(v: string | null | undefined): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}
