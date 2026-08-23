'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { AppData, Asset, PurchaseRequest, ReviewChoice, ReviewInvite, SavingGoal } from '@/lib/types';

type Tab = 'home' | 'wishes' | 'saving' | 'assets';
type Screen = 'main' | 'create' | 'request' | 'createAsset';

const choiceCopy: Record<ReviewChoice, string> = { BUY_NOW:'现在购买', SAVE_FIRST:'存钱购买', WAIT:'这次不买' };
const typeCopy: Record<Asset['type'], string> = { COURSE:'课程', MEMBERSHIP:'会员', STORED_VALUE:'储值', ITEM:'实物' };

async function readApi<T>(response:Response):Promise<T> {
  const raw = await response.text();
  let output:Record<string,unknown>;
  try { output = raw ? JSON.parse(raw) as Record<string,unknown> : {}; }
  catch { throw new Error('本地接口没有正常启动，请刷新页面后再试'); }
  if (!response.ok) throw new Error(typeof output.error === 'string' ? output.error : '操作失败');
  return output as T;
}

const fallbackData: AppData = {
  requests:[{ id:'request-iceland', name:'去冰岛看极光', price:18600, reason:'二十七岁以前，想认真地去一次很远的地方。不是逃离，是奖励自己终于学会独自出发。', category:'旅行体验', total_units:7, usage_frequency:'一次完整旅行', expiry_date:null, product_url:null, similar_item:null, status:'REVIEWING', review_token:'iceland-demo-2026', created_at:'2026-08-21T10:00:00Z', review_count:3 }],
  reviews:[
    { id:'r1', request_id:'request-iceland', reviewer_name:'桃子', choice:'SAVE_FIRST', comment:'这件事你念叨很久了，值得去。慢一点准备，会更安心。', created_at:'2026-08-22T10:00:00Z' },
    { id:'r2', request_id:'request-iceland', reviewer_name:'晴晴', choice:'BUY_NOW', comment:'支持出发，但别忘了把冬季装备和保险算进预算。', created_at:'2026-08-22T11:00:00Z' },
    { id:'r3', request_id:'request-iceland', reviewer_name:'安安', choice:'SAVE_FIRST', comment:'先存到八成就开始订票，期待也会变成旅程的一部分。', created_at:'2026-08-22T12:00:00Z' },
  ],
  invites:[
    { id:'invite-iceland-1', request_id:'request-iceland', token:'iceland-a7f3k2', label:'朋友 1', used_by:'桃子', used_at:'2026-08-22T10:00:00Z', revoked:0, created_at:'2026-08-21T10:00:00Z' },
    { id:'invite-iceland-2', request_id:'request-iceland', token:'iceland-b9m4q7', label:'朋友 2', used_by:'晴晴', used_at:'2026-08-22T11:00:00Z', revoked:0, created_at:'2026-08-21T10:00:01Z' },
    { id:'invite-iceland-3', request_id:'request-iceland', token:'iceland-c2x8n5', label:'朋友 3', used_by:'安安', used_at:'2026-08-22T12:00:00Z', revoked:0, created_at:'2026-08-21T10:00:02Z' },
  ],
  savingGoals:[{ id:'saving-camera', request_id:null, name:'一台陪我看世界的相机', target:7000, current:4480, weekly_plan:500, created_at:'2026-05-12T08:00:00Z' }],
  assets:[
    { id:'asset-dance', name:'十二节现代舞年卡', type:'COURSE', purchase_price:1680, total_units:12, used_units:9, current_balance:null, expiry_date:'2026-11-20', usage_count:9, last_used_at:'2026-08-22' },
    { id:'asset-pottery', name:'六次陶艺体验课', type:'COURSE', purchase_price:980, total_units:6, used_units:3, current_balance:null, expiry_date:'2026-09-10', usage_count:3, last_used_at:'2026-08-11' },
    { id:'asset-headphones', name:'降噪耳机', type:'ITEM', purchase_price:2499, total_units:null, used_units:0, current_balance:null, expiry_date:null, usage_count:32, last_used_at:'2026-08-23' },
  ],
};

