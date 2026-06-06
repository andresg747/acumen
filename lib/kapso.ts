import 'server-only';
import crypto from 'node:crypto';

export class KapsoSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KapsoSignatureError';
  }
}

export function verifyKapsoSignature(rawBody: string, signatureHex: string | null): void {
  const secret = process.env.KAPSO_WEBHOOK_SECRET;
  if (!secret) throw new KapsoSignatureError('Missing KAPSO_WEBHOOK_SECRET');
  if (!signatureHex) throw new KapsoSignatureError('Missing X-Webhook-Signature header');

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  const a = Buffer.from(signatureHex, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new KapsoSignatureError('Invalid X-Webhook-Signature');
  }
}

export interface KapsoMedia {
  url: string;
  filename: string;
  contentType: string;
  byteSize?: number;
  kind: 'image' | 'document' | 'audio' | 'video' | 'sticker' | 'other';
}

export interface KapsoInboundMessage {
  from: string;
  text?: string;
  caption?: string;
  transcript?: string;
  media?: KapsoMedia;
  messageId?: string;
  phoneNumberId?: string;
  conversationId?: string;
}

function pickString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function pickNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function mediaKindFromType(type: string | undefined): KapsoMedia['kind'] {
  switch (type) {
    case 'image':
    case 'document':
    case 'audio':
    case 'video':
    case 'sticker':
      return type;
    default:
      return 'other';
  }
}

export function parseKapsoInbound(payload: unknown): KapsoInboundMessage {
  const root = asObject(payload);
  // Kapso sometimes nests under `data` (v2 payload version). Accept both.
  const body = asObject(root.data ?? root);

  const message = asObject(body.message);
  const conversation = asObject(body.conversation);
  const kapso = asObject(message.kapso);
  const mediaData = asObject(kapso.media_data);
  const messageTypeData = asObject(kapso.message_type_data);
  const transcriptObj = asObject(kapso.transcript);
  const textObj = asObject(message.text);

  const from =
    pickString(message.from) ??
    pickString(conversation.phone_number) ??
    pickString(body.from) ??
    pickString(body.phone) ??
    pickString(body.wa_id);

  const text =
    pickString(textObj.body) ??
    pickString(message.text) ??
    pickString(message.body) ??
    pickString(body.text) ??
    pickString(body.body);

  const caption = pickString(messageTypeData.caption);
  const transcript = pickString(transcriptObj.text);

  const messageType = pickString(message.type);
  const hasMedia = kapso.has_media === true || Boolean(mediaData.url);

  let media: KapsoMedia | undefined;
  if (hasMedia) {
    const url = pickString(mediaData.url) ?? pickString(kapso.media_url);
    const filename = pickString(mediaData.filename) ?? `${messageType ?? 'file'}.bin`;
    const contentType = pickString(mediaData.content_type) ?? 'application/octet-stream';
    if (url) {
      media = {
        url,
        filename,
        contentType,
        byteSize: pickNumber(mediaData.byte_size),
        kind: mediaKindFromType(messageType),
      };
    }
  }

  if (!from) throw new Error('Kapso webhook missing sender phone number');
  if (!text && !media) throw new Error('Kapso webhook missing message text and media');

  return {
    from,
    text,
    caption,
    transcript,
    media,
    messageId: pickString(message.id) ?? pickString(body.messageId) ?? pickString(body.message_id),
    phoneNumberId: pickString(body.phone_number_id) ?? pickString(conversation.phone_number_id),
    conversationId: pickString(conversation.id),
  };
}

export async function downloadKapsoMedia(url: string): Promise<{ buffer: Buffer; contentType: string }> {
  const apiKey = process.env.KAPSO_API_KEY;
  if (!apiKey) throw new Error('Missing KAPSO_API_KEY');

  const res = await fetch(url, {
    headers: { 'X-API-Key': apiKey },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Kapso media download failed (${res.status}): ${body.slice(0, 500)}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get('content-type') ?? 'application/octet-stream';
  return { buffer, contentType };
}

export function isInboundMessageEvent(req: { headers: Headers }, payload: unknown): boolean {
  const headerEvent = req.headers.get('x-webhook-event');
  if (headerEvent) return headerEvent === 'whatsapp.message.received';

  const root = asObject(payload);
  const bodyEvent = pickString(root.event);
  if (bodyEvent) return bodyEvent === 'whatsapp.message.received';

  // No event marker — fall back to "looks like an inbound message".
  const body = asObject(root.data ?? root);
  return Boolean(asObject(body.message).from);
}

export async function sendKapsoMessage(to: string, text: string, phoneNumberIdOverride?: string): Promise<void> {
  const apiKey = process.env.KAPSO_API_KEY;
  const phoneNumberId = phoneNumberIdOverride ?? process.env.KAPSO_PHONE_NUMBER_ID;
  const apiBase = process.env.KAPSO_API_BASE ?? 'https://api.kapso.ai';

  if (!apiKey) throw new Error('Missing KAPSO_API_KEY');
  if (!phoneNumberId) throw new Error('Missing KAPSO_PHONE_NUMBER_ID');

  const url = `${apiBase.replace(/\/$/, '')}/meta/whatsapp/v24.0/${encodeURIComponent(phoneNumberId)}/messages`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Kapso send failed (${res.status}): ${body.slice(0, 500)}`);
  }
}
