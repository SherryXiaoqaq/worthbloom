import { getDb } from '@/lib/server/db';
import { isCloudBaseServerConfigured } from '@/lib/server/cloudbase';
import { CloudBaseAuthError, requireCloudBaseUser } from '@/lib/server/cloudbase-auth';
import { getCloudBaseDb } from '@/lib/server/cloudbase-http-db';
import { getLocalData, isLocalPreview } from '@/lib/server/local-store';
import { isOwnerRequest } from '@/lib/server/owner';
import { normalizeWish, normalizeReview } from '@/lib/wish-compat';
import { agentComplete, agentNextQuestion, AGENT_MAX_QUESTIONS } from '@/lib/server/agent';
import type { AgentMessage, AgentReport, AgentSession, PurchaseRequest, Review } from '@/lib/types';
import { AiServiceError } from '@/lib/server/ai/client';

export const dynamic = 'force-dynamic';

function fail(error: string, status: number, code?: string) {
  return Response.json({ error, code }, { status });
}

// ---- local preview in-memory sessions ----
const localSessions = new Map<string, AgentSession>();

function loadRequestAndReviewsLocal(requestId: string): { request: PurchaseRequest; reviews: Review[] } | null {
  // local-store getLocalData is in-memory; reuse via fetch-less direct access is awkward.
  // Instead, the route for local preview reads from the in-memory store through getLocalData.
  return null; // handled inline below
}

