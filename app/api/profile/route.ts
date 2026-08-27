import { CloudBaseAuthError, requireCloudBaseUser } from '@/lib/server/cloudbase-auth';
import { isCloudBaseServerConfigured } from '@/lib/server/cloudbase';
import { CloudBaseStoreError, loadCloudBaseProfile, saveCloudBaseProfile } from '@/lib/server/cloudbase-store';
import { getLocalProfile, LocalStoreError, saveLocalProfile } from '@/lib/server/local-store';
import { isOwnerRequest, ownerOnly } from '@/lib/server/owner';

export const dynamic = 'force-dynamic';

async function currentUser(request: Request) {
  if (isCloudBaseServerConfigured()) return requireCloudBaseUser(request);
  if (!isOwnerRequest(request.headers)) return null;
  return { id: 'owner-preview', nickName: '好好花用户' as string | null };
}

function failure(error: unknown) {
  const status = error instanceof CloudBaseAuthError || error instanceof CloudBaseStoreError || error instanceof LocalStoreError ? error.status : 500;
  const code = error instanceof CloudBaseAuthError ? 'AUTH_REQUIRED' : error instanceof CloudBaseStoreError || error instanceof LocalStoreError ? error.code : undefined;
  return Response.json({ error: error instanceof Error ? error.message : '个人资料操作失败', code }, { status });
}

export async function GET(request: Request) {
  try {
    const user = await currentUser(request);
    if (!user) return ownerOnly();
    const profile = isCloudBaseServerConfigured()
      ? await loadCloudBaseProfile(user.id, user.nickName)
      : getLocalProfile(user.id, user.nickName);
    return Response.json({ profile });
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await currentUser(request);
    if (!user) return ownerOnly();
    const body = await request.json() as { nickname?: string; bio?: string; shareIdentityDefault?: 'ANONYMOUS' | 'NICKNAME' };
    const patch = { nickname: body.nickname, bio: body.bio, shareIdentityDefault: body.shareIdentityDefault };
    const profile = isCloudBaseServerConfigured()
      ? await saveCloudBaseProfile(user.id, patch, user.nickName)
      : saveLocalProfile(user.id, patch, user.nickName);
    return Response.json({ profile });
  } catch (error) {
    return failure(error);
  }
}
