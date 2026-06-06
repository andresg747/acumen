import 'server-only';
import { Readable } from 'node:stream';
import { getDriveClient, getOrCreateAcumenFolderId } from './google';
import { DEFAULT_FILE_FIELDS } from './drive';

export interface DriveUploadResult {
  id: string;
  name: string;
  webViewLink?: string;
  mimeType?: string;
}

/**
 * Upload a buffer to the user's ACUMEN folder. Auth comes from the session
 * cookie OR the GOOGLE_TOKEN_PATH file fallback — works inside webhook
 * handlers that have no cookie context.
 */
export async function uploadBufferToAcumen(params: {
  name: string;
  mimeType: string;
  buffer: Buffer;
  /** Optional. Must be the ACUMEN folder or one of its direct children. */
  parentFolderId?: string;
}): Promise<DriveUploadResult> {
  const drive = await getDriveClient();
  const acumenFolderId = await getOrCreateAcumenFolderId();
  const parentFolderId = params.parentFolderId ?? acumenFolderId;

  const result = await drive.files.create({
    requestBody: {
      name: params.name,
      mimeType: params.mimeType,
      parents: [parentFolderId],
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
