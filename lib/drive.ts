import 'server-only';
import type { drive_v3 } from 'googleapis';

export const DEFAULT_FILE_FIELDS =
  'id, name, mimeType, size, modifiedTime, createdTime, parents, owners, webViewLink, iconLink, starred, description';

export const ACUMEN_FOLDER_NAME = 'ACUMEN';
export const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

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
    fields: 'files(id, name)',
    pageSize: 100,
    spaces: 'drive',
  });
  return (result.data.files ?? [])
    .filter((file): file is drive_v3.Schema$File & { id: string } => !!file.id)
    .map((file) => ({ id: file.id, name: file.name }));
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
