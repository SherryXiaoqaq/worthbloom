import { getDb } from '@/lib/server/db';
import { isCloudBaseServerConfigured } from '@/lib/server/cloudbase';
import { requireCloudBaseUser } from '@/lib/server/cloudbase-auth';
import { getCloudBaseDb } from '@/lib/server/cloudbase-http-db';
import { getLocalData, isLocalPreview } from '@/lib/server/local-store';
import { isOwnerRequest } from '@/lib/server/owner';
import { normalizeWish, normalizeReview } from '@/lib/wish-compat';
import { agentComplete, agentNextQuestion, AGENT_MAX_QUESTIONS, fallbackQuestion } from '@/lib/server/agent';
import type { AgentMessage, AgentReport, AgentSession, PurchaseRequest, Review } from '@/lib/types';
import { AiServiceError } from '@/lib/server/ai/client';

export const dynamic = 'force-dynamic';

function fail(error: string, status: number, code?: string) {
  return Response.json({ error, code }, { status });
}

// ---- local preview in-memory sessions ----
const localSessions = new Map<string, AgentSession>();

async function loadContext(request: Request, requestId: string, ownerId: string): Promise<{ request: PurchaseRequest; reviews: Review[] } | null> {
  if (isCloudBaseServerConfigured()) {
    const db = getCloudBaseDb();
    const reqDoc = await db.collection('purchase_requests').doc(requestId).get();
    const req = (reqDoc.data || [])[0] as Record<string, unknown> | undefined;
    if (!req || String(req.owner_id ?? '') !== ownerId) return null;
    const revDocs = await db.collection('reviews').where({ request_id: requestId }).get();
    return {
      request: normalizeWish(req as Record<string, unknown>),
      reviews: ((revDocs.data || []) as Record<string, unknown>[])
        .filter(review => String(review.owner_id ?? '') === ownerId)
        .map(normalizeReview),
    };
  }
  if (isLocalPreview(request)) {
    const data = getLocalData();
    const req = data.requests.find(r => r.id === requestId);
    if (!req) return null;
    return { request: req, reviews: data.reviews.filter(r => r.request_id === requestId) };
  }
  const db = await getDb();
  const reqRow = await db.prepare(`SELECT * FROM purchase_requests WHERE id = ?`).bind(requestId).first<Record<string, unknown>>();
  if (!reqRow) return null;
  const revRows = await db.prepare(`SELECT * FROM reviews WHERE request_id = ? ORDER BY created_at DESC`).bind(requestId).all();
  const imgRows = await db.prepare(`SELECT id, url, sort_order, is_cover FROM wish_images WHERE request_id = ? ORDER BY sort_order`).bind(requestId).all();
  reqRow.images = (imgRows.results as Record<string, unknown>[]).map(img => ({ id: String(img.id), url: String(img.url), sortOrder: Number(img.sort_order), isCover: Boolean(img.is_cover) }));
  return { request: normalizeWish(reqRow), reviews: (revRows.results as Record<string, unknown>[]).map(normalizeReview) };
}

// ---- D1 session ops ----
async function d1LoadSession(sessionId: string): Promise<AgentSession | null> {
  const db = await getDb();
  const s = await db.prepare(`SELECT * FROM agent_sessions WHERE id = ?`).bind(sessionId).first<Record<string, unknown>>();
  if (!s) return null;
  const msgs = await db.prepare(`SELECT * FROM agent_messages WHERE session_id = ? ORDER BY created_at`).bind(sessionId).all();
  const rep = await db.prepare(`SELECT report_json FROM agent_reports WHERE session_id = ?`).bind(sessionId).first<{ report_json: string }>();
  return {
    id: String(s.id), requestId: String(s.request_id), requestRevision: Number(s.request_revision),
    status: String(s.status) as AgentSession['status'],
    messages: (msgs.results as Record<string, unknown>[]).map(m => ({ id: String(m.id), role: String(m.role) as AgentMessage['role'], content: String(m.content), questionId: m.question_id ? String(m.question_id) : undefined, skipped: Boolean(m.skipped), createdAt: String(m.created_at) })),
    report: rep ? JSON.parse(rep.report_json) as AgentReport : undefined,
    questionCount: Number(s.question_count), createdAt: String(s.created_at), updatedAt: String(s.updated_at),
  };
}