function Flower({ progress=78, small=false }: { progress?:number; small?:boolean }) {
  return <div className={`wb-flower ${small?'is-small':''}`} aria-label={`电子花成长 ${progress}%`}><i className="wb-stem"/><i className="wb-leaf left"/><i className="wb-leaf right"/><div className="wb-bloom"><i/><i/><i/><i/><i/><b/></div></div>;
}

function TopBar({ title, onBack, action }: { title:string; onBack?:()=>void; action?:React.ReactNode }) {
  return <header className="mobile-topbar">{onBack?<button className="icon-button" onClick={onBack} aria-label="返回">←</button>:<span className="mini-brand">好</span>}<strong>{title}</strong><div className="top-action">{action??<span className="avatar">妍</span>}</div></header>;
}

function SectionHeading({ overline,title,action,onAction }: { overline:string; title:string; action?:string; onAction?:()=>void }) {
  return <div className="section-heading"><div><span>{overline}</span><h2>{title}</h2></div>{action&&<button onClick={onAction}>{action}</button>}</div>;
}

function HomeView({ data,onRequest,onTab }: { data:AppData; onRequest:(request:PurchaseRequest)=>void; onTab:(tab:Tab)=>void }) {
  const activeGoal = data.savingGoals[0];
  const inbox = data.requests.filter(request=>request.review_count>0 && request.status==='REVIEWING');
  return <><TopBar title="好好花"/><section className="welcome"><p>晚上好，阿妍</p><h1>今天也让喜欢的事，<br/>慢慢长大。</h1></section>
    <section className="flower-companion"><div><span className="live-dot">小好 · 健康</span><h2>你把期待<br/>过成了日子。</h2><p>记录真实使用，也记录那些<br/>被认真做过的决定。</p></div><Flower progress={82}/></section>
    <section className="mobile-section"><SectionHeading overline="待你回应" title="朋友的回信到了" action="查看全部" onAction={()=>onTab('wishes')}/>{inbox.length?inbox.slice(0,1).map(request=><button className="inbox-card" key={request.id} onClick={()=>onRequest(request)}><span className="inbox-mark">✦</span><div><small>{request.review_count} 位朋友给了建议</small><h3>{request.name}</h3><p>意见不会替你决定，最后一步由你来走。</p></div><b>›</b></button>):<div className="empty-card">暂时没有新回信，去种下一个愿望吧。</div>}</section>
    {activeGoal&&<section className="mobile-section"><SectionHeading overline="正在养愿" title={activeGoal.name} action="去存钱" onAction={()=>onTab('saving')}/><GoalCard goal={activeGoal} compact/></section>}
    <section className="mobile-section assets-preview"><SectionHeading overline="已经拥有" title="让它们继续产生价值" action="物资列表" onAction={()=>onTab('assets')}/><div className="mini-assets">{data.assets.slice(0,3).map(asset=><div key={asset.id}><AssetGlyph type={asset.type}/><span>{asset.name}</span></div>)}</div></section>
  </>;
}

