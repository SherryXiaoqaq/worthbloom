import type { AppData, Asset, PurchaseRequest, ReviewChoice, ReviewInvite } from '@/lib/types';

declare global {
  var __worthBloomLocalStore: AppData | undefined;
  var __worthBloomDeviceEvents: Set<string> | undefined;
}

export class LocalStoreError extends Error {
  constructor(message:string, public status=400) { super(message); }
}

const now = () => new Date().toISOString();
const token = () => crypto.randomUUID().replaceAll('-', '').slice(0,20);

function seed(): AppData {
  return {
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
}

function store() {
  globalThis.__worthBloomLocalStore ??= seed();
  return globalThis.__worthBloomLocalStore;
}

export function isLocalPreview(request:Request) {
  const hostname = new URL(request.url).hostname;
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

export function getLocalData(): AppData {
  return structuredClone(store());
}

function requestType(category:string): Asset['type'] {
  if (category.includes('课程')) return 'COURSE';
  if (category.includes('会员')) return 'MEMBERSHIP';
  if (category.includes('储值')) return 'STORED_VALUE';
  return 'ITEM';
}

export function handleLocalDataAction(body:Record<string,unknown>) {
  if (body.action === 'reset_preview') {
    globalThis.__worthBloomLocalStore = seed();
    globalThis.__worthBloomDeviceEvents = new Set<string>();
    return { ok:true };
  }
  const data = store();
  if (body.action === 'create_request') {
    const payload = body.payload as Record<string,string|number|null>;
    const name=String(payload.name??'').trim(); const reason=String(payload.reason??'').trim(); const price=Number(payload.price);
    if(!name||!reason||!Number.isFinite(price)||price<0) throw new LocalStoreError('请完整填写名称、价格和理由');
    const id=crypto.randomUUID();
    const request:PurchaseRequest={ id,name,price,reason,category:String(payload.category??'其他'),total_units:payload.total_units==null?null:Number(payload.total_units),usage_frequency:payload.usage_frequency?String(payload.usage_frequency):null,expiry_date:payload.expiry_date?String(payload.expiry_date):null,product_url:payload.product_url?String(payload.product_url):null,similar_item:payload.similar_item?String(payload.similar_item):null,status:'REVIEWING',review_token:token(),created_at:now(),review_count:0 };
    const invites:ReviewInvite[]=[1,2,3].map(index=>({id:crypto.randomUUID(),request_id:id,token:token(),label:`朋友 ${index}`,used_by:null,used_at:null,revoked:0,created_at:now()}));
    data.requests.unshift(request); data.invites.push(...invites);
    return { request,invites };
  }
  if (body.action === 'create_invite') {
    const requestId=String(body.requestId??''); const request=data.requests.find(item=>item.id===requestId);
    if(!request||request.status!=='REVIEWING') throw new LocalStoreError('这个心愿已经结束征集',409);
    const invite:ReviewInvite={id:crypto.randomUUID(),request_id:requestId,token:token(),label:`朋友 ${data.invites.filter(item=>item.request_id===requestId).length+1}`,used_by:null,used_at:null,revoked:0,created_at:now()};
    data.invites.push(invite); return {invite};
  }
  if (body.action === 'revoke_invite') {
    const invite=data.invites.find(item=>item.id===String(body.inviteId??'')); if(invite&&!invite.used_at)invite.revoked=1; return {ok:true};
  }
  if (body.action === 'add_saving') {
    const amount=Number(body.amount); if(!Number.isFinite(amount)||amount<=0)throw new LocalStoreError('金额必须大于 0');
    const goal=data.savingGoals.find(item=>item.id===String(body.goalId??'')); if(!goal)throw new LocalStoreError('没有找到这个养愿目标',404);
    goal.current=Math.min(goal.target,goal.current+amount);
    if(goal.current<goal.target)return {goal,completed:false};
    const request=goal.request_id?data.requests.find(item=>item.id===goal.request_id):null;
    const type=request?requestType(request.category):'ITEM';
    const assetId=request?`asset-${request.id}`:`asset-${goal.id}`;
    let asset=data.assets.find(item=>item.id===assetId);
    if(!asset){asset={id:assetId,name:goal.name,type,purchase_price:goal.target,total_units:request?.total_units??null,used_units:0,current_balance:type==='STORED_VALUE'?goal.target:null,expiry_date:request?.expiry_date??null,usage_count:0,last_used_at:null,bloom_until:new Date(Date.now()+20_000).toISOString()};data.assets.unshift(asset)}
    if(request)request.status='PURCHASED';
    data.savingGoals=data.savingGoals.filter(item=>item.id!==goal.id); globalThis.__worthBloomLocalStore=data;
    return {goal,completed:true,asset};
  }
  if (body.action === 'add_asset') {
    const payload=body.payload as Record<string,string|number|null>; const name=String(payload.name??'').trim(); const type=String(payload.type??'ITEM') as Asset['type']; const price=Number(payload.purchase_price);
    if(!name||!['COURSE','MEMBERSHIP','STORED_VALUE','ITEM'].includes(type)||!Number.isFinite(price)||price<0)throw new LocalStoreError('请完整填写物资名称、类型和购入金额');
    const used=Number(payload.used_units??0); const asset:Asset={id:crypto.randomUUID(),name,type,purchase_price:price,total_units:payload.total_units==null?null:Number(payload.total_units),used_units:used,current_balance:payload.current_balance==null?null:Number(payload.current_balance),expiry_date:payload.expiry_date?String(payload.expiry_date):null,usage_count:Number(payload.usage_count??used),last_used_at:used?new Date().toISOString().slice(0,10):null};
    data.assets.unshift(asset); return {asset};
  }
  if (body.action === 'delete_asset') {
    const id=String(body.assetId??''); data.assets=data.assets.filter(item=>item.id!==id); globalThis.__worthBloomLocalStore=data; return {ok:true};
  }
  if (body.action === 'use_asset') {
    const asset=data.assets.find(item=>item.id===String(body.assetId??'')); if(!asset)throw new LocalStoreError('没有找到这个物资',404);
    if(asset.total_units!=null)asset.used_units=Math.min(asset.total_units,asset.used_units+1); asset.usage_count+=1; asset.last_used_at=new Date().toISOString().slice(0,10); asset.recovering_until=new Date(Date.now()+10_000).toISOString(); return {ok:true};
  }
  if (body.action === 'decide') {
    const decision=String(body.decision) as ReviewChoice; if(!['BUY_NOW','SAVE_FIRST','WAIT'].includes(decision))throw new LocalStoreError('无效决定');
    const request=data.requests.find(item=>item.id===String(body.requestId??'')); if(!request||request.status!=='REVIEWING')throw new LocalStoreError('这个心愿已经完成决定',409);
    request.status=decision==='BUY_NOW'?'PURCHASED':decision==='SAVE_FIRST'?'SAVING':'ARCHIVED'; data.invites.filter(item=>item.request_id===request.id&&!item.used_at).forEach(item=>item.revoked=1);
    if(decision==='SAVE_FIRST'&&!data.savingGoals.some(item=>item.request_id===request.id))data.savingGoals.unshift({id:`saving-${request.id}`,request_id:request.id,name:request.name,target:request.price,current:0,weekly_plan:null,created_at:now()});
    if(decision==='BUY_NOW'&&!data.assets.some(item=>item.id===`asset-${request.id}`))data.assets.unshift({id:`asset-${request.id}`,name:request.name,type:requestType(request.category),purchase_price:request.price,total_units:request.total_units,used_units:0,current_balance:requestType(request.category)==='STORED_VALUE'?request.price:null,expiry_date:request.expiry_date,usage_count:0,last_used_at:null,bloom_until:new Date(Date.now()+20_000).toISOString()});
    return {ok:true,target:decision==='BUY_NOW'?'assets':decision==='SAVE_FIRST'?'saving':'wishes'};
  }
  throw new LocalStoreError('不支持的操作');
}

export function recordLocalDeviceUsage(assetId:string, clientEventId:string) {
  globalThis.__worthBloomDeviceEvents ??= new Set<string>();
  if (globalThis.__worthBloomDeviceEvents.has(clientEventId)) return {ok:true,duplicate:true};
  const asset=store().assets.find(item=>item.id===assetId);
  if(!asset)throw new LocalStoreError('没有找到这个物资',404);
  if(asset.total_units!=null)asset.used_units=Math.min(asset.total_units,asset.used_units+1);
  asset.usage_count+=1;
  asset.last_used_at=new Date().toISOString().slice(0,10);
  asset.recovering_until=new Date(Date.now()+10_000).toISOString();
  globalThis.__worthBloomDeviceEvents.add(clientEventId);
  return {ok:true,duplicate:false};
}

export function getLocalReview(tokenValue:string) {
  const data=store(); const invite=data.invites.find(item=>item.token===tokenValue);
  if(!invite)throw new LocalStoreError('链接不存在或已撤销',404);
  const request=data.requests.find(item=>item.id===invite.request_id);
  if(invite.revoked||invite.used_at||!request||request.status!=='REVIEWING')throw new LocalStoreError('这张邀请卡已经完成使命了',410);
  const wish:Partial<PurchaseRequest>={...request}; delete wish.review_token; delete wish.review_count; delete wish.created_at; return {request:wish};
}

export function submitLocalReview(body:{token?:string;reviewerName?:string;choice?:ReviewChoice;comment?:string}) {
  const data=store(); const name=body.reviewerName?.trim(); const comment=body.comment?.trim();
  if(!body.token||!name||!comment||!body.choice||!['BUY_NOW','SAVE_FIRST','WAIT'].includes(body.choice))throw new LocalStoreError('请完成昵称、建议和原因');
  const invite=data.invites.find(item=>item.token===body.token); const request=invite?data.requests.find(item=>item.id===invite.request_id):null;
  if(!invite||invite.revoked||invite.used_at||!request||request.status!=='REVIEWING')throw new LocalStoreError('这张邀请卡已使用或心愿已结束',409);
  invite.used_by=name.slice(0,20); invite.used_at=now(); request.review_count+=1; data.reviews.unshift({id:crypto.randomUUID(),request_id:request.id,reviewer_name:name.slice(0,20),choice:body.choice,comment:comment.slice(0,500),created_at:now()}); return {ok:true};
}
