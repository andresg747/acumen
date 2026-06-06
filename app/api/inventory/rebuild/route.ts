import { NextResponse } from 'next/server';
import { ensureAcumenFolder } from '@/lib/drive';
import { getServiceDriveClient } from '@/lib/google';
import { rebuildProyectosInventory } from '@/lib/inventory';
import { errorResponse } from '@/lib/http';

export const runtime = 'nodejs';

export async function POST() {
  try {
    const drive = await getServiceDriveClient();
    const acumenFolderId = await ensureAcumenFolder(drive);
    const stats = await rebuildProyectosInventory(drive, acumenFolderId);
    return NextResponse.json({ ok: true, ...stats });
  } catch (err) {
    return errorResponse(err);
  }
}