function CreateRequest({ onBack,onCreated }: { onBack:()=>void; onCreated:(request:PurchaseRequest, invites:ReviewInvite[])=>void }) {
  const [form,setForm] = useState({ name:'',price:'',reason:'',category:'课程',total_units:'',usage_frequency:'',expiry_date:'',product_url:'',similar_item:'' });
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const update = (key:keyof typeof form,value:string) => setForm(previous=>({...previous,[key]:value}));
  async function submit(event:FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    const payload = { ...form, price:Number(form.price), total_units:form.total_units?Number(form.total_units):null };
    try {
      const response = await fetch('/api/data',{ method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'create_request',payload}) });
      const output = await readApi<{request:PurchaseRequest;invites:ReviewInvite[]}>(response);
      onCreated(output.request, output.invites);
    } catch (reason) { setError(reason instanceof Error?reason.message:'创建失败'); }
    finally { setBusy(false); }
  }
  return <><TopBar title="种下新愿望" onBack={onBack}/><form className="request-form" onSubmit={submit}><div className="form-intro"><span>01 · 说清楚想要</span><h1>这次，你想把什么<br/>带进生活？</h1><p>没有标准答案，先用自己的话讲明白。</p></div>
    <label><span>名称 *</span><input required value={form.name} onChange={event=>update('name',event.target.value)} placeholder="例如：十二节现代舞课程"/></label>
    <div className="field-pair"><label><span>价格 *</span><div className="money-input"><i>¥</i><input required min="0" step="0.01" type="number" value={form.price} onChange={event=>update('price',event.target.value)} placeholder="0"/></div></label><label><span>类别 *</span><select value={form.category} onChange={event=>update('category',event.target.value)}><option>课程</option><option>会员</option><option>储值</option><option>实物</option><option>旅行体验</option></select></label></div>
    <label><span>为什么想要它？ *</span><textarea required rows={4} value={form.reason} onChange={event=>update('reason',event.target.value)} placeholder="是长久的愿望，还是生活里真正缺少的东西？"/></label>
    <div className="field-pair"><label><span>次数 / 天数</span><input min="0" type="number" value={form.total_units} onChange={event=>update('total_units',event.target.value)} placeholder="例如 12"/></label><label><span>有效期</span><input type="date" value={form.expiry_date} onChange={event=>update('expiry_date',event.target.value)}/></label></div>
    <label><span>预计怎么使用？</span><input value={form.usage_frequency} onChange={event=>update('usage_frequency',event.target.value)} placeholder="例如：每周去 1 次"/></label><label><span>商品 / 课程链接</span><input type="url" value={form.product_url} onChange={event=>update('product_url',event.target.value)} placeholder="https://"/></label><label><span>已经有相似的东西吗？</span><input value={form.similar_item} onChange={event=>update('similar_item',event.target.value)} placeholder="没有的话可以留空"/></label>
    <div className="form-note"><b>创建后先生成 3 张独立邀请卡</b><p>一位朋友用一张；她不需要登录，也看不到别人的内容。</p></div>{error&&<p className="form-error">{error}</p>}<button className="main-button" disabled={busy}>{busy?'正在种下…':'生成愿望和朋友链接'}</button></form></>;
}

function requestSlug(request:PurchaseRequest) {
  if (request.id === 'request-iceland' || /冰岛/.test(request.name)) return 'iceland';
  return `wish-${request.id.slice(0,8)}`;
}

