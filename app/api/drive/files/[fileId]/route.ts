import { NextResponse, type NextRequest } from 'next/server';
import { Readable } from 'node:stream';
import { getDriveClient } from '@/lib/google';
import { DEFAULT_FILE_FIELDS, assertFileInAcumen, ensureAcumenFolders, nonEmpty } from '@/lib/drive';
import { errorResponse } from '@/lib/http';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ fileId: string }> };

export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    const { fileId } = await ctx.params;
    const drive = await getDriveClient();
    const acumenFolderIds = (await ensureAcumenFolders(drive)).map((folder) => folder.id);
    await assertFileInAcumen(drive, fileId, acumenFolderIds);
    const result = await drive.files.get({
      fileId,
      fields: DEFAULT_FILE_FIELDS,
    });
    return NextResponse.json(result.data);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PUT(req: NextRequest, ctx: RouteContext) {
  try {
    const { fileId } = await ctx.params;
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: 'Missing "file" field in multipart upload' },
        { status: 400 },
      );
    }
    const drive = await getDriveClient();
    const acumenFolderIds = (await ensureAcumenFolders(drive)).map((folder) => folder.id);
    await assertFileInAcumen(drive, fileId, acumenFolderIds);
    const name = nonEmpty(form.get('name')?.toString() ?? null);
    const mimeType = file.type || 'application/octet-stream';

    const buf = Buffer.from(await file.arrayBuffer());
    const result = await drive.files.update({
      fileId,
      requestBody: name ? { name } : undefined,
      media: {
        mimeType,
        body: Readable.from(buf),
      },
      fields: DEFAULT_FILE_FIELDS,
    });
    return NextResponse.json(result.data);
  } catch (err) {
    return errorResponse(err);
  }
}
