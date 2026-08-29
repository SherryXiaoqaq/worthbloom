'use client';

import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { AUTH_TOKEN_KEY, AUTH_USER_KEY, clearStoredSession, cloudBaseFetch, configureCloudBaseClient, isCloudBaseClientConfigured, type CloudBaseClientConfig } from '@/lib/cloudbase/client';

type AuthMode = 'login' | 'register';
type RegisterStep = 'credentials' | 'verify';
type AuthUser = { id?: string; email?: string; nickName?: string | null };
type AuthOutput = { ok?: boolean; error?: string; accessToken?: string; user?: AuthUser; verificationId?: string; isUser?: boolean };

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
  const [verificationId, setVerificationId] = useState('');
  const [isUser, setIsUser] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [shoppingOnboarding,setShoppingOnboarding]=useState(false);
  const [shoppingImages,setShoppingImages]=useState<string[]>([]);
  const [shoppingConsent,setShoppingConsent]=useState(false);

  useEffect(() => {
    if (!configured) return;
    let active = true;
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) { const frame=requestAnimationFrame(()=>{if(active)setChecking(false)});return()=>{active=false;cancelAnimationFrame(frame)}; }
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
    setMode(next); setStep('credentials'); setError(''); setNotice(''); setVerificationCode(''); setVerificationId(''); setIsUser(false);
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
          const output = await authRequest({ action: 'verify', email: payload.email, code: verificationCode.trim(), nickname: payload.nickname, password: payload.password, verificationId, isUser });
          saveSession(output);
          if(isUser)setSignedIn(true);else setShoppingOnboarding(true);
        } else {
          const output = await authRequest({ action: 'register', email: payload.email, password: payload.password });
          setVerificationId(output.verificationId ?? '');
          setIsUser(Boolean(output.isUser));
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

  async function chooseShoppingImages(files:FileList|null){
    const selected=Array.from(files??[]).slice(0,3);
    try{
      const values=await Promise.all(selected.map(file=>new Promise<string>((resolve,reject)=>{if(file.size>5*1024*1024){reject(new Error('每张图片不能超过 5MB'));return}const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||''));reader.onerror=()=>reject(new Error('图片读取失败'));reader.readAsDataURL(file)})));
      setShoppingImages(values);setError('');
    }catch(reason){setError(reason instanceof Error?reason.message:'图片读取失败')}
  }

  async function importShoppingProfile(){
    if(!shoppingConsent){setError('请先确认这是自愿提供，并了解保存范围');return}
    if(!shoppingImages.length){setError('请先选择 1–3 张购物截图');return}
    setBusy(true);setError('');
    try{const response=await cloudBaseFetch('/api/profile/shopping-import',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({images:shoppingImages,consent:true})});const output=await response.json() as {error?:string};if(!response.ok)throw new Error(output.error||'整理失败');setSignedIn(true);setShoppingOnboarding(false)}
    catch(reason){setError(reason instanceof Error?reason.message:'整理失败，请稍后再试')}
    finally{setBusy(false)}
  }

  if (!configured) return children;
  if (checking) return <main className="auth-stage"><section className="auth-card auth-loading-card"><div className="auth-loading"><span className="auth-mark" aria-hidden="true">好</span><b>WORTHBLOOM</b><p>正在打开你的好好花…</p><i aria-hidden="true"/></div></section></main>;
  if(shoppingOnboarding)return <main className="auth-stage"><section className="auth-card auth-onboarding"><div className="auth-panel"><p className="auth-overline">OPTIONAL · 可跳过</p><h1>愿意让我们了解<br/>你过去关注过什么吗？</h1><p className="auth-intro">可以选择 1–3 张历史购物截图或购物车截图。AI 只整理商品名称、类型和价格，用来让之后的提醒更贴近你。</p><label className="auth-shopping-upload"><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={event=>void chooseShoppingImages(event.target.files)}/><b>{shoppingImages.length?`已选择 ${shoppingImages.length} 张`:'选择购物截图'}</b><span>完成一次可获得 20 好好值</span></label><label className="auth-consent"><input type="checkbox" checked={shoppingConsent} onChange={event=>setShoppingConsent(event.target.checked)}/><span>我自愿提供这些截图，并了解系统默认不长期保存原图，只保存 AI 提取后的商品名称、类型、价格和识别置信度。</span></label>{error&&<p className="form-error">{error}</p>}<button className="main-button" disabled={busy} onClick={()=>void importShoppingProfile()}>{busy?'AI 正在整理…':'整理并进入好好花'}</button><button className="auth-skip" disabled={busy} onClick={()=>{setShoppingOnboarding(false);setSignedIn(true)}}>暂时跳过</button></div></section></main>;
  if (signedIn) return children;

  return <main className="auth-stage"><section className="auth-card">
    <header className="auth-hero">
      <div className="auth-brand"><span className="auth-mark" aria-hidden="true">好</span><div><b>WORTHBLOOM</b><small>好好花 · 把决定慢慢想清楚</small></div></div>
      <p className="auth-overline">{mode === 'login' ? 'WELCOME BACK' : 'START YOUR GARDEN'}</p>
      <h1>{mode === 'login' ? <>继续照看那些<br/>认真种下的愿望。</> : <>给每一个愿望<br/>留一点想清楚的时间。</>}</h1>
      <p className="auth-intro">记录心愿、听见不同视角，再做属于自己的决定。</p>
      <div className="auth-hero-decoration" aria-hidden="true"><span>愿</span><i/><i/><i/></div>
    </header>
    <div className="auth-panel">
      <div className="auth-tabs" aria-label="登录或注册"><button type="button" className={mode === 'login' ? 'active' : ''} aria-pressed={mode === 'login'} onClick={() => switchMode('login')}>登录</button><button type="button" className={mode === 'register' ? 'active' : ''} aria-pressed={mode === 'register'} onClick={() => switchMode('register')}>注册</button></div>
      <form className="auth-form" onSubmit={submit}>
        <label><span>邮箱</span><input required type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="name@example.com"/></label>
        <label><span>{mode === 'register' ? '昵称' : '昵称（可填）'}</span><input required={mode === 'register'} maxLength={20} value={nickname} onChange={event => setNickname(event.target.value)} placeholder={mode === 'register' ? '首页会这样称呼你' : '想更换称呼时填写，留空则不变'}/></label>
        <label><span>密码</span><input required minLength={8} maxLength={32} type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={event => setPassword(event.target.value)} placeholder="8–32 位，包含字母和数字"/></label>
        {mode === 'register' && step === 'verify' && <label><span>邮箱验证码</span><input required inputMode="numeric" autoComplete="one-time-code" value={verificationCode} onChange={event => setVerificationCode(event.target.value)} placeholder="填写邮件中的验证码"/></label>}
        {notice && <p className="auth-notice">{notice}</p>}
        {error && <p className="form-error">{error}</p>}
        <button className="main-button" disabled={busy}>{busy ? '请稍候…' : mode === 'login' ? '进入我的好好花' : step === 'verify' ? '验证并创建账户' : '发送邮箱验证码'}</button>
      </form>
      <small className="auth-footnote">朋友通过邀请链接回信时，无需注册或登录。</small>
    </div>
  </section></main>;
}