function RequestDetail({ request,data,onBack,onRefresh,onDecision }: { request:PurchaseRequest; data:AppData; onBack:()=>void; onRefresh:()=>Promise<void>; onDecision:(target:Tab)=>void }) {
  const reviews = data.reviews.filter(review=>review.request_id===request.id);
  const invites = data.invites.filter(invite=>invite.request_id===request.id && !invite.revoked);
  const [copied,setCopied] = useState('');
  const [busy,setBusy] = useState('');
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const counts = useMemo(()=>({ BUY_NOW:reviews.filter(review=>review.choice==='BUY_NOW').length, SAVE_FIRST:reviews.filter(review=>review.choice==='SAVE_FIRST').length, WAIT:reviews.filter(review=>review.choice==='WAIT').length }),[reviews]);
  const inviteUrl = (invite:ReviewInvite) => typeof window==='undefined'?'':`${window.location.origin}/review/${requestSlug(request)}/${invite.token}`;
  async function copy(invite:ReviewInvite) { await navigator.clipboard.writeText(inviteUrl(invite)); setCopied(invite.id); setTimeout(()=>setCopied(''),1600); }
  async function mutate(action:string, payload:Record<string,unknown>) {
    const response = await fetch('/api/data',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,...payload})});
    return readApi<Record<string,unknown>>(response);
  }
  async function addInvite(){setBusy('invite');setError('');setNotice('');try{await mutate('create_invite',{requestId:request.id});await onRefresh();setNotice('新邀请卡已生成。复制这一张发给下一位朋友即可。')}catch(reason){setError(reason instanceof Error?reason.message:'生成失败')}finally{setBusy('')}}
  async function revoke(inviteId:string){setBusy(inviteId);setNotice('');try{await mutate('revoke_invite',{inviteId});await onRefresh();setNotice('这张未使用的邀请卡已经撤销。')}catch(reason){setError(reason instanceof Error?reason.message:'撤销失败')}finally{setBusy('')}}
  async function decide(decision:ReviewChoice){setBusy(decision);setError('');try{const output=await mutate('decide',{requestId:request.id,decision});await onRefresh();onDecision(output.target as Tab)}catch(reason){setError(reason instanceof Error?reason.message:'决定未保存')}finally{setBusy('')}}
  return <><TopBar title="愿望详情" onBack={onBack} action={<button className="text-action" onClick={onRefresh}>刷新</button>}/><section className="request-detail-hero"><span>{request.category} · 等待建议</span><h1>{request.name}</h1><strong>¥{request.price.toLocaleString()}</strong><blockquote>“{request.reason}”</blockquote></section>
    <section className="share-panel"><span>朋友建议链接</span><h2>每位朋友，一张只属于她的邀请卡</h2><p>点击“再生成”会新增一条随机链接，不会覆盖旧链接。无需登录；每条链接只能提交一次。</p><div className="invite-list">{invites.map(invite=><div className={`invite-row ${invite.used_at?'used':''}`} key={invite.id}><div><b>{invite.used_by?`${invite.used_by} 已回信`:invite.label}</b><small>{invite.used_at?'链接已自动失效':'等待填写 · 独立链接'}</small></div>{invite.used_at?<span>✓</span>:<><button onClick={()=>copy(invite)}>{copied===invite.id?'已复制':'复制'}</button><button className="revoke-link" disabled={busy===invite.id} onClick={()=>revoke(invite.id)}>撤销</button></>}</div>)}</div><button className="new-invite" disabled={busy==='invite'} onClick={addInvite}>＋ {busy==='invite'?'正在生成':'再生成一张朋友邀请卡'}</button>{notice&&<p className="panel-notice">✓ {notice}</p>}</section>
    <section className="mobile-section review-section"><SectionHeading overline={`${reviews.length} 份回信`} title="朋友们这样看"/><div className="review-tally">{(Object.keys(choiceCopy) as ReviewChoice[]).map(choice=><div key={choice}><b>{counts[choice]}</b><span>{choiceCopy[choice]}</span></div>)}</div>{reviews.length?reviews.map(review=><article className="review-message" key={review.id}><div><span className="review-avatar">{review.reviewer_name.slice(0,1)}</span><b>{review.reviewer_name}</b><em>{choiceCopy[review.choice]}</em></div><p>{review.comment}</p></article>):<div className="empty-card">邀请卡已经准备好，正在等第一封回信。</div>}</section>
    <section className="decision-panel"><span>最后仍然由你决定</span><h2>听完朋友，也听听自己</h2><p>现在购买会进入“我的物资”；存钱购买会从 ¥0 开始进入“养愿花园”；这次不买会结束这个心愿。</p><div>{(Object.keys(choiceCopy) as ReviewChoice[]).map(choice=><button disabled={Boolean(busy)} key={choice} onClick={()=>decide(choice)}>{busy===choice?'处理中…':choiceCopy[choice]}</button>)}</div>{error&&<p className="form-error">{error}</p>}</section></>;
}

