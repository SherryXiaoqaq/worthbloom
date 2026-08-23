'use client';

import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { configureCloudBaseClient, getCloudBaseAuth, isCloudBaseClientConfigured, type CloudBaseClientConfig } from '@/lib/cloudbase/client';

type AuthMode = 'login' | 'register';
type VerifyRegistration = (params: { token: string }) => Promise<{ error?: { message?: string } | null }>;

function authMessage(reason: unknown) {
  if (!(reason instanceof Error)) return '登录没有成功，请稍后重试';
  const message = reason.message.toLowerCase();
  if (message.includes('password') || message.includes('credential')) return '邮箱或密码不正确';
  if (message.includes('verified') || message.includes('verify')) return '请先打开邮箱里的验证链接';
  if (message.includes('exist') || message.includes('registered')) return '这个邮箱已经注册，可以直接登录';
  return reason.message || 'CloudBase 身份认证失败';
}

export default function CloudBaseAuthGate({ children, config }: { children: ReactNode; config: CloudBaseClientConfig }) {
  configureCloudBaseClient(config);
  const configured = isCloudBaseClientConfigured();
  const [checking, setChecking] = useState(configured);
  const [signedIn, setSignedIn] = useState(!configured);
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [verifyRegistration, setVerifyRegistration] = useState<VerifyRegistration | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!configured) return;
    let active = true;
    getCloudBaseAuth().getCurrentUser()
      .then(user => { if (active) setSignedIn(Boolean(user)); })
      .catch(() => { if (active) setSignedIn(false); })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [configured]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const auth = getCloudBaseAuth();
      if (mode === 'register') {
        if (verifyRegistration) {
          const verified = await verifyRegistration({ token: verificationCode.trim() });
          if (verified.error) throw new Error(verified.error.message || '验证码不正确');
          setSignedIn(true);
        } else {
          const result = await auth.signUp({ email: email.trim(), password });
          if (result.error) throw new Error(result.error.message || '验证码发送失败');
          if (!result.data?.verifyOtp) throw new Error('CloudBase 没有返回验证码校验步骤');
          setVerifyRegistration(() => result.data.verifyOtp as VerifyRegistration);
          setNotice('验证码已经发到邮箱，请在下方填写。');
        }
      } else {
        const result = await auth.signInWithPassword({ email: email.trim(), password });
        if (result.error) throw new Error(result.error.message || '登录失败');
        setSignedIn(true);
      }
    } catch (reason) {
      setError(authMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await getCloudBaseAuth().signOut();
    setSignedIn(false);
    setPassword('');
  }

  if (!configured) return children;
  if (checking) return <main className="auth-stage"><div className="auth-loading"><span>好</span><p>正在打开愿望花园…</p></div></main>;
  if (signedIn) return <><button className="cloudbase-signout" onClick={signOut}>退出</button>{children}</>;

  return <main className="auth-stage"><section className="auth-card">
    <div className="auth-brand"><span>好</span><div><b>WORTHBLOOM</b><small>好好花 · 私人愿望花园</small></div></div>
    <div className="auth-flower">✿</div>
    <p className="auth-overline">{mode === 'login' ? '欢迎回来' : '第一次来花园'}</p>
    <h1>{mode === 'login' ? <>继续照看那些<br/>认真种下的愿望。</> : <>为自己留一座<br/>慢慢生长的花园。</>}</h1>
    <div className="auth-tabs"><button className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError(''); setNotice(''); setVerifyRegistration(null); setVerificationCode(''); }}>登录</button><button className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError(''); setNotice(''); setVerifyRegistration(null); setVerificationCode(''); }}>注册</button></div>
    <form className="auth-form" onSubmit={submit}>
      <label><span>邮箱</span><input required type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="name@example.com"/></label>
      <label><span>密码</span><input required minLength={8} maxLength={32} type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={event => setPassword(event.target.value)} placeholder="8–32 位，包含字母和数字"/></label>
      {mode === 'register' && verifyRegistration && <label><span>邮箱验证码</span><input required inputMode="numeric" autoComplete="one-time-code" value={verificationCode} onChange={event => setVerificationCode(event.target.value)} placeholder="填写邮件中的验证码"/></label>}
      {notice && <p className="auth-notice">{notice}</p>}
      {error && <p className="form-error">{error}</p>}
      <button className="main-button" disabled={busy}>{busy ? '请稍候…' : mode === 'login' ? '进入我的花园' : verifyRegistration ? '验证并创建花园' : '发送邮箱验证码'}</button>
    </form>
    <small className="auth-footnote">朋友收到独立邀请链接后仍然无需登录。</small>
  </section></main>;
}
