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
  const [nickname, setNickname] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [verifyRegistration, setVerifyRegistration] = useState<VerifyRegistration | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!configured) return;
    let active = true;
    // CloudBase 会给未登录访客自动生成“游客身份”，getCurrentUser() 对游客也返回对象。
    // 必须判断是不是真实邮箱账号（有 email / loginType 为 email / 已验证邮箱），
    // 否则游客会被当成主人直接放进花园。
    getCloudBaseAuth().getCurrentUser()
      .then(user => {
        if (!active) return;
        const u = user as (Record<string, unknown> & { email?: string; loginType?: string; email_verified?: boolean; emailVerified?: boolean }) | null | undefined;
        const hasRealIdentity = Boolean(u && (u.email || u.loginType === 'email' || u.email_verified || u.emailVerified));
        setSignedIn(hasRealIdentity);
      })
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
          await saveNickname();
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
        await saveNickname();
        setSignedIn(true);
      }
    } catch (reason) {
      setError(authMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function saveNickname() {
    const name = nickname.trim();
    if (!name) return;
    try {
      const user = await getCloudBaseAuth().getCurrentUser();
      const email = (user as { email?: string } | null)?.email || '';
      // 1) 本地立即记录（同浏览器必定生效）
      try { localStorage.setItem(`wb-nickname:${email}`, name); } catch { /* 隐私模式等场景忽略 */ }
      // 2) CloudBase 用户资料里也存一份（跨设备同步，尽力而为）
      try { await (user as { update?: (info: Record<string, unknown>) => Promise<void> } | null)?.update?.({ nickName: name }); } catch { /* 不阻断进入花园 */ }
    } catch {
      // 拿不到用户信息时至少本地记录
      try { localStorage.setItem('wb-nickname:unknown', name); } catch { /* 忽略 */ }
    }
  }

  async function signOut() {
    await getCloudBaseAuth().signOut();
    setSignedIn(false);
    setPassword('');
  }

  if (!configured) return children;
  if (checking) return <main className="auth-stage"><div className="auth-loading"><img className="auth-logo" src="/flower2.png" alt="" draggable={false}/><p>正在打开愿望花园…</p></div></main>;
  if (signedIn) return <><button className="cloudbase-signout" onClick={signOut}>退出</button>{children}</>;

  return <main className="auth-stage"><section className="auth-card">
    <div className="auth-brand"><img className="auth-logo" src="/flower2.png" alt="" draggable={false}/><div><b>WORTHBLOOM</b><small>好好花 · 私人愿望花园</small></div></div>
    <img className="auth-flower" src="/flower.png" alt="" draggable={false}/>
    <p className="auth-overline">{mode === 'login' ? '欢迎回来' : '第一次来花园'}</p>
    <h1>{mode === 'login' ? <>继续照看那些<br/>认真种下的愿望。</> : <>为自己留一座<br/>慢慢生长的花园。</>}</h1>
    <div className="auth-tabs"><button className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError(''); setNotice(''); setVerifyRegistration(null); setVerificationCode(''); }}>登录</button><button className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError(''); setNotice(''); setVerifyRegistration(null); setVerificationCode(''); }}>注册</button></div>
    <form className="auth-form" onSubmit={submit}>
      <label><span>邮箱</span><input required type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="name@example.com"/></label>
      <label><span>{mode === 'register' ? '昵称' : '昵称（可填）'}</span><input required={mode === 'register'} maxLength={20} value={nickname} onChange={event => setNickname(event.target.value)} placeholder={mode === 'register' ? '首页会这样称呼你' : '登录时想换称呼就填一下，留空不变'}/></label>
      <label><span>密码</span><input required minLength={8} maxLength={32} type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={event => setPassword(event.target.value)} placeholder="8–32 位，包含字母和数字"/></label>
      {mode === 'register' && verifyRegistration && <label><span>邮箱验证码</span><input required inputMode="numeric" autoComplete="one-time-code" value={verificationCode} onChange={event => setVerificationCode(event.target.value)} placeholder="填写邮件中的验证码"/></label>}
      {notice && <p className="auth-notice">{notice}</p>}
      {error && <p className="form-error">{error}</p>}
      <button className="main-button" disabled={busy}>{busy ? '请稍候…' : mode === 'login' ? '进入我的花园' : verifyRegistration ? '验证并创建花园' : '发送邮箱验证码'}</button>
    </form>
    <small className="auth-footnote">朋友收到独立邀请链接后仍然无需登录。</small>
  </section></main>;
}
