import 'server-only';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function runLocalHermesForWhatsApp(from: string, text: string): Promise<string> {
  const prompt = `You are Hermes running locally for a WhatsApp demo.

Incoming WhatsApp message from: ${from}

User message:
${text}

Process the user's intent and reply in a concise WhatsApp-friendly way. If the user asks about Google Drive or ACUMEN, explain what you can do through the local Halketon app.`;

  const { stdout } = await execFileAsync('hermes', ['chat', '-q', prompt, '--quiet'], {
    timeout: 120_000,
    maxBuffer: 1024 * 1024,
    cwd: process.cwd(),
  });

  const reply = stdout.trim();
  return reply || 'Done.';
}
