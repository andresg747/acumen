import { NextResponse, type NextRequest } from 'next/server';
import { Readable } from 'node:stream';
import { getDriveClient } from '@/lib/google';
import { EXPORT_MAP, assertFileInAcumen, ensureAcumenFolders, nonEmpty } from '@/lib/drive';
import { errorResponse } from '@/lib/http';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ fileId: string }> };

export async function GET(req: NextRequest, ctx: RouteContext) {
  try {
    const { fileId } = await ctx.params;
    const drive = await getDriveClient();
    const acumenFolderIds = (await ensureAcumenFolders(drive)).map((folder) => folder.id);
    await assertFileInAcumen(drive, fileId, acumenFolderIds);
    const meta = await drive.files.get({
      fileId,
      fields: 'id, name, mimeType',
    });
    const mimeType = meta.data.mimeType ?? 'application/octet-stream';
    const name = meta.data.name ?? meta.data.id ?? 'file';

    const exportInfo = EXPORT_MAP[mimeType];
    let bodyStream: NodeJS.ReadableStream;
    let outMime: string;
    let outFilename: string;

    if (exportInfo) {
      const overrideMime = nonEmpty(req.nextUrl.searchParams.get('mimeType')) ?? exportInfo.mime;
      const result = await drive.files.export(
        { fileId, mimeType: overrideMime },
        { responseType: 'stream' },
      );
      bodyStream = result.data;
      outMime = overrideMime;
      outFilename = `${name}.${exportInfo.ext}`;
    } else {
      const result = await drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'stream' },
      );
      bodyStream = result.data;
      outMime = mimeType;
      outFilename = name;
    }

    const web = Readable.toWeb(bodyStream as Readable) as ReadableStream<Uint8Array>;
    return new Response(web, {
      status: 200,
      headers: {
        'Content-Type': outMime,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(outFilename)}"`,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
