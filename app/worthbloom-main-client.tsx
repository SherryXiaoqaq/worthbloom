'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { AppData, PurchaseRequest, ReviewChoice, ReviewInvite, UserProfile } from '@/lib/types';
import { AUTH_USER_KEY, cloudBaseFetch } from '@/lib/cloudbase/client';
import CreateWishSheet from './worthbloom-create';
import { BottomNav, DecisionsView, DeviceView, GardenView, InboxView, ProfileView, SavingsView, View, WishesView, WishRoom } from './worthbloom-views';
import styles from './worthbloom-v2.module.css';

const demoData:AppData={
  requests:[
    {id:'demo-course',name:'十二节现代舞训练课',price:2680,reason:'我一直想把跳舞变成每周真实发生的事情，但担心买完后又因为加班缺席。',category:'训练课程',total_units:12,usage_frequency:'每周 2 次',expiry_date:'2026-12-31',product_url:null,similar_item:'坚持不下来',status:'REVIEWING',review_token:'dance-demo',created_at:'2026-08-24T09:00:00Z',review_count:3},
    {id:'demo-headphones',name:'轻量降噪耳机',price:1299,reason:'通勤和自习都会使用，希望减少环境噪音，但担心戴久了不舒服。',category:'较高价商品',total_units:null,usage_frequency:'每天通勤',expiry_date:null,product_url:'https://example.com/headphones',similar_item:'不适合自己',status:'REVIEWING',review_token:'headphones-demo',created_at:'2026-08-25T08:00:00Z',review_count:0},
    {id:'demo-dryer',name:'高速吹风机',price:1699,reason:'每天都会用，想减少吹头发的时间，也希望更轻一点。',category:'较高价商品',total_units:null,usage_frequency:'每天',expiry_date:null,product_url:'https://example.com/dryer',similar_item:'预算压力',status:'SAVING',review_token:'dryer-demo',created_at:'2026-08-22T09:00:00Z',review_count:1,decision_note:'先存到一半，再确认旧吹风机是否还能继续使用。'},
    {id:'demo-camera',name:'便携微单相机',price:6299,reason:'想认真记录旅行和朋友，不希望每次都只依赖手机。',category:'较高价商品',total_units:null,usage_frequency:'每月 2–3 次',expiry_date:null,product_url:'https://example.com/camera',similar_item:'买完闲置',status:'PURCHASED',review_token:'camera-demo',created_at:'2026-08-18T09:00:00Z',review_count:1,decision_note:'未来半年已有三次旅行，决定购买并先用好套机镜头。'},
    {id:'demo-theatre',name:'周末表演训练营',price:3980,reason:'想挑战舞台表达，也希望认识新的朋友。',category:'训练课程',total_units:8,usage_frequency:'每周末',expiry_date:'2026-11-30',product_url:null,similar_item:'时间安排',status:'ARCHIVED',review_token:'theatre-demo',created_at:'2026-08-12T09:00:00Z',review_count:1,decision_note:'这两个月周末行程太满，先等等不是放弃。'},
  ],
  reviews:[
    {id:'demo-r1',request_id:'demo-course',reviewer_name:'曲奇 · 了解你',choice:'SAVE_FIRST',comment:'【有条件】时间能排开｜你是真的喜欢。先锁定每周二、周六，再报名会更稳。',created_at:'2026-08-24T10:00:00Z'},
    {id:'demo-r2',request_id:'demo-course',reviewer_name:'卡卡 · 两者都是',choice:'BUY_NOW',comment:'【适合她】课程体验不错｜离家近。你上次体验课回来很开心，但先问清楚请假能不能顺延。',created_at:'2026-08-24T11:00:00Z'},
    {id:'demo-r3',request_id:'demo-course',reviewer_name:'窝窝 · 了解你',choice:'WAIT',comment:'【先等等】最近太忙｜先体验。等这个项目结束再决定，不然前两周很容易缺课。',created_at:'2026-08-24T12:00:00Z'},
    {id:'demo-r4',request_id:'demo-dryer',reviewer_name:'桃子 · 体验过',choice:'SAVE_FIRST',comment:'【有条件】确实省时间，但先看看重量和售后，存到一半再决定也不迟。',created_at:'2026-08-22T12:00:00Z'},
    {id:'demo-r5',request_id:'demo-camera',reviewer_name:'安安 · 两者都是',choice:'BUY_NOW',comment:'【适合她】你每次旅行都会拍很多照片，这次的使用计划也比以前具体。',created_at:'2026-08-20T12:00:00Z'},
    {id:'demo-r6',request_id:'demo-theatre',reviewer_name:'曲奇 · 了解你',choice:'WAIT',comment:'【先等等】最近周末已经很满，等项目结束再报名会更投入。',created_at:'2026-08-15T12:00:00Z'},
  ],
  invites:[{id:'demo-i1',request_id:'demo-course',token:'dance-friend-demo',label:'朋友 1',used_by:null,used_at:null,revoked:0,created_at:'2026-08-24T09:00:00Z'},{id:'demo-i2',request_id:'demo-headphones',token:'headphones-friend-demo',label:'朋友 1',used_by:null,used_at:null,revoked:0,created_at:'2026-08-25T08:00:00Z'}],
  decisions:[{request_id:'demo-dryer',decision:'SAVE_FIRST',decided_at:'2026-08-23T09:30:00Z'},{request_id:'demo-camera',decision:'BUY_NOW',decided_at:'2026-08-21T18:20:00Z'},{request_id:'demo-theatre',decision:'WAIT',decided_at:'2026-08-16T20:10:00Z'}],
  savingGoals:[{id:'demo-saving',request_id:'demo-dryer',name:'高速吹风机',target:1699,current:900,weekly_plan:200,created_at:'2026-08-22T09:00:00Z'}],assets:[],
};