function GoalCard({ goal,compact=false,onUpdated,onCompleted }: { goal:SavingGoal; compact?:boolean; onUpdated?:(goal:SavingGoal)=>void; onCompleted?:()=>void }) {
  const [amount,setAmount] = useState('');
  const [current,setCurrent] = useState(goal.current);
  const [state,setState] = useState<'idle'|'saving'|'saved'|'completed'|'error'>('idle');
  useEffect(()=>setCurrent(goal.current),[goal.current]);
  const progress = Math.min(100,Math.round(current/goal.target*100));
  async function add(value?:number){const amountValue=value??Number(amount);if(!amountValue||amountValue<=0){setState('error');return}setState('saving');try{const response=await fetch('/api/data',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'add_saving',goalId:goal.id,amount:amountValue})});const output=await readApi<{goal:SavingGoal;completed:boolean}>(response);setCurrent(output.goal.current);setAmount('');if(output.completed){setState('completed');setTimeout(()=>onCompleted?.(),900);return}setState('saved');onUpdated?.(output.goal);setTimeout(()=>setState('idle'),1500)}catch{setState('error')}}
  return <article className={`goal-card ${compact?'compact':''}`}><div className="goal-flower"><Flower progress={progress} small/><b>{progress}%</b></div><div className="goal-copy"><span>{state==='completed'?'愿望已盛开':'养愿中'}</span><h3>{goal.name}</h3><div className="goal-progress"><i style={{width:`${progress}%`}}/></div><div className="goal-money"><b>¥{current.toLocaleString()}</b><span>/ ¥{goal.target.toLocaleString()}</span></div></div>{!compact&&<div className="saving-actions"><p>今天想让它靠近多少？</p><div className="quick-saving">{[50,100,200].map(value=><button disabled={state==='saving'||state==='completed'} key={value} onClick={()=>add(value)}>+ ¥{value}</button>)}</div><div className="custom-saving"><div><span>¥</span><input aria-label="自定义存钱金额" disabled={state==='completed'} min="1" type="number" value={amount} onChange={event=>setAmount(event.target.value)} placeholder="输入自定义金额"/></div><button disabled={state==='saving'||state==='completed'} onClick={()=>add()}>{state==='saving'?'存入中':'存入'}</button></div>{state==='saved'&&<small className="saving-feedback success">✓ 已存入，花又长大了一点</small>}{state==='completed'&&<small className="saving-feedback success">✓ 目标达成，正在放进“我的物资”</small>}{state==='error'&&<small className="saving-feedback error">请输入大于 0 的金额并重试</small>}</div>}</article>;
}

function CreateAsset({ onBack,onCreated }: { onBack:()=>void; onCreated:()=>void }) {
  const [form,setForm] = useState({ name:'',type:'ITEM' as Asset['type'],purchase_price:'',total_units:'',used_units:'',usage_count:'',current_balance:'',expiry_date:'' });
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const update = (key:keyof typeof form,value:string) => setForm(previous=>({...previous,[key]:value}));
  async function submit(event:FormEvent){event.preventDefault();setBusy(true);setError('');try{const payload={...form,purchase_price:Number(form.purchase_price),total_units:form.total_units?Number(form.total_units):null,used_units:form.used_units?Number(form.used_units):0,usage_count:form.usage_count?Number(form.usage_count):0,current_balance:form.current_balance?Number(form.current_balance):null};const response=await fetch('/api/data',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'add_asset',payload})});await readApi(response);onCreated()}catch(reason){setError(reason instanceof Error?reason.message:'添加失败')}finally{setBusy(false)}}
  return <><TopBar title="添加已有物资" onBack={onBack}/><form className="request-form" onSubmit={submit}><div className="form-intro"><span>ALREADY MINE</span><h1>把已经拥有的，<br/>重新带回生活。</h1><p>以前买过的课程、会员、储值或实物，都可以从这里开始记录。</p></div>
    <label><span>物资名称 *</span><input required value={form.name} onChange={event=>update('name',event.target.value)} placeholder="例如：去年买的瑜伽年卡"/></label><div className="field-pair"><label><span>类型 *</span><select value={form.type} onChange={event=>update('type',event.target.value)}>{Object.entries(typeCopy).map(([id,label])=><option value={id} key={id}>{label}</option>)}</select></label><label><span>当时购入金额 *</span><div className="money-input"><i>¥</i><input required min="0" step="0.01" type="number" value={form.purchase_price} onChange={event=>update('purchase_price',event.target.value)} placeholder="0"/></div></label></div>
    <div className="field-pair"><label><span>总次数 / 份数</span><input min="0" type="number" value={form.total_units} onChange={event=>update('total_units',event.target.value)} placeholder="不限次可留空"/></label><label><span>已经用掉</span><input min="0" type="number" value={form.used_units} onChange={event=>update('used_units',event.target.value)} placeholder="0"/></label></div>
    <div className="field-pair"><label><span>历史使用次数</span><input min="0" type="number" value={form.usage_count} onChange={event=>update('usage_count',event.target.value)} placeholder="0"/></label><label><span>当前余额</span><input min="0" step="0.01" type="number" value={form.current_balance} onChange={event=>update('current_balance',event.target.value)} placeholder="储值类可填"/></label></div>
    <label><span>有效期</span><input type="date" value={form.expiry_date} onChange={event=>update('expiry_date',event.target.value)}/></label><div className="form-note"><b>不需要补全过去的每一天</b><p>从你愿意重新关注它的今天开始，就已经足够。</p></div>{error&&<p className="form-error">{error}</p>}<button className="main-button" disabled={busy}>{busy?'正在放进物资架…':'添加到我的物资'}</button></form></>;
}