async function d1FindInProgress(requestId: string, revision: number): Promise<AgentSession | null> {
  const db = await getDb();
  const s = await db.prepare(`SELECT * FROM agent_sessions WHERE request_id = ? AND request_revision = ? AND status = 'IN_PROGRESS' ORDER BY created_at DESC LIMIT 1`).bind(requestId, revision).first<Record<string, unknown>>();
  if (!s) return null;
  return d1LoadSession(String(s.id));
}

async function d1FindLatest(requestId: string, revision: number): Promise<AgentSession | null> {
  const db = await getDb();
  const s = await db.prepare(`SELECT id FROM agent_sessions WHERE request_id = ? AND request_revision = ? ORDER BY updated_at DESC, created_at DESC LIMIT 1`).bind(requestId, revision).first<{ id: string }>();
  return s ? d1LoadSession(String(s.id)) : null;
}

async function d1StartSession(requestId: string, revision: number): Promise<AgentSession> {
  const db = await getDb();
  const id = crypto.randomUUID(); const ts = new Date().toISOString();
  await db.prepare(`INSERT INTO agent_sessions (id, request_id, request_revision, status, question_count, created_at, updated_at) VALUES (?,?,?,?,0,?,?)`).bind(id, requestId, revision, 'IN_PROGRESS', ts, ts).run();
  return { id, requestId, requestRevision: revision, status: 'IN_PROGRESS', messages: [], questionCount: 0, createdAt: ts, updatedAt: ts };
}

async function d1AddMessage(session: AgentSession, msg: AgentMessage) {
  const db = await getDb();
  await db.prepare(`INSERT INTO agent_messages (id, session_id, role, content, question_id, skipped, created_at) VALUES (?,?,?,?,?,?,?)`).bind(msg.id, session.id, msg.role, msg.content, msg.questionId ?? null, msg.skipped ? 1 : 0, msg.createdAt).run();
  const qc = session.questionCount + (msg.role === 'ASSISTANT' && msg.questionId ? 1 : 0);
  await db.prepare(`UPDATE agent_sessions SET question_count = ?, updated_at = ? WHERE id = ?`).bind(qc, msg.createdAt, session.id).run();
  session.messages.push(msg); session.questionCount = qc; session.updatedAt = msg.createdAt;
}

async function d1SetStatus(session: AgentSession, status: AgentSession['status'], report?: AgentReport) {
  const db = await getDb();
  const ts = new Date().toISOString();
  await db.prepare(`UPDATE agent_sessions SET status = ?, updated_at = ? WHERE id = ?`).bind(status, ts, session.id).run();
  if (report) await db.prepare(`INSERT INTO agent_reports (session_id, report_json, created_at) VALUES (?,?,?) ON CONFLICT(session_id) DO UPDATE SET report_json=excluded.report_json`).bind(session.id, JSON.stringify(report), ts).run();
  session.status = status; session.report = report; session.updatedAt = ts;
}

async function cloudBaseLoadSession(sessionId: string, ownerId: string): Promise<AgentSession | null> {
  const db = getCloudBaseDb();
  const doc = (await db.collection('agent_sessions').doc(sessionId).get()).data?.[0] as Record<string, unknown> | undefined;
  if (!doc || String(doc.owner_id ?? '') !== ownerId) return null;
  const [messageResult, reportResult] = await Promise.all([
    db.collection('agent_messages').where({ session_id: sessionId, owner_id: ownerId }).get(),
    db.collection('agent_reports').where({ session_id: sessionId, owner_id: ownerId }).limit(1).get(),
  ]);
  const messages = ((messageResult.data || []) as Record<string, unknown>[])
    .sort((left, right) => String(left.created_at ?? '').localeCompare(String(right.created_at ?? '')))
    .map(message => ({
      id: String(message.id || message._id || ''),
      role: String(message.role) as AgentMessage['role'],
      content: String(message.content ?? ''),
      questionId: message.question_id ? String(message.question_id) : undefined,
      skipped: Boolean(message.skipped),
      createdAt: String(message.created_at),
    }));
  const reportDoc = (reportResult.data || [])[0] as Record<string, unknown> | undefined;
  let report: AgentReport | undefined;
  if (reportDoc?.report_json) {
    try { report = JSON.parse(String(reportDoc.report_json)) as AgentReport; } catch { report = undefined; }
  }
  return {
    id: sessionId,
    requestId: String(doc.request_id),
    requestRevision: Number(doc.request_revision),
    status: String(doc.status) as AgentSession['status'],
    messages,
    report,
    questionCount: Number(doc.question_count ?? 0),
    createdAt: String(doc.created_at),
    updatedAt: String(doc.updated_at),
  };
}

