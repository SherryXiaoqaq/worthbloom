'use client';

import { ReactNode, useEffect, useState } from 'react';
import { clearStoredSession, DEMO_SESSION_KEY } from '@/lib/cloudbase/client';

/**
 * 本地演示模式登录门。
 *
 * 演示模式没有真实的账号体系（服务端固定以 owner-preview 身份存放数据），
 * 但为了让「退出当前账号 → 回到登录页 → 重新登录」的流程可用，这里用
 * localStorage 记录一个演示会话。退出只清这个会话标记，服务端数据原样保留，
 * 重新进入即可回到之前的记录。
 */
export default function DemoAuthGate({ children }: { children: ReactNode }) {
  const [checking, setChecking] = useState(true);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let active = true;
    let value: string | null = null;
    try { value = localStorage.getItem(DEMO_SESSION_KEY); } catch { /* 隐私模式等场景忽略 */ }
    if (active) setSignedIn(value === '1');
    if (active) setChecking(false);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const onExpired = () => { clearStoredSession(); setSignedIn(false); };
    window.addEventListener('wb-auth-expired', onExpired);
    return () => window.removeEventListener('wb-auth-expired', onExpired);
  }, []);

  function enter() {
    try { localStorage.setItem(DEMO_SESSION_KEY, '1'); } catch { /* 忽略 */ }
    setSignedIn(true);
  }

  if (checking) return null;
  if (signedIn) return children;

  return <main className="auth-stage"><section className="auth-card">
    <header className="auth-hero">
      <div className="auth-brand"><span className="auth-mark" aria-hidden="true">好</span><div><b>WORTHBLOOM</b><small>好好花 · 把决定慢慢想清楚</small></div></div>
      <p className="auth-overline">WELCOME BACK</p>
      <h1>继续照看那些<br/>认真种下的愿望。</h1>
      <p className="auth-intro">记录心愿、听见不同视角，再做属于自己的决定。</p>
      <div className="auth-hero-decoration" aria-hidden="true"><span>愿</span><i/><i/><i/></div>
    </header>
    <div className="auth-panel">
      <button className="main-button" onClick={enter}>进入我的好好花</button>
      <small className="auth-footnote">本地演示模式 · 无需注册。退出后再次进入，你的心愿与积分都会原样保留。</small>
    </div>
  </section></main>;
}
