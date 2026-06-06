import { NextResponse } from 'next/server';
import { getDriveClient } from '@/lib/google';
import { errorResponse } from '@/lib/http';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const drive = await getDriveClient();
    const about = await drive.about.get({ fields: 'user(displayName,emailAddress)' });
    return NextResponse.json({
      name: about.data.user?.displayName ?? null,
      email: about.data.user?.emailAddress ?? null,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