async function cloudBaseAddMessage(session: AgentSession, message: AgentMessage, ownerId: string) {
  const db = getCloudBaseDb();
  const questionCount = session.questionCount + (message.role === 'ASSISTANT' && message.questionId ? 1 : 0);
  await db.collection('agent_messages').doc(message.id).set({
    id: message.id,
    owner_id: ownerId,
    session_id: session.id,
    role: message.role,
    content: message.content,
    question_id: message.questionId ?? null,
    skipped: message.skipped ? 1 : 0,
    created_at: message.createdAt,
  });
  await db.collection('agent_sessions').doc(session.id).update({ question_count: questionCount, updated_at: message.createdAt });
  session.messages.push(message);
  session.questionCount = questionCount;
  session.updatedAt = message.createdAt;
}

async function cloudBaseSetStatus(session: AgentSession, status: AgentSession['status'], ownerId: string, report?: AgentReport) {
  const db = getCloudBaseDb();
  const updatedAt = new Date().toISOString();
  await db.collection('agent_sessions').doc(session.id).update({ status, updated_at: updatedAt });
  if (report) {
    await db.collection('agent_reports').doc(session.id).set({
      owner_id: ownerId,
      session_id: session.id,
      report_json: JSON.stringify(report),
      created_at: updatedAt,
    });
  }
  session.status = status;
  session.report = report;
  session.updatedAt = updatedAt;
}

