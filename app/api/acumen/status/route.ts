import { NextResponse } from 'next/server';
import {
  getOrCreateAcumenFolderId,
  hasSessionCredentials,
} from '@/lib/google';
import { errorResponse } from '@/lib/http';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const authenticated = await hasSessionCredentials();
    if (!authenticated) {
      return NextResponse.json({
        authenticated: false,
        folderReady: false,
      });
    }

    try {
      const folderId = await getOrCreateAcumenFolderId();
      return NextResponse.json({
        authenticated: true,
        folderReady: true,
        folderId,
      });
    } catch {
      return NextResponse.json({
        authenticated: true,
        folderReady: false,
      });
    }
  } catch (err) {
    return errorResponse(err);
  }
}
