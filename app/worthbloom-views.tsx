'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { clearStoredSession, cloudBaseFetch } from '@/lib/cloudbase/client';
import type { AppData, Asset, AssetReflection, AssetReflectionFeeling, Decision, DeviceState, GrowthAccount, GrowthLedgerEntry, InboxItem, PurchaseRequest, Review, ReviewChoice, ReviewInvite, SavingGoal, UserProfile } from '@/lib/types';
import { assetFinished, costPerUse, isAssetExpired, remainingUnits } from '@/lib/asset-rules';
import { typeToCategory } from '@/lib/wish-compat';
import { isMultiProductWish, parseMultiProductOptions } from '@/lib/multi-product';
import { AgentCouncil, AgentPanel } from './agent-panel';
import styles from './worthbloom-v2.module.css';

export type View = 'garden'|'profile'|'room'|'wishes'|'decisions'|'inbox'|'device'|'agent'|'savings'|'assets';

type IconName='garden'|'plus'|'user'|'bell'|'chevron'|'back'|'flower'|'fruit'|'wish'|'check'|'reply'|'shield'|'help'|'device'|'sort'|'external'|'sparkle'|'share'|'settings'|'wallet'|'edit'|'camera'|'close'|'history';

export function Icon({name,size=22}:{name:IconName;size?:number}){
  const paths:Record<IconName,React.ReactNode>={
    garden:<><path d="M4 19V9.5L12 4l8 5.5V19a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1Z"/></>,
    plus:<><path d="M12 5v14M5 12h14"/></>,
    user:<><circle cx="12" cy="8" r="4"/><path d="M4.5 20c.8-4 3.3-6 7.5-6s6.7 2 7.5 6"/></>,
    bell:<><path d="M6 9a6 6 0 0 1 12 0c0 7 3 7 3 7H3s3 0 3-7Z"/><path d="M10 20h4"/></>,
    chevron:<><path d="m9 18 6-6-6-6"/></>,
    back:<><path d="m15 18-6-6 6-6"/></>,
    flower:<><circle cx="12" cy="12" r="2.2"/><circle cx="12" cy="6.5" r="3.2"/><circle cx="17.2" cy="10.4" r="3.2"/><circle cx="15.2" cy="16.2" r="3.2"/><circle cx="8.8" cy="16.2" r="3.2"/><circle cx="6.8" cy="10.4" r="3.2"/></>,
    fruit:<><path d="M12 7c-4.8 0-7.5 2.7-7.5 6.5S7.2 21 12 21s7.5-3.7 7.5-7.5S16.8 7 12 7Z"/><path d="M12 7c0-2.4 1.4-4 4-4M12.5 6.5c-2.2-.1-3.8-1-4.5-2.8 2.4-.5 4.1.4 4.5 2.8Z"/></>,
    wish:<><path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h8M8 16h5"/></>,
    check:<><path d="m5 12 4 4L19 6"/></>,
    reply:<><path d="M20 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h9a4 4 0 0 1 4 4Z"/><path d="M7 8h9M7 12h6"/></>,
    shield:<><path d="M12 3 4.5 6v5.5c0 4.8 3 8 7.5 9.5 4.5-1.5 7.5-4.7 7.5-9.5V6Z"/><path d="m9 12 2 2 4-5"/></>,
    help:<><circle cx="12" cy="12" r="9"/><path d="M9.7 9a2.5 2.5 0 1 1 3.3 2.4c-.8.3-1 1-1 1.8M12 17h.01"/></>,
    device:<><rect x="5" y="3" width="14" height="18" rx="3"/><path d="M9 17h6M9 7h6"/></>,
    sort:<><path d="M4 7h12M4 12h9M4 17h6M17 14v6m0 0 3-3m-3 3-3-3"/></>,
    external:<><path d="M14 4h6v6M20 4l-9 9"/><path d="M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6"/></>,
    sparkle:<><path d="m12 3 1.4 4.6L18 9l-4.6 1.4L12 15l-1.4-4.6L6 9l4.6-1.4ZM18 15l.7 2.3L21 18l-2.3.7L18 21l-.7-2.3L14 18l2.3-.7Z"/></>,
    share:<><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.5-4.4M8.2 13.2l7.5 4.4"/></>,
    settings:<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
    wallet:<><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H19v14H6.5A2.5 2.5 0 0 1 4 16.5Z"/><path d="M4 8h14M15 11h6v4h-6a2 2 0 0 1 0-4Z"/></>,
    edit:<><path d="m4 20 4.2-1 10-10a2.1 2.1 0 0 0-3-3l-10 10Z"/><path d="m13.8 7.2 3 3"/></>,
    camera:<><path d="M5 7h3l1.5-2h5L16 7h3a2 2 0 0 1 2 2v9H3V9a2 2 0 0 1 2-2Z"/><circle cx="12" cy="12.5" r="3.2"/></>,
    close:<><path d="m6 6 12 12M18 6 6 18"/></>,
    history:<><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6"/><path d="M4 4v4.6h4.6M12 8v4l3 2"/></>,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export function BottomNav({view,onRoot,onCreate,onAgent,onAssets}:{view:View;onRoot:(view:'garden'|'profile')=>void;onCreate:()=>void;onAgent:()=>void;onAssets:()=>void}){
  return <nav className={styles.bottomNav} aria-label="主导航">
    <button className={view==='garden'?styles.navActive:''} onClick={()=>onRoot('garden')}><Icon name="garden"/><span>花园</span></button>
    <button className={view==='agent'?styles.navActive:''} onClick={onAgent}><Icon name="sparkle"/><span>AI 对话</span></button>
    <button className={styles.navCreate} onClick={onCreate} aria-label="种心愿"><span><Icon name="plus" size={25}/></span><b>种心愿</b></button>
    <button className={view==='assets'?styles.navActive:''} onClick={onAssets}><Icon name="fruit"/><span>我的果实</span></button>
    <button className={view==='profile'?styles.navActive:''} onClick={()=>onRoot('profile')}><Icon name="user"/><span>我的</span></button>
  </nav>;
}

export function PageHeader({title,onBack,action}:{title:string;onBack:()=>void;action?:React.ReactNode}){
  return <header className={styles.pageHeader}><button className={styles.backButton} onClick={onBack} aria-label="返回"><Icon name="back"/></button><h1>{title}</h1><div>{action}</div></header>;
}

function decisionCopy(choice:ReviewChoice){return choice==='BUY_NOW'?'现在购买':choice==='SAVE_FIRST'?'先存钱':'再等等'}
function decisionNoteOf(request:PurchaseRequest){return request.decision_note||request.decisionNote||''}
function multiDecisionFromNote(note:string){
  const match=note.match(/(?:已选择购买|决定[:：]\s*买)\s*([A-Z])|(?:已选择先不买|决定[:：]\s*(?:先不买|都不买))/);
  if(!match)return '';
  if(match[1])return `已选择购买${match[1]}`;
  return '已选择先不买';
}
function decisionCopyForRequest(request:PurchaseRequest,choice:ReviewChoice){
  if(!isMultiProductWish(request))return decisionCopy(choice);
  const noted=multiDecisionFromNote(decisionNoteOf(request));
  if(noted)return noted;
  if(choice==='WAIT')return '已选择先不买';
  if(choice==='BUY_NOW')return '已选择购买';
  return '已选择先不买';
}
function decisionReasonForRequest(request:PurchaseRequest){
  const note=decisionNoteOf(request).split(/\r?\n/).map(line=>line.trim()).filter(line=>line&&!/^(?:已选择购买[A-Z]|已选择先不买|决定[:：]\s*(?:买\s*[A-Z]|先不买|都不买))$/.test(line)).join('\n');
  return note||'当时没有补充决定理由。';
}
function statusCopy(request:PurchaseRequest){if(request.status==='REVIEWING')return request.review_count?'回信已到':'等待回信';if(request.status==='SAVING')return '先存钱';if(request.status==='PURCHASED')return '现在购买';return '再等等'}
function categoryGlyph(category:string){if(category.includes('课程')||category.includes('训练'))return '课';if(category.includes('数码')||category.includes('商品'))return '物';return '愿'}
function imageFor(request:PurchaseRequest){return request.image_url||request.images?.find(image=>image.isCover)?.url||request.images?.[0]?.url||''}
function requestByDecision(data:AppData,decision:Decision){return data.requests.find(request=>request.id===decision.request_id)}
function reviewCountFor(data:AppData,requestId:string){return data.reviews.filter(review=>review.request_id===requestId).length}

export function deriveDeviceSummary(data:AppData):DeviceState{
  const activeAssets=(data.assets??[]).filter(asset=>!asset.archived_at);
  const savingGoals=data.savingGoals??[];
  const requests=data.requests??[];
  const now=Date.now();
  const assetState=(asset:Asset):DeviceState=>{
    const remaining=asset.type==='STORED_VALUE'?Number(asset.current_balance??0):remainingUnits(asset);
    const progress=asset.type==='STORED_VALUE'&&asset.purchase_price>0
      ?Math.min(1,Math.max(0,1-Number(asset.current_balance??0)/asset.purchase_price))
      :asset.total_units&&remaining!=null
        ?Math.min(1,Math.max(0,1-remaining/asset.total_units))
        :Math.min(1,asset.usage_count/30);
    const expiry=asset.expiry_date?new Date(`${asset.expiry_date.slice(0,10)}T23:59:59`).getTime():NaN;
    const daysLeft=Number.isFinite(expiry)?Math.ceil((expiry-now)/86_400_000):null;
    const lastUsed=asset.last_used_at?new Date(`${asset.last_used_at.slice(0,10)}T12:00:00`).getTime():NaN;
    const idleDays=Number.isFinite(lastUsed)?Math.floor((now-lastUsed)/86_400_000):null;
    if(asset.bloom_until&&new Date(asset.bloom_until).getTime()>now)return{mode:'BLOOM',title:asset.name,progress:1,flower_health:100,remaining,days_left:daysLeft,message:'心愿实现了，花开了一次',asset_id:asset.id};
    if(asset.recovering_until&&new Date(asset.recovering_until).getTime()>now)return{mode:'RECOVERING',title:asset.name,progress,flower_health:88,remaining,days_left:daysLeft,message:'今天又用了一次',asset_id:asset.id};
    if((daysLeft!=null&&daysLeft<=14)||(remaining!=null&&asset.total_units!=null&&remaining/Math.max(1,asset.total_units)<=.2))return{mode:'THIRSTY',title:asset.name,progress,flower_health:48,remaining,days_left:daysLeft,message:daysLeft!=null&&daysLeft<0?'已经到期，等你回看':'快到期或快用完了',asset_id:asset.id};
    if(idleDays==null||idleDays>=21)return{mode:'STRESSED',title:asset.name,progress,flower_health:58,remaining,days_left:daysLeft,message:'有一阵没有记录使用了',asset_id:asset.id};
    return{mode:'HEALTHY',title:asset.name,progress,flower_health:90,remaining,days_left:daysLeft,message:'正在生活里发挥作用',asset_id:asset.id};
  };
  const highlighted=activeAssets.find(asset=>asset.bloom_until&&new Date(asset.bloom_until).getTime()>now)||activeAssets.find(asset=>asset.recovering_until&&new Date(asset.recovering_until).getTime()>now);
  if(highlighted)return assetState(highlighted);
  const goal=savingGoals[0];
  if(goal){const progress=goal.target?Math.min(1,goal.current/goal.target):0;return{mode:'GROWING',title:goal.name,progress,flower_health:Math.round(65+progress*30),remaining:Math.max(0,goal.target-goal.current),days_left:null,message:'正在靠近目标',asset_id:null}}
  const active=requests.find(request=>request.status==='REVIEWING');
  if(active){const replies=data.reviews.filter(review=>review.request_id===active.id).length;return{mode:'WAITING',title:active.name,progress:Math.min(1,replies/3),flower_health:78,remaining:Math.max(0,3-replies),days_left:null,message:replies?'回信已到，等你决定':'等待不同视角',asset_id:null}}
  if(activeAssets[0])return assetState(activeAssets[0]);
  return{mode:'SEED',title:'种下第一个心愿',progress:.06,flower_health:72,remaining:null,days_left:null,message:'还没有正在推进的心愿',asset_id:null};
}

function DeviceStrip({state,onOpen}:{state:DeviceState;onOpen:()=>void}){
  return <button className={styles.deviceStrip} onClick={onOpen}><span className={styles.deviceIcon}><Icon name="flower"/></span><span><small>电子花 · 花园进度</small><b>{state.title}</b><em>{state.message}</em></span><i>{Math.round(state.progress*100)}%</i><Icon name="chevron" size={18}/></button>;
}

function ActiveWishCard({request,onOpen,onInvite}:{request:PurchaseRequest;onOpen:()=>void;onInvite:()=>void}){
  const multiOptions=isMultiProductWish(request)?parseMultiProductOptions(request):[];
  return <article className={styles.activeCard}>
    <button className={styles.wishImage} onClick={onOpen} aria-label={`查看 ${request.name}`}>{imageFor(request)?<img src={imageFor(request)} alt=""/>:<span className={styles.wishImageFallback}>{categoryGlyph(request.category??'')}</span>}<span>{multiOptions.length?'多商品选择':request.category??''}</span></button>
    <div className={styles.cardTop}><span className={request.review_count?styles.pinkTag:styles.blueTag}>{statusCopy(request)}</span><small>{request.review_count} 条回信</small></div>
    <button className={styles.cardMain} onClick={onOpen}><span className={styles.categoryIcon}>{categoryGlyph(request.category??'')}</span><div><h3>{request.name}</h3><p>{request.reason}</p>{multiOptions.length?<div className={styles.cardProductList}>{multiOptions.map(option=><span key={option.label}><b>{option.name || `${option.label} 商品`}{option.brand ? ` · ${option.brand}` : ''}</b>{option.price!==null&&<em>¥{option.price.toLocaleString()}</em>}</span>)}</div>:<strong>¥{request.price.toLocaleString()}</strong>}</div></button>
    <button className={styles.cardAction} onClick={request.review_count?onOpen:onInvite}><span className={styles.cardActionIcon}><Icon name={request.review_count?'reply':'share'} size={16}/></span>{request.review_count?'查看回信并决定':'继续邀请'}<Icon name="chevron" size={17}/></button>
  </article>;
}

function DecisionCard({request,decision,goal,onOpen}:{request:PurchaseRequest;decision:Decision;goal?:SavingGoal;onOpen:()=>void}){
  const cls=decision.decision==='SAVE_FIRST'?styles.greenTag:decision.decision==='BUY_NOW'?styles.yellowTag:styles.grayTag;
  return <article className={styles.decisionCard}><button onClick={onOpen} className={styles.decisionMain}>{imageFor(request)?<img className={styles.decisionImage} src={imageFor(request)} alt=""/>:<span className={`${styles.decisionImage} ${styles.decisionImageFallback}`}>{categoryGlyph(request.category??'')}</span>}<span><small className={cls}>{decisionCopyForRequest(request,decision.decision)}</small><h3>{request.name}</h3><p>{new Date(decision.decided_at).toLocaleDateString('zh-CN')} · ¥{request.price.toLocaleString()}</p>{goal&&<><div className={styles.progress}><i style={{width:`${Math.min(100,goal.current/goal.target*100)}%`}}/></div><em>已准备 ¥{goal.current.toLocaleString()} / ¥{goal.target.toLocaleString()}</em></>}</span><Icon name="chevron" size={18}/></button></article>;
}

export function GardenView({data,unreadReviews,unreadCount,onNavigate,onOpen,onInvite}:{data:AppData;unreadReviews:Review[];unreadCount:number;onNavigate:(view:View)=>void;onOpen:(request:PurchaseRequest)=>void;onInvite:(request:PurchaseRequest)=>void}){
  const track=useRef<HTMLDivElement>(null);
  const active=useMemo(()=>data.requests.filter(item=>item.status==='REVIEWING').sort((a,b)=>((b.review_count??0)-(a.review_count??0))||Date.parse(b.created_at??'')-Date.parse(a.created_at??'')).slice(0,5),[data.requests]);
  const decided=useMemo(()=>[...data.decisions].sort((a,b)=>Date.parse(b.decided_at)-Date.parse(a.decided_at)).slice(0,3),[data.decisions]);
  const inbox=unreadCount;
  const latestReply=[...unreadReviews].sort((a,b)=>Date.parse(b.created_at??'')-Date.parse(a.created_at??''))[0];
  const replyRequest=latestReply&&data.requests.find(request=>request.id===latestReply.request_id);
  const device=deriveDeviceSummary(data);
  const scroll=(direction:number)=>track.current?.scrollBy({left:direction*300,behavior:'smooth'});
  return <section className={styles.rootPage}>
    <header className={styles.rootHeader}><div><small>WORTHBLOOM</small></div><button onClick={()=>onNavigate('inbox')} aria-label={`未读朋友回信 ${inbox} 条`}><Icon name="bell"/>{inbox>0&&<i>{inbox}</i>}</button></header>
    <button className={`${styles.replyHero} ${inbox?styles.replyHeroUnread:''}`} onClick={()=>onNavigate('inbox')}>
      <span className={styles.replyHeroIcon}><Icon name="reply" size={28}/></span>
      <span className={styles.replyHeroCopy}><small>{inbox?`优先处理 · ${inbox} 封未读回信`:'朋友回信'}</small><b>{inbox?'朋友的回信到了':'回信都看完了'}</b><em>{latestReply&&replyRequest?`${latestReply.reviewer_name} 回复了「${replyRequest.name}」`:'新的建议会优先出现在这里'}</em></span>
      <span className={styles.replyHeroAction}>{inbox?'现在查看':'查看记录'}<Icon name="chevron" size={17}/></span>
    </button>
    <section className={styles.section}><div className={styles.sectionHeading}><div><span className={styles.sectionEyebrow}>02 · 继续推进</span><h2>正在征集意见</h2><p>{active.length} 个心愿正在等待不同视角</p></div><div className={styles.carouselControls}><button onClick={()=>scroll(-1)} aria-label="上一个心愿"><Icon name="back" size={18}/></button><button onClick={()=>scroll(1)} aria-label="下一个心愿"><Icon name="chevron" size={18}/></button></div></div>
      {active.length?<div className={styles.carousel} ref={track}>{active.map(request=><ActiveWishCard key={request.id} request={request} onOpen={()=>onOpen(request)} onInvite={()=>onInvite(request)}/>)}</div>:<button className={styles.emptyAction} onClick={()=>onNavigate('wishes')}><Icon name="wish"/><span><b>暂无进行中心愿</b><small>去心愿档案看看，或种下一个新的愿望</small></span><Icon name="chevron"/></button>}
      {data.requests.length>active.length&&<button className={styles.textLink} onClick={()=>onNavigate('wishes')}>查看全部心愿 <Icon name="chevron" size={16}/></button>}
    </section>
    <section className={`${styles.section} ${styles.decidedSection}`}><div className={styles.sectionHeading}><div><span className={styles.sectionEyebrow}>03 · 回顾与行动</span><h2>已做决定</h2><p>继续存钱，或回看当时的理由</p></div><button className={styles.headingLink} onClick={()=>onNavigate('decisions')}>查看全部</button></div>
      <div className={styles.decisionList}>{decided.map(decision=>{const request=requestByDecision(data,decision);if(!request)return null;return <DecisionCard key={decision.request_id} request={request} decision={decision} goal={data.savingGoals.find(goal=>goal.request_id===request.id)} onOpen={()=>onOpen(request)}/>})}</div>
      {!decided.length&&<button className={styles.emptyAction} onClick={()=>onNavigate('wishes')}><Icon name="check"/><span><b>还没有完成决定</b><small>先从一个正在推进的心愿开始</small></span><Icon name="chevron"/></button>}
    </section>
    <div className={styles.deviceAfterTasks}><DeviceStrip state={device} onOpen={()=>onNavigate('device')}/></div>
  </section>;
}

export function AgentHubView({data,onBack}:{data:AppData;onBack:()=>void}){
  const wishes=data.requests.filter(request=>request.status==='REVIEWING');
  const [selectedId,setSelectedId]=useState(wishes[0]?.id||'');
  const [historyTrigger,setHistoryTrigger]=useState(0);
  const selected=wishes.find(request=>request.id===selectedId)||wishes[0];
  const cover=selected&&imageFor(selected);
  return <section className={`${styles.subPage} ${styles.agentHubPage}`}><PageHeader title="AI 对话" onBack={onBack} action={<button className={styles.headerIconAction} aria-label="历史对话" onClick={()=>setHistoryTrigger(value=>value+1)}><Icon name="history"/></button>}/>
    {selected&&<section className={styles.agentContextCard}>{cover?<img src={cover} alt=""/>:<span>{categoryGlyph(selected.category??'')}</span>}<label><small>正在讨论</small><select value={selected.id} onChange={event=>setSelectedId(event.target.value)}>{wishes.map(request=><option key={request.id} value={request.id}>{request.name}</option>)}</select><b>¥{selected.price.toLocaleString()}</b></label></section>}
    {selected?<AgentCouncil request={selected} hasReviews={data.reviews.some(review=>review.request_id===selected.id)} historyTrigger={historyTrigger}/>:<div className={styles.emptyAction}><Icon name="sparkle"/><span><b>还没有正在征集意见的心愿</b><small>先种下一个心愿，再来和 AI 聊聊。</small></span></div>}
  </section>;
}

function growthLevel(points:number){if(points>=700)return{level:4 as const,name:'做自己的决定',floor:700,next:null};if(points>=300)return{level:3 as const,name:'听见不同视角',floor:300,next:700};if(points>=100)return{level:2 as const,name:'看见条件',floor:100,next:300};return{level:1 as const,name:'开始想清楚',floor:0,next:100}}

async function cropAvatar(source:string,zoom:number,x:number,y:number){
  const image=await new Promise<HTMLImageElement>((resolve,reject)=>{const item=new Image();item.onload=()=>resolve(item);item.onerror=()=>reject(new Error('图片无法读取'));item.src=source});
  const size=Math.min(image.naturalWidth,image.naturalHeight)/zoom;
  const sx=Math.max(0,(image.naturalWidth-size)*(x/100));
  const sy=Math.max(0,(image.naturalHeight-size)*(y/100));
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;
  const context=canvas.getContext('2d');if(!context)throw new Error('头像处理失败');
  context.drawImage(image,sx,sy,size,size,0,0,512,512);
  return canvas.toDataURL('image/jpeg',.86);
}

export function ProfileView({data,profile,growthAccount,growthEntries,unreadCount,onProfileChange,onAvatarChange,onNavigate,onOpen}:{data:AppData;profile:UserProfile;growthAccount:GrowthAccount;growthEntries:GrowthLedgerEntry[];unreadCount:number;onProfileChange:(profile:UserProfile)=>Promise<void>;onAvatarChange:(avatarDataUrl:string|null)=>Promise<void>;onNavigate:(view:View)=>void;onOpen:(request:PurchaseRequest)=>void}){
  const [panel,setPanel]=useState<'NONE'|'SETTINGS'|'EDIT'|'AVATAR'|'PRIVACY'|'GROWTH'|'DEVICES'>('NONE');
  const [nickname,setNickname]=useState(profile.nickname);
  const [bio,setBio]=useState(profile.bio||'');
  const [avatarSource,setAvatarSource]=useState('');
  const [avatarZoom,setAvatarZoom]=useState(1);
  const [avatarX,setAvatarX]=useState(50);
  const [avatarY,setAvatarY]=useState(50);
  const [avatarError,setAvatarError]=useState('');
  const [avatarBusy,setAvatarBusy]=useState(false);
  const [profileBusy,setProfileBusy]=useState(false);
  const [profileError,setProfileError]=useState('');
  const fileRef=useRef<HTMLInputElement>(null);
  const points=growthAccount.points;
  const growth=growthLevel(points);
  const progress=growth.next==null?100:Math.max(0,Math.min(100,((points-growth.floor)/(growth.next-growth.floor))*100));
  const displayGrowthEntries=growthEntries.map(entry=>{const request=data.requests.find(item=>item.id===entry.referenceId);const asset=data.assets.find(item=>item.id===entry.referenceId);const title=entry.actionType==='daily_login'?'每日登录':entry.actionType==='login_streak'?'连续登录 7 天':entry.actionType==='invite_friend'?'邀请新用户':entry.actionType==='effective_share'?'有效分享':entry.actionType==='profile_completed'?'完善个人资料':entry.actionType==='review_claim'?'提供一份有效朋友回信':entry.actionType==='consumption_upload'?'上传一次消费记录':entry.actionType==='decision_with_reason'?`为「${request?.name||'心愿'}」写下决定理由`:entry.actionType==='asset_reflection'?`记录「${asset?.name||'已有物品'}」的真实体验`:entry.actionType;return{id:entry.id,title,date:entry.createdAt,points:entry.delta,limited:entry.limited}});
  const ready=data.requests.find(request=>request.status==='REVIEWING'&&data.reviews.some(review=>review.request_id===request.id));
  const latestDecision=[...data.decisions].sort((a,b)=>Date.parse(b.decided_at)-Date.parse(a.decided_at))[0];
  const currentAssetCount=data.assets.filter(item=>!item.archived_at).length;
  const tasks:Array<{id:string;eyebrow:string;title:string;action:()=>void}>=[];
  if(unreadCount>0)tasks.push({id:'unread',eyebrow:`${unreadCount} 封未读`,title:'朋友的回信到了',action:()=>onNavigate('inbox')});
  if(ready)tasks.push({id:'ready',eyebrow:'可以决定了',title:`继续「${ready.name}」`,action:()=>onOpen(ready)});
  if(tasks.length<2&&data.savingGoals.length)tasks.push({id:'saving',eyebrow:'存钱进行中',title:`查看「${data.savingGoals[0].name}」`,action:()=>onNavigate('savings')});
  if(!tasks.length&&latestDecision)tasks.push({id:'recent',eyebrow:'最近完成',title:'回看一次清楚的决定',action:()=>onNavigate('decisions')});
  const core=[
    {label:'心愿档案',value:data.requests.length,copy:'进行中与历史心愿',icon:'wish' as IconName,view:'wishes' as View,tone:'yellow'},
    {label:'全部决定',value:data.decisions.length,copy:'Buy · Save · Wait',icon:'check' as IconName,view:'decisions' as View,tone:'blue'},
    {label:'朋友回信',value:unreadCount,copy:unreadCount?'还有未读回信':'真实意见都在这里',icon:'reply' as IconName,view:'inbox' as View,tone:'pink'},
    {label:'存钱目标',value:data.savingGoals.length,copy:data.savingGoals.length?'继续靠近目标':'暂无进行中目标',icon:'wallet' as IconName,view:'savings' as View,tone:'green'},
    {label:'我的果实',value:currentAssetCount,copy:currentAssetCount?'记录使用与真实体验':'把已有物品放进来',icon:'fruit' as IconName,view:'assets' as View,tone:'yellow'},
  ];
  function chooseAvatar(event:React.ChangeEvent<HTMLInputElement>){
    const file=event.target.files?.[0];event.target.value='';if(!file)return;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)){setAvatarError('请选择 JPG、PNG 或 WebP 图片');return}
    if(file.size>5*1024*1024){setAvatarError('头像不能超过 5MB');return}
    const reader=new FileReader();reader.onload=()=>{setAvatarSource(String(reader.result||''));setAvatarZoom(1);setAvatarX(50);setAvatarY(50);setAvatarError('');setPanel('AVATAR')};reader.onerror=()=>setAvatarError('图片读取失败，请重试');reader.readAsDataURL(file);
  }
  async function saveAvatar(){setAvatarBusy(true);setAvatarError('');try{const avatarUrl=await cropAvatar(avatarSource,avatarZoom,avatarX,avatarY);await onAvatarChange(avatarUrl);setPanel('NONE')}catch(error){setAvatarError(error instanceof Error?error.message:'头像处理失败')}finally{setAvatarBusy(false)}}
  async function saveProfile(event:FormEvent){event.preventDefault();const name=nickname.trim();if(!name)return;setProfileBusy(true);setProfileError('');try{await onProfileChange({...profile,nickname:name.slice(0,20),bio:bio.trim().slice(0,80)});setPanel('NONE')}catch(error){setProfileError(error instanceof Error?error.message:'资料保存失败')}finally{setProfileBusy(false)}}
  async function removeAvatar(){if(!profile.avatarUrl||!confirm('移除当前头像并恢复默认占位图？'))return;setProfileBusy(true);setProfileError('');try{await onAvatarChange(null);setPanel('NONE')}catch(error){setProfileError(error instanceof Error?error.message:'头像移除失败')}finally{setProfileBusy(false)}}
  async function savePrivacy(value:UserProfile['shareIdentityDefault']){setProfileBusy(true);setProfileError('');try{await onProfileChange({...profile,shareIdentityDefault:value})}catch(error){setProfileError(error instanceof Error?error.message:'隐私设置保存失败')}finally{setProfileBusy(false)}}
  function signOut(){if(!confirm('确定退出当前账号吗？退出后需要重新登录。'))return;clearStoredSession();window.dispatchEvent(new Event('wb-auth-expired'))}
  return <section className={`${styles.rootPage} ${styles.profilePage}`}>
    <header className={styles.profileHeader}>
      <div className={styles.profileActions}><button onClick={()=>onNavigate('inbox')} aria-label={`朋友回信${unreadCount?`，${unreadCount}封未读`:''}`}><Icon name="bell"/>{unreadCount>0&&<i>{unreadCount}</i>}</button><button onClick={()=>setPanel('SETTINGS')} aria-label="设置"><Icon name="settings"/></button></div>
      <div className={styles.profileIdentity}>
        <button className={styles.avatarButton} onClick={()=>fileRef.current?.click()} aria-label="更换头像">{profile.avatarUrl?<img src={profile.avatarUrl} alt={`${profile.nickname}的头像`}/>:<span>{profile.nickname.trim().slice(0,1)||'好'}</span>}<i><Icon name="camera" size={14}/></i></button>
        <button className={styles.profileName} onClick={()=>{setNickname(profile.nickname);setBio(profile.bio||'');setPanel('EDIT')}}><small>WORTHBLOOM</small><h1>{profile.nickname}</h1><p>{profile.bio||'把每一次认真思考，留给未来的自己。'}</p></button>
      </div>
      <input ref={fileRef} className={styles.visuallyHidden} type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseAvatar}/>
      {avatarError&&panel==='NONE'&&<p className={styles.profileInlineError}>{avatarError}</p>}
    </header>

    <section className={styles.growthCard}>
      <div className={styles.growthTop}><span><small>LV.{growth.level} · {growth.name}</small><b>{points}<em> 好好值</em></b></span><button onClick={()=>setPanel('GROWTH')}>规则与明细 <Icon name="chevron" size={15}/></button></div>
      <div className={styles.growthProgress}><i style={{width:`${progress}%`}}/></div>
      <p className={styles.growthMeaning}>记录你认真想过、真正用过、愿意回看过的事，不按消费金额计算。</p>
      <small className={styles.growthLevelHint}>{growth.next?`距离下一级还差 ${growth.next-points} 好好值`:'当前已达到最高等级'}</small>
      <div className={styles.growthTasks}>{tasks.slice(0,2).map(task=><button key={task.id} onClick={task.action}><span><small>{task.eyebrow}</small><b>{task.title}</b></span><Icon name="chevron" size={17}/></button>)}</div>
    </section>

    <section className={`${styles.profileSection} ${styles.profileFeatureSection}`}><div className={styles.profileSectionHeading}><small>MY SPACE</small><h2>我的记录</h2></div><div className={styles.profileCoreGrid}>{core.map(card=><button key={card.label} data-tone={card.tone} onClick={()=>onNavigate(card.view)}><span className={styles.profileCoreIcon}><Icon name={card.icon} size={27}/></span><b>{card.value}</b><strong>{card.label}</strong><small>{card.copy}</small><Icon name="chevron" size={17}/></button>)}</div></section>

    <section className={styles.profileSection}><div className={styles.profileSectionHeading}><h2>常用功能</h2></div><div className={styles.profileUtilityGrid}><button onClick={()=>onNavigate('device')}><span><Icon name="flower" size={25}/></span><b>电子花</b><small>查看「{deriveDeviceSummary(data).title}」的进度</small></button><button onClick={()=>setPanel('PRIVACY')}><span><Icon name="shield" size={25}/></span><b>隐私与分享</b><small>{profile.shareIdentityDefault==='ANONYMOUS'?'默认匿名':'默认展示昵称'}</small></button></div></section>

    {panel!=='NONE'&&<div className={styles.profileOverlay} role="presentation" onMouseDown={event=>{if(event.currentTarget===event.target)setPanel('NONE')}}><section className={styles.profileSheet} role="dialog" aria-modal="true" aria-label={panel==='AVATAR'?'裁剪头像':panel==='EDIT'?'编辑资料':panel==='PRIVACY'?'隐私与分享':panel==='GROWTH'?'好好值规则与明细':panel==='DEVICES'?'新增设备':'设置'}><header><b>{panel==='AVATAR'?'调整头像':panel==='EDIT'?'编辑资料':panel==='PRIVACY'?'隐私与分享':panel==='GROWTH'?'好好值规则与明细':panel==='DEVICES'?'新增设备':'设置'}</b><button onClick={()=>setPanel('NONE')} aria-label="关闭"><Icon name="close"/></button></header>
      {panel==='SETTINGS'&&<div className={styles.profileSettingsList}><button onClick={()=>{setNickname(profile.nickname);setBio(profile.bio||'');setPanel('EDIT')}}><Icon name="edit"/><span><b>账户与资料</b><small>昵称、头像和个人简介</small></span><Icon name="chevron"/></button><button onClick={()=>setPanel('PRIVACY')}><Icon name="shield"/><span><b>隐私与分享</b><small>设置分享时的默认身份</small></span><Icon name="chevron"/></button><button onClick={()=>onNavigate('device')}><Icon name="device"/><span><b>电子花</b><small>查看花园进度，实体设备可选</small></span><Icon name="chevron"/></button><button onClick={()=>setPanel('DEVICES')}><Icon name="plus"/><span><b>新增设备</b><small>电子衣橱、智能冰箱贴（展示中）</small></span><Icon name="chevron"/></button><article><Icon name="help"/><span><b>关于好好花</b><small>朋友给出视角，工具帮你整理，最后仍由你决定。</small></span></article></div>}
      {panel==='DEVICES'&&<div className={styles.deviceCatalog}><p>先看看未来可以一起照看的设备。它们目前只做展示，暂不连接或收集数据。</p><article><span><Icon name="device" size={26}/></span><div><b>电子衣橱</b><small>记录衣物使用频率与搭配灵感</small></div><em>即将开放</em></article><article><span><Icon name="wish" size={26}/></span><div><b>智能冰箱贴</b><small>把日常补货和小小提醒放在眼前</small></div><em>即将开放</em></article></div>}
      {panel==='EDIT'&&<form className={styles.profileEditForm} onSubmit={saveProfile}><label><span>昵称</span><input required maxLength={20} value={nickname} onChange={event=>setNickname(event.target.value)} placeholder="怎么称呼你"/></label><label><span>个人简介</span><textarea maxLength={80} value={bio} onChange={event=>setBio(event.target.value)} placeholder="写下一句留给未来自己的话"/></label><button type="button" className={styles.profileSecondaryAction} onClick={()=>fileRef.current?.click()}><Icon name="camera"/>更换头像</button>{profile.avatarUrl&&<button type="button" className={styles.profileDangerAction} disabled={profileBusy} onClick={()=>void removeAvatar()}>移除头像</button>}{profileError&&<p className={styles.profileInlineError}>{profileError}</p>}<button className={styles.profilePrimaryAction} disabled={profileBusy}>{profileBusy?'保存中…':'保存资料'}</button><button type="button" className={styles.profileDangerAction} onClick={signOut}>退出当前账号</button></form>}
      {panel==='AVATAR'&&<div className={styles.avatarEditor}><div className={styles.avatarCrop}><img src={avatarSource} alt="头像裁剪预览" style={{transform:`scale(${avatarZoom})`,transformOrigin:`${avatarX}% ${avatarY}%`}}/></div><label>缩放<input type="range" min="1" max="2" step=".05" value={avatarZoom} onChange={event=>setAvatarZoom(Number(event.target.value))}/></label><label>水平位置<input type="range" min="0" max="100" value={avatarX} onChange={event=>setAvatarX(Number(event.target.value))}/></label><label>垂直位置<input type="range" min="0" max="100" value={avatarY} onChange={event=>setAvatarY(Number(event.target.value))}/></label>{avatarError&&<p className={styles.profileInlineError}>{avatarError}</p>}<button className={styles.profilePrimaryAction} disabled={avatarBusy} onClick={()=>void saveAvatar()}>{avatarBusy?'处理中…':'使用这张头像'}</button></div>}
      {panel==='PRIVACY'&&<div className={styles.profilePrivacy}><p>头像会保存在你的账户资料中。分享心愿时，是否展示身份由你决定。</p><div><button disabled={profileBusy} className={profile.shareIdentityDefault==='ANONYMOUS'?styles.profileChoiceActive:''} onClick={()=>void savePrivacy('ANONYMOUS')}><b>默认匿名</b><small>朋友只看到匿名称呼</small></button><button disabled={profileBusy} className={profile.shareIdentityDefault==='NICKNAME'?styles.profileChoiceActive:''} onClick={()=>void savePrivacy('NICKNAME')}><b>展示昵称</b><small>仅展示昵称，不自动公开头像</small></button></div>{profileError&&<p className={styles.profileInlineError}>{profileError}</p>}<article><b>好好值奖励什么？</b><p>它记录的是认真完成的过程，不是花了多少钱。具体规则可以在“成长明细”里查看。</p></article></div>}
      {panel==='GROWTH'&&<div className={styles.growthLedger}><section><small>LV.{growth.level} · {growth.name}</small><b>{points}<em> 好好值</em></b><div className={styles.growthProgress}><i style={{width:`${progress}%`}}/></div><p>{growth.next?`再获得 ${growth.next-points} 好好值进入下一级`:'当前已达到最高等级'}</p></section><p>它记录“想清楚—行动—回看”的过程。写下好体验或坏体验得到的分值相同，消费金额也不会改变分数。</p><div className={styles.growthSection}><b>好好花「积分等级会员体系」</b><div className={styles.growthTable}><div className={`${styles.growthTableRow} ${styles.growthTableHead}`}><span>等级</span><span>会员名称</span><span>所需累计积分</span><span>用户定位</span></div>{MEMBERSHIP_LEVELS.map(level=><div className={styles.growthTableRow} key={level.level}><span className={styles.growthTableLevel}>{level.level}</span><span className={styles.growthTableName}>{level.name}</span><span>{level.points}</span><span className={styles.growthTableRole}>{level.role}</span></div>)}</div></div><div className={styles.growthSection}><b>好好花积分</b><div className={`${styles.growthTable} ${styles.growthTokenTable}`}><div className={`${styles.growthTableRow} ${styles.growthTableHead}`}><span>用户行为</span><span>积分</span><span>对应 Token</span></div>{POINT_RULES.map(rule=><div className={styles.growthTableRow} key={rule.action}><span>{rule.action}</span><strong>{rule.points}</strong><span>{rule.token}</span></div>)}</div></div><div>{displayGrowthEntries.map(entry=><article key={entry.id}><span><b>{entry.title}</b><small>{new Date(entry.date).toLocaleDateString('zh-CN')}{entry.limited?' · 已达当日上限':''}</small></span><strong>{entry.points>0?'+':''}{entry.points}</strong></article>)}</div>{!displayGrowthEntries.length&&<p className={styles.emptyState}>还没有成长记录。</p>}</div>}
    </section></div>}
  </section>;
}

