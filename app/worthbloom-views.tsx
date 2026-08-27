'use client';

import { FormEvent, useMemo, useRef, useState } from 'react';
import type { AppData, Decision, DeviceState, GrowthAccount, GrowthLedgerEntry, InboxItem, PurchaseRequest, Review, ReviewChoice, SavingGoal, UserProfile } from '@/lib/types';
import { typeToCategory } from '@/lib/wish-compat';
import { AgentPanel } from './agent-panel';
import styles from './worthbloom-v2.module.css';

export type View = 'garden'|'profile'|'room'|'wishes'|'decisions'|'inbox'|'device'|'savings';

type IconName='garden'|'plus'|'user'|'bell'|'chevron'|'back'|'flower'|'wish'|'check'|'reply'|'shield'|'help'|'device'|'sort'|'external'|'sparkle'|'share'|'settings'|'wallet'|'edit'|'camera'|'close';

export function Icon({name,size=22}:{name:IconName;size?:number}){
  const paths:Record<IconName,React.ReactNode>={
    garden:<><path d="M4 19V9.5L12 4l8 5.5V19a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1Z"/></>,
    plus:<><path d="M12 5v14M5 12h14"/></>,
    user:<><circle cx="12" cy="8" r="4"/><path d="M4.5 20c.8-4 3.3-6 7.5-6s6.7 2 7.5 6"/></>,
    bell:<><path d="M6 9a6 6 0 0 1 12 0c0 7 3 7 3 7H3s3 0 3-7Z"/><path d="M10 20h4"/></>,
    chevron:<><path d="m9 18 6-6-6-6"/></>,
    back:<><path d="m15 18-6-6 6-6"/></>,
    flower:<><circle cx="12" cy="12" r="2.2"/><circle cx="12" cy="6.5" r="3.2"/><circle cx="17.2" cy="10.4" r="3.2"/><circle cx="15.2" cy="16.2" r="3.2"/><circle cx="8.8" cy="16.2" r="3.2"/><circle cx="6.8" cy="10.4" r="3.2"/></>,
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
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export function BottomNav({view,onRoot,onCreate}:{view:View;onRoot:(view:'garden'|'profile')=>void;onCreate:()=>void}){
  return <nav className={styles.bottomNav} aria-label="主导航">
    <button className={view==='garden'?styles.navActive:''} onClick={()=>onRoot('garden')}><Icon name="garden"/><span>花园</span></button>
    <button className={styles.navCreate} onClick={onCreate} aria-label="种心愿"><span><Icon name="plus" size={25}/></span><b>种心愿</b></button>
    <button className={view==='profile'?styles.navActive:''} onClick={()=>onRoot('profile')}><Icon name="user"/><span>我的</span></button>
  </nav>;
}

export function PageHeader({title,onBack,action}:{title:string;onBack:()=>void;action?:React.ReactNode}){
  return <header className={styles.pageHeader}><button className={styles.backButton} onClick={onBack} aria-label="返回"><Icon name="back"/></button><h1>{title}</h1><div>{action}</div></header>;
}

function decisionCopy(choice:ReviewChoice){return choice==='BUY_NOW'?'现在购买':choice==='SAVE_FIRST'?'先存钱':'再等等'}
function statusCopy(request:PurchaseRequest){if(request.status==='REVIEWING')return request.review_count?'回信已到':'等待回信';if(request.status==='SAVING')return '先存钱';if(request.status==='PURCHASED')return '现在购买';return '再等等'}
function categoryGlyph(category:string){if(category.includes('课程')||category.includes('训练'))return '课';if(category.includes('数码')||category.includes('商品'))return '物';return '愿'}
function imageFor(request:PurchaseRequest){return request.image_url||request.images?.find(image=>image.isCover)?.url||request.images?.[0]?.url||''}
function requestByDecision(data:AppData,decision:Decision){return data.requests.find(request=>request.id===decision.request_id)}
function reviewCountFor(data:AppData,requestId:string){return data.reviews.filter(review=>review.request_id===requestId).length}

export function deriveDeviceSummary(data:AppData):DeviceState{
  const goal=data.savingGoals[0];
  if(goal){const progress=goal.target?Math.min(1,goal.current/goal.target):0;return{mode:'GROWING',title:goal.name,progress,flower_health:Math.round(65+progress*30),remaining:Math.max(0,goal.target-goal.current),days_left:null,message:'正在靠近目标',asset_id:null}}
  const active=data.requests.find(request=>request.status==='REVIEWING');
  if(active){const invites=data.invites.filter(invite=>invite.request_id===active.id&&!invite.revoked);const replies=invites.filter(invite=>invite.used_at).length;return{mode:'WAITING',title:active.name,progress:invites.length?replies/invites.length:0,flower_health:78,remaining:Math.max(0,invites.length-replies),days_left:null,message:active.review_count?'回信已到，等你决定':'等待不同视角',asset_id:null}}
  return{mode:'SEED',title:'种下第一个心愿',progress:.06,flower_health:72,remaining:null,days_left:null,message:'还没有正在推进的心愿',asset_id:null};
}

function DeviceStrip({state,onOpen}:{state:DeviceState;onOpen:()=>void}){
  return <button className={styles.deviceStrip} onClick={onOpen}><span className={styles.deviceIcon}><Icon name="flower"/></span><span><small>电子花当前承载</small><b>{state.title}</b><em>{state.message}</em></span><i>{Math.round(state.progress*100)}%</i><Icon name="chevron" size={18}/></button>;
}

function ActiveWishCard({request,onOpen,onInvite}:{request:PurchaseRequest;onOpen:()=>void;onInvite:()=>void}){
  return <article className={styles.activeCard}>
    <button className={styles.wishImage} onClick={onOpen} aria-label={`查看 ${request.name}`}>{imageFor(request)?<img src={imageFor(request)} alt=""/>:<span className={styles.wishImageFallback}>{categoryGlyph(request.category??'')}</span>}<span>{request.category??''}</span></button>
    <div className={styles.cardTop}><span className={request.review_count?styles.pinkTag:styles.blueTag}>{statusCopy(request)}</span><small>{request.review_count} 条回信</small></div>
    <button className={styles.cardMain} onClick={onOpen}><span className={styles.categoryIcon}>{categoryGlyph(request.category??'')}</span><div><h3>{request.name}</h3><p>{request.reason}</p><strong>¥{request.price.toLocaleString()}</strong></div></button>
    <button className={styles.cardAction} onClick={request.review_count?onOpen:onInvite}><span className={styles.cardActionIcon}><Icon name={request.review_count?'reply':'share'} size={16}/></span>{request.review_count?'查看回信并决定':'继续邀请'}<Icon name="chevron" size={17}/></button>
  </article>;
}

function DecisionCard({request,decision,goal,onOpen}:{request:PurchaseRequest;decision:Decision;goal?:SavingGoal;onOpen:()=>void}){
  const cls=decision.decision==='SAVE_FIRST'?styles.greenTag:decision.decision==='BUY_NOW'?styles.yellowTag:styles.grayTag;
  return <article className={styles.decisionCard}><button onClick={onOpen} className={styles.decisionMain}>{imageFor(request)?<img className={styles.decisionImage} src={imageFor(request)} alt=""/>:<span className={`${styles.decisionImage} ${styles.decisionImageFallback}`}>{categoryGlyph(request.category??'')}</span>}<span><small className={cls}>{decisionCopy(decision.decision)}</small><h3>{request.name}</h3><p>{new Date(decision.decided_at).toLocaleDateString('zh-CN')} · ¥{request.price.toLocaleString()}</p>{goal&&<><div className={styles.progress}><i style={{width:`${Math.min(100,goal.current/goal.target*100)}%`}}/></div><em>已准备 ¥{goal.current.toLocaleString()} / ¥{goal.target.toLocaleString()}</em></>}</span><Icon name="chevron" size={18}/></button></article>;
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
  const [panel,setPanel]=useState<'NONE'|'SETTINGS'|'EDIT'|'AVATAR'|'PRIVACY'|'GROWTH'>('NONE');
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
  const displayGrowthEntries=growthEntries.map(entry=>{const request=data.requests.find(item=>item.id===entry.referenceId);const title=entry.actionType==='profile_completed'?'完善个人资料':entry.actionType==='decision_with_reason'?`完成「${request?.name||'心愿'}」的清楚决定`:entry.actionType==='review_claim'?'提供一份有效朋友回信':entry.actionType;return{id:entry.id,title,date:entry.createdAt,points:entry.delta,limited:entry.limited}});
  const ready=data.requests.find(request=>request.status==='REVIEWING'&&data.reviews.some(review=>review.request_id===request.id));
  const latestDecision=[...data.decisions].sort((a,b)=>Date.parse(b.decided_at)-Date.parse(a.decided_at))[0];
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
      <div className={styles.growthTop}><span><small>LV.{growth.level} · {growth.name}</small><b>{points}<em> 好好值</em></b></span><button onClick={()=>setPanel('GROWTH')}>成长明细 <Icon name="chevron" size={15}/></button></div>
      <div className={styles.growthProgress}><i style={{width:`${progress}%`}}/></div>
      <p>{growth.next?`距离下一级还差 ${growth.next-points} 好好值`:'你已经建立了稳定的清晰决策习惯'}</p>
      <div className={styles.growthTasks}>{tasks.slice(0,2).map(task=><button key={task.id} onClick={task.action}><span><small>{task.eyebrow}</small><b>{task.title}</b></span><Icon name="chevron" size={17}/></button>)}</div>
    </section>

    <section className={styles.profileSection}><div className={styles.profileSectionHeading}><small>MY SPACE</small><h2>我的记录</h2></div><div className={styles.profileCoreGrid}>{core.map(card=><button key={card.label} data-tone={card.tone} onClick={()=>onNavigate(card.view)}><span className={styles.profileCoreIcon}><Icon name={card.icon} size={27}/></span><b>{card.value}</b><strong>{card.label}</strong><small>{card.copy}</small><Icon name="chevron" size={17}/></button>)}</div></section>

    <section className={styles.profileSection}><div className={styles.profileSectionHeading}><small>TOOLS</small><h2>常用功能</h2></div><div className={styles.profileUtilityGrid}><button onClick={()=>onNavigate('device')}><span><Icon name="flower" size={25}/></span><b>电子花设备</b><small>{deriveDeviceSummary(data).title}</small></button><button onClick={()=>setPanel('PRIVACY')}><span><Icon name="shield" size={25}/></span><b>隐私与分享</b><small>{profile.shareIdentityDefault==='ANONYMOUS'?'默认匿名':'默认展示昵称'}</small></button></div></section>

    {panel!=='NONE'&&<div className={styles.profileOverlay} role="presentation" onMouseDown={event=>{if(event.currentTarget===event.target)setPanel('NONE')}}><section className={styles.profileSheet} role="dialog" aria-modal="true" aria-label={panel==='AVATAR'?'裁剪头像':panel==='EDIT'?'编辑资料':panel==='PRIVACY'?'隐私与分享':panel==='GROWTH'?'好好值明细':'设置'}><header><b>{panel==='AVATAR'?'调整头像':panel==='EDIT'?'编辑资料':panel==='PRIVACY'?'隐私与分享':panel==='GROWTH'?'好好值明细':'设置'}</b><button onClick={()=>setPanel('NONE')} aria-label="关闭"><Icon name="close"/></button></header>
      {panel==='SETTINGS'&&<div className={styles.profileSettingsList}><button onClick={()=>{setNickname(profile.nickname);setBio(profile.bio||'');setPanel('EDIT')}}><Icon name="edit"/><span><b>账户与资料</b><small>昵称、头像和个人简介</small></span><Icon name="chevron"/></button><button onClick={()=>setPanel('PRIVACY')}><Icon name="shield"/><span><b>隐私与分享</b><small>设置分享时的默认身份</small></span><Icon name="chevron"/></button><button onClick={()=>onNavigate('device')}><Icon name="device"/><span><b>电子花设备</b><small>查看当前承载状态</small></span><Icon name="chevron"/></button><article><Icon name="help"/><span><b>关于好好花</b><small>朋友和 AI 提供视角，最终决定始终属于你。</small></span></article></div>}
      {panel==='EDIT'&&<form className={styles.profileEditForm} onSubmit={saveProfile}><label><span>昵称</span><input required maxLength={20} value={nickname} onChange={event=>setNickname(event.target.value)} placeholder="怎么称呼你"/></label><label><span>个人简介</span><textarea maxLength={80} value={bio} onChange={event=>setBio(event.target.value)} placeholder="写下一句留给未来自己的话"/></label><button type="button" className={styles.profileSecondaryAction} onClick={()=>fileRef.current?.click()}><Icon name="camera"/>更换头像</button>{profile.avatarUrl&&<button type="button" className={styles.profileDangerAction} disabled={profileBusy} onClick={()=>void removeAvatar()}>移除头像</button>}{profileError&&<p className={styles.profileInlineError}>{profileError}</p>}<button className={styles.profilePrimaryAction} disabled={profileBusy}>{profileBusy?'保存中…':'保存资料'}</button></form>}
      {panel==='AVATAR'&&<div className={styles.avatarEditor}><div className={styles.avatarCrop}><img src={avatarSource} alt="头像裁剪预览" style={{transform:`scale(${avatarZoom})`,transformOrigin:`${avatarX}% ${avatarY}%`}}/></div><label>缩放<input type="range" min="1" max="2" step=".05" value={avatarZoom} onChange={event=>setAvatarZoom(Number(event.target.value))}/></label><label>水平位置<input type="range" min="0" max="100" value={avatarX} onChange={event=>setAvatarX(Number(event.target.value))}/></label><label>垂直位置<input type="range" min="0" max="100" value={avatarY} onChange={event=>setAvatarY(Number(event.target.value))}/></label>{avatarError&&<p className={styles.profileInlineError}>{avatarError}</p>}<button className={styles.profilePrimaryAction} disabled={avatarBusy} onClick={()=>void saveAvatar()}>{avatarBusy?'处理中…':'使用这张头像'}</button></div>}
      {panel==='PRIVACY'&&<div className={styles.profilePrivacy}><p>头像会保存在你的账户资料中。分享心愿时，是否展示身份由你决定。</p><div><button disabled={profileBusy} className={profile.shareIdentityDefault==='ANONYMOUS'?styles.profileChoiceActive:''} onClick={()=>void savePrivacy('ANONYMOUS')}><b>默认匿名</b><small>Reviewer 只看到匿名称呼</small></button><button disabled={profileBusy} className={profile.shareIdentityDefault==='NICKNAME'?styles.profileChoiceActive:''} onClick={()=>void savePrivacy('NICKNAME')}><b>展示昵称</b><small>仅展示昵称，不自动公开头像</small></button></div>{profileError&&<p className={styles.profileInlineError}>{profileError}</p>}<article><b>好好值奖励什么？</b><p>完成有理由的决定、提供有效反馈和补充真实结果。购买金额、邀请人数、连续登录和多数赞同都不会加分。</p></article></div>}
      {panel==='GROWTH'&&<div className={styles.growthLedger}><section><small>LV.{growth.level} · {growth.name}</small><b>{points}<em> 好好值</em></b><div className={styles.growthProgress}><i style={{width:`${progress}%`}}/></div><p>{growth.next?`再获得 ${growth.next-points} 好好值进入下一级`:'当前已达到最高等级'}</p></section><p>好好值只奖励真实贡献，不按消费金额、邀请人数或多数意见加分。</p><div>{displayGrowthEntries.map(entry=><article key={entry.id}><span><b>{entry.title}</b><small>{new Date(entry.date).toLocaleDateString('zh-CN')}{entry.limited?' · 已达当日上限':''}</small></span><strong>{entry.points>0?'+':''}{entry.points}</strong></article>)}</div>{!displayGrowthEntries.length&&<p className={styles.emptyState}>还没有成长记录。</p>}</div>}
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
  return <section className={styles.subPage}><PageHeader title="存钱目标" onBack={onBack}/><section className={styles.savingsSummary}><small>SAVING GOALS</small><b>¥{saved.toLocaleString()}<em> / ¥{total.toLocaleString()}</em></b><p>{data.savingGoals.length?`${data.savingGoals.length} 个目标正在慢慢靠近`:'当前没有进行中的存钱目标'}</p></section><div className={styles.savingsList}>{data.savingGoals.map(goal=><article key={goal.id}><SavingControl goal={goal} onAdd={amount=>onAddSaving(goal.id,amount)}/></article>)}</div>{!data.savingGoals.length&&<p className={styles.emptyState}>当你选择“先存钱”，对应目标会出现在这里。</p>}</section>;
}

export function InboxView({data,items,nextCursor,onLoadMore,onBack,onOpen}:{data:AppData;items:InboxItem[];nextCursor:string|null;onLoadMore:()=>Promise<unknown>;onBack:()=>void;onOpen:(request:PurchaseRequest)=>void}){
  const [loading,setLoading]=useState(false);
  const fallback=[...data.reviews].sort((a,b)=>Date.parse(b.created_at??'')-Date.parse(a.created_at??'')).map(review=>({review,requestName:data.requests.find(item=>item.id===review.request_id)?.name||'已归档心愿',isRead:true} as InboxItem));
  const visible=items.length?items:fallback;
  async function loadMore(){setLoading(true);try{await onLoadMore()}finally{setLoading(false)}}
  return <section className={styles.subPage}><PageHeader title="朋友回信" onBack={onBack}/><p className={styles.pageLead}>按时间查看收到的真实视角。回信只提供参考，决定仍然属于你。</p><div className={styles.inboxList}>{visible.map(item=>{const review=item.review;const request=data.requests.find(entry=>entry.id===review.request_id);return <button key={review.id} disabled={!request} onClick={()=>request&&onOpen(request)}><span className={styles.replyAvatar}>{review.reviewer_name.slice(0,1)}</span><span><small>{!item.isRead?'未读 · ':''}{review.reviewer_name} · {new Date(review.created_at??'').toLocaleDateString('zh-CN')}</small><b>{item.requestName}</b><p>{review.comment}</p></span><Icon name="chevron"/></button>})}</div>{!visible.length&&<p className={styles.emptyState}>还没有收到朋友回信。</p>}{nextCursor&&<button className={styles.headingLink} disabled={loading} onClick={()=>void loadMore()}>{loading?'加载中…':'加载更多回信'}</button>}</section>;
}

export function DeviceView({data,onBack}:{data:AppData;onBack:()=>void}){
  const state=deriveDeviceSummary(data);const mode=state.mode==='GROWING'?'生长中':state.mode==='WAITING'?'等待视角':'种子状态';
  return <section className={styles.subPage}><PageHeader title="电子花" onBack={onBack}/><article className={styles.devicePanel}><span className={styles.deviceLargeIcon}><Icon name="flower" size={42}/></span><small>当前承载状态</small><h2>{state.title}</h2><p>{mode} · {state.message}</p><div className={styles.largeProgress}><i style={{width:`${Math.round(state.progress*100)}%`}}/></div><b>{Math.round(state.progress*100)}%</b></article><section className={styles.deviceFacts}><h2>状态说明</h2><div><span>当前模式</span><b>{mode}</b></div><div><span>剩余目标</span><b>{state.remaining==null?'—':`¥${Math.round(state.remaining).toLocaleString()}`}</b></div><p>当前页面展示软件可推导的承载状态。产品尚未接入设备心跳，因此不会显示未经验证的“在线/离线”。</p></section></section>;
}

function SavingControl({goal,onAdd}:{goal:SavingGoal;onAdd:(amount:number)=>Promise<void>}){
  const [amount,setAmount]=useState('100');const [busy,setBusy]=useState(false);const [note,setNote]=useState('');
  async function submit(event:FormEvent){event.preventDefault();const value=Number(amount);if(!value||value<=0){setNote('请输入大于 0 的金额');return}setBusy(true);setNote('');try{await onAdd(value);setNote('已存入，进度更新了')}catch(error){setNote(error instanceof Error?error.message:'存入失败')}finally{setBusy(false)}}
  return <form className={styles.savingControl} onSubmit={submit}><div><span>Saving Goal</span><b>¥{goal.current.toLocaleString()} / ¥{goal.target.toLocaleString()}</b></div><div className={styles.largeProgress}><i style={{width:`${Math.min(100,goal.current/goal.target*100)}%`}}/></div><div className={styles.savingRow}><label>¥<input aria-label="存钱金额" type="number" min="1" value={amount} onChange={event=>setAmount(event.target.value)}/></label><button disabled={busy}>{busy?'存入中…':'继续存钱'}</button></div>{note&&<small>{note}</small>}</form>;
}

export function WishRoom({data,request,busy,message,onBack,onInvite,onDecide,onAddSaving,onDecisionNote,onEdit}:{data:AppData;request:PurchaseRequest;busy:string;message:string;onBack:()=>void;onInvite:()=>void;onDecide:(choice:ReviewChoice)=>void;onAddSaving:(goalId:string,amount:number)=>Promise<void>;onDecisionNote:(note:string)=>void;onEdit?:()=>void}){
  const reviews=data.reviews.filter(review=>review.request_id===request.id);const decision=data.decisions.find(item=>item.request_id===request.id);const goal=data.savingGoals.find(item=>item.request_id===request.id);const active=request.status==='REVIEWING';
  const [note,setNote]=useState(request.decision_note||'');
  const images=request.images??[];const [imgIndex,setImgIndex]=useState(0);const clampIndex=(n:number)=>Math.max(0,Math.min(n,Math.max(0,images.length-1)));
  const carousel=(<div className={styles.detailImage}>{images.length===0?<span className={styles.detailPlaceholder}><Icon name="wish" size={48}/></span>:<><img src={images[clampIndex(imgIndex)].url} alt={request.name}/>{images.length>1&&<><button className={styles.carouselPrev} onClick={()=>setImgIndex(i=>clampIndex(i-1))} aria-label="上一张"><Icon name="back" size={20}/></button><button className={styles.carouselNext} onClick={()=>setImgIndex(i=>clampIndex(i+1))} aria-label="下一张"><Icon name="chevron" size={20}/></button><span className={styles.carouselDots}>{clampIndex(imgIndex)+1} / {images.length}</span></>}</>}</div>);
  return <section className={styles.subPage}><PageHeader title={active?'心愿详情':'决定详情'} onBack={onBack}/>
    <article className={styles.detailHero}>{carousel}
      <span>{typeToCategory(request.type) ?? request.category ?? ''} · {statusCopy(request)}</span>
      <div className={styles.detailTitle}><div><h2>{request.name}</h2><b>¥{request.price.toLocaleString()}</b></div>{active&&onEdit&&<button className={styles.editEntry} onClick={onEdit}>编辑心愿</button>}</div>
      <blockquote>{request.reason}</blockquote>
      <div className={styles.factChips}><span>计划：{request.usageFrequency||request.usage_frequency||'待确认'}</span><span>担心：{request.concern||request.similar_item||'待补充'}</span></div>
      <details className={styles.detailFold}><summary>详情</summary><div className={styles.detailFoldGrid}><span>品牌：{request.brand||'—'}</span><span>规格：{request.skuLabel||'—'}</span><span>来源：{request.sourcePlatform||'—'}</span>{request.details&&<p>{request.details}</p>}{(request.productUrl||request.product_url)&&<a href={request.productUrl||request.product_url||''} target="_blank" rel="noreferrer">查看原商品 <Icon name="external" size={14}/></a>}</div></details>
      {request.product_url&&!request.productUrl&&<a href={request.product_url} target="_blank" rel="noreferrer">查看原商品 <Icon name="external" size={16}/></a>}{!request.product_url&&!request.productUrl&&<p className={styles.missingLink}>未保存商品链接</p>}
    </article>
    {active?<><FeedbackPanel reviews={reviews} currentRevision={request.revision??1} onInvite={onInvite}/>
      <AgentPanel requestId={request.id} revision={request.revision??1} />
      <section className={styles.finalDecision}><small>最后一步</small><h2>听完不同视角，<br/>由你完成决定。</h2><textarea value={note} onChange={event=>{setNote(event.target.value);onDecisionNote(event.target.value)}} placeholder="写下为什么这样决定，留给之后的自己"/><div><button disabled={Boolean(busy)} onClick={()=>onDecide('BUY_NOW')}>现在购买</button><button disabled={Boolean(busy)} onClick={()=>onDecide('SAVE_FIRST')}>先存钱</button><button disabled={Boolean(busy)} onClick={()=>onDecide('WAIT')}>再等等</button></div></section>
    </>:<><section className={styles.timeline}><h2>决定时间线</h2><article className={styles.blueSurface}><small>01 · 心愿事实</small><b>{request.reason}</b></article><article className={styles.pinkSurface}><small>02 · 朋友视角</small><b>{reviews.length?`${reviews.length} 条回信已保存`:'当时没有真人回信'}</b>{reviews.map(review=><p key={review.id}>{review.reviewer_name}：{review.comment}</p>)}</article><article className={decision?.decision==='SAVE_FIRST'?styles.greenSurface:styles.yellowSurface}><small>03 · 最终决定</small><b>{decision?decisionCopy(decision.decision):statusCopy(request)}</b><p>{request.decision_note||'当时没有补充决定理由。'}</p><time>{decision?new Date(decision.decided_at).toLocaleString('zh-CN'):'时间未记录'}</time></article></section>{goal&&<SavingControl goal={goal} onAdd={amount=>onAddSaving(goal.id,amount)}/>}</>}{message&&<p className={styles.toast} role="status">{message}</p>}</section>;
}

const ROLE_LABELS:Record<string,string>={KNOWS_YOU:'了解她',USED_IT:'体验过',BOTH:'两者都是'};
const STAMP_LABELS:Record<string,string>={FITS:'适合她',CONDITIONAL:'有条件',WAIT:'先等等',NOT_FIT:'不太适合',NEED_INFO:'信息不足'};
function FeedbackPanel({reviews,currentRevision,onInvite}:{reviews:Review[];currentRevision:number;onInvite?:()=>void}){const current=reviews.filter(r=>(r.requestRevision??1)===currentRevision);const legacy=reviews.filter(r=>(r.requestRevision??1)!==currentRevision);const renderReview=(review:Review,legacyHint?:boolean)=><article key={review.id}><div><b>{review.reviewer_name}</b>{review.reviewerRole&&<small className={styles.reviewRole}>{ROLE_LABELS[review.reviewerRole]||review.reviewerRole}</small>}{review.stamp&&<small className={styles.reviewStamp}>{STAMP_LABELS[review.stamp]||review.stamp}</small>}<time>{new Date(review.created_at??'').toLocaleDateString('zh-CN')}</time>{legacyHint&&<small className={styles.legacyHint}>提交于心愿信息更新前</small>}</div><p>{review.comment}</p></article>;return <section className={styles.feedbackPanel}><details open><summary className={styles.sectionHeading}><div><h2>朋友回信</h2><p>{reviews.length?`${reviews.length} 条真实视角`:'原始内容始终可回看'}</p></div></summary>{reviews.length===0&&onInvite&&<div className={styles.emptyState}><p>还没有真人回信。</p><button className={styles.headingLink} onClick={onInvite}>邀请了解你的人</button></div>}{current.map(r=>renderReview(r,false))}{legacy.length>0&&<div className={styles.legacyGroup}><small>提交于旧版本</small>{legacy.map(r=>renderReview(r,true))}</div>}</details></section>;}