export async function POST(request: Request) {
  let userId: string;
  if (isCloudBaseServerConfigured()) {
    try { const u = await requireCloudBaseUser(request); userId = u.id; } catch { return fail('请先登录', 401, 'AUTH_REQUIRED'); }
  } else if (!isOwnerRequest(request.headers)) {
    return fail('请先登录', 401, 'AUTH_REQUIRED');
  } else { userId = 'owner-preview'; }

  const body = await request.json() as { action: string; requestId?: string; expectedRevision?: number; sessionId?: string; answer?: string; skipped?: boolean; confirmed?: boolean };
  const useCloudBase = isCloudBaseServerConfigured();
  const useLocal = !useCloudBase && isLocalPreview(request);

  try {
    if (body.action === 'load') {
      const requestId = String(body.requestId ?? '');
      const expected = Number(body.expectedRevision);
      const ctx = await loadContext(request, requestId, userId);
      if (!ctx) return fail('没有找到这个心愿', 404, 'NOT_FOUND');
      const rev = ctx.request.revision ?? 1;
      if (!Number.isFinite(expected) || expected !== rev) return fail('心愿已被修改，请基于最新版本加载对话', 409, 'REVISION_CONFLICT');

      let session: AgentSession | null = null;
      if (useLocal) {
        session = [...localSessions.values()]
          .filter(item => item.requestId === requestId && item.requestRevision === rev)
          .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0] ?? null;
      } else if (!useCloudBase) {
        session = await d1FindLatest(requestId, rev);
      } else {
        const db = getCloudBaseDb();
        const res = await db.collection('agent_sessions').where({ owner_id: userId, request_id: requestId, request_revision: rev }).limit(100).get();
        const docs = (res.data || []) as Record<string, unknown>[];
        docs.sort((left, right) => String(right.updated_at ?? right.created_at ?? '').localeCompare(String(left.updated_at ?? left.created_at ?? '')));
        const latest = docs[0];
        if (latest) session = await cloudBaseLoadSession(String(latest.id || latest._id || ''), userId);
      }
      const readyToComplete = Boolean(session && session.status === 'IN_PROGRESS' && (session.questionCount >= AGENT_MAX_QUESTIONS || session.messages.at(-1)?.role === 'USER'));
      return Response.json({ session, readyToComplete });
    }

    if (body.action === 'start') {
      const requestId = String(body.requestId ?? '');
      const expected = Number(body.expectedRevision);
      const ctx = await loadContext(request, requestId, userId);
      if (!ctx) return fail('没有找到这个心愿', 404, 'NOT_FOUND');
      const rev = ctx.request.revision ?? 1;
      if (!Number.isFinite(expected) || expected !== rev) return fail('心愿已被修改，请基于最新版本开始新对话', 409, 'REVISION_CONFLICT');

      // find existing IN_PROGRESS session for this revision
      let session: AgentSession | null = null;
      if (useLocal) {
        for (const s of localSessions.values()) { if (s.requestId === requestId && s.requestRevision === rev && s.status === 'IN_PROGRESS') { session = s; break; } }
      } else if (!useCloudBase) {
        session = await d1FindInProgress(requestId, rev);
      } else {
        const db = getCloudBaseDb();
        const res = await db.collection('agent_sessions').where({ owner_id: userId, request_id: requestId, request_revision: rev, status: 'IN_PROGRESS' }).limit(1).get();
        const doc = (res.data || [])[0] as Record<string, unknown> | undefined;
        if (doc) session = await cloudBaseLoadSession(String(doc.id || doc._id || ''), userId);
      }

      if (!session) {
        if (useLocal) { session = { id: crypto.randomUUID(), requestId, requestRevision: rev, status: 'IN_PROGRESS', messages: [], questionCount: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; localSessions.set(session.id, session); }
        else if (!useCloudBase) { session = await d1StartSession(requestId, rev); }
        else { const id = crypto.randomUUID(); const ts = new Date().toISOString(); const db = getCloudBaseDb(); await db.collection('agent_sessions').doc(id).set({ id, owner_id: userId, request_id: requestId, request_revision: rev, status: 'IN_PROGRESS', question_count: 0, created_at: ts, updated_at: ts }); session = { id, requestId, requestRevision: rev, status: 'IN_PROGRESS', messages: [], questionCount: 0, createdAt: ts, updatedAt: ts }; }
      }

      if (session.messages.length === 0) {
        let firstQuestion: string;
        try {
          const turn = await agentNextQuestion(ctx, session.messages);
          firstQuestion = turn.content;
        } catch {
          firstQuestion = fallbackQuestion(ctx, session.messages);
        }
        const msg: AgentMessage = { id: crypto.randomUUID(), role: 'ASSISTANT', content: firstQuestion, questionId: 'q1', createdAt: new Date().toISOString() };
        if (useLocal) { session.messages.push(msg); session.questionCount += 1; session.updatedAt = msg.createdAt; }
        else if (!useCloudBase) { await d1AddMessage(session, msg); }
        else { await cloudBaseAddMessage(session, msg, userId); }
      }
      return Response.json({ session });
    }

    if (body.action === 'reply') {
      const sessionId = String(body.sessionId ?? '');
      let session: AgentSession | null;
      if (useLocal) session = localSessions.get(sessionId) ?? null;
      else if (!useCloudBase) session = await d1LoadSession(sessionId);
      else session = await cloudBaseLoadSession(sessionId, userId);
      if (!session) return fail('会话不存在', 404, 'SESSION_NOT_FOUND');
      if (session.status !== 'IN_PROGRESS') return fail('会话已结束', 409, 'SESSION_CLOSED');

      const ctx = await loadContext(request, session.requestId, userId);
      if (!ctx) return fail('心愿不存在', 404, 'NOT_FOUND');
      if ((ctx.request.revision ?? 1) !== session.requestRevision) return fail('心愿已被修改，请基于最新版本开始新对话', 409, 'REVISION_CONFLICT');
      if (!body.skipped && !String(body.answer ?? '').trim()) return fail('请填写回答或选择暂时跳过', 400, 'ANSWER_REQUIRED');
      const userMsg: AgentMessage = { id: crypto.randomUUID(), role: 'USER', content: body.skipped ? '' : String(body.answer ?? ''), skipped: Boolean(body.skipped), createdAt: new Date().toISOString() };
      if (useLocal) { session.messages.push(userMsg); session.updatedAt = userMsg.createdAt; }
      else if (!useCloudBase) { await d1AddMessage(session, userMsg); }
      else { await cloudBaseAddMessage(session, userMsg, userId); }

      let readyToComplete = false;
      if (session.questionCount >= AGENT_MAX_QUESTIONS) {
        readyToComplete = true;
      } else {
        try {
          const turn = await agentNextQuestion(ctx, session.messages);
          if (turn.type === 'complete') { readyToComplete = true; }
          else {
            const qMsg: AgentMessage = { id: crypto.randomUUID(), role: 'ASSISTANT', content: turn.content, questionId: `q${session.questionCount + 1}`, createdAt: new Date().toISOString() };
            if (useLocal) { session.messages.push(qMsg); session.questionCount += 1; session.updatedAt = qMsg.createdAt; }
            else if (!useCloudBase) { await d1AddMessage(session, qMsg); }
            else { await cloudBaseAddMessage(session, qMsg, userId); }
          }
        } catch {
          const qMsg: AgentMessage = { id: crypto.randomUUID(), role: 'ASSISTANT', content: fallbackQuestion(ctx, session.messages), questionId: `q${session.questionCount + 1}`, createdAt: new Date().toISOString() };
          if (useLocal) { session.messages.push(qMsg); session.questionCount += 1; session.updatedAt = qMsg.createdAt; }
          else if (!useCloudBase) { await d1AddMessage(session, qMsg); }
          else { await cloudBaseAddMessage(session, qMsg, userId); }
        }
      }
      return Response.json({ session, readyToComplete });
    }

    if (body.action === 'complete') {
      const sessionId = String(body.sessionId ?? '');
      let session: AgentSession | null;
      if (useLocal) session = localSessions.get(sessionId) ?? null;
      else if (!useCloudBase) session = await d1LoadSession(sessionId);
      else session = await cloudBaseLoadSession(sessionId, userId);
      if (!session) return fail('会话不存在', 404, 'SESSION_NOT_FOUND');
      if (session.status === 'COMPLETED' && session.report) return Response.json({ session });
      if (session.status !== 'IN_PROGRESS') return fail('会话已结束', 409, 'SESSION_CLOSED');
      const ctx = await loadContext(request, session.requestId, userId);
      if (!ctx) return fail('心愿不存在', 404, 'NOT_FOUND');
      if ((ctx.request.revision ?? 1) !== session.requestRevision) return fail('心愿已被修改，请基于最新版本开始新对话', 409, 'REVISION_CONFLICT');
      const report = await agentComplete(ctx, session.messages);
      if (useLocal) { session.status = 'COMPLETED'; session.report = report; }
      else if (!useCloudBase) { await d1SetStatus(session, 'COMPLETED', report); }
      else { await cloudBaseSetStatus(session, 'COMPLETED', userId, report); }
      return Response.json({ session });
    }

    if (body.action === 'dismiss') {
      const sessionId = String(body.sessionId ?? '');
      if (!body.confirmed) return fail('需要二次确认', 400, 'CONFIRM_REQUIRED');
      let session: AgentSession | null;
      if (useLocal) session = localSessions.get(sessionId) ?? null;
      else if (!useCloudBase) session = await d1LoadSession(sessionId);
      else session = await cloudBaseLoadSession(sessionId, userId);
      if (!session) return fail('会话不存在', 404, 'SESSION_NOT_FOUND');
      if (session.status === 'DISMISSED') return Response.json({ session });
      if (session.status !== 'IN_PROGRESS') return fail('会话已结束', 409, 'SESSION_CLOSED');
      if (useLocal) { session.status = 'DISMISSED'; }
      else if (!useCloudBase) { await d1SetStatus(session, 'DISMISSED'); }
      else { await cloudBaseSetStatus(session, 'DISMISSED', userId); }
      return Response.json({ session });
    }

    return fail('未知操作', 400, 'UNKNOWN_ACTION');
  } catch (error) {
    const status = error instanceof AiServiceError ? error.status : 500;
    return fail(error instanceof Error ? error.message : 'Agent 失败', status);
  }
}
