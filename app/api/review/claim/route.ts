import { getDb } from '@/lib/server/db';
import { isCloudBaseServerConfigured } from '@/lib/server/cloudbase';
import { CloudBaseStoreError } from '@/lib/server/cloudbase-store';
import { getCloudBaseDb } from '@/lib/server/cloudbase-http-db';
import { claimLocalReview, isLocalPreview, LocalStoreError } from '@/lib/server/local-store';
import { requireCloudBaseUser, CloudBaseAuthError } from '@/lib/server/cloudbase-auth';
import { isOwnerRequest } from '@/lib/server/owner';
import { digestClaimToken } from '@/lib/server/claim-token';

export const dynamic = 'force-dynamic';

function fail(error: string, status: number, code?: string) {
  return Response.json({ error, code }, { status });
}

function levelForPoints(points: number): 1 | 2 | 3 | 4 | 5 {
  if (points >= 1500) return 5;
  if (points >= 700) return 4;
  if (points >= 300) return 3;
  if (points >= 100) return 2;
  return 1;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { reviewId?: string; claimToken?: string };
    if (!body.reviewId || !body.claimToken) return fail('参数不完整', 400, 'CLAIM_INVALID');

    // Resolve caller identity
    let userId: string;
    if (isCloudBaseServerConfigured()) {
      const user = await requireCloudBaseUser(request);
      userId = user.id;
    } else if (isOwnerRequest(request.headers)) {
      userId = 'owner-preview';
    } else {
      return fail('请先登录', 401, 'AUTH_REQUIRED');
    }

    if (isLocalPreview(request) && !isCloudBaseServerConfigured()) {
      return Response.json(claimLocalReview(body.reviewId, body.claimToken, userId));
    }

    if (isCloudBaseServerConfigured()) {
      const db = getCloudBaseDb();
      const tokenDigest = await digestClaimToken(body.claimToken);
      let claimDocs = await db.collection('claim_tokens').where({ token_digest: tokenDigest }).limit(1).get();
      // Compatibility for pending tokens written by the old build before hashing was introduced.
      if (!claimDocs.data?.length) claimDocs = await db.collection('claim_tokens').where({ token_digest: body.claimToken }).limit(1).get();
      const claim = (claimDocs.data || [])[0] as Record<string, unknown> | undefined;
      if (!claim || String(claim.review_id) !== body.reviewId) return fail('认领凭据无效', 410, 'CLAIM_EXPIRED');
      const claimId = String(claim.id || claim._id || '');
      if (!claimId) return fail('认领凭据无效', 410, 'CLAIM_EXPIRED');

      const reviewDoc = (await db.collection('reviews').doc(body.reviewId).get()).data?.[0] as Record<string, unknown> | undefined;
      if (reviewDoc && String(reviewDoc.owner_id) === userId) return fail('心愿主人不能认领自己的回信', 403, 'CLAIM_OWNER_FORBIDDEN');

      const todayEntries = (await db.collection('growth_ledger').where({ user_id: userId }).get()).data as Record<string, unknown>[] || [];
      const idempotencyKey = `claim:${body.reviewId}`;
      const existing = todayEntries.find(e => String(e.idempotency_key) === idempotencyKey);
      const acctDoc = (await db.collection('growth_accounts').doc(userId).get()).data?.[0] as Record<string, unknown> | undefined;
      if (existing) {
        const accountPoints = Number(acctDoc?.points ?? existing.points ?? 0);
        return Response.json({
          claimed: true,
          pointsAwarded: Number(existing.points ?? 0),
          dailyLimitReached: Boolean(existing.limited),
          growthAccount: { userId, points: accountPoints, level: Number(acctDoc?.level ?? levelForPoints(accountPoints)) },
        });
      }

      if (claim.status === 'CLAIMED' || (claim.claimed_by && String(claim.claimed_by) !== userId)) {
        return fail('认领凭据已经使用', 410, 'CLAIM_ALREADY_USED');
      }
      if (new Date(String(claim.expires_at)).getTime() < Date.now()) {
        await db.collection('claim_tokens').doc(claimId).update({ status: 'EXPIRED' });
        return fail('认领凭据已过期', 410, 'CLAIM_EXPIRED');
      }

      const pointsAwarded = 3;
      const claimed = await db.collection('claim_tokens').where({ _id: claimId, status: 'PENDING' }).update({
        status: 'CLAIMED',
        claimed_by: userId,
        claimed_at: new Date().toISOString(),
      });
      if (claimed.updated !== 1) return fail('认领凭据已经使用', 410, 'CLAIM_ALREADY_USED');

      const newPoints = Number(acctDoc?.points ?? 0) + pointsAwarded;
      const level = levelForPoints(newPoints);
      if (acctDoc) await db.collection('growth_accounts').doc(userId).update({ points: newPoints, level, updated_at: new Date().toISOString() });
      else await db.collection('growth_accounts').doc(userId).set({ user_id: userId, points: newPoints, level, updated_at: new Date().toISOString() });
      await db.collection('growth_ledger').doc(crypto.randomUUID()).set({
        owner_id: userId,
        user_id: userId,
        action_type: 'review_claim',
        points: pointsAwarded,
        limited: false,
        idempotency_key: idempotencyKey,
        reason: 'review_claim',
        reference_id: body.reviewId,
        created_at: new Date().toISOString(),
      });
      await db.collection('reviews').doc(body.reviewId).update({ claimed_by: userId, claimed_at: new Date().toISOString() });
      return Response.json({ claimed: true, pointsAwarded, dailyLimitReached: false, growthAccount: { userId, points: newPoints, level } });
    }

    // D1 path
    const db = await getDb();
    const tokenDigest = await digestClaimToken(body.claimToken);
    const claim = await db.prepare(`SELECT token_digest, review_id, expires_at, status FROM claim_tokens WHERE token_digest IN (?, ?) LIMIT 1`).bind(tokenDigest, body.claimToken).first<{ token_digest: string; review_id: string; expires_at: string; status: string }>();
    if (!claim || claim.review_id !== body.reviewId) return fail('认领凭据无效', 410, 'CLAIM_EXPIRED');
    const idempotencyKey = `claim:${body.reviewId}`;
    const existing = await db.prepare(`SELECT id, points FROM growth_ledger_entries WHERE idempotency_key = ?`).bind(idempotencyKey).first<{ id: string; points: number }>();
    if (existing) {
      const account = await db.prepare(`SELECT points, level FROM growth_accounts WHERE user_id = ?`).bind(userId).first<{ points: number; level: number }>();
      return Response.json({ claimed: true, pointsAwarded: existing.points, dailyLimitReached: existing.points === 0, growthAccount: { userId, points: account?.points ?? 0, level: account?.level ?? 1 } });
    }
    if (claim.status === 'CLAIMED') return fail('认领凭据已经使用', 410, 'CLAIM_ALREADY_USED');
    if (new Date(claim.expires_at).getTime() < Date.now()) return fail('认领凭据已过期', 410, 'CLAIM_EXPIRED');

    const pointsAwarded = 3;
    const currentAccount = await db.prepare(`SELECT points FROM growth_accounts WHERE user_id = ?`).bind(userId).first<{ points: number }>();
    const newPoints = Number(currentAccount?.points ?? 0) + pointsAwarded;
    const level = levelForPoints(newPoints);
    await db.batch([
      db.prepare(`UPDATE claim_tokens SET status = 'CLAIMED' WHERE token_digest = ? AND status = 'PENDING'`).bind(claim.token_digest),
      db.prepare(`INSERT INTO growth_accounts (user_id, points, level) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET points = excluded.points, level = excluded.level`).bind(userId, newPoints, level),
      db.prepare(`INSERT INTO growth_ledger_entries (id, user_id, points, idempotency_key, reason) VALUES (?,?,?,?,?)`).bind(crypto.randomUUID(), userId, pointsAwarded, idempotencyKey, 'review_claim'),
      db.prepare(`UPDATE reviews SET claimed_by = ?, claimed_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(userId, body.reviewId),
    ]);
    return Response.json({ claimed: true, pointsAwarded, dailyLimitReached: false, growthAccount: { userId, points: newPoints, level } });
  } catch (error) {
    const status = error instanceof LocalStoreError || error instanceof CloudBaseStoreError || error instanceof CloudBaseAuthError ? error.status : 500;
    const code = error instanceof CloudBaseAuthError ? 'AUTH_REQUIRED' : error instanceof LocalStoreError ? error.code : error instanceof CloudBaseStoreError ? (error as { code?: string }).code : undefined;
    return fail(error instanceof Error ? error.message : '认领失败', status, code);
  }
}
