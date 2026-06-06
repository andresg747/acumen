import 'server-only';
import { Readable } from 'node:stream';
import type { drive_v3 } from 'googleapis';
import { escapeDriveQueryValue } from './drive';

export const PROYECTOS_MD_NAME = 'PROYECTOS.md';
export const TIMELINE_CSV_NAME = 'TIMELINE.csv';

export interface LedgerEntry {
  receivedAt: Date;
  from: string;
  kind: string;
  project: string | null;
  filename: string;
  summary: string;
  webViewLink?: string;
}

async function findFileByName(
  drive: drive_v3.Drive,
  parentId: string,
  name: string,
): Promise<string | null> {
  const safeName = escapeDriveQueryValue(name);
  const safeParent = escapeDriveQueryValue(parentId);
  const q = `name = '${safeName}' and '${safeParent}' in parents and trashed = false`;
  const res = await drive.files.list({
    q,
    fields: 'files(id)',
    pageSize: 1,
    spaces: 'drive',
  });
  return res.data.files?.[0]?.id ?? null;
}

async function downloadText(drive: drive_v3.Drive, fileId: string): Promise<string> {
  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'text' },
  );
  return typeof res.data === 'string' ? res.data : String(res.data ?? '');
}

async function upsertText(params: {
  drive: drive_v3.Drive;
  parentFolderId: string;
  name: string;
  mimeType: string;
  content: string;
  existingId: string | null;
}): Promise<void> {
  const body = Readable.from(Buffer.from(params.content, 'utf8'));
  if (params.existingId) {
    await params.drive.files.update({
      fileId: params.existingId,
      media: { mimeType: params.mimeType, body },
    });
    return;
  }
  await params.drive.files.create({
    requestBody: {
      name: params.name,
      mimeType: params.mimeType,
      parents: [params.parentFolderId],
    },
    media: { mimeType: params.mimeType, body },
  });
}

function csvEscape(field: string): string {
  if (/[",\n\r]/.test(field)) return `"${field.replace(/"/g, '""')}"`;
  return field;
}

const CSV_HEADER = 'timestamp,from,kind,project,filename,summary,link\n';

/**
 * Append a new row to TIMELINE.csv. Header is written on first creation. Rows
 * are appended in arrival order so the CSV is a true time series.
 */
export async function appendToTimelineCsv(
  drive: drive_v3.Drive,
  acumenFolderId: string,
  entry: LedgerEntry,
): Promise<void> {
  const existingId = await findFileByName(drive, acumenFolderId, TIMELINE_CSV_NAME);
  let previous = existingId ? await downloadText(drive, existingId) : '';
  if (!previous.startsWith('timestamp,')) previous = CSV_HEADER;

  const row =
    [
      entry.receivedAt.toISOString(),
      entry.from,
      entry.kind,
      entry.project ?? '',
      entry.filename,
      entry.summary,
      entry.webViewLink ?? '',
    ]
      .map(csvEscape)
      .join(',') + '\n';

  await upsertText({
    drive,
    parentFolderId: acumenFolderId,
    name: TIMELINE_CSV_NAME,
    mimeType: 'text/csv',
    content: previous + row,
    existingId,
  });
}
