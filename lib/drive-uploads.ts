import 'server-only';
import { Readable } from 'node:stream';
import type { drive_v3 } from 'googleapis';
import { DEFAULT_FILE_FIELDS } from './drive';

export interface DriveUploadResult {
  id: string;
  name: string;
  webViewLink?: string;
  mimeType?: string;
}

/**
 * Upload a buffer to a specific Drive folder. Auth and folder resolution are
 * the caller's responsibility — pass the Drive client and the parent folder
 * id directly. Keeps this helper agnostic to whether the caller is a browser
 * request (cookie auth) or a webhook (service-token auth).
 */
export async function uploadFileToFolder(params: {
  drive: drive_v3.Drive;
  parentFolderId: string;
  name: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<DriveUploadResult> {
  const result = await params.drive.files.create({
    requestBody: {
      name: params.name,
      mimeType: params.mimeType,
      parents: [params.parentFolderId],
    },
    media: {
      mimeType: params.mimeType,
      body: Readable.from(params.buffer),
    },
    fields: DEFAULT_FILE_FIELDS,
  });

  const data = result.data;
  if (!data.id) throw new Error('Drive did not return an id for the uploaded file');
  return {
    id: data.id,
    name: data.name ?? params.name,
    webViewLink: data.webViewLink ?? undefined,
    mimeType: data.mimeType ?? params.mimeType,
  };
}
