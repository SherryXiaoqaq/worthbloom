'use client';

import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { AUTH_TOKEN_KEY, AUTH_USER_KEY, clearStoredSession, configureCloudBaseClient, isCloudBaseClientConfigured, type CloudBaseClientConfig } from '@/lib/cloudbase/client';

type AuthMode = 'login' | 'register';
type RegisterStep = 'credentials' | 'verify';
type AuthUser = { id?: string; email?: string; nickName?: string | null };
type AuthOutput = { ok?: boolean; error?: string; accessToken?: string; user?: AuthUser };

function authMessage(reason: unknown) {
  if (!(reason instanceof Error)) return '登录没有成功，请稍后重试';
  const message = reason.message.toLowerCase();
  if (message.includes('password') || message.includes('credential')) return '邮箱或密码不正确';
  if (message.includes('verified') || message.includes('verify')) return '请先打开邮箱里的验证链接';
  if (message.includes('exist') || message.includes('registered')) return '这个邮箱已经注册，可以直接登录';
  return reason.message || 'CloudBase 身份认证失败';
}

async function authRequest(payload: Record<string, unknown>): Promise<AuthOutput> {
  const response = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const output = await response.json().catch(() => ({})) as AuthOutput;
  if (!response.ok || !output.ok) throw new Error(output.error || '请求失败，请稍后重试');
  return output;
}

export default function CloudBaseAuthGate({ children, config }: { children: ReactNode; config: CloudBaseClientConfig }) {
  configureCloudBaseClient(config);
  const configured = isCloudBaseClientConfigured();
  const [checking, setChecking] = useState(configured);
  const [signedIn, setSignedIn] = useState(!configured);
  const [mode, setMode] = useState<AuthMode>('login');
  const [step, setStep] = useState<RegisterStep>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!configured) return;
    let active = true;
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) { if (active) setChecking(false); return; }
    authRequest({ action: 'me', accessToken: token })
      .then(output => {
        if (!active) return;
        if (output.user?.email) {
          try {
            localStorage.setItem(AUTH_USER_KEY, JSON.stringify(output.user));
            const name = output.user.nickName;
            if (name && !localStorage.getItem(`wb-nickname:${output.user.email}`)) {
              localStorage.setItem(`wb-nickname:${output.user.email}`, name);
            }
          } catch { /* 隐私模式等场景忽略 */ }
        }
        setSignedIn(true);
      })
      .catch(() => { if (active) { clearStoredSession(); setSignedIn(false); } })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [configured]);

  useEffect(() => {
    if (!configured) return;
    const onExpired = () => { clearStoredSession(); setSignedIn(false); };
    window.addEventListener('wb-auth-expired', onExpired);
    return () => window.removeEventListener('wb-auth-expired', onExpired);
  }, [configured]);

  function switchMode(next: AuthMode) {
    setMode(next); setStep('credentials'); setError(''); setNotice(''); setVerificationCode('');
  }

  function saveSession(output: AuthOutput) {
    if (!output.accessToken || !output.user?.email) return;
    try {
      localStorage.setItem(AUTH_TOKEN_KEY, output.accessToken);
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(output.user));
      const name = nickname.trim();
      if (name) localStorage.setItem(`wb-nickname:${output.user.email}`, name);
      else if (output.user.nickName && !localStorage.getItem(`wb-nickname:${output.user.email}`)) {
        localStorage.setItem(`wb-nickname:${output.user.email}`, output.user.nickName);
      }
    } catch { /* 隐私模式等场景忽略 */ }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const payload = { email: email.trim(), password, nickname: nickname.trim() };
      if (mode === 'register') {
        if (step === 'verify') {
          const output = await authRequest({ action: 'verify', email: payload.email, code: verificationCode.trim(), nickname: payload.nickname });
          saveSession(output);
          setSignedIn(true);
        } else {
          await authRequest({ action: 'register', email: payload.email, password: payload.password });
          setStep('verify');
          setNotice('验证码已经发到邮箱，请在下方填写。');
        }
      } else {
        const output = await authRequest({ action: 'login', email: payload.email, password: payload.password, nickname: payload.nickname });
        saveSession(output);
        setSignedIn(true);
      }
    } catch (reason) {
      setError(authMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    try {
      if (token) await fetch('/api/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'logout', accessToken: token }) });
    } catch { /* 忽略 */ }
    clearStoredSession();
    setSignedIn(false);
    setPassword('');
    setStep('credentials');
  }

  if (!configured) return children;
  if (checking) return <main className="auth-stage"><div className="auth-loading"><img className="auth-logo" src="/flower2.png" alt="" draggable={false}/><p>正在打开愿望花园…</p></div></main>;
  if (signedIn) return <><button className="cloudbase-signout" onClick={signOut}>退出</button>{children}</>;

  return <main className="auth-stage"><section className="auth-card">
    <div className="auth-brand"><img className="auth-logo" src="/flower2.png" alt="" draggable={false}/><div><b>WORTHBLOOM</b><small>好好花 · 私人愿望花园</small></div></div>
    <img className="auth-flower" src="/flower.png" alt="" draggable={false}/>
    <p className="auth-overline">{mode === 'login' ? '欢迎回来' : '第一次来花园'}</p>
    <h1>{mode === 'login' ? <>继续照看那些<br/>认真种下的愿望。</> : <>为自己留一座<br/>慢慢生长的花园。</>}</h1>
    <div className="auth-tabs"><button className={mode === 'login' ? 'active' : ''} onClick={() => switchMode('login')}>登录</button><button className={mode === 'register' ? 'active' : ''} onClick={() => switchMode('register')}>注册</button></div>
    <form className="auth-form" onSubmit={submit}>
      <label><span>邮箱</span><input required type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="name@example.com"/></label>
      <label><span>{mode === 'register' ? '昵称' : '昵称（可填）'}</span><input required={mode === 'register'} maxLength={20} value={nickname} onChange={event => setNickname(event.target.value)} placeholder={mode === 'register' ? '首页会这样称呼你' : '登录时想换称呼就填一下，留空不变'}/></label>
      <label><span>密码</span><input required minLength={8} maxLength={32} type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={event => setPassword(event.target.value)} placeholder="8–32 位，包含字母和数字"/></label>
      {mode === 'register' && step === 'verify' && <label><span>邮箱验证码</span><input required inputMode="numeric" autoComplete="one-time-code" value={verificationCode} onChange={event => setVerificationCode(event.target.value)} placeholder="填写邮件中的验证码"/></label>}
      {notice && <p className="auth-notice">{notice}</p>}
      {error && <p className="form-error">{error}</p>}
      <button className="main-button" disabled={busy}>{busy ? '请稍候…' : mode === 'login' ? '进入我的花园' : step === 'verify' ? '验证并创建花园' : '发送邮箱验证码'}</button>
    </form>
    <small className="auth-footnote">朋友收到独立邀请链接后仍然无需登录。</small>
  </section></main>;
}