export function WishesView({data,onBack,onOpen}:{data:AppData;onBack:()=>void;onOpen:(request:PurchaseRequest)=>void}){
  const active=data.requests.filter(request=>request.status==='REVIEWING');
  return <section className={styles.subPage}><PageHeader title="心愿档案" onBack={onBack}/><div className={styles.archiveIntro}><b>{data.requests.length}</b><span>个心愿被认真记录</span></div><div className={styles.archiveList}>{data.requests.map(request=><button key={request.id} onClick={()=>onOpen(request)}><span className={styles.categoryIcon}>{categoryGlyph(request.category??'')}</span><span><small>{statusCopy(request)} · {reviewCountFor(data,request.id)} 条回信</small><b>{request.name}</b><em>¥{request.price.toLocaleString()}</em></span><Icon name="chevron"/></button>)}</div>{!active.length&&<p className={styles.inlineNote}>当前没有正在征集意见的心愿。</p>}</section>;
}

export function DecisionsView({data,onBack,onOpen}:{data:AppData;onBack:()=>void;onOpen:(request:PurchaseRequest)=>void}){
  const [filter,setFilter]=useState<'ALL'|ReviewChoice>('ALL');
  const [sort,setSort]=useState<'NEWEST'|'OLDEST'|'PRICE'>('NEWEST');
  const items=useMemo(()=>data.decisions.map(decision=>({decision,request:requestByDecision(data,decision)})).filter(item=>item.request&& (filter==='ALL'||item.decision.decision===filter)).sort((a,b)=>sort==='PRICE'?(b.request!.price-a.request!.price):sort==='OLDEST'?(Date.parse(a.decision.decided_at)-Date.parse(b.decision.decided_at)):(Date.parse(b.decision.decided_at)-Date.parse(a.decision.decided_at))),[data,filter,sort]);
  return <section className={styles.subPage}><PageHeader title="已做决定" onBack={onBack} action={<label className={styles.sortSelect}><Icon name="sort" size={18}/><select aria-label="决定排序" value={sort} onChange={event=>setSort(event.target.value as typeof sort)}><option value="NEWEST">最新决定</option><option value="OLDEST">最早决定</option><option value="PRICE">金额从高到低</option></select></label>}/><div className={styles.filterTabs}>{([['ALL','全部'],['BUY_NOW','现在购买'],['SAVE_FIRST','先存钱'],['WAIT','再等等']] as const).map(item=><button className={filter===item[0]?styles.filterActive:''} key={item[0]} onClick={()=>setFilter(item[0])}>{item[1]}</button>)}</div><div className={styles.decisionList}>{items.map(({decision,request})=><DecisionCard key={decision.request_id} request={request!} decision={decision} goal={data.savingGoals.find(goal=>goal.request_id===request!.id)} onOpen={()=>onOpen(request!)}/>)}</div>{!items.length&&<p className={styles.emptyState}>这个筛选下还没有决定记录。</p>}</section>;
}