function WishesView({ data,onCreate,onRequest }: { data:AppData; onCreate:()=>void; onRequest:(request:PurchaseRequest)=>void }) {
  const active = data.requests.filter(request=>request.status==='REVIEWING');
  const completed = data.requests.length-active.length;
  return <><TopBar title="我的心愿" action={<button className="round-add" onClick={onCreate}>＋</button>}/><section className="tab-intro"><span>WANT · ASK · DECIDE</span><h1>把想要说清楚，<br/>再认真做决定。</h1></section><section className="request-list">{active.map(request=><button key={request.id} onClick={()=>onRequest(request)}><div><span>{request.category} · {request.review_count} 份建议</span><h2>{request.name}</h2><p>{request.reason}</p></div><strong>¥{request.price.toLocaleString()}</strong><i>查看详情 →</i></button>)}{!active.length&&<div className="empty-card">当前没有等待决定的心愿。</div>}</section>{completed>0&&<p className="completed-note">{completed} 个心愿已经完成流程，分别进入养愿、物资或静静归档。</p>}<button className="floating-create" onClick={onCreate}>＋ 种下新愿望</button></>;
}

function SavingView({ goals,onUpdated,onCompleted }: { goals:SavingGoal[]; onUpdated:()=>void; onCompleted:()=>void }) {
  return <><TopBar title="养愿花园"/><section className="tab-intro"><span>GROWING WISHES</span><h1>不是忍住不买，<br/>是慢慢准备好。</h1><p>每一笔存下的钱，都会让花醒来一点。</p></section><section className="goal-list">{goals.map(goal=><GoalCard goal={goal} key={goal.id} onUpdated={onUpdated} onCompleted={onCompleted}/>)}{!goals.length&&<div className="empty-card">还没有正在养的愿望。决定存钱购买后，它会从 ¥0 在这里开始生长。</div>}</section></>;
}

function AssetGlyph({ type }: { type:Asset['type'] }) {
  return <span className={`asset-glyph type-${type.toLowerCase()}`}>{type==='COURSE'?'课':type==='ITEM'?'物':type==='MEMBERSHIP'?'卡':'值'}</span>;
}

