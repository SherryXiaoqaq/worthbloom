import { CloudBaseAuthError, requireCloudBaseUser } from '@/lib/server/cloudbase-auth';
import { isCloudBaseServerConfigured } from '@/lib/server/cloudbase';
import { loadCloudBaseInbox, markCloudBaseInboxRead } from '@/lib/server/cloudbase-store';
import { getLocalInbox, markLocalInboxRead } from '@/lib/server/local-store';
import { isOwnerRequest, ownerOnly } from '@/lib/server/owner';

export const dynamic = 'force-dynamic';

async function userIdFor(request: Request) {
  if (isCloudBaseServerConfigured()) return (await requireCloudBaseUser(request)).id;
  return isOwnerRequest(request.headers) ? 'owner-preview' : null;
}

function failure(error: unknown) {
  const status = error instanceof CloudBaseAuthError ? error.status : 500;
  return Response.json({ error: error instanceof Error ? error.message : '回信列表操作失败' }, { status });
}

export async function GET(request: Request) {
  try {
    const userId = await userIdFor(request);
    if (!userId) return ownerOnly();
    const url = new URL(request.url);
    const cursor = url.searchParams.get('cursor') || '0';
    const limit = Number(url.searchParams.get('limit') || 20);
    const page = isCloudBaseServerConfigured()
      ? await loadCloudBaseInbox(userId, cursor, limit)
      : getLocalInbox(userId, cursor, limit);
    return Response.json(page);
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const userId = await userIdFor(request);
    if (!userId) return ownerOnly();
    const body = await request.json() as { reviewIds?: string[] };
    const reviewIds = Array.isArray(body.reviewIds) ? body.reviewIds.map(String).slice(0, 100) : [];
    if (!reviewIds.length) return Response.json({ error: '请选择需要标记的回信', code: 'REVIEW_IDS_REQUIRED' }, { status: 400 });
    const output = isCloudBaseServerConfigured()
      ? await markCloudBaseInboxRead(userId, reviewIds)
      : markLocalInboxRead(userId, reviewIds);
    return Response.json(output);
  } catch (error) {
    return failure(error);
  }
}
