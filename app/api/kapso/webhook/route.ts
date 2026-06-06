import { NextResponse, type NextRequest } from 'next/server';
import { runLocalHermesForWhatsApp } from '@/lib/hermes';
import {
  KapsoSignatureError,
  isInboundMessageEvent,
  parseKapsoInbound,
  sendKapsoMessage,
  verifyKapsoSignature,
} from '@/lib/kapso';
import { errorResponse } from '@/lib/http';

export const runtime = 'nodejs';

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
    const reply = await runLocalHermesForWhatsApp(inbound.from, inbound.text);
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
