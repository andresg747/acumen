import { NextResponse, type NextRequest } from 'next/server';
import { ensureAcumenFolder } from '@/lib/drive';
import { getServiceDriveClient } from '@/lib/google';
import { rebuildProyectosInventory } from '@/lib/inventory';
import { errorResponse } from '@/lib/http';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const force = req.nextUrl.searchParams.get('force') === 'true';
    const drive = await getServiceDriveClient();
    const acumenFolderId = await ensureAcumenFolder(drive);
    const stats = await rebuildProyectosInventory(drive, acumenFolderId, { force });
    return NextResponse.json({ ok: true, force, ...stats });
  } catch (err) {
    return errorResponse(err);
  }
}