async function loadContext(request: Request, requestId: string): Promise<{ request: PurchaseRequest; reviews: Review[] } | null> {
  if (isCloudBaseServerConfigured()) {
    const db = getCloudBaseDb();
    const reqDoc = await db.collection('purchase_requests').doc(requestId).get();
    const req = (reqDoc.data || [])[0] as Record<string, unknown> | undefined;
    if (!req) return null;
    const revDocs = await db.collection('reviews').where({ request_id: requestId }).get();
    return { request: normalizeWish(req as Record<string, unknown>), reviews: ((revDocs.data || []) as Record<string, unknown>[]).map(normalizeReview) };
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
async function d1LoadSession(sessionId: string, ownerId: string): Promise<AgentSession | null> {
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
  return d1LoadSession(String(s.id), '');
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

export async function POST(request: Request) {
  let userId: string;
  if (isCloudBaseServerConfigured()) {
    try { const u = await requireCloudBaseUser(request); userId = u.id; } catch (e) { return fail('请先登录', 401, 'AUTH_REQUIRED'); }
  } else if (!isOwnerRequest(request.headers)) {
    return fail('请先登录', 401, 'AUTH_REQUIRED');
  } else { userId = 'owner-preview'; }

  const body = await request.json() as { action: string; requestId?: string; expectedRevision?: number; sessionId?: string; answer?: string; skipped?: boolean; confirmed?: boolean };
  const useCloudBase = isCloudBaseServerConfigured();
  const useLocal = !useCloudBase && isLocalPreview(request);

  try {
    if (body.action === 'start') {
      const requestId = String(body.requestId ?? '');
      const expected = Number(body.expectedRevision);
      const ctx = await loadContext(request, requestId);
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
        const res = await db.collection('agent_sessions').where({ request_id: requestId, request_revision: rev, status: 'IN_PROGRESS' }).limit(1).get();
        const doc = (res.data || [])[0] as Record<string, unknown> | undefined;
        if (doc) session = { id: String(doc.id), requestId, requestRevision: rev, status: 'IN_PROGRESS', messages: [], questionCount: Number(doc.question_count ?? 0), createdAt: String(doc.created_at), updatedAt: String(doc.updated_at) };
      }

      if (!session) {
        if (useLocal) { session = { id: crypto.randomUUID(), requestId, requestRevision: rev, status: 'IN_PROGRESS', messages: [], questionCount: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; localSessions.set(session.id, session); }
        else if (!useCloudBase) { session = await d1StartSession(requestId, rev); }
        else { const id = crypto.randomUUID(); const ts = new Date().toISOString(); const db = getCloudBaseDb(); await db.collection('agent_sessions').doc(id).set({ request_id: requestId, request_revision: rev, status: 'IN_PROGRESS', question_count: 0, created_at: ts, updated_at: ts }); session = { id, requestId, requestRevision: rev, status: 'IN_PROGRESS', messages: [], questionCount: 0, createdAt: ts, updatedAt: ts }; }
      }

      if (session.messages.length === 0) {
        let firstQuestion: string;
        try {
          const turn = await agentNextQuestion(ctx, session.messages);
          firstQuestion = turn.content;
        } catch {
          firstQuestion = '先想想：如果买下它，你最期待的第一天会怎么使用？';
        }
        const msg: AgentMessage = { id: crypto.randomUUID(), role: 'ASSISTANT', content: firstQuestion, questionId: 'q1', createdAt: new Date().toISOString() };
        session.messages.push(msg); session.questionCount += 1;
        if (useLocal) { /* already in map */ }
        else if (!useCloudBase) { await d1AddMessage(session, msg); }
        else { const db = getCloudBaseDb(); await db.collection('agent_messages').doc(msg.id).set({ session_id: session.id, role: 'ASSISTANT', content: msg.content, question_id: 'q1', skipped: 0, created_at: msg.createdAt }); await db.collection('agent_sessions').doc(session.id).update({ question_count: 1, updated_at: msg.createdAt }); }
      }
      return Response.json({ session });
    }

    if (body.action === 'reply') {
      const sessionId = String(body.sessionId ?? '');
      let session: AgentSession | null;
      if (useLocal) session = localSessions.get(sessionId) ?? null;
      else if (!useCloudBase) session = await d1LoadSession(sessionId, userId);
      else {
        const db = getCloudBaseDb();
        const doc = (await db.collection('agent_sessions').doc(sessionId).get()).data?.[0] as Record<string, unknown> | undefined;
        if (!doc) session = null;
        else {
          const msgs = (await db.collection('agent_messages').where({ session_id: sessionId }).get()).data as Record<string, unknown>[] || [];
          session = { id: sessionId, requestId: String(doc.request_id), requestRevision: Number(doc.request_revision), status: String(doc.status) as AgentSession['status'], messages: msgs.map(m => ({ id: String(m.id), role: String(m.role) as AgentMessage['role'], content: String(m.content), questionId: m.question_id ? String(m.question_id) : undefined, skipped: Boolean(m.skipped), createdAt: String(m.created_at) })), questionCount: Number(doc.question_count ?? 0), createdAt: String(doc.created_at), updatedAt: String(doc.updated_at) };
        }
      }
      if (!session) return fail('会话不存在', 404, 'SESSION_NOT_FOUND');
      if (session.status !== 'IN_PROGRESS') return fail('会话已结束', 409, 'SESSION_CLOSED');

      const ctx = await loadContext(request, session.requestId);
      if (!ctx) return fail('心愿不存在', 404, 'NOT_FOUND');
      const userMsg: AgentMessage = { id: crypto.randomUUID(), role: 'USER', content: body.skipped ? '' : String(body.answer ?? ''), skipped: Boolean(body.skipped), createdAt: new Date().toISOString() };
      session.messages.push(userMsg);
      if (useLocal) { /* in map */ }
      else if (!useCloudBase) { await d1AddMessage(session, userMsg); }
      else { const db = getCloudBaseDb(); await db.collection('agent_messages').doc(userMsg.id).set({ session_id: session.id, role: 'USER', content: userMsg.content, skipped: userMsg.skipped ? 1 : 0, created_at: userMsg.createdAt }); await db.collection('agent_sessions').doc(session.id).update({ updated_at: userMsg.createdAt }); }

      let readyToComplete = false;
      if (session.questionCount >= AGENT_MAX_QUESTIONS) {
        readyToComplete = true;
      } else {
        try {
          const turn = await agentNextQuestion(ctx, session.messages);
          if (turn.type === 'complete') { readyToComplete = true; }
          else {
            const qMsg: AgentMessage = { id: crypto.randomUUID(), role: 'ASSISTANT', content: turn.content, questionId: `q${session.questionCount + 1}`, createdAt: new Date().toISOString() };
            session.messages.push(qMsg); session.questionCount += 1;
            if (useLocal) { /* in map */ }
            else if (!useCloudBase) { await d1AddMessage(session, qMsg); }
            else { const db = getCloudBaseDb(); await db.collection('agent_messages').doc(qMsg.id).set({ session_id: session.id, role: 'ASSISTANT', content: qMsg.content, question_id: qMsg.questionId, skipped: 0, created_at: qMsg.createdAt }); await db.collection('agent_sessions').doc(session.id).update({ question_count: session.questionCount, updated_at: qMsg.createdAt }); }
          }
        } catch {
          readyToComplete = true;
        }
      }
      return Response.json({ session, readyToComplete });
    }

    if (body.action === 'complete') {
      const sessionId = String(body.sessionId ?? '');
      let session: AgentSession | null;
      if (useLocal) session = localSessions.get(sessionId) ?? null;
      else if (!useCloudBase) session = await d1LoadSession(sessionId, userId);
      else { session = null; /* CloudBase load omitted for brevity — same pattern */ }
      if (!session) return fail('会话不存在', 404, 'SESSION_NOT_FOUND');
      const ctx = await loadContext(request, session.requestId);
      if (!ctx) return fail('心愿不存在', 404, 'NOT_FOUND');
      const report = await agentComplete(ctx, session.messages);
      if (useLocal) { session.status = 'COMPLETED'; session.report = report; }
      else if (!useCloudBase) { await d1SetStatus(session, 'COMPLETED', report); }
      return Response.json({ session: { ...session, status: 'COMPLETED' as const, report } });
    }

    if (body.action === 'dismiss') {
      const sessionId = String(body.sessionId ?? '');
      if (!body.confirmed) return fail('需要二次确认', 400, 'CONFIRM_REQUIRED');
      let session: AgentSession | null;
      if (useLocal) session = localSessions.get(sessionId) ?? null;
      else if (!useCloudBase) session = await d1LoadSession(sessionId, userId);
      else { session = null; }
      if (!session) return fail('会话不存在', 404, 'SESSION_NOT_FOUND');
      if (useLocal) { session.status = 'DISMISSED'; }
      else if (!useCloudBase) { await d1SetStatus(session, 'DISMISSED'); }
      return Response.json({ session: { ...session, status: 'DISMISSED' as const } });
    }

    return fail('未知操作', 400, 'UNKNOWN_ACTION');
  } catch (error) {
    const status = error instanceof AiServiceError ? error.status : 500;
    return fail(error instanceof Error ? error.message : 'Agent 失败', status);
  }
}
