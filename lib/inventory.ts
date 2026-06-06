import 'server-only';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import type { drive_v3 } from 'googleapis';
import {
  FOLDER_MIME_TYPE,
  escapeDriveQueryValue,
  isSystemFolderName,
  listAcumenChildFolders,
} from './drive';
import { PROYECTOS_MD_NAME, TIMELINE_CSV_NAME } from './ledger';
import { summarizeProjectAggregate } from './hermes';

const TITLE = '# Inventario de ACUMEN';
const SUBTITLE = '_Resumen del contenido por carpeta. Se actualiza solo._';
const ROOT_LABEL = 'ACUMEN (raíz)';
const AGGREGATES_CACHE_NAME = '_AGGREGATES.json';
const INVENTORY_OWN_FILES = new Set([
  PROYECTOS_MD_NAME,
  TIMELINE_CSV_NAME,
  AGGREGATES_CACHE_NAME,
]);

interface SectionFile {
  name: string;
  summary: string;
}

interface FolderSection {
  name: string;
  files: SectionFile[];
}

interface CachedAggregate {
  hash: string;
  aggregate: string;
}

type AggregateCache = Record<string, CachedAggregate>;

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
): Promise<{ id: string; name: string }[]> {
  const parent = escapeDriveQueryValue(parentId);
  const q = `'${parent}' in parents and trashed = false and mimeType != '${FOLDER_MIME_TYPE}'`;
  const out: { id: string; name: string }[] = [];
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

async function loadAggregateCache(
  drive: drive_v3.Drive,
  acumenFolderId: string,
): Promise<AggregateCache> {
  const id = await findFileByName(drive, acumenFolderId, AGGREGATES_CACHE_NAME);
  if (!id) return {};
  try {
    const res = await drive.files.get(
      { fileId: id, alt: 'media' },
      { responseType: 'text' },
    );
    const text = typeof res.data === 'string' ? res.data : String(res.data ?? '');
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') return {};
    const out: AggregateCache = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (
        v &&
        typeof v === 'object' &&
        typeof (v as CachedAggregate).hash === 'string' &&
        typeof (v as CachedAggregate).aggregate === 'string'
      ) {
        out[k] = v as CachedAggregate;
      }
    }
    return out;
  } catch {
    return {};
  }
}

async function saveAggregateCache(
  drive: drive_v3.Drive,
  acumenFolderId: string,
  cache: AggregateCache,
): Promise<void> {
  const id = await findFileByName(drive, acumenFolderId, AGGREGATES_CACHE_NAME);
  const content = JSON.stringify(cache, null, 2);
  const body = Readable.from(Buffer.from(content, 'utf8'));
  const mimeType = 'application/json';
  if (id) {
    await drive.files.update({ fileId: id, media: { mimeType, body } });
    return;
  }
  await drive.files.create({
    requestBody: {
      name: AGGREGATES_CACHE_NAME,
      mimeType,
      parents: [acumenFolderId],
    },
    media: { mimeType, body },
  });
}

function computeSectionHash(files: SectionFile[]): string {
  const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name));
  const payload = JSON.stringify(sorted.map((f) => [f.name, f.summary]));
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * Decide which sections need a fresh aggregate (hash mismatch or no cache),
 * call Hermes in parallel for those, fall back to the previous cached value
 * on failure. Empty sections get no aggregate.
 */
