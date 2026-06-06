import 'server-only';
import crypto from 'node:crypto';

/**
 * In-memory idempotency cache for webhook delivery dedup.
 *
 * Reserve a key BEFORE you start processing. If the reserve returns false,
 * a previous request is in-flight or recently completed — skip the work and
 * return 200 immediately. Entries expire after TTL_MS; cache is capped at
 * MAX_ENTRIES with FIFO eviction.
 *
 * Note: process-local. Dies on restart, and won't dedupe across instances.
 * For multi-instance or production deployments, swap for Redis or a DB row.
 */

const TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_ENTRIES = 1000;

const cache = new Map<string, number>(); // key -> insertion timestamp ms

function purgeExpired(now: number): void {
  for (const [key, ts] of cache) {
    if (now - ts > TTL_MS) cache.delete(key);
    else break; // Map preserves insertion order; oldest entries first.
  }
}

function capSize(): void {
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/**
 * Reserve a key. Returns true on success (caller proceeds), false if the key
 * was already reserved within the TTL window (caller dedupes).
 */
export function tryReserveIdempotencyKey(key: string): boolean {
  const now = Date.now();
  purgeExpired(now);
  if (cache.has(key)) return false;
  cache.set(key, now);
  capSize();
  return true;
}

/**
 * Build an idempotency key from whatever signals are available, in order of
 * reliability. Stable across retries because the upstream signals (Kapso's
 * own idempotency header, the WhatsApp message id, or a body hash) are stable.
 */
export function buildIdempotencyKey(
  headerKey: string | null | undefined,
  messageId: string | null | undefined,
  rawBody: string,
): string {
  const trimmedHeader = headerKey?.trim();
  if (trimmedHeader) return `hdr:${trimmedHeader}`;
  const trimmedMsg = messageId?.trim();
  if (trimmedMsg) return `msg:${trimmedMsg}`;
  return `body:${crypto.createHash('sha256').update(rawBody).digest('hex')}`;
}