export function SavingsView({data,onBack,onAddSaving}:{data:AppData;onBack:()=>void;onAddSaving:(goalId:string,amount:number)=>Promise<void>}){
  const total=data.savingGoals.reduce((sum,goal)=>sum+goal.target,0);
  const saved=data.savingGoals.reduce((sum,goal)=>sum+goal.current,0);
  return <section className={styles.subPage}><PageHeader title="存钱目标" onBack={onBack}/><section className={styles.savingsSummary}><small>SAVING GOALS</small><b>¥{saved.toLocaleString()}<em> / ¥{total.toLocaleString()}</em></b><p>{data.savingGoals.length?`${data.savingGoals.length} 个目标正在准备中`:'当前没有进行中的存钱目标'}</p></section><div className={styles.savingsList}>{data.savingGoals.map(goal=><article key={goal.id}><SavingControl goal={goal} onAdd={amount=>onAddSaving(goal.id,amount)}/></article>)}</div>{!data.savingGoals.length&&<p className={styles.emptyState}>选择“先存钱”后，对应目标会出现在这里。</p>}</section>;
}

const MEMBERSHIP_LEVELS:Array<{level:string;name:string;points:string;role:string}>=[
  { level:'Lv.1', name:'青铜会员', points:'0 ~ 99', role:'新用户' },
  { level:'Lv.2', name:'白银会员', points:'100 ~ 299', role:'初步活跃' },
  { level:'Lv.3', name:'黄金会员', points:'300 ~ 699', role:'核心用户' },
  { level:'Lv.4', name:'铂金会员', points:'700 ~ 1,499', role:'高价值用户' },
  { level:'Lv.5', name:'钻石会员', points:'≥ 1,500', role:'核心贡献用户' },
];
const POINT_RULES:Array<{action:string;points:string;token:string}>=[
  { action:'每日登录', points:'+3', token:'2,700 Token' },
  { action:'连续登录 7 天', points:'+21', token:'18,900 Token' },
  { action:'邀请新用户', points:'+8', token:'7,200 Token' },
  { action:'有效分享', points:'+2', token:'1,800 Token' },
  { action:'完成有效回答/回信', points:'+3', token:'2,700 Token' },
  { action:'上传一次消费记录', points:'+10', token:'9,000 Token' },
  { action:'完成一次心愿/决策', points:'+40', token:'36,000 Token' },
];
const assetTypeOptions:Array<{value:Asset['type'];label:string}>=[
  {value:'ITEM',label:'高价值实物'},
  {value:'EXPERIENCE',label:'一次性体验 / 消耗品'},
  {value:'MEMBERSHIP',label:'会员 / 订阅'},
  {value:'STORED_VALUE',label:'储值 / 余额'},
  {value:'COURSE',label:'课程 / 次卡'},
  {value:'OTHER',label:'其他'},
];
const assetTypeLabel=Object.fromEntries(assetTypeOptions.map(item=>[item.value,item.label])) as Record<Asset['type'],string>;
const feelingOptions:Array<{value:AssetReflectionFeeling;label:string}>=[
  {value:'BECAME_PART_OF_LIFE',label:'成了生活的一部分'},
  {value:'SOMETIMES_USEFUL',label:'偶尔派上用场'},
  {value:'BARELY_USED',label:'没有想象中常用'},
  {value:'NOT_FOR_ME',label:'这次不太适合我'},
];
const buyAgainOptions:Array<{value:AssetReflection['would_buy_again'];label:string}>=[
  {value:'YES',label:'还是会选'},
  {value:'MAYBE',label:'会先试试'},
  {value:'NO',label:'下次换一种'},
];
function terminalTrigger(asset:Asset):AssetReflection['trigger']|null{return isAssetExpired(asset)?'EXPIRED':assetFinished(asset)?'COMPLETED':null}
function reflectionFeeling(reflection:AssetReflection){
  if(reflection.feeling)return feelingOptions.find(item=>item.value===reflection.feeling)?.label||'留下了一次真实回看';
  if((reflection.rating??0)>=4)return '成了生活的一部分';
  if(reflection.rating===3)return '偶尔派上用场';
  if(reflection.rating===2)return '没有想象中常用';
  return '这次不太适合我';
}

