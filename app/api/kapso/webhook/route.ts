import { NextResponse, after, type NextRequest } from 'next/server';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  looksLikeQuestion,
  runHermesForMediaIntake,
  runHermesForQuestion,
  runLocalHermesForWhatsApp,
} from '@/lib/hermes';
import {
  KapsoSignatureError,
  downloadKapsoMedia,
  isInboundMessageEvent,
  parseKapsoInbound,
  sendKapsoMessage,
  verifyKapsoSignature,
  type KapsoInboundMessage,
} from '@/lib/kapso';
import { uploadFileToFolder } from '@/lib/drive-uploads';
import { getServiceDriveClient } from '@/lib/google';
import {
  ensureAcumenFolder,
  ensurePreguntasFolder,
  isSystemFolderName,
  listAcumenChildFolders,
  PREGUNTAS_FOLDER_NAME,
} from '@/lib/drive';
import { buildIdempotencyKey, tryReserveIdempotencyKey } from '@/lib/idempotency';
import { appendToTimelineCsv } from '@/lib/ledger';
import { readProyectosInventory, rebuildProyectosInventory } from '@/lib/inventory';

export const runtime = 'nodejs';

async function writeTempFile(buffer: Buffer, suggestedFilename: string): Promise<string> {
  const dir = path.join(os.tmpdir(), 'halketon-kapso');
  await fs.mkdir(dir, { recursive: true });
  const ext = path.extname(suggestedFilename) || '.bin';
  const localPath = path.join(dir, `${randomUUID()}${ext}`);
  await fs.writeFile(localPath, buffer);
  return localPath;
}

function normalizeFolderName(name: string): string {
  return name
    .trim()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritical marks
    .toLowerCase();
}

/** Map internal media kinds to user-facing Spanish labels. Shown in PROYECTOS.md, which the user can open. */
function spanishKindLabel(kind: string): string {
  switch (kind) {
    case 'audio':
      return 'nota de voz';
    case 'image':
      return 'foto';
    case 'document':
      return 'documento';
    case 'video':
      return 'video';
    case 'sticker':
      return 'sticker';
    default:
      return 'archivo';
  }
}

/**
 * Deterministic fallback when Hermes didn't pick a project: scan the user's
 * own words (caption + transcript) for any project folder name. Substring
 * match on diacritic-stripped lowercase, so "mentoría" in speech finds the
 * folder named "Mentoría".
 */
function findProjectInUserText(
  text: string,
  projects: { id: string; name?: string | null }[],
): { id: string; name: string } | null {
  const haystack = normalizeFolderName(text);
  if (!haystack) return null;
  for (const p of projects) {
    if (!p.name) continue;
    const needle = normalizeFolderName(p.name);
    if (needle && haystack.includes(needle)) {
      return { id: p.id, name: p.name };
    }
  }
  return null;
}

