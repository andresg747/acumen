import { NextResponse, type NextRequest } from 'next/server';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { runHermesForMediaIntake, runLocalHermesForWhatsApp } from '@/lib/hermes';
import {
  KapsoSignatureError,
  downloadKapsoMedia,
  isInboundMessageEvent,
  parseKapsoInbound,
  sendKapsoMessage,
  verifyKapsoSignature,
  type KapsoInboundMessage,
} from '@/lib/kapso';
import { uploadBufferToAcumen } from '@/lib/drive-uploads';
import { getDriveClient, getOrCreateAcumenFolderId } from '@/lib/google';
import { listAcumenChildFolders } from '@/lib/drive';
import { errorResponse } from '@/lib/http';

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
  return name.trim().normalize('NFKD').toLowerCase();
}

async function handleMedia(
  inbound: KapsoInboundMessage & { media: NonNullable<KapsoInboundMessage['media']> },
) {
  const receivedAt = new Date();

  const drive = await getDriveClient();
  const acumenFolderId = await getOrCreateAcumenFolderId();
  const projectFolders = await listAcumenChildFolders(drive, acumenFolderId);

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

  // Resolve project name → folder id. Hermes is instructed to pick only from
  // the list, but be defensive: case-insensitive exact match, fall back to
  // ACUMEN root for anything we don't recognize.
  let parentFolderId = acumenFolderId;
  let resolvedProjectName: string | null = null;
  if (plan.project) {
    const wanted = normalizeFolderName(plan.project);
    const match = projectFolders.find(
      (f) => typeof f.name === 'string' && normalizeFolderName(f.name) === wanted,
    );
    if (match) {
      parentFolderId = match.id;
      resolvedProjectName = match.name ?? plan.project;
    }
  }

  const mimeType = inbound.media.contentType || contentType;
  const originalUpload = uploadBufferToAcumen({
    name: plan.filename,
    mimeType,
    buffer,
    parentFolderId,
  });

  const uploads: Promise<unknown>[] = [originalUpload];
  let notesUpload: Promise<unknown> | undefined;
  if (plan.notes) {
    const baseName = plan.filename.replace(/\.[^.]+$/, '');
    notesUpload = uploadBufferToAcumen({
      name: `${baseName}.md`,
      mimeType: 'text/markdown',
      buffer: Buffer.from(plan.notes, 'utf8'),
      parentFolderId,
    });
    uploads.push(notesUpload);
  }

  const [original, notes] = (await Promise.all(uploads)) as [
    Awaited<typeof originalUpload>,
    Awaited<typeof originalUpload> | undefined,
  ];

  const location = resolvedProjectName
    ? `ACUMEN / ${resolvedProjectName}`
    : 'ACUMEN';
  const link = original.webViewLink ? `\n${original.webViewLink}` : '';
  const reply = `${plan.summary}\n(${location})${link}`;
  return { reply, original, notes, project: resolvedProjectName };
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();

    try {
      verifyKapsoSignature(rawBody, req.headers.get('x-webhook-signature'));
    } catch (err) {
      if (err instanceof KapsoSignatureError) {
        return NextResponse.json({ ok: false, error: err.message }, { status: 401 });
      }
      throw err;
    }

    const body = JSON.parse(rawBody);

    if (!isInboundMessageEvent(req, body)) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const inbound = parseKapsoInbound(body);

    if (inbound.media) {
      const { reply, original, notes, project } = await handleMedia(
        inbound as KapsoInboundMessage & { media: NonNullable<KapsoInboundMessage['media']> },
      );
      await sendKapsoMessage(inbound.from, reply, inbound.phoneNumberId);
      return NextResponse.json({
        ok: true,
        to: inbound.from,
        kind: inbound.media.kind,
        project,
        originalFileId: original.id,
        notesFileId: notes?.id ?? null,
        reply,
      });
    }

    const text = inbound.text ?? inbound.caption ?? '';
    if (!text) {
      const note = 'Recibí un mensaje vacío. Mándame texto, audio, imagen o documento.';
      await sendKapsoMessage(inbound.from, note, inbound.phoneNumberId);
      return NextResponse.json({ ok: true, to: inbound.from, ignored: true });
    }

    const reply = await runLocalHermesForWhatsApp(inbound.from, text);
    await sendKapsoMessage(inbound.from, reply, inbound.phoneNumberId);

    return NextResponse.json({
      ok: true,
      to: inbound.from,
      messageId: inbound.messageId ?? null,
      reply,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