export function AssetsView({data,onBack,onAddAsset,onUseAsset,onDeleteAsset,onAddReflection}:{data:AppData;onBack:()=>void;onAddAsset:(payload:Record<string,unknown>)=>Promise<Asset>;onUseAsset:(assetId:string,amount?:number)=>Promise<Asset>;onDeleteAsset:(assetId:string)=>Promise<void>;onAddReflection:(payload:{assetId:string;feeling:AssetReflectionFeeling;wouldBuyAgain:AssetReflection['would_buy_again'];note:string;trigger:AssetReflection['trigger']})=>Promise<AssetReflection>}){
  const [panel,setPanel]=useState<'NONE'|'ADD'|'REFLECT'>('NONE');
  const [active,setActive]=useState<Asset|null>(null);
  const [trigger,setTrigger]=useState<AssetReflection['trigger']>('MANUAL');
  const [busy,setBusy]=useState('');
  const [message,setMessage]=useState('');
  const [spend,setSpend]=useState<Record<string,string>>({});
  const [showArchive,setShowArchive]=useState(false);
  const [assetForm,setAssetForm]=useState({name:'',type:'ITEM' as Asset['type'],purchase_price:'',total_units:'',current_balance:'',usage_count:'0',expiry_date:''});
  const [reflection,setReflection]=useState<{feeling:AssetReflectionFeeling|'';wouldBuyAgain:AssetReflection['would_buy_again']|'';note:string}>({feeling:'',wouldBuyAgain:'',note:''});
  const activeAssets=data.assets.filter(item=>!item.archived_at);
  const archivedAssets=data.assets.filter(item=>Boolean(item.archived_at));
  const pendingAssets=activeAssets.filter(item=>terminalTrigger(item));
  const currentAssets=activeAssets.filter(item=>!terminalTrigger(item));
  const totalSpend=activeAssets.reduce((sum,item)=>sum+item.purchase_price,0);
  const totalUses=activeAssets.reduce((sum,item)=>sum+item.usage_count,0);
  function openReflection(asset:Asset,nextTrigger:AssetReflection['trigger']=terminalTrigger(asset)||'MANUAL'){setActive(asset);setTrigger(nextTrigger);setReflection({feeling:'',wouldBuyAgain:'',note:''});setMessage('');setPanel('REFLECT')}
  async function addAsset(event:FormEvent){event.preventDefault();setBusy('add');setMessage('');try{await onAddAsset({name:assetForm.name,type:assetForm.type,purchase_price:Number(assetForm.purchase_price),total_units:assetForm.total_units?Number(assetForm.total_units):null,current_balance:assetForm.current_balance?Number(assetForm.current_balance):null,usage_count:Number(assetForm.usage_count||0),expiry_date:assetForm.expiry_date||null});setAssetForm({name:'',type:'ITEM',purchase_price:'',total_units:'',current_balance:'',usage_count:'0',expiry_date:''});setPanel('NONE')}catch(error){setMessage(error instanceof Error?error.message:'物品没有保存')}finally{setBusy('')}}
  async function use(asset:Asset){setBusy(`use:${asset.id}`);setMessage('');try{const amount=asset.type==='STORED_VALUE'?Number(spend[asset.id]):undefined;const updated=await onUseAsset(asset.id,amount);setSpend(previous=>({...previous,[asset.id]:''}));if(assetFinished(updated))openReflection(updated,'COMPLETED')}catch(error){setMessage(error instanceof Error?error.message:'使用记录没有保存')}finally{setBusy('')}}
  async function remove(asset:Asset){if(!confirm(`停止追踪「${asset.name}」？已经写下的体验记录会保留。`))return;setBusy(`delete:${asset.id}`);try{await onDeleteAsset(asset.id)}catch(error){setMessage(error instanceof Error?error.message:'移除失败')}finally{setBusy('')}}
  async function saveReflection(event:FormEvent){event.preventDefault();if(!active)return;if(!reflection.feeling){setMessage('请选择一句最接近真实体验的话');return}if(!reflection.wouldBuyAgain){setMessage('请选择下次再遇到类似选择时会怎么做');return}setBusy('reflect');setMessage('');try{await onAddReflection({assetId:active.id,feeling:reflection.feeling,wouldBuyAgain:reflection.wouldBuyAgain,note:reflection.note,trigger});setPanel('NONE')}catch(error){setMessage(error instanceof Error?error.message:'体验没有保存')}finally{setBusy('')}}
  function renderAsset(asset:Asset,archived=false){
    const remaining=remainingUnits(asset);const perUse=costPerUse(asset);const reflections=data.assetReflections.filter(item=>item.asset_id===asset.id);const nextTrigger=terminalTrigger(asset);const finished=Boolean(nextTrigger);
    const primaryValue=asset.type==='COURSE'?remaining??'—':asset.type==='STORED_VALUE'?`¥${Number(asset.current_balance??0).toLocaleString()}`:asset.usage_count;
    const primaryLabel=asset.type==='COURSE'?'剩余次数':asset.type==='STORED_VALUE'?'当前余额':'使用次数';
    return <article className={`${styles.assetCard} ${archived?styles.assetCardArchived:''}`} key={asset.id}>
      <header><span className={styles.assetFruit} data-finished={finished||archived}><Icon name="fruit" size={25}/></span><span><small>{assetTypeLabel[asset.type]}{archived?' · 已归档':nextTrigger==='EXPIRED'?' · 已到期':nextTrigger==='COMPLETED'?' · 已用完':''}</small><h2>{asset.name}</h2></span></header>
      <div className={styles.assetNumbers}><span><b>{primaryValue}</b><small>{primaryLabel}</small></span><span><b>{perUse==null?'—':`¥${perUse.toLocaleString()}`}</b><small>目前每次</small></span><span><b>{asset.expiry_date?asset.expiry_date.slice(5).replace('-','.'):'长期'}</b><small>有效期</small></span></div>
      {!archived&&asset.type==='STORED_VALUE'&&!nextTrigger&&<label className={styles.spendInput}>本次消费 ¥<input type="number" min="0.01" step="0.01" value={spend[asset.id]??''} onChange={event=>setSpend(previous=>({...previous,[asset.id]:event.target.value}))} placeholder="0"/></label>}
      {!archived&&(nextTrigger?<div className={styles.assetPendingActions}><p>{nextTrigger==='EXPIRED'?'它已经走到有效期的终点。':'它已经完成了这段使用。'}写下一次回看后，会从当前果实中收进过去。</p><button onClick={()=>openReflection(asset,nextTrigger)}>写下回看</button></div>:<div className={styles.assetActions}><button disabled={busy===`use:${asset.id}`} onClick={()=>void use(asset)}>{busy===`use:${asset.id}`?'记录中…':asset.type==='STORED_VALUE'?'记录消费':'今天用了一次'}</button><button onClick={()=>openReflection(asset,'MANUAL')}>写体验</button><button disabled={busy===`delete:${asset.id}`} onClick={()=>void remove(asset)}>停止追踪</button></div>)}
      {reflections.length>0&&<div className={styles.reflectionPreview}>{reflections.slice(0,2).map(item=><blockquote key={item.id}><b>{reflectionFeeling(item)} · {item.would_buy_again==='YES'?'还是会选':item.would_buy_again==='NO'?'下次换一种':'会先试试'}</b><p>{item.note}</p><small>{new Date(item.created_at).toLocaleDateString('zh-CN')}</small></blockquote>)}</div>}
    </article>;
  }
  return <section className={styles.subPage}><PageHeader title="我的果实" onBack={onBack} action={<button className={styles.headerAction} onClick={()=>{setMessage('');setPanel('ADD')}}>添加</button>}/>
    <section className={styles.assetSummary}><div><span className={styles.fruitMark}><Icon name="fruit" size={30}/></span><span><small>正在生活里</small><b>{activeAssets.length} 件</b></span></div><p>总购入 ¥{totalSpend.toLocaleString()} · 已记录 {totalUses} 次使用{archivedAssets.length?` · ${archivedAssets.length} 件已归档`:''}</p></section>
    <p className={styles.pageLead}>买下之后，继续看看它有没有真正进入生活。每次价格会随着使用记录自动更新。</p>
    {pendingAssets.length>0&&<section className={styles.assetReviewCallout}><span><b>{pendingAssets.length} 件果实到了回看的时候</b><p>写下真实体验后，它会从当前列表收进“过去的果实”。记录不会丢失。</p></span><button onClick={()=>openReflection(pendingAssets[0],terminalTrigger(pendingAssets[0])||'COMPLETED')}>开始回看</button></section>}
    {pendingAssets.length>0&&<section className={styles.assetSection}><header><span>待回看</span><small>完成后自动归档</small></header><div className={styles.assetGrid}>{pendingAssets.map(asset=>renderAsset(asset))}</div></section>}
    {currentAssets.length>0&&<section className={styles.assetSection}><header><span>当前果实</span><small>{currentAssets.length} 件正在使用</small></header><div className={styles.assetGrid}>{currentAssets.map(asset=>renderAsset(asset))}</div></section>}
    {!activeAssets.length&&<button className={styles.assetEmpty} onClick={()=>setPanel('ADD')}><span className={styles.fruitMark}><Icon name="fruit" size={34}/></span><b>把已经拥有的放进来</b><p>实物、体验、会员、储值和课程都可以从今天开始记录。</p></button>}
    {archivedAssets.length>0&&<section className={styles.assetArchive}><button onClick={()=>setShowArchive(previous=>!previous)}><span><b>过去的果实</b><small>{archivedAssets.length} 件 · 记录仍然保留</small></span><Icon name="chevron" size={18}/></button>{showArchive&&<div className={styles.assetGrid}>{archivedAssets.map(asset=>renderAsset(asset,true))}</div>}</section>}
    {message&&panel==='NONE'&&<p className={styles.toast}>{message}</p>}
    {panel!=='NONE'&&<div className={styles.profileOverlay} role="presentation" onMouseDown={event=>{if(event.currentTarget===event.target)setPanel('NONE')}}><section className={styles.profileSheet} role="dialog" aria-modal="true"><header><b>{panel==='ADD'?'添加已有物品':trigger==='COMPLETED'?'用完了，留一次回看':trigger==='EXPIRED'?'到期了，留一次回看':'记录一次使用感受'}</b><button onClick={()=>setPanel('NONE')} aria-label="关闭"><Icon name="close"/></button></header>
      {panel==='ADD'&&<form className={styles.assetForm} onSubmit={addAsset}><label><span>名称</span><input required maxLength={80} value={assetForm.name} onChange={event=>setAssetForm(previous=>({...previous,name:event.target.value}))}/></label><div><label><span>类型</span><select value={assetForm.type} onChange={event=>setAssetForm(previous=>({...previous,type:event.target.value as Asset['type']}))}>{assetTypeOptions.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label><span>购入金额</span><input required type="number" min="0" step="0.01" value={assetForm.purchase_price} onChange={event=>setAssetForm(previous=>({...previous,purchase_price:event.target.value}))}/></label></div>{assetForm.type==='COURSE'&&<label><span>总次数</span><input required type="number" min="1" value={assetForm.total_units} onChange={event=>setAssetForm(previous=>({...previous,total_units:event.target.value}))}/></label>}{assetForm.type==='STORED_VALUE'&&<label><span>当前余额</span><input required type="number" min="0" step="0.01" value={assetForm.current_balance} onChange={event=>setAssetForm(previous=>({...previous,current_balance:event.target.value}))}/></label>}<div><label><span>过去已使用</span><input type="number" min="0" value={assetForm.usage_count} onChange={event=>setAssetForm(previous=>({...previous,usage_count:event.target.value}))}/></label><label><span>有效期</span><input type="date" value={assetForm.expiry_date} onChange={event=>setAssetForm(previous=>({...previous,expiry_date:event.target.value}))}/></label></div>{message&&<p className={styles.profileInlineError}>{message}</p>}<button className={styles.profilePrimaryAction} disabled={busy==='add'}>{busy==='add'?'保存中…':'放进果实架'}</button></form>}
      {panel==='REFLECT'&&active&&<form className={styles.reflectionForm} onSubmit={saveReflection}><p>关于「{active.name}」，不必打分，只选一句最接近真实生活的话。</p><fieldset><legend>它最后有没有进入你的生活？</legend><div className={styles.feelingChoices}>{feelingOptions.map(item=><button type="button" className={reflection.feeling===item.value?styles.ratingActive:''} key={item.value} onClick={()=>setReflection(previous=>({...previous,feeling:item.value}))}>{item.label}</button>)}</div></fieldset><fieldset><legend>如果再遇到类似的，你会？</legend><div>{buyAgainOptions.map(item=><button type="button" className={reflection.wouldBuyAgain===item.value?styles.ratingActive:''} key={item.value} onClick={()=>setReflection(previous=>({...previous,wouldBuyAgain:item.value}))}>{item.label}</button>)}</div></fieldset><label><span>最想留给下次自己的话</span><textarea required maxLength={500} rows={4} value={reflection.note} onChange={event=>setReflection(previous=>({...previous,note:event.target.value}))} placeholder="例如：离家近，所以这次真的坚持下来了；下次不必买更长的课包。"/></label><aside className={styles.reflectionReward}><b>首次回看 +15 好好值</b><span>奖励的是愿意诚实回看。答案好坏不会影响分数。</span></aside>{message&&<p className={styles.profileInlineError}>{message}</p>}<button className={styles.profilePrimaryAction} disabled={busy==='reflect'}>{busy==='reflect'?'保存中…':trigger==='MANUAL'?'保存这次体验':'保存并归档'}</button></form>}
    </section></div>}
  </section>;
}

export function InboxView({data,items,nextCursor,onLoadMore,onBack,onOpen}:{data:AppData;items:InboxItem[];nextCursor:string|null;onLoadMore:()=>Promise<unknown>;onBack:()=>void;onOpen:(request:PurchaseRequest)=>void}){
  const [loading,setLoading]=useState(false);
  const fallback=[...data.reviews].sort((a,b)=>Date.parse(b.created_at??'')-Date.parse(a.created_at??'')).map(review=>({review,requestName:data.requests.find(item=>item.id===review.request_id)?.name||'已归档心愿',isRead:true} as InboxItem));
  const visible=items.length?items:fallback;
  async function loadMore(){setLoading(true);try{await onLoadMore()}finally{setLoading(false)}}
  return <section className={styles.subPage}><PageHeader title="朋友回信" onBack={onBack}/><p className={styles.pageLead}>按时间查看收到的真实视角。回信只提供参考，决定仍然属于你。</p><div className={styles.inboxList}>{visible.map(item=>{const review=item.review;const request=data.requests.find(entry=>entry.id===review.request_id);return <button key={review.id} disabled={!request} onClick={()=>request&&onOpen(request)}><span className={styles.replyAvatar}>{review.reviewer_name.slice(0,1)}</span><span><small>{!item.isRead?'未读 · ':''}{review.reviewer_name} · {new Date(review.created_at??'').toLocaleDateString('zh-CN')}</small><b>{item.requestName}</b><p>{review.comment}</p></span><Icon name="chevron"/></button>})}</div>{!visible.length&&<p className={styles.emptyState}>还没有收到朋友回信。</p>}{nextCursor&&<button className={styles.headingLink} disabled={loading} onClick={()=>void loadMore()}>{loading?'加载中…':'加载更多回信'}</button>}</section>;
}

const HAOHAOHUA_BLUETOOTH = {
  deviceName: 'HaoHaoHua',
  serviceUuid: '4fafc201-1fb5-459e-8fcc-c5c9c331914b',
  characteristicUuid: 'beb5483e-36e1-4688-b7f5-ea07361b26a8',
} as const;

type BluetoothCharacteristicLike = {
  writeValue(value: Uint8Array): Promise<void>;
  writeValueWithResponse?: (value: Uint8Array) => Promise<void>;
};
type BluetoothGattServerLike = {
  connected: boolean;
  connect(): Promise<BluetoothGattServerLike>;
  disconnect(): void;
  getPrimaryService(uuid: string): Promise<{getCharacteristic(uuid: string): Promise<BluetoothCharacteristicLike>}>;
};
type BluetoothDeviceLike = {
  name?: string;
  gatt?: BluetoothGattServerLike;
  addEventListener?: (type: string, listener: EventListener) => void;
  removeEventListener?: (type: string, listener: EventListener) => void;
};
type BluetoothApiLike = {
  requestDevice(options: {filters: Array<{name?: string;services?: string[]}>;optionalServices?: string[]}): Promise<BluetoothDeviceLike>;
};

export function DeviceView({data,onBack}:{data:AppData;onBack:()=>void}){
  const candidates=useMemo(()=>data.requests.filter(request=>request.status==='REVIEWING'||(request.status==='SAVING'&&data.savingGoals.some(goal=>goal.request_id===request.id))),[data.requests,data.savingGoals]);
  const [focusRequestId,setFocusRequestId]=useState<string|null>(null);
  const [syncMessage,setSyncMessage]=useState('');
  const [bluetoothDevice,setBluetoothDevice]=useState<BluetoothDeviceLike|null>(null);
  const [bluetoothCharacteristic,setBluetoothCharacteristic]=useState<BluetoothCharacteristicLike|null>(null);
  const [bluetoothBusy,setBluetoothBusy]=useState(false);
  const [bluetoothMessage,setBluetoothMessage]=useState('');
  const [bluetoothError,setBluetoothError]=useState('');
  const [sendProgress,setSendProgress]=useState('0');
  const bluetoothCleanupRef=useRef<(() => void)|null>(null);
  const bluetoothDeviceRef=useRef<BluetoothDeviceLike|null>(null);
  const bluetoothCharacteristicRef=useRef<BluetoothCharacteristicLike|null>(null);
  useEffect(()=>{let active=true;cloudBaseFetch('/api/device/focus',{cache:'no-store'}).then(async response=>await response.json() as {focusRequestId?:string|null}).then(output=>{if(active)setFocusRequestId(output.focusRequestId??null)}).catch(()=>{});return()=>{active=false}},[]);
  const defaultRequestId=data.savingGoals[0]?.request_id??undefined;
  const selected=candidates.find(request=>request.id===focusRequestId)??candidates.find(request=>request.id===defaultRequestId)??candidates[0];
  const selectedGoal=selected?data.savingGoals.find(goal=>goal.request_id===selected.id):undefined;
  const selectedReplies=selected?data.reviews.filter(review=>review.request_id===selected.id).length:0;
  const state=selected
    ? selectedGoal
      ? {mode:'GROWING' as const,title:selected.name,progress:selectedGoal.target?Math.min(1,selectedGoal.current/selectedGoal.target):0,flower_health:80,remaining:Math.max(0,selectedGoal.target-selectedGoal.current),days_left:null,message:'正在靠近目标',asset_id:null,request_id:selected.id}
      : {mode:'WAITING' as const,title:selected.name,progress:Math.min(1,selectedReplies/3),flower_health:78,remaining:Math.max(0,3-selectedReplies),days_left:null,message:selectedReplies?'回信已到，等你决定':'等待不同视角',asset_id:null,request_id:selected.id}
    : deriveDeviceSummary(data);
  useEffect(()=>()=>{bluetoothCleanupRef.current?.();bluetoothCleanupRef.current=null},[]);
  function progressForRequest(requestId:string){
    const request=data.requests.find(item=>item.id===requestId);
    if(!request)return 0;
    const goal=data.savingGoals.find(item=>item.request_id===request.id);
    return goal?.target?Math.min(1,goal.current/goal.target):Math.min(1,data.reviews.filter(review=>review.request_id===request.id).length/3);
  }
  async function selectWish(requestId:string){
    setFocusRequestId(requestId);setSendProgress(String(Math.round(progressForRequest(requestId)*100)));setSyncMessage('正在同步…');
    try{const response=await cloudBaseFetch('/api/device/focus',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({requestId})});const output=await response.json() as {error?:string};if(!response.ok)throw new Error(output.error||'同步失败');setSyncMessage('已同步，实体花会在下一次刷新时更新（最长约 5 秒）。')}
    catch(error){setSyncMessage(error instanceof Error?error.message:'同步失败')}
  }
  async function connectBluetooth(){
    setBluetoothBusy(true);setBluetoothError('');setBluetoothMessage('');
    const bluetooth=(typeof navigator!=='undefined'?(navigator as Navigator & {bluetooth?:BluetoothApiLike}).bluetooth:undefined);
    if(!bluetooth){setBluetoothError('当前浏览器不支持 Web Bluetooth。请使用 Android 手机上的 Chrome。');setBluetoothBusy(false);return}
    if(typeof window!=='undefined'&&!window.isSecureContext&&location.hostname!=='localhost'&&location.hostname!=='127.0.0.1'){
      setBluetoothError('蓝牙连接需要 HTTPS 页面。请打开以 https:// 开头的队友链接。');setBluetoothBusy(false);return
    }
    try{
      bluetoothCleanupRef.current?.();
      bluetoothCleanupRef.current=null;
      const device=await bluetooth.requestDevice({filters:[{name:HAOHAOHUA_BLUETOOTH.deviceName}],optionalServices:[HAOHAOHUA_BLUETOOTH.serviceUuid]});
      const server=await device.gatt?.connect();
      if(!server)throw new Error('没有找到设备的 GATT 服务，请确认 ESP32 已上电并正在广播。');
      const service=await server.getPrimaryService(HAOHAOHUA_BLUETOOTH.serviceUuid);
      const characteristic=await service.getCharacteristic(HAOHAOHUA_BLUETOOTH.characteristicUuid);
      const handleDisconnected=()=>{
        if(bluetoothDeviceRef.current!==device)return;
        bluetoothDeviceRef.current=null;bluetoothCharacteristicRef.current=null;setBluetoothDevice(null);setBluetoothCharacteristic(null);setBluetoothMessage('设备已断开，请重新连接。');
      };
      device.addEventListener?.('gattserverdisconnected',handleDisconnected);
      bluetoothCleanupRef.current=()=>{device.removeEventListener?.('gattserverdisconnected',handleDisconnected);if(device.gatt?.connected)device.gatt.disconnect();};
      bluetoothDeviceRef.current=device;bluetoothCharacteristicRef.current=characteristic;setBluetoothDevice(device);setBluetoothCharacteristic(characteristic);setBluetoothMessage(`已连接 ${device.name||HAOHAOHUA_BLUETOOTH.deviceName}`);
    }catch(error){
      const name=error instanceof DOMException?error.name:'';
      if(name==='NotFoundError'){setBluetoothError('没有选择设备。请再次点击“连接设备”并选择 HaoHaoHua。')}
      else if(name==='SecurityError'){setBluetoothError('浏览器阻止了蓝牙访问，请确认页面使用 HTTPS，并允许附近设备权限。')}
      else{setBluetoothError(error instanceof Error?error.message:'连接失败，请确认 ESP32 已上电并正在广播。')}
      bluetoothDeviceRef.current=null;bluetoothCharacteristicRef.current=null;setBluetoothDevice(null);setBluetoothCharacteristic(null);
    }finally{setBluetoothBusy(false)}
  }
  function disconnectBluetooth(){bluetoothCleanupRef.current?.();bluetoothCleanupRef.current=null;bluetoothDeviceRef.current=null;bluetoothCharacteristicRef.current=null;setBluetoothDevice(null);setBluetoothCharacteristic(null);setBluetoothMessage('已断开设备。');setBluetoothError('')}
  async function sendToESP32(progressValue:number){
    const characteristic=bluetoothCharacteristicRef.current??bluetoothCharacteristic;
    if(!characteristic)throw new Error('请先连接 HaoHaoHua 设备。');
    if(!Number.isInteger(progressValue)||progressValue<0||progressValue>100)throw new Error('进度必须是 0～100 的整数。');
    const payload=String(progressValue);
    const bytes=new TextEncoder().encode(payload);
    if(characteristic.writeValueWithResponse)await characteristic.writeValueWithResponse(bytes);else await characteristic.writeValue(bytes);
    setBluetoothMessage(`已发送 ${payload}%`);
  }
  async function submitBluetoothProgress(event:FormEvent){
    event.preventDefault();setBluetoothError('');
    if(sendProgress.trim()===''){setBluetoothError('请输入 0～100 的进度。');return}
    const value=Number(sendProgress);
    if(!Number.isInteger(value)||value<0||value>100){setBluetoothError('进度必须是 0～100 的整数。');return}
    setBluetoothBusy(true);try{await sendToESP32(value)}catch(error){setBluetoothError(error instanceof Error?error.message:'发送失败，请重新连接设备。')}finally{setBluetoothBusy(false)}
  }
  const mode={SEED:'还没有种下心愿',SPROUT:'刚刚开始',WAITING:'等朋友回信',GROWING:'正在靠近目标',BLOOM:'心愿实现了',HEALTHY:'正在使用',STRESSED:'有一阵没用了',THIRSTY:'到了该留意的时候',RECOVERING:'重新用起来了'}[state.mode];
  const asset=state.asset_id?(data.assets??[]).find(item=>item.id===state.asset_id):undefined;
  const remainingLabel=state.mode==='WAITING'?'还等回信':state.mode==='GROWING'?'还差金额':asset?.type==='STORED_VALUE'?'剩余余额':asset?.total_units!=null?'剩余次数':state.days_left!=null?'剩余有效期':'已记录使用';
  const remainingValue=state.mode==='WAITING'?(state.remaining==null?'—':`${Math.round(state.remaining)} 封`):state.mode==='GROWING'||asset?.type==='STORED_VALUE'?(state.remaining==null?'—':`¥${Math.round(state.remaining).toLocaleString()}`):asset?.total_units!=null?(state.remaining==null?'—':`${Math.round(state.remaining)} 次`):state.days_left!=null?`${Math.max(0,state.days_left)} 天`:asset?`${asset.usage_count} 次`:`${Math.round(state.progress*100)}%`;
  const statusLine=state.message===mode?mode:`${mode} · ${state.message}`;
  return <section className={styles.subPage}><PageHeader title="电子花" onBack={onBack}/><aside className={styles.deviceIntro}><span className={styles.deviceIntroIcon}><Icon name="flower" size={22}/></span><div><h2>电子花是什么？</h2><p>它把心愿进度变成一朵会慢慢开放的花。左右滑动卡片，再点一下，就能切换实体花正在陪伴的心愿。</p><small>不连接实体设备时，页面仍可单独使用。</small></div></aside><section className={styles.bluetoothPanel}><div className={styles.bluetoothPanelHeader}><div><small>手机蓝牙控制</small><h2>{bluetoothDevice?'HaoHaoHua 已连接':'连接实体花'}</h2></div><span className={bluetoothDevice?styles.bluetoothStatusConnected:styles.bluetoothStatus}><i/>{bluetoothDevice?'已连接':'未连接'}</span></div><p>使用 Android + Chrome，通过 HTTPS 连接队友的 ESP32。选择设备 HaoHaoHua 后，输入 0～100 的进度即可发送。</p><div className={styles.bluetoothActions}>{bluetoothDevice?<button type="button" className={styles.bluetoothSecondaryButton} onClick={disconnectBluetooth}>断开设备</button>:<button type="button" className={styles.bluetoothPrimaryButton} onClick={()=>void connectBluetooth()} disabled={bluetoothBusy}>{bluetoothBusy?'连接中…':'连接设备'}</button>}</div>{bluetoothDevice&&<form className={styles.bluetoothSendForm} onSubmit={submitBluetoothProgress}><label><span>存钱进度（0～100）</span><div><input aria-label="存钱进度 0 到 100" type="number" min="0" max="100" step="1" inputMode="numeric" value={sendProgress} onChange={event=>setSendProgress(event.target.value)}/><em>%</em></div></label><button type="submit" className={styles.bluetoothPrimaryButton} disabled={bluetoothBusy}>{bluetoothBusy?'发送中…':'提交 / 发送'}</button></form>}{bluetoothMessage&&<p className={styles.bluetoothMessage} role="status">{bluetoothMessage}</p>}{bluetoothError&&<p className={styles.bluetoothError} role="alert">{bluetoothError}</p>}<small className={styles.bluetoothHint}>服务 UUID：{HAOHAOHUA_BLUETOOTH.serviceUuid}<br/>特性 UUID：{HAOHAOHUA_BLUETOOTH.characteristicUuid}</small></section>{candidates.length>0&&<section className={styles.deviceWishSection}><div><b>切换心愿</b><small>新建和未完成的心愿会出现在这里</small></div><div className={styles.deviceWishRail}>{candidates.map(request=>{const goal=data.savingGoals.find(item=>item.request_id===request.id);const replies=data.reviews.filter(review=>review.request_id===request.id).length;const progress=goal?(goal.target?goal.current/goal.target:0):replies/3;const active=request.id===selected?.id;return <button key={request.id} className={active?styles.deviceWishActive:''} onClick={()=>void selectWish(request.id)}><small>{goal?'存钱中':'等朋友回信'}</small><b>{request.name}</b><span>{Math.round(Math.min(1,progress)*100)}%</span><i><em style={{width:`${Math.min(100,progress*100)}%`}}/></i>{active&&<strong>实体花当前心愿</strong>}</button>})}</div>{syncMessage&&<p className={styles.deviceSyncMessage}>{syncMessage}</p>}</section>}<article className={styles.devicePanel}><span className={styles.deviceLargeIcon}><Icon name="flower" size={42}/></span><small>此刻陪你关注</small><h2>{state.title}</h2><p>{statusLine}</p><div className={styles.largeProgress}><i style={{width:`${Math.round(state.progress*100)}%`}}/></div><b>{Math.round(state.progress*100)}%</b></article><section className={styles.deviceFacts}><h2>这朵花在看什么</h2><div><span>当前状态</span><b>{mode}</b></div><div><span>{remainingLabel}</span><b>{remainingValue}</b></div><p>网页会把 0～100% 的进度传给设备。舵机按同样比例在“闭合角”和“完全开放角”之间移动。</p></section></section>;
}