async function handleMedia(
  inbound: KapsoInboundMessage & { media: NonNullable<KapsoInboundMessage['media']> },
): Promise<string> {
  const receivedAt = new Date();

  const drive = await getServiceDriveClient();
  const acumenFolderId = await ensureAcumenFolder(drive);
  // Strip system folders (starting with `_`) — those aren't projects.
  const projectFolders = (await listAcumenChildFolders(drive, acumenFolderId)).filter(
    (f) => !isSystemFolderName(f.name),
  );

  const { buffer, contentType } = await downloadKapsoMedia(inbound.media.url);

  const localPath = await writeTempFile(buffer, inbound.media.filename);

  let plan;
  try {
    plan = await runHermesForMediaIntake({
      from: inbound.from,
      receivedAt,
      kind: inbound.media.kind,
      originalFilename: inbound.media.filename,
      contentType: inbound.media.contentType || contentType,
      byteSize: inbound.media.byteSize,
      caption: inbound.caption,
      transcript: inbound.transcript,
      localPath,
      projects: projectFolders
        .filter((f): f is { id: string; name: string } => typeof f.name === 'string' && f.name.length > 0)
        .map((f) => ({ name: f.name })),
    });
  } finally {
    await fs.unlink(localPath).catch(() => {});
  }

  let parentFolderId = acumenFolderId;
  let resolvedProjectName: string | null = null;

  // Primary: Hermes-chosen project, matched case/diacritic-insensitively.
  if (plan.project) {
    const wanted = normalizeFolderName(plan.project);
    const match = projectFolders.find(
      (f) => typeof f.name === 'string' && normalizeFolderName(f.name) === wanted,
    );
    if (match && match.name) {
      parentFolderId = match.id;
      resolvedProjectName = match.name;
    }
  }

  // Fallback: scan the user's own words (caption + transcript) for any
  // folder name. Catches the common case where Hermes' JSON didn't survive
  // but the speaker clearly mentioned the project.
  if (!resolvedProjectName) {
    const userText = [inbound.caption, inbound.transcript].filter(Boolean).join(' ');
    if (userText) {
      const guess = findProjectInUserText(userText, projectFolders);
      if (guess) {
        parentFolderId = guess.id;
        resolvedProjectName = guess.name;
      }
    }
  }

  // For audio, always produce a transcription markdown — even if Hermes
  // didn't return `notes`. The user explicitly asked for this guarantee so
  // every voice note gets a searchable text twin in Drive.
  let notesContent: string | undefined = plan.notes;
  if (!notesContent && inbound.media.kind === 'audio' && inbound.transcript?.trim()) {
    notesContent = buildAudioNotes({
      title: plan.filename.replace(/\.[^.]+$/, ''),
      from: inbound.from,
      receivedAt,
      summary: plan.summary,
      transcript: inbound.transcript.trim(),
    });
  }

  const mimeType = inbound.media.contentType || contentType;
  const [originalUpload, notesUpload] = await Promise.all([
    uploadFileToFolder({
      drive,
      parentFolderId,
      name: plan.filename,
      mimeType,
      buffer,
    }),
    notesContent
      ? uploadFileToFolder({
          drive,
          parentFolderId,
          name: `${plan.filename.replace(/\.[^.]+$/, '')}.md`,
          mimeType: 'text/markdown',
          buffer: Buffer.from(notesContent, 'utf8'),
        })
      : Promise.resolve(null),
  ]);

  // Update ACUMEN-root ledgers. TIMELINE.csv writes first because the
  // inventory rebuild reads it to look up the per-file summary line.
  try {
    const ledgerEntry = {
      receivedAt,
      from: inbound.from,
      kind: spanishKindLabel(inbound.media.kind),
      project: resolvedProjectName,
      filename: originalUpload.name,
      summary: plan.summary,
      webViewLink: originalUpload.webViewLink,
    };
    await appendToTimelineCsv(drive, acumenFolderId, ledgerEntry);
    await rebuildProyectosInventory(drive, acumenFolderId);
  } catch (err) {
    // Ledger failures are non-fatal — the original file is already in Drive.
    // eslint-disable-next-line no-console
    console.error('[ledger] failed to update PROYECTOS.md / TIMELINE.csv:', err);
  }

  void notesUpload; // referenced for type narrowing only

  const projectLine = resolvedProjectName
    ? `Lo guardé en ${resolvedProjectName}.`
    : 'No lo asocié a ningún proyecto, lo dejé suelto.';

  // For voice notes, the user expects to see what they actually said back to
  // them — not just Hermes' summary. For other media, the summary is the
  // interpretation.
  const interpretation = inbound.transcript?.trim()
    ? `"${inbound.transcript.trim()}"\n\n${plan.summary}`
    : plan.summary;

  return `${interpretation}\n\n${projectLine}`;
}

function buildAudioNotes(params: {
  title: string;
  from: string;
  receivedAt: Date;
  summary: string;
  transcript: string;
}): string {
  return (
    `# ${params.title}\n\n` +
    `> Nota de voz que mandaste el ${formatHumanDate(params.receivedAt)} desde ${params.from}.\n\n` +
    `## Resumen\n\n${params.summary}\n\n` +
    `## Transcripción\n\n${params.transcript}\n`
  );
}

