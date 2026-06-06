import 'server-only';
import { Readable } from 'node:stream';
import type { drive_v3 } from 'googleapis';
import {
  FOLDER_MIME_TYPE,
  escapeDriveQueryValue,
  isSystemFolderName,
  listAcumenChildFolders,
} from './drive';
import { PROYECTOS_MD_NAME, TIMELINE_CSV_NAME } from './ledger';

const TITLE = '# Inventario de ACUMEN';
const SUBTITLE = '_Resumen del contenido por carpeta. Se actualiza solo._';
const ROOT_LABEL = 'ACUMEN (raíz)';
const INVENTORY_OWN_FILES = new Set([PROYECTOS_MD_NAME, TIMELINE_CSV_NAME]);

interface ListedFile {
  id: string;
  name: string;
}

interface FolderSection {
  name: string;
  files: ListedFile[];
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

async function listNonFolderChildren(
  drive: drive_v3.Drive,
  parentId: string,
): Promise<ListedFile[]> {
  const parent = escapeDriveQueryValue(parentId);
  const q = `'${parent}' in parents and trashed = false and mimeType != '${FOLDER_MIME_TYPE}'`;
  const out: ListedFile[] = [];
  let pageToken: string | undefined;
  do {
    const res = await drive.files.list({
      q,
      fields: 'nextPageToken, files(id, name)',
      pageSize: 1000,
      pageToken,
      spaces: 'drive',
      orderBy: 'name',
    });
    for (const f of res.data.files ?? []) {
      if (f.id && f.name) out.push({ id: f.id, name: f.name });
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return out;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else if (c === ',') {
      out.push(cur);
      cur = '';
    } else if (c === '"' && cur === '') {
      inQuotes = true;
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

// Header (see ledger.ts): timestamp,from,kind,project,filename,summary,link
async function loadSummariesFromTimeline(
  drive: drive_v3.Drive,
  acumenFolderId: string,
): Promise<Map<string, string>> {
  const timelineId = await findFileByName(drive, acumenFolderId, TIMELINE_CSV_NAME);
  if (!timelineId) return new Map();
  const res = await drive.files.get(
    { fileId: timelineId, alt: 'media' },
    { responseType: 'text' },
  );
  const text = typeof res.data === 'string' ? res.data : String(res.data ?? '');
  const map = new Map<string, string>();
  const lines = text.split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const cells = parseCsvLine(lines[i]);
    if (cells.length < 6) continue;
    const filename = cells[4];
    const summary = cells[5];
    if (filename && summary) map.set(filename, summary);
  }
  return map;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function formatUpdatedAt(d: Date): string {
  const months = [
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'octubre',
    'noviembre',
    'diciembre',
  ];
  return `${d.getDate()} de ${months[d.getMonth()]} de ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function renderInventory(
  sections: FolderSection[],
  summaries: Map<string, string>,
  now: Date,
): string {
  const lines: string[] = [TITLE, '', SUBTITLE, ''];
  for (const section of sections) {
    lines.push(`## ${section.name}`);
    if (section.files.length === 0) {
      lines.push('_Vacía._');
    } else {
      for (const file of section.files) {
        const summary = summaries.get(file.name);
        lines.push(summary ? `- **${file.name}** — ${summary}` : `- **${file.name}**`);
      }
    }
    lines.push('');
  }
  lines.push('---', `_Actualizado: ${formatUpdatedAt(now)}_`, '');
  return lines.join('\n');
}

async function upsertInventoryFile(
  drive: drive_v3.Drive,
  acumenFolderId: string,
  content: string,
): Promise<void> {
  const existingId = await findFileByName(drive, acumenFolderId, PROYECTOS_MD_NAME);
  const mimeType = 'text/markdown';
  const body = Readable.from(Buffer.from(content, 'utf8'));
  if (existingId) {
    await drive.files.update({ fileId: existingId, media: { mimeType, body } });
    return;
  }
  await drive.files.create({
    requestBody: {
      name: PROYECTOS_MD_NAME,
      mimeType,
      parents: [acumenFolderId],
    },
    media: { mimeType, body },
  });
}

export interface InventoryStats {
  folders: number;
  files: number;
}

/**
 * Rebuild PROYECTOS.md by walking ACUMEN root and each non-system child
 * folder. Summaries are pulled from TIMELINE.csv when present; pre-existing
 * files without a timeline entry render as filename-only.
 *
 * Safe to call after every upload — the rebuild is a single Drive walk, and
 * a single source of truth beats incremental patching for this dataset size.
 */
export async function rebuildProyectosInventory(
  drive: drive_v3.Drive,
  acumenFolderId: string,
): Promise<InventoryStats> {
  const [summaries, childFolders, rootFilesRaw] = await Promise.all([
    loadSummariesFromTimeline(drive, acumenFolderId),
    listAcumenChildFolders(drive, acumenFolderId),
    listNonFolderChildren(drive, acumenFolderId),
  ]);

  const rootFiles = rootFilesRaw.filter((f) => !INVENTORY_OWN_FILES.has(f.name));
  const sections: FolderSection[] = [{ name: ROOT_LABEL, files: rootFiles }];

  const projectFolders = childFolders.filter(
    (f): f is { id: string; name: string } =>
      typeof f.name === 'string' && f.name.length > 0 && !isSystemFolderName(f.name),
  );

  const projectFiles = await Promise.all(
    projectFolders.map((f) => listNonFolderChildren(drive, f.id)),
  );
  projectFolders.forEach((folder, i) => {
    sections.push({ name: folder.name, files: projectFiles[i] });
  });

  const content = renderInventory(sections, summaries, new Date());
  await upsertInventoryFile(drive, acumenFolderId, content);

  return {
    folders: sections.length,
    files: sections.reduce((sum, s) => sum + s.files.length, 0),
  };
}

/**
 * Read PROYECTOS.md to feed as context to Hermes (question answering, intent
 * detection). Empty string when the file doesn't exist yet.
 */
export async function readProyectosInventory(
  drive: drive_v3.Drive,
  acumenFolderId: string,
): Promise<string> {
  const existingId = await findFileByName(drive, acumenFolderId, PROYECTOS_MD_NAME);
  if (!existingId) return '';
  const res = await drive.files.get(
    { fileId: existingId, alt: 'media' },
    { responseType: 'text' },
  );
  return typeof res.data === 'string' ? res.data : String(res.data ?? '');
}