function SavingControl({goal,onAdd}:{goal:SavingGoal;onAdd:(amount:number)=>Promise<void>}){
  const [amount,setAmount]=useState('100');const [busy,setBusy]=useState(false);const [note,setNote]=useState('');
  async function submit(event:FormEvent){event.preventDefault();const value=Number(amount);if(!value||value<=0){setNote('请输入大于 0 的金额');return}setBusy(true);setNote('');try{await onAdd(value);setNote('已存入，进度更新了')}catch(error){setNote(error instanceof Error?error.message:'存入失败')}finally{setBusy(false)}}
  return <form className={styles.savingControl} onSubmit={submit}><div><span>{goal.name||'未命名的存钱目标'}</span><b>¥{goal.current.toLocaleString()} / ¥{goal.target.toLocaleString()}</b></div><div className={styles.largeProgress}><i style={{width:`${goal.target?Math.min(100,goal.current/goal.target*100):0}%`}}/></div><div className={styles.savingRow}><label>¥<input aria-label={`为「${goal.name||'存钱目标'}」存入金额`} type="number" min="1" value={amount} onChange={event=>setAmount(event.target.value)}/></label><button disabled={busy}>{busy?'存入中…':'继续存钱'}</button></div>{note&&<small>{note}</small>}</form>;
}

