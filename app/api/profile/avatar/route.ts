import { CloudBaseAuthError, requireCloudBaseUser } from '@/lib/server/cloudbase-auth';
import { isCloudBaseServerConfigured } from '@/lib/server/cloudbase';
import { CloudBaseStoreError, saveCloudBaseAvatar } from '@/lib/server/cloudbase-store';
import { LocalStoreError, saveLocalAvatar } from '@/lib/server/local-store';
import { isOwnerRequest, ownerOnly } from '@/lib/server/owner';

export const dynamic = 'force-dynamic';

const AVATAR_PATTERN = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;
const MAX_AVATAR_BYTES = 1_500_000;

async function currentUser(request: Request) {
  if (isCloudBaseServerConfigured()) return requireCloudBaseUser(request);
  if (!isOwnerRequest(request.headers)) return null;
  return { id: 'owner-preview', nickName: '好好花用户' as string | null };
}

function failure(error: unknown) {
  const status = error instanceof CloudBaseAuthError || error instanceof CloudBaseStoreError || error instanceof LocalStoreError ? error.status : 500;
  return Response.json({ error: error instanceof Error ? error.message : '头像操作失败' }, { status });
}

export async function POST(request: Request) {
  try {
    const user = await currentUser(request);
    if (!user) return ownerOnly();
    const body = await request.json() as { avatarDataUrl?: string };
    const match = typeof body.avatarDataUrl === 'string' ? body.avatarDataUrl.match(AVATAR_PATTERN) : null;
    if (!match) return Response.json({ error: '头像格式无效，请使用 JPG、PNG 或 WebP', code: 'AVATAR_INVALID' }, { status: 400 });
    if (Buffer.byteLength(match[2], 'base64') > MAX_AVATAR_BYTES) return Response.json({ error: '处理后的头像不能超过 1.5MB', code: 'AVATAR_TOO_LARGE' }, { status: 413 });
    const profile = isCloudBaseServerConfigured()
      ? await saveCloudBaseAvatar(user.id, body.avatarDataUrl!, user.nickName)
      : saveLocalAvatar(user.id, body.avatarDataUrl!, user.nickName);
    return Response.json({ profile });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await currentUser(request);
    if (!user) return ownerOnly();
    const profile = isCloudBaseServerConfigured()
      ? await saveCloudBaseAvatar(user.id, null, user.nickName)
      : saveLocalAvatar(user.id, null, user.nickName);
    return Response.json({ profile });
  } catch (error) {
    return failure(error);
  }
}
