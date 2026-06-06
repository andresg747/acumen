import { NextResponse, type NextRequest } from 'next/server';
import {
  exchangeCodeForTokens,
  getDriveClientForCredentials,
} from '@/lib/google';
import { writeSessionState } from '@/lib/session';
import { ensureAcumenFolder } from '@/lib/drive';
import { errorResponse } from '@/lib/http';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const error = searchParams.get('error');
    if (error) {
      return NextResponse.json(
        { error: `Google OAuth error: ${error}` },
        { status: 400 },
      );
    }
    const code = searchParams.get('code');
    if (!code) {
      return NextResponse.json(
        { error: 'Missing "code" query parameter' },
        { status: 400 },
      );
    }
    const tokens = await exchangeCodeForTokens(code);

    let acumenFolderId: string | undefined;
    try {
      const drive = getDriveClientForCredentials(tokens);
      acumenFolderId = await ensureAcumenFolder(drive);
    } catch (folderErr) {
      // Non-fatal: persist credentials anyway, the next request can resolve
      // the folder on demand via getOrCreateAcumenFolderId().
      // eslint-disable-next-line no-console
      console.error('Failed to ensure ACUMEN folder during callback:', folderErr);
    }

    await writeSessionState({ creds: tokens, acumenFolderId });
    return NextResponse.redirect(new URL('/', req.url));
  } catch (err) {
    return errorResponse(err);
  }
}