function InvitePanel({request,invites,busy,onInvite,onCopyInvite}:{request:PurchaseRequest;invites:ReviewInvite[];busy:string;onInvite:()=>void;onCopyInvite:(invite:ReviewInvite)=>Promise<void>}){
  const related=invites.filter(invite=>invite.request_id===request.id&&!invite.revoked);
  const invite=related[0];
  const replyCount=request.review_count??0;
  return <section className={styles.invitePanel}>
    <header><div><h2>分享到群聊</h2><p>一个链接可以收集多份独立回信。朋友不需要登录，也看不到其他人的回答。</p></div></header>
    {!related.length&&<div className={styles.inviteEmpty}><p>还没有邀请链接，先生成一张发给朋友吧。</p><button type="button" onClick={onInvite} disabled={Boolean(busy)}>{busy==='invite'?'生成中…':'生成邀请链接'}</button></div>}
    {invite&&<div className={styles.inviteLinks}><div className={styles.inviteLinkRow}><span className={styles.invitePerson}><b>群聊邀请</b><small>{replyCount?`已收到 ${replyCount} 份回信`:'等待第一份回信'}</small></span><button type="button" onClick={()=>void onCopyInvite(invite)} disabled={busy===`copy:${invite.id}`}>{busy===`copy:${invite.id}`?'复制中…':'复制邀请'}</button></div></div>}
    <small>同一个链接可以由多人填写；心愿完成决定后，链接会自动停止收集。本地开发时地址会显示 localhost，正式部署后会自动使用部署域名。</small>
  </section>;
}