type HistoryState={worthbloom:true;view:View;requestId?:string;scrollY:number};
const viewNames=new Set<View>(['garden','profile','room','wishes','decisions','inbox','device','savings']);
function routeFromHash(hash:string):Pick<HistoryState,'view'|'requestId'>{
  const [rawView,rawRequestId]=hash.replace(/^#/,'').split('/');
  const view=viewNames.has(rawView as View)?rawView as View:'garden';
  return{view,requestId:rawRequestId?decodeURIComponent(rawRequestId):undefined};
}
async function json<T>(response:Response):Promise<T>{const data=await response.json() as T&{error?:string};if(!response.ok)throw new Error(data.error||'操作失败');return data}
function normalizeData(data:AppData):AppData{return{...data,requests:data.requests||[],reviews:data.reviews||[],invites:data.invites||[],decisions:data.decisions||[],savingGoals:data.savingGoals||[],assets:data.assets||[]}}
const defaultProfile:UserProfile={userId:'local-profile',nickname:'好好花用户',bio:'把每一次认真思考，留给未来的自己。',shareIdentityDefault:'ANONYMOUS',createdAt:'2026-08-26T00:00:00.000Z',updatedAt:'2026-08-26T00:00:00.000Z'};
function readProfile(){
  try{
    const authRaw=localStorage.getItem(AUTH_USER_KEY);
    const auth=authRaw?JSON.parse(authRaw) as {id?:string;email?:string;nickName?:string|null}:null;
    const key=`wb-profile:${auth?.email||'local'}`;
    const storedRaw=localStorage.getItem(key);
    const stored=storedRaw?JSON.parse(storedRaw) as Partial<UserProfile>:null;
    const nickname=stored?.nickname||auth?.nickName||(auth?.email?localStorage.getItem(`wb-nickname:${auth.email}`):'')||defaultProfile.nickname;
    return{...defaultProfile,...stored,userId:auth?.id||stored?.userId||defaultProfile.userId,nickname,updatedAt:stored?.updatedAt||defaultProfile.updatedAt};
  }catch{return defaultProfile}
}
function writeProfile(profile:UserProfile){
  try{const authRaw=localStorage.getItem(AUTH_USER_KEY);const auth=authRaw?JSON.parse(authRaw) as {email?:string}:null;localStorage.setItem(`wb-profile:${auth?.email||'local'}`,JSON.stringify(profile));if(auth?.email)localStorage.setItem(`wb-nickname:${auth.email}`,profile.nickname)}catch{/* 隐私模式下保留当前会话状态 */}
}

export default function WorthBloomMainClient(){
  const [data,setData]=useState<AppData>(demoData);
  const [view,setView]=useState<View>('garden');
  const [activeId,setActiveId]=useState('demo-course');
  const [createOpen,setCreateOpen]=useState(false);
  const [editRequest,setEditRequest]=useState<PurchaseRequest|null>(null);
  const [busy,setBusy]=useState('');
  const [message,setMessage]=useState('');
  const [decisionNote,setDecisionNote]=useState('');
  const [seenReviewIds,setSeenReviewIds]=useState<string[]>([]);
  const [profile,setProfile]=useState<UserProfile>(defaultProfile);
  const scrollRef=useRef<Record<string,number>>({});
  const active=useMemo(()=>data.requests.find(request=>request.id===activeId)||data.requests[0],[activeId,data.requests]);

  async function refresh(){try{const result=normalizeData(await json<AppData>(await cloudBaseFetch('/api/data',{cache:'no-store'})));setData(result);return result}catch{return data}}
  useEffect(()=>{let mounted=true;cloudBaseFetch('/api/data',{cache:'no-store'}).then(response=>json<AppData>(response)).then(result=>{if(mounted)setData(normalizeData(result))}).catch(()=>{});return()=>{mounted=false}},[]);
  useEffect(()=>{let stored:string[]=[];try{stored=JSON.parse(localStorage.getItem('worthbloom_seen_reviews')||'[]') as string[]}catch{}const frame=requestAnimationFrame(()=>setSeenReviewIds(stored));return()=>cancelAnimationFrame(frame)},[]);
  useEffect(()=>{const frame=requestAnimationFrame(()=>setProfile(readProfile()));return()=>cancelAnimationFrame(frame)},[]);
  useEffect(()=>{
    const route=routeFromHash(location.hash);
    const initial:HistoryState={worthbloom:true,view:route.view,requestId:route.requestId,scrollY:0};
    history.replaceState(initial,'',`#${route.view}${route.requestId?`/${encodeURIComponent(route.requestId)}`:''}`);
    const frame=requestAnimationFrame(()=>{setView(route.view);if(route.requestId)setActiveId(route.requestId)});
    const onPop=(event:PopStateEvent)=>{const state=event.state as HistoryState|null;if(!state?.worthbloom)return;setView(state.view);if(state.requestId)setActiveId(state.requestId);setMessage('');requestAnimationFrame(()=>window.scrollTo({top:state.scrollY||scrollRef.current[state.view]||0,behavior:'auto'}))};
    addEventListener('popstate',onPop);return()=>{cancelAnimationFrame(frame);removeEventListener('popstate',onPop)};
  },[]);
  function remember(){scrollRef.current[view]=window.scrollY;const state=history.state as HistoryState|null;if(state?.worthbloom)history.replaceState({...state,scrollY:window.scrollY},'',location.href)}
  function navigate(next:View,requestId?:string,replace=false){remember();const state:HistoryState={worthbloom:true,view:next,requestId,scrollY:0};(replace?history.replaceState:history.pushState).call(history,state,'',`#${next}${requestId?`/${requestId}`:''}`);setView(next);if(requestId)setActiveId(requestId);setMessage('');window.scrollTo({top:0,behavior:'auto'})}
  function root(next:'garden'|'profile'){navigate(next,undefined,true)}
  function openInbox(){const ids=data.reviews.map(review=>review.id);setSeenReviewIds(ids);localStorage.setItem('worthbloom_seen_reviews',JSON.stringify(ids));navigate('inbox')}
  function back(){const state=history.state as HistoryState|null;if(state?.worthbloom&&view!=='garden'&&view!=='profile')history.back();else root('garden')}
  function openRoom(request:PurchaseRequest){setDecisionNote(request.decision_note||'');navigate('room',request.id)}
  async function invite(request=active){if(!request)return;setBusy('invite');setMessage('');try{let invite=data.invites.find(item=>item.request_id===request.id&&!item.revoked&&!item.used_at);if(!invite){const output=await json<{invite:ReviewInvite}>(await cloudBaseFetch('/api/data',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'create_invite',requestId:request.id})}));invite=output.invite;setData(previous=>({...previous,invites:[...previous.invites,invite!]}))}const url=`${location.origin}/review/wish/${invite.token}`;await navigator.clipboard.writeText(url);setMessage('朋友邀请链接已复制，可以发到微信或其他群聊。');if(view!=='room')openRoom(request)}catch(error){setMessage(error instanceof Error?error.message:'邀请链接生成失败')}finally{setBusy('')}}
  async function decide(choice:ReviewChoice){if(!active)return;setBusy(choice);setMessage('');try{await json(await cloudBaseFetch('/api/data',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'decide',requestId:active.id,decision:choice,note:decisionNote})}));const result=await refresh();const updated=result.requests.find(item=>item.id===active.id);if(updated)setActiveId(updated.id);setMessage(choice==='BUY_NOW'?'决定已经保存：现在购买。':choice==='SAVE_FIRST'?'决定已经保存，并创建了存钱目标。':'决定已经保存：再等等也是一种清楚的选择。')}catch(error){setMessage(error instanceof Error?error.message:'决定没有保存')}finally{setBusy('')}}
  async function addSaving(goalId:string,amount:number){await json(await cloudBaseFetch('/api/data',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'add_saving',goalId,amount})}));await refresh()}
  function created(request:PurchaseRequest,invites:ReviewInvite[]){setData(previous=>{const exists=previous.requests.some(r=>r.id===request.id);return{...previous,requests:exists?previous.requests.map(r=>r.id===request.id?request:r):[request,...previous.requests],invites:[...previous.invites,...invites]}});setEditRequest(null);setDecisionNote('');navigate('room',request.id)}
  function updateProfile(next:UserProfile){const saved={...next,updatedAt:new Date().toISOString()};setProfile(saved);writeProfile(saved)}

  const rootPage=view==='garden'||view==='profile';
  const unreadReviews=data.reviews.filter(review=>!seenReviewIds.includes(review.id));
  return <main className={styles.stage}><div className={styles.phone}>
    {view==='garden'&&<GardenView data={data} unreadReviews={unreadReviews} onNavigate={next=>next==='inbox'?openInbox():navigate(next)} onOpen={openRoom} onInvite={request=>void invite(request)}/>}
    {view==='profile'&&<ProfileView data={data} profile={profile} unreadCount={unreadReviews.length} onProfileChange={updateProfile} onNavigate={next=>next==='inbox'?openInbox():navigate(next)} onOpen={openRoom}/>}
    {view==='wishes'&&<WishesView data={data} onBack={back} onOpen={openRoom}/>}
    {view==='decisions'&&<DecisionsView data={data} onBack={back} onOpen={openRoom}/>}
    {view==='inbox'&&<InboxView data={data} onBack={back} onOpen={openRoom}/>}
    {view==='device'&&<DeviceView data={data} onBack={back}/>}
    {view==='savings'&&<SavingsView data={data} onBack={back} onAddSaving={addSaving}/>}
    {view==='room'&&active&&<WishRoom key={active.id} data={data} request={active} busy={busy} message={message} onBack={back} onInvite={()=>void invite()} onDecide={choice=>void decide(choice)} onAddSaving={addSaving} onDecisionNote={setDecisionNote} onEdit={()=>{setEditRequest(active);setCreateOpen(true)}}/>}
    {rootPage&&<BottomNav view={view} onRoot={root} onCreate={()=>setCreateOpen(true)}/>}
    <CreateWishSheet open={createOpen} editRequest={editRequest} onClose={()=>{setCreateOpen(false);setEditRequest(null)}} onCreated={created}/>
  </div></main>;
}