function AssetsView({ assets,onUpdated,onAdd }: { assets:Asset[]; onUpdated:()=>void; onAdd:()=>void }) {
  const [confirmDelete,setConfirmDelete] = useState('');
  const [busy,setBusy] = useState('');
  const [error,setError] = useState('');
  async function action(actionName:string, assetId:string){setBusy(assetId);setError('');try{const response=await fetch('/api/data',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:actionName,assetId})});await readApi(response);onUpdated();setConfirmDelete('')}catch(reason){setError(reason instanceof Error?reason.message:'操作失败')}finally{setBusy('')}}
  return <><TopBar title="我的物资" action={<button className="round-add" onClick={onAdd}>＋</button>}/><section className="tab-intro"><span>MY VALUE</span><h1>买下不是结尾，<br/>用起来才是。</h1><p>以前买过的也能直接添加；不想继续记录时，随时停止追踪。</p></section>{error&&<p className="form-error list-error">{error}</p>}<section className="asset-list">{assets.map(asset=>{const remain=asset.total_units==null?null:Math.max(0,asset.total_units-asset.used_units);const costPerUse=asset.usage_count?Math.round(asset.purchase_price/asset.usage_count):null;return <article key={asset.id}><div className="asset-title"><AssetGlyph type={asset.type}/><div><span>{typeCopy[asset.type]}</span><h2>{asset.name}</h2></div></div><div className="asset-stats"><div><b>{remain==null?asset.usage_count:remain}</b><span>{remain==null?'累计使用':'剩余次数'}</span></div><div><b>{costPerUse?`¥${costPerUse}`:'—'}</b><span>单次价值</span></div><div><b>{asset.expiry_date?asset.expiry_date.slice(5).replace('-','.'):'长期'}</b><span>有效期</span></div></div><div className="asset-actions"><button disabled={busy===asset.id} onClick={()=>action('use_asset',asset.id)}>{busy===asset.id?'更新中…':'＋ 今天使用了'}</button><button className={`stop-track ${confirmDelete===asset.id?'confirming':''}`} disabled={busy===asset.id} onClick={()=>confirmDelete===asset.id?action('delete_asset',asset.id):setConfirmDelete(asset.id)}>{confirmDelete===asset.id?'确认移除':'停止追踪'}</button></div>{confirmDelete===asset.id&&<small className="delete-hint">再点一次确认移除；这不会影响其他物资。</small>}</article>})}{!assets.length&&<div className="empty-card">还没有物资。把以前买过但仍想好好使用的东西放进来吧。</div>}</section><button className="floating-create" onClick={onAdd}>＋ 添加已有物资</button></>;
}

const nav:{id:Tab;label:string;icon:string}[] = [{id:'home',label:'花园',icon:'⌂'},{id:'wishes',label:'心愿',icon:'◇'},{id:'saving',label:'养愿',icon:'◔'},{id:'assets',label:'物资',icon:'▤'}];

export default function DashboardClient() {
  const [data,setData] = useState<AppData>(fallbackData);
  const [tab,setTab] = useState<Tab>('home');
  const [screen,setScreen] = useState<Screen>('main');
  const [active,setActive] = useState<PurchaseRequest|null>(null);
  async function refresh(){try{const response=await fetch('/api/data',{cache:'no-store'});setData(await readApi<AppData>(response))}catch{}}
  useEffect(()=>{void refresh()},[]);
  function choose(nextTab:Tab){setTab(nextTab);setScreen('main');setActive(null);window.scrollTo({top:0,behavior:'smooth'})}
  function open(request:PurchaseRequest){setActive(request);setScreen('request');window.scrollTo(0,0)}
  function created(request:PurchaseRequest, invites:ReviewInvite[]){setData(previous=>({...previous,requests:[request,...previous.requests],invites:[...previous.invites,...invites]}));setActive(request);setScreen('request');window.scrollTo(0,0)}
  async function assetCreated(){await refresh();choose('assets')}
  async function savingCompleted(){await refresh();choose('assets')}
  return <main className="mobile-stage"><div className="phone-shell">
    {screen==='create'&&<CreateRequest onBack={()=>setScreen('main')} onCreated={created}/>} 
    {screen==='createAsset'&&<CreateAsset onBack={()=>setScreen('main')} onCreated={()=>void assetCreated()}/>} 
    {screen==='request'&&active&&<RequestDetail request={active} data={data} onBack={()=>setScreen('main')} onRefresh={refresh} onDecision={choose}/>}
    {screen==='main'&&<>{tab==='home'&&<HomeView data={data} onRequest={open} onTab={choose}/>} {tab==='wishes'&&<WishesView data={data} onCreate={()=>setScreen('create')} onRequest={open}/>} {tab==='saving'&&<SavingView goals={data.savingGoals} onUpdated={()=>void refresh()} onCompleted={()=>void savingCompleted()}/>} {tab==='assets'&&<AssetsView assets={data.assets} onUpdated={()=>void refresh()} onAdd={()=>setScreen('createAsset')}/>}<nav className="mobile-nav">{nav.map(item=><button className={tab===item.id?'active':''} key={item.id} onClick={()=>choose(item.id)}><i>{item.icon}</i><span>{item.label}</span></button>)}</nav></>}
  </div></main>;
}