export function WishRoom({data,request,busy,message,onBack,onInvite,onCopyInvite,onDecide,onAddSaving,onDecisionNote,onEdit}:{data:AppData;request:PurchaseRequest;busy:string;message:string;onBack:()=>void;onInvite:()=>void;onCopyInvite:(invite:ReviewInvite)=>Promise<void>;onDecide:(choice:ReviewChoice,noteOverride?:string)=>void;onAddSaving:(goalId:string,amount:number)=>Promise<void>;onDecisionNote:(note:string)=>void;onEdit?:()=>void}){
  const reviews=data.reviews.filter(review=>review.request_id===request.id);const decision=data.decisions.find(item=>item.request_id===request.id);const goal=data.savingGoals.find(item=>item.request_id===request.id);const active=request.status==='REVIEWING';
  const [note,setNote]=useState(request.decision_note||'');
  const multiOptions=isMultiProductWish(request)?parseMultiProductOptions(request):[];
  const isMulti=multiOptions.length>0;
  const images=request.images??[];const [imgIndex,setImgIndex]=useState(0);const clampIndex=(n:number)=>Math.max(0,Math.min(n,Math.max(0,images.length-1)));
  const carousel=(<div className={styles.detailImage}>{images.length===0?<span className={styles.detailPlaceholder}><Icon name="wish" size={48}/></span>:<><img src={images[clampIndex(imgIndex)].url} alt={request.name}/>{images.length>1&&<><button className={styles.carouselPrev} onClick={()=>setImgIndex(i=>clampIndex(i-1))} aria-label="上一张"><Icon name="back" size={20}/></button><button className={styles.carouselNext} onClick={()=>setImgIndex(i=>clampIndex(i+1))} aria-label="下一张"><Icon name="chevron" size={20}/></button><span className={styles.carouselDots}>{clampIndex(imgIndex)+1} / {images.length}</span></>}</>}</div>);
  return <section className={styles.subPage}><PageHeader title={active?'心愿详情':'决定详情'} onBack={onBack}/>
    <article className={styles.detailHero}>{carousel}
      <span>{isMulti?'多商品选择':typeToCategory(request.type) ?? request.category ?? ''} · {statusCopy(request)}</span>
      <div className={styles.detailTitle}><div><h2>{request.name}</h2>{!isMulti&&<b>¥{request.price.toLocaleString()}</b>}</div>{active&&onEdit&&<button className={styles.editEntry} onClick={onEdit}>编辑心愿</button>}</div>
      <blockquote>{request.reason}</blockquote>
      {isMulti?<div className={styles.multiDetailGrid}>{multiOptions.map(option=><article key={option.label}><span><b>{option.name || `${option.label} 商品`}</b>{option.brand&&<small>{option.brand}</small>}</span>{option.price!==null&&<small>¥{option.price.toLocaleString()}</small>}</article>)}</div>:<>
        <div className={styles.factChips}><span>计划：{request.usageFrequency||request.usage_frequency||'待确认'}</span><span>担心：{request.concern||request.similar_item||'待补充'}</span></div>
        <details className={styles.detailFold}><summary>详情</summary><div className={styles.detailFoldGrid}><span>品牌：{request.brand||'—'}</span><span>规格：{request.skuLabel||'—'}</span><span>来源：{request.sourcePlatform||'—'}</span>{request.details&&<p>{request.details}</p>}{(request.productUrl||request.product_url)&&<a href={request.productUrl||request.product_url||''} target="_blank" rel="noreferrer">查看原商品 <Icon name="external" size={14}/></a>}</div></details>
        {request.product_url&&!request.productUrl&&<a href={request.product_url} target="_blank" rel="noreferrer">查看原商品 <Icon name="external" size={16}/></a>}{!request.product_url&&!request.productUrl&&<p className={styles.missingLink}>未保存商品链接</p>}
      </>}
    </article>
    {active?<><InvitePanel request={request} invites={data.invites??[]} busy={busy} onInvite={onInvite} onCopyInvite={onCopyInvite}/><FeedbackPanel reviews={reviews} currentRevision={request.revision??1} onInvite={onInvite}/>
      <AgentPanel request={request} revision={request.revision??1} />
      <section className={styles.finalDecision}><small>最后一步</small><h2>听完不同视角，<br/>由你完成决定。</h2><textarea value={note} onChange={event=>{setNote(event.target.value);onDecisionNote(event.target.value)}} placeholder="写下为什么这样决定，留给之后的自己"/><div><button disabled={Boolean(busy)} onClick={()=>onDecide('BUY_NOW')}>现在购买</button><button disabled={Boolean(busy)} onClick={()=>onDecide('SAVE_FIRST')}>先存钱</button><button disabled={Boolean(busy)} onClick={()=>onDecide('WAIT')}>再等等</button></div></section>
    </>:<><section className={styles.timeline}><h2>决定时间线</h2><article className={styles.blueSurface}><small>01 · 心愿事实</small><b>{request.reason}</b></article><article className={styles.pinkSurface}><small>02 · 朋友视角</small><b>{reviews.length?`${reviews.length} 条回信已保存`:'当时没有真人回信'}</b>{reviews.map(review=><p key={review.id}>{review.reviewer_name}：{review.comment}</p>)}</article><article className={decision?.decision==='SAVE_FIRST'?styles.greenSurface:styles.yellowSurface}><small>03 · 最终决定</small><b>{decision?decisionCopy(decision.decision):statusCopy(request)}</b><p>{request.decision_note||'当时没有补充决定理由。'}</p><time>{decision?new Date(decision.decided_at).toLocaleString('zh-CN'):'时间未记录'}</time></article></section>{goal&&<SavingControl goal={goal} onAdd={amount=>onAddSaving(goal.id,amount)}/>}</>}{message&&<p className={styles.toast} role="status">{message}</p>}</section>;
}