function formatHumanDate(d: Date): string {
  // 6 de junio de 2026, 17:30
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
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getDate()} de ${months[d.getMonth()]} de ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function handleQuestion(inbound: KapsoInboundMessage, question: string): Promise<string> {
  const receivedAt = new Date();
  const source: 'text' | 'audio' = inbound.media?.kind === 'audio' ? 'audio' : 'text';

  const drive = await getServiceDriveClient();
  const acumenFolderId = await ensureAcumenFolder(drive);
  const preguntasFolderId = await ensurePreguntasFolder(drive, acumenFolderId);
  const allChildren = await listAcumenChildFolders(drive, acumenFolderId);
  const projects = allChildren.filter((f) => !isSystemFolderName(f.name));
  const inventory = await readProyectosInventory(drive, acumenFolderId);

  const answer = await runHermesForQuestion({
    question,
    source,
    from: inbound.from,
    receivedAt,
    projects: projects
      .filter((f): f is { id: string; name: string } => typeof f.name === 'string' && f.name.length > 0)
      .map((f) => ({ name: f.name })),
    inventory,
  });

  // Persist the Q&A. For voice notes also save the original audio.
  const stamp = formatStamp(receivedAt);
  const safeQuestion = question.replace(/[\\/:*?"<>|\n\r]+/g, ' ').trim().slice(0, 120);
  const baseName = `${stamp} ${safeQuestion}`.trim();
  const mdContent = buildQuestionDoc({
    question,
    answer,
    from: inbound.from,
    receivedAt,
    source,
  });

  const uploads: Promise<unknown>[] = [
    uploadFileToFolder({
      drive,
      parentFolderId: preguntasFolderId,
      name: `${baseName}.md`,
      mimeType: 'text/markdown',
      buffer: Buffer.from(mdContent, 'utf8'),
    }),
  ];
  if (inbound.media?.kind === 'audio') {
    try {
      const { buffer, contentType } = await downloadKapsoMedia(inbound.media.url);
      const audioExt = path.extname(inbound.media.filename) || '.ogg';
      uploads.push(
        uploadFileToFolder({
          drive,
          parentFolderId: preguntasFolderId,
          name: `${baseName}${audioExt}`,
          mimeType: inbound.media.contentType || contentType,
          buffer,
        }),
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[question] failed to download audio for archive:', err);
    }
  }
  await Promise.all(uploads);

  // Record the question in TIMELINE.csv only. Questions land in _PREGUNTAS,
  // which is a system folder excluded from the PROYECTOS.md inventory.
  try {
    await appendToTimelineCsv(drive, acumenFolderId, {
      receivedAt,
      from: inbound.from,
      kind: source === 'audio' ? 'pregunta por voz' : 'pregunta',
      project: '',
      filename: `${baseName}.md`,
      summary: `P: ${question} | R: ${answer}`,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[ledger] question ledger write failed:', err);
  }

  return answer;
}

function formatStamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}-${pad(d.getMinutes())}`;
}

function buildQuestionDoc(params: {
  question: string;
  answer: string;
  from: string;
  receivedAt: Date;
  source: 'text' | 'audio';
}): string {
  const via = params.source === 'audio' ? 'una nota de voz' : 'un mensaje';
  return (
    `# ${params.question}\n\n` +
    `> Pregunta que mandaste el ${formatHumanDate(params.receivedAt)} desde ${params.from} (${via}).\n\n` +
    `## Respuesta\n\n${params.answer}\n\n` +
    `## Pregunta\n\n"${params.question}"\n`
  );
}

async function processInbound(inbound: KapsoInboundMessage): Promise<void> {
  // Questions take precedence over media/text routing — including voice-note
  // questions, which would otherwise be filed as project content.
  const userText = (inbound.transcript ?? inbound.text ?? inbound.caption ?? '').trim();
  if (looksLikeQuestion(userText)) {
    const answer = await handleQuestion(inbound, userText);
    await sendKapsoMessage(inbound.from, answer, inbound.phoneNumberId);
    return;
  }

  let reply: string;
  if (inbound.media) {
    reply = await handleMedia(
      inbound as KapsoInboundMessage & { media: NonNullable<KapsoInboundMessage['media']> },
    );
  } else {
    const text = inbound.text ?? inbound.caption ?? '';
    if (!text) {
      reply = 'No vi nada en tu mensaje. Mandame un texto, una nota de voz, una foto o un archivo.';
    } else {
      reply = await runLocalHermesForWhatsApp(inbound.from, text);
    }
  }
  await sendKapsoMessage(inbound.from, reply, inbound.phoneNumberId);
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  try {
    verifyKapsoSignature(rawBody, req.headers.get('x-webhook-signature'));
  } catch (err) {
    if (err instanceof KapsoSignatureError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: 'verification failed' }, { status: 500 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 });
  }

  if (!isInboundMessageEvent(req, body)) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  let inbound: KapsoInboundMessage;
  try {
    inbound = parseKapsoInbound(body);
  } catch (err) {
    // Acknowledge so Kapso doesn't retry an un-parseable message forever.
    // eslint-disable-next-line no-console
    console.warn('[kapso] failed to parse inbound:', err);
    return NextResponse.json({ ok: true, ignored: true });
  }

  const idempotencyKey = buildIdempotencyKey(
    req.headers.get('x-idempotency-key'),
    inbound.messageId,
    rawBody,
  );

  if (!tryReserveIdempotencyKey(idempotencyKey)) {
    // Retry of an already-seen delivery. 200 fast, no work.
    return NextResponse.json({ ok: true, deduped: true });
  }

  // Acknowledge IMMEDIATELY — Kapso has a 10s timeout. Hermes + Drive uploads
  // can take 10–20s, so we defer the actual work to after() and run it after
  // the response has been sent.
  after(async () => {
    try {
      await processInbound(inbound);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[kapso] background processing failed:', err);
    }
  });

  return NextResponse.json({ ok: true, accepted: true, idempotencyKey });
}
