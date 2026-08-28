'use client';

import { useEffect, useState } from 'react';
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
  const [loadingSession, setLoadingSession] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function loadSession() {
      setLoadingSession(true); setError('');
      try {
        const res = await json<{ session: AgentSession | null; readyToComplete: boolean }>(await cloudBaseFetch('/api/agent', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'load', requestId, expectedRevision: revision }) }));
        if (mounted) { setSession(res.session); setReadyToComplete(res.readyToComplete); }
      } catch (e) {
        if (mounted) setError(e instanceof Error ? e.message : '读取对话记录失败');
      } finally {
        if (mounted) setLoadingSession(false);
      }
    }
    void loadSession();
    return () => { mounted = false; };
  }, [requestId, revision]);

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

  if (loadingSession) return <section className={styles.agentPanel}><div className={styles.agentEntry}><Sparkle size={24} /><div><b>正在找回这次聊天</b><p>稍等一下，之前的回答和回看会保留。</p></div></div></section>;

  if (!session) return <section className={styles.agentPanel}><div className={styles.agentEntry}><Sparkle size={28} /><div><b>和 AI 聊聊这件事</b><p>把想买它的理由、担心和真实生活场景说出来。AI 会听着你的话继续追问，帮你看见想要、代价和未知，不替你决定。</p></div><button className={styles.primary} disabled={!!busy} onClick={() => void start()}>{busy === 'start' ? '正在开始…' : '开始聊聊'}</button></div>{error && <p className={styles.toast}>{error}</p>}</section>;

  if (session.status === 'COMPLETED' && session.report) {
    const r = session.report;
    return <section className={styles.agentPanel}><div className={styles.agentHeader}><Sparkle size={20} /><h2>这次聊过的事</h2><small>最终决定由你完成</small></div>
      {REPORT_GROUPS.map(g => { const items = r[g.key] as EvidenceItem[]; return items.length ? <div key={g.key} className={styles.reportGroup}><h3>{g.label}</h3><EvidenceList items={items} /></div> : null; })}
      <div className={styles.reportDisclaimer}><p>{r.disclaimer}</p><button className={styles.headingLink} onClick={() => void start()}>重新开始对话</button></div>
    </section>;
  }

  if (session.status === 'DISMISSED') return <section className={styles.agentPanel}><div className={styles.agentEntry}><b>这次聊天先放在这里</b><p>已经回答的内容还在，想继续时可以重新开始。</p><button className={styles.primary} disabled={!!busy} onClick={() => void start()}>重新开始</button></div></section>;

  // IN_PROGRESS
  return <section className={styles.agentPanel}>
    <div className={styles.agentHeader}><Sparkle size={20} /><h2>和 AI 聊聊</h2><small>第 {session.questionCount} 轮</small><button className={styles.dismissBtn} onClick={() => void dismiss()}>先放一放</button></div>
    <div className={styles.agentMessages}>
      {session.messages.map(m => m.role === 'ASSISTANT' ? <div key={m.id} className={styles.msgAssistant}><small>AI</small><p>{m.content}</p></div> : <div key={m.id} className={styles.msgUser}><small>{m.skipped ? '已跳过' : '你'}</small><p>{m.content || '（跳过）'}</p></div>)}
    </div>
    {readyToComplete ? <div className={styles.agentComplete}><p>我们已经把几个关键地方聊过一遍，可以整理成一份回看。</p><button className={styles.primary} disabled={!!busy} onClick={() => void complete()}>{busy === 'complete' ? '正在整理…' : '整理这次聊天'}</button></div>
      : <div className={styles.agentInput}><textarea rows={4} value={answer} onChange={e => setAnswer(e.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();if(answer.trim()&&!busy)void reply(false)}}} placeholder="写下你的真实想法，AI 会接着聊（Ctrl / ⌘ + Enter 发送）" /><div className={styles.agentInputActions}><button onClick={() => void reply(true)} disabled={!!busy}>先跳过</button><button className={styles.primary} onClick={() => void reply(false)} disabled={!!busy || !answer.trim()}>{busy === 'reply' ? '提交中…' : '继续聊'}</button></div></div>}
    {error && <p className={styles.toast}>{error}</p>}
  </section>;
}