async function resolveAggregates(
  sections: FolderSection[],
  cache: AggregateCache,
  forceRegenerate: boolean,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const toRegen: { section: FolderSection; hash: string }[] = [];

  for (const section of sections) {
    if (section.files.length === 0) continue;
    const hash = computeSectionHash(section.files);
    const cached = cache[section.name];
    if (!forceRegenerate && cached && cached.hash === hash) {
      result.set(section.name, cached.aggregate);
    } else {
      toRegen.push({ section, hash });
    }
  }

  const generated = await Promise.allSettled(
    toRegen.map(({ section }) =>
      summarizeProjectAggregate({
        projectName: section.name,
        files: section.files.map((f) => ({ filename: f.name, summary: f.summary })),
      }),
    ),
  );

  toRegen.forEach(({ section }, i) => {
    const r = generated[i];
    if (r.status === 'fulfilled' && r.value.trim()) {
      result.set(section.name, r.value.trim());
      return;
    }
    // On failure, fall back to the prior cached aggregate even though file
    // list changed — a stale summary beats no summary in the inventory.
    const prev = cache[section.name];
    if (prev) {
      result.set(section.name, prev.aggregate);
      // eslint-disable-next-line no-console
      console.warn(
        `[inventory] aggregate regen failed for ${section.name}, falling back to cached.`,
        r.status === 'rejected' ? r.reason : '',
      );
    } else {
      // eslint-disable-next-line no-console
      console.warn(
        `[inventory] aggregate generation failed for ${section.name}, leaving blank.`,
        r.status === 'rejected' ? r.reason : '',
      );
    }
  });

  return result;
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
  aggregates: Map<string, string>,
  now: Date,
): string {
  const lines: string[] = [TITLE, '', SUBTITLE, ''];
  for (const section of sections) {
    lines.push(`## ${section.name}`);
    lines.push('');
    if (section.files.length === 0) {
      lines.push('_Vacía._');
    } else {
      const aggregate = aggregates.get(section.name);
      if (aggregate) {
        lines.push(`_${aggregate}_`);
        lines.push('');
      }
      for (const file of section.files) {
        lines.push(
          file.summary
            ? `- **${file.name}** — ${file.summary}`
            : `- **${file.name}**`,
        );
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
  aggregatesRegenerated: number;
}

export interface RebuildOptions {
  /** Ignore the sidecar cache and re-summarize every project. */
  force?: boolean;
}

/**
 * Rebuild PROYECTOS.md by walking ACUMEN root and each non-system child
 * folder. Per-file lines come from TIMELINE.csv (fallback: filename only).
 * Each section gets a Hermes-synthesized aggregate paragraph above its file
 * list — cached in _AGGREGATES.json so only sections whose file list changed
 * trigger a fresh Hermes call.
 *
 * Safe to call after every upload — the cache turns the typical incremental
 * case into one Hermes call (for the affected project only).
 */
export async function rebuildProyectosInventory(
  drive: drive_v3.Drive,
  acumenFolderId: string,
  opts: RebuildOptions = {},
): Promise<InventoryStats> {
  const [summaries, childFolders, rootFilesRaw, cache] = await Promise.all([
    loadSummariesFromTimeline(drive, acumenFolderId),
    listAcumenChildFolders(drive, acumenFolderId),
    listNonFolderChildren(drive, acumenFolderId),
    loadAggregateCache(drive, acumenFolderId),
  ]);

  const rootFiles: SectionFile[] = rootFilesRaw
    .filter((f) => !INVENTORY_OWN_FILES.has(f.name))
    .map((f) => ({ name: f.name, summary: summaries.get(f.name) ?? '' }));

  const sections: FolderSection[] = [{ name: ROOT_LABEL, files: rootFiles }];

  const projectFolders = childFolders.filter(
    (f): f is { id: string; name: string } =>
      typeof f.name === 'string' && f.name.length > 0 && !isSystemFolderName(f.name),
  );

  const projectFiles = await Promise.all(
    projectFolders.map((f) => listNonFolderChildren(drive, f.id)),
  );
  projectFolders.forEach((folder, i) => {
    sections.push({
      name: folder.name,
      files: projectFiles[i].map((f) => ({
        name: f.name,
        summary: summaries.get(f.name) ?? '',
      })),
    });
  });

  const aggregates = await resolveAggregates(sections, cache, opts.force ?? false);

  // Rebuild the cache so deleted projects don't leak stale entries.
  const newCache: AggregateCache = {};
  let regenerated = 0;
  for (const section of sections) {
    if (section.files.length === 0) continue;
    const aggregate = aggregates.get(section.name);
    if (!aggregate) continue;
    const hash = computeSectionHash(section.files);
    newCache[section.name] = { hash, aggregate };
    if (cache[section.name]?.hash !== hash) regenerated += 1;
  }
  await saveAggregateCache(drive, acumenFolderId, newCache);

  const content = renderInventory(sections, aggregates, new Date());
  await upsertInventoryFile(drive, acumenFolderId, content);

  return {
    folders: sections.length,
    files: sections.reduce((sum, s) => sum + s.files.length, 0),
    aggregatesRegenerated: regenerated,
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
