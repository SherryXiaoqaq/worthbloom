'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import type { ReviewChoice } from '@/lib/types';

interface ReviewWish { id:string; name:string; price:number; reason:string; category:string; total_units:number|null; usage_frequency:string|null; expiry_date:string|null; status:string; }

const options:{id:ReviewChoice;title:string;note:string;mark:string}[] = [
  { id:'BUY_NOW', title:'现在购买', note:'现在就值得拥有', mark:'花' },
  { id:'SAVE_FIRST', title:'存钱购买', note:'值得，但先慢慢准备', mark:'芽' },
  { id:'WAIT', title:'这次不买', note:'让愿望先安静一会儿', mark:'种' },
];

export default function FriendReviewPage() {
  const params = useParams<{ token:string }>();
  const token = params?.token ?? '';
  const [wish,setWish] = useState<ReviewWish|null>(null);
  const [choice,setChoice] = useState<ReviewChoice>('SAVE_FIRST');
  const [name,setName] = useState('');
  const [comment,setComment] = useState('');
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [done,setDone] = useState(false);
  const [busy,setBusy] = useState(false);

  useEffect(() => {
    if (!token) {
      Promise.resolve().then(() => { setError('这条链接不完整'); setLoading(false); });
      return;
    }
    fetch(`/api/review?token=${encodeURIComponent(token)}`, { cache:'no-store' })
      .then(async response => {
        const data = await response.json() as { error?:string; request?:ReviewWish };
        if (!response.ok) throw new Error(data.error ?? '链接无法打开');
        if (!data.request) throw new Error('邀请卡内容不完整');
        setWish(data.request);
      })
      .catch(reason => setError(reason instanceof Error ? reason.message : '加载失败'))
      .finally(() => setLoading(false));
  }, [token]);

  const perUse = useMemo(() => wish?.total_units ? Math.round(wish.price / wish.total_units) : null, [wish]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/review', { method:'POST', headers:{ 'content-type':'application/json' }, body:JSON.stringify({ token, reviewerName:name, choice, comment }) });
      const data = await response.json() as { error?:string };
      if (!response.ok) throw new Error(data.error ?? '提交失败');
      setDone(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '提交失败');
    } finally { setBusy(false); }
  }

  if (loading) return <main className="friend-stage"><div className="friend-shell loading-card">愿望正在展开…</div></main>;
  if (error && !wish) return <main className="friend-stage"><div className="friend-shell"><div className="friend-brand"><img className="auth-logo" src="/flower2.png" alt="" draggable={false}/><b>好好花</b></div><section className="link-error"><b>这张邀请卡已经合上</b><p>{error}</p><small>每张链接只属于一位朋友，也只能填写一次。</small></section></div></main>;
  if (done) return <main className="friend-stage"><div className="friend-shell"><div className="friend-brand"><img className="auth-logo" src="/flower2.png" alt="" draggable={false}/><b>好好花</b></div><section className="thanks-card"><img className="auth-flower" src="/flower.png" alt="" draggable={false}/><span>建议已经送到</span><h1>谢谢你，认真听完了<br/>这个愿望。</h1><p>这张链接已经自动失效。<br/>你的留言只会回到心愿主人的花园。</p></section></div></main>;

  return <main className="friend-stage"><div className="friend-shell"><header className="friend-brand"><img className="auth-logo" src="/flower2.png" alt="" draggable={false}/><b>好好花</b><em>一封只给你的愿望卡</em></header>{wish && <>
    <section className="wish-letter"><span>{wish.category} · 想听听你的看法</span><h1>{wish.name}</h1><strong>¥{wish.price.toLocaleString()}</strong><blockquote>“{wish.reason}”</blockquote><div className="wish-facts">{wish.total_units ? <div><b>{wish.total_units}</b><span>{wish.category === '旅行体验' ? '天' : '次'}</span></div> : null}{perUse ? <div><b>¥{perUse}</b><span>全部用完每次</span></div> : null}{wish.usage_frequency ? <div><b>计划</b><span>{wish.usage_frequency}</span></div> : null}</div></section>
    <form className="friend-form" onSubmit={submit}><div className="friend-question"><span>只需要填写三件事</span><h2>站在了解她的角度，<br/>给一个真诚的建议。</h2></div>
      <label><span>1 · 你的昵称 *</span><input required maxLength={20} value={name} onChange={event=>setName(event.target.value)} placeholder="昵称即可，不需要注册"/></label>
      <fieldset className="choice-field"><legend>2 · 你建议她怎么做？ *</legend><div className="review-options">{options.map(option=><button type="button" className={choice===option.id?'selected':''} onClick={()=>setChoice(option.id)} key={option.id}><i>{option.mark}</i><div><b>{option.title}</b><span>{option.note}</span></div><em>{choice===option.id?'✓':''}</em></button>)}</div></fieldset>
      <label><span>3 · 原因 / 留言 *</span><textarea required maxLength={500} rows={5} value={comment} onChange={event=>setComment(event.target.value)} placeholder="为什么这样建议？支持、担心，或她可能没想到的角度，都很有用。"/></label>
      {error && <p className="form-error">{error}</p>}<button className="friend-submit" disabled={busy}>{busy?'正在送出…':'把建议送给她'}</button><small className="privacy-note">无需登录 · 每张链接仅能提交一次 · 看不到其他人的留言</small>
    </form></>}</div></main>;
}