const ROLE_LABELS:Record<string,string>={KNOWS_YOU:'了解她',USED_IT:'体验过',BOTH:'两者都是'};
const STAMP_LABELS:Record<string,string>={FITS:'适合她',CONDITIONAL:'有条件',WAIT:'先等等',NOT_FIT:'不太适合',NEED_INFO:'信息不足'};
function FeedbackPanel({reviews,currentRevision,onInvite}:{reviews:Review[];currentRevision:number;onInvite?:()=>void}){const current=reviews.filter(r=>(r.requestRevision??1)===currentRevision);const legacy=reviews.filter(r=>(r.requestRevision??1)!==currentRevision);const renderReview=(review:Review,legacyHint?:boolean)=><article key={review.id}><div><b>{review.reviewer_name}</b>{review.reviewerRole&&<small className={styles.reviewRole}>{ROLE_LABELS[review.reviewerRole]||review.reviewerRole}</small>}{review.stamp&&<small className={styles.reviewStamp}>{STAMP_LABELS[review.stamp]||review.stamp}</small>}<time>{new Date(review.created_at??'').toLocaleDateString('zh-CN')}</time>{legacyHint&&<small className={styles.legacyHint}>提交于心愿信息更新前</small>}</div><p>{review.comment}</p></article>;return <section className={styles.feedbackPanel}><details open><summary className={styles.sectionHeading}><div><h2>朋友回信</h2><p>{reviews.length?`${reviews.length} 条真实视角`:'原始内容始终可回看'}</p></div></summary>{reviews.length===0&&onInvite&&<div className={styles.emptyState}><p>还没有真人回信。</p><button className={styles.headingLink} onClick={onInvite}>邀请了解你的人</button></div>}{current.map(r=>renderReview(r,false))}{legacy.length>0&&<div className={styles.legacyGroup}><small>提交于旧版本</small>{legacy.map(r=>renderReview(r,true))}</div>}</details></section>;}
