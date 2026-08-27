'use client';

import { useState } from 'react';
import type { AgentReport, AgentSession, EvidenceItem } from '@/lib/types';
import { cloudBaseFetch } from '@/lib/cloudbase/client';
import styles from './worthbloom-v2.module.css';

const Sparkle = ({ size = 20 }: { size?: number }) => <span style={{ fontSize: size, lineHeight: 1 }}>✦</span>;

async function json<T>(response: Response): Promise<T> {
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || '操作失败');
  return data;
}

const REPORT_GROUPS: { key: keyof AgentReport; label: string }[] = [
  { key: 'confirmedFacts', label: '已确认事实' },
  { key: 'motives', label: '你的动机' },
  { key: 'signalsForPurchase', label: '倾向购买' },
  { key: 'signalsForWaiting', label: '倾向等待' },
  { key: 'unknowns', label: '仍未知' },
  { key: 'humanConsensus', label: '朋友共识' },
  { key: 'humanDisagreements', label: '朋友分歧' },
];

const SOURCE_LABEL: Record<string, string> = { WISH_FACT: '事实', USER_ANSWER: '你的回答', HUMAN_REVIEW: '真人', AI_INFERENCE: 'AI 推断' };

function EvidenceList({ items }: { items: EvidenceItem[] }) {
  if (!items.length) return null;
  return <ul className={styles.evidenceList}>{items.map(item => <li key={item.id}><small className={styles.evidenceSource}>{SOURCE_LABEL[item.source] || item.source}</small><span>{item.text}</span></li>)}</ul>;
}

export function AgentPanel({ requestId, revision }: { requestId: string; revision: number }) {
  const [session, setSession] = useState<AgentSession | null>(null);
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [readyToComplete, setReadyToComplete] = useState(false);

  async function start() {
    setBusy('start'); setError('');
    try {
      const res = await json<{ session: AgentSession }>(await cloudBaseFetch('/api/agent', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'start', requestId, expectedRevision: revision }) }));
      setSession(res.session); setReadyToComplete(false);
    } catch (e) { setError(e instanceof Error ? e.message : '启动失败'); }
    finally { setBusy(''); }
  }

  async function reply(skipped: boolean) {
    if (!session) return;
    setBusy('reply'); setError('');
    try {
      const res = await json<{ session: AgentSession; readyToComplete: boolean }>(await cloudBaseFetch('/api/agent', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'reply', sessionId: session.id, answer: skipped ? '' : answer, skipped }) }));
      setSession(res.session); setReadyToComplete(res.readyToComplete); setAnswer('');
    } catch (e) { setError(e instanceof Error ? e.message : '提交失败'); }
    finally { setBusy(''); }
  }

  async function complete() {
    if (!session) return;
    setBusy('complete'); setError('');
    try {
      const res = await json<{ session: AgentSession }>(await cloudBaseFetch('/api/agent', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'complete', sessionId: session.id }) }));
      setSession(res.session); setReadyToComplete(false);
    } catch (e) { setError(e instanceof Error ? e.message : '生成报告失败'); }
    finally { setBusy(''); }
  }

  async function dismiss() {
    if (!session) return;
    if (!confirm('放弃本次对话？已回答的内容保留审计记录，但不会生成报告。')) return;
    setBusy('dismiss'); setError('');
    try {
      const res = await json<{ session: AgentSession }>(await cloudBaseFetch('/api/agent', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'dismiss', sessionId: session.id, confirmed: true }) }));
      setSession(res.session);
    } catch (e) { setError(e instanceof Error ? e.message : '操作失败'); }
    finally { setBusy(''); }
  }

  if (!session) return <section className={styles.agentPanel}><div className={styles.agentEntry}><Sparkle size={28} /><div><b>AI 决策对话</b><p>基于心愿事实与朋友反馈，逐个问题帮你理清，最后给出一份带来源的决策报告。不替你决定。</p></div><button className={styles.primary} disabled={!!busy} onClick={() => void start()}>{busy === 'start' ? '正在开始…' : '开始对话'}</button></div>{error && <p className={styles.toast}>{error}</p>}</section>;

  if (session.status === 'COMPLETED' && session.report) {
    const r = session.report;
    return <section className={styles.agentPanel}><div className={styles.agentHeader}><Sparkle size={20} /><h2>AI 决策报告</h2><small>最终决定由你完成</small></div>
      {REPORT_GROUPS.map(g => { const items = r[g.key] as EvidenceItem[]; return items.length ? <div key={g.key} className={styles.reportGroup}><h3>{g.label}</h3><EvidenceList items={items} /></div> : null; })}
      <div className={styles.reportDisclaimer}><p>{r.disclaimer}</p><button className={styles.headingLink} onClick={() => void start()}>重新开始对话</button></div>
    </section>;
  }

  if (session.status === 'DISMISSED') return <section className={styles.agentPanel}><div className={styles.agentEntry}><b>已放弃本次对话</b><p>可以重新开始一个新对话。</p><button className={styles.primary} disabled={!!busy} onClick={() => void start()}>重新开始</button></div></section>;

  // IN_PROGRESS
  return <section className={styles.agentPanel}>
    <div className={styles.agentHeader}><Sparkle size={20} /><h2>AI 决策对话</h2><small>已问 {session.questionCount} 题</small><button className={styles.dismissBtn} onClick={() => void dismiss()}>放弃对话</button></div>
    <div className={styles.agentMessages}>
      {session.messages.map(m => m.role === 'ASSISTANT' ? <div key={m.id} className={styles.msgAssistant}><small>AI</small><p>{m.content}</p></div> : <div key={m.id} className={styles.msgUser}><small>{m.skipped ? '已跳过' : '你'}</small><p>{m.content || '（跳过）'}</p></div>)}
    </div>
    {readyToComplete ? <div className={styles.agentComplete}><p>问题问完了，可以生成报告了。</p><button className={styles.primary} disabled={!!busy} onClick={() => void complete()}>{busy === 'complete' ? '正在生成…' : '生成决策报告'}</button></div>
      : <div className={styles.agentInput}><textarea rows={3} value={answer} onChange={e => setAnswer(e.target.value)} placeholder="回答 AI 的问题" /><div className={styles.agentInputActions}><button onClick={() => void reply(true)} disabled={!!busy}>暂时跳过</button><button className={styles.primary} onClick={() => void reply(false)} disabled={!!busy || !answer.trim()}>{busy === 'reply' ? '提交中…' : '提交回答'}</button></div></div>}
    {error && <p className={styles.toast}>{error}</p>}
  </section>;
}
