import { CloudBaseAuthError, requireCloudBaseUser } from '@/lib/server/cloudbase-auth';
import { isCloudBaseServerConfigured } from '@/lib/server/cloudbase';
import { loadCloudBaseGrowth } from '@/lib/server/cloudbase-store';
import { getLocalGrowth } from '@/lib/server/local-store';
import { isOwnerRequest, ownerOnly } from '@/lib/server/owner';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    let userId: string;
    if (isCloudBaseServerConfigured()) userId = (await requireCloudBaseUser(request)).id;
    else {
      if (!isOwnerRequest(request.headers)) return ownerOnly();
      userId = 'owner-preview';
    }
    return Response.json(isCloudBaseServerConfigured() ? await loadCloudBaseGrowth(userId) : getLocalGrowth(userId));
  } catch (error) {
    const status = error instanceof CloudBaseAuthError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : '成长数据读取失败' }, { status });
  }
}
