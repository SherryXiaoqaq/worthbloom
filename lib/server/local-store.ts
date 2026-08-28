import type { AppData, Asset, AssetReflection, Decision, GrowthAccount, GrowthLedgerEntry, InboxPage, PurchaseRequest, Review, ReviewChoice, ReviewInvite, UserProfile } from '@/lib/types';
import { applyAssetUsage, assetTypeForRequest, AssetRuleError, costPerUse, normalizeAssetReflection, parseAssetPayload, parseAssetReflectionPayload } from '@/lib/asset-rules';
import { isLocalPreviewHostname } from '@/lib/server/network';
import { canonicalWishType, isKnownWishType, normalizeDecision, normalizeSavingGoal, normalizeWish, normalizeReview, typeToCategory } from '@/lib/wish-compat';

declare global {
  var __worthBloomLocalStore: AppData | undefined;
  var __worthBloomDeviceEvents: Set<string> | undefined;
  var __worthBloomLocalProfiles: Record<string, UserProfile> | undefined;
  var __worthBloomLocalGrowthAccounts: Record<string, GrowthAccount> | undefined;
  var __worthBloomLocalGrowthLedger: Record<string, GrowthLedgerEntry[]> | undefined;
  var __worthBloomLocalInboxReads: Record<string, string[]> | undefined;
}

export class LocalStoreError extends Error {
  code?: string;
  constructor(message:string, public status=400, code?:string) { super(message); this.code=code; }
}

const now = () => new Date().toISOString();
const token = () => crypto.randomUUID().replaceAll('-', '').slice(0,20);
function seed(): AppData {
  return {
    requests:[{ id:'request-iceland', name:'去冰岛看极光', price:18600, reason:'二十七岁以前，想认真地去一次很远的地方。不是逃离，是奖励自己终于学会独自出发。', category:'一次性体验/消耗品', total_units:1, usage_frequency:'一次完整旅行', expiry_date:null, product_url:null, similar_item:null, status:'REVIEWING', review_token:'iceland-demo-2026', created_at:'2026-08-21T10:00:00Z', updatedAt:'2026-08-21T10:00:00Z', review_count:3, revision:1, sourceType:'MANUAL', type:'SINGLE_USE', concern:'', brand:'', skuLabel:'', details:'', sourcePlatform:'', images:[] }],
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
    decisions:[] as Decision[],
    assets:[
      { id:'asset-dance', name:'十二节现代舞年卡', type:'COURSE', purchase_price:1680, total_units:12, used_units:9, current_balance:null, expiry_date:'2026-11-20', usage_count:9, last_used_at:'2026-08-22' },
      { id:'asset-pottery', name:'六次陶艺体验课', type:'COURSE', purchase_price:980, total_units:6, used_units:3, current_balance:null, expiry_date:'2026-09-10', usage_count:3, last_used_at:'2026-08-11' },
      { id:'asset-headphones', name:'降噪耳机', type:'ITEM', purchase_price:2499, total_units:null, used_units:0, current_balance:null, expiry_date:null, usage_count:32, last_used_at:'2026-08-23' },
    ],
    assetReflections:[],
  };
}

function repairLegacyLocalState(data: AppData) {
  data.savingGoals = (data.savingGoals ?? []).map(goal => normalizeSavingGoal(goal as unknown as Record<string, unknown>));
  data.decisions = (data.decisions ?? [])
    .map(decision => normalizeDecision(decision as unknown as Record<string, unknown>))
    .filter((decision): decision is Decision => decision !== null);

  const recorded = new Set(data.decisions.map(decision => decision.request_id));
  for (const request of data.requests) {
    if (recorded.has(request.id) || request.status === 'REVIEWING') continue;
    const goal = data.savingGoals.find(item => item.request_id === request.id);
    const inferred: ReviewChoice = goal || request.status === 'SAVING'
      ? 'SAVE_FIRST'
      : request.status === 'ARCHIVED'
        ? 'WAIT'
        : 'BUY_NOW';
    data.decisions.push({
      request_id: request.id,
      decision: inferred,
      decided_at: goal?.created_at ?? request.updatedAt ?? request.createdAt ?? request.created_at ?? now(),
    });
    recorded.add(request.id);
  }
  data.decisions.sort((left, right) => right.decided_at.localeCompare(left.decided_at));
  return data;
}

function store() {
  globalThis.__worthBloomLocalStore ??= seed();
  return repairLegacyLocalState(globalThis.__worthBloomLocalStore);
}

function levelForPoints(points:number):1|2|3|4{return points>=700?4:points>=300?3:points>=100?2:1}
function nextLevelPoints(level:1|2|3|4){return level===1?100:level===2?300:level===3?700:undefined}
function defaultLocalProfile(userId:string,fallbackNickname?:string|null):UserProfile{const timestamp=now();return{userId,nickname:fallbackNickname||'好好花用户',bio:'把每一次认真思考，留给未来的自己。',shareIdentityDefault:'ANONYMOUS',createdAt:timestamp,updatedAt:timestamp}}
function localProfiles(){globalThis.__worthBloomLocalProfiles??={};return globalThis.__worthBloomLocalProfiles}
function localGrowthAccounts(){globalThis.__worthBloomLocalGrowthAccounts??={};return globalThis.__worthBloomLocalGrowthAccounts}
function localGrowthLedger(){globalThis.__worthBloomLocalGrowthLedger??={};return globalThis.__worthBloomLocalGrowthLedger}
function localInboxReads(){globalThis.__worthBloomLocalInboxReads??={};return globalThis.__worthBloomLocalInboxReads}

function awardLocalGrowth(userId:string,actionType:string,referenceId:string,delta:number){
  const ledger=localGrowthLedger();const entries=ledger[userId]??[];const idempotencyKey=`${actionType}:${referenceId}`;
  if(entries.some(entry=>entry.idempotencyKey===idempotencyKey))return;
  const accounts=localGrowthAccounts();const points=(accounts[userId]?.points??0)+delta;const level=levelForPoints(points);const timestamp=now();
  accounts[userId]={userId,points,level,nextLevelPoints:nextLevelPoints(level),updatedAt:timestamp};
  ledger[userId]=[{id:crypto.randomUUID(),userId,actionType,referenceId,delta,idempotencyKey,limited:false,createdAt:timestamp},...entries];
}

export function getLocalProfile(userId:string,fallbackNickname?:string|null){return structuredClone(localProfiles()[userId]??defaultLocalProfile(userId,fallbackNickname))}
export function saveLocalProfile(userId:string,patch:Partial<UserProfile>,fallbackNickname?:string|null){
  const current=localProfiles()[userId]??defaultLocalProfile(userId,fallbackNickname);const nickname=patch.nickname===undefined?current.nickname:String(patch.nickname).trim().slice(0,20);if(!nickname)throw new LocalStoreError('请填写昵称',400,'nickname');
  const shareIdentityDefault=patch.shareIdentityDefault??current.shareIdentityDefault;if(!['ANONYMOUS','NICKNAME'].includes(shareIdentityDefault))throw new LocalStoreError('分享身份设置无效',400,'shareIdentityDefault');
  const profile:UserProfile={...current,nickname,bio:patch.bio===undefined?current.bio:String(patch.bio).trim().slice(0,80),shareIdentityDefault,updatedAt:now()};localProfiles()[userId]=profile;
  if(profile.nickname&&profile.bio)awardLocalGrowth(userId,'profile_completed',userId,10);return structuredClone(profile);
}
export function saveLocalAvatar(userId:string,avatarUrl:string|null,fallbackNickname?:string|null){const current=localProfiles()[userId]??defaultLocalProfile(userId,fallbackNickname);const profile={...current,avatarUrl:avatarUrl||undefined,updatedAt:now()};localProfiles()[userId]=profile;return structuredClone(profile)}
export function getLocalGrowth(userId:string){const account=localGrowthAccounts()[userId]??{userId,points:0,level:1 as const,nextLevelPoints:100};return{account:structuredClone(account),entries:structuredClone(localGrowthLedger()[userId]??[])}}
export function getLocalInbox(userId:string,cursor='0',limit=20):InboxPage{const data=store();const readIds=new Set(localInboxReads()[userId]??[]);const reviews=[...data.reviews].sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')));const offset=Math.max(0,Number.parseInt(cursor,10)||0);const safeLimit=Math.max(1,Math.min(50,limit));const page=reviews.slice(offset,offset+safeLimit);return{items:page.map(review=>({review:normalizeReview(review as unknown as Record<string,unknown>),requestName:data.requests.find(request=>request.id===review.request_id)?.name||'已归档心愿',isRead:readIds.has(review.id)})),nextCursor:offset+safeLimit<reviews.length?String(offset+safeLimit):null,unreadCount:reviews.filter(review=>!readIds.has(review.id)).length}}
export function markLocalInboxRead(userId:string,reviewIds:string[]){const allowed=new Set(store().reviews.map(review=>review.id));const merged=[...new Set([...(localInboxReads()[userId]??[]),...reviewIds.filter(id=>allowed.has(id))])].slice(-1000);localInboxReads()[userId]=merged;return{ok:true,readReviewIds:merged}}

export function isLocalPreview(request:Request) {
  // When Next.js listens on 0.0.0.0 it may normalize request.url to the
  // listening address. The Host header still contains the address the phone
  // or browser actually used, so prefer it for local-preview detection.
  const host = request.headers.get('host') || new URL(request.url).hostname;
  return isLocalPreviewHostname(host);
}

export function getLocalData(): AppData {
  const raw = structuredClone(store());
  return {
    ...raw,
    requests: raw.requests.map(r => normalizeWish(r as unknown as Record<string, unknown>)),
    reviews: raw.reviews.map(r => normalizeReview(r as unknown as Record<string, unknown>)),
    assets: raw.assets.map(asset => ({...asset,archived_at:asset.archived_at??null})),
    assetReflections: raw.assetReflections.map(normalizeAssetReflection),
  };
}

export function handleLocalDataAction(body:Record<string,unknown>) {
  if (body.action === 'reset_preview') {
    globalThis.__worthBloomLocalStore = seed();
    globalThis.__worthBloomDeviceEvents = new Set<string>();
    globalThis.__worthBloomLocalProfiles = {};
    globalThis.__worthBloomLocalGrowthAccounts = {};
    globalThis.__worthBloomLocalGrowthLedger = {};
    globalThis.__worthBloomLocalInboxReads = {};
    return { ok:true };
  }
  const data = store();
  if (body.action === 'create_request') {
    const payload = body.payload as Record<string,unknown>;
    const name=String(payload.name??'').trim().slice(0,80);
    const reason=String(payload.reason??'').trim().slice(0,500);
    const price=Number(payload.price);
    const concern=String(payload.concern??payload.similar_item??'').trim().slice(0,200);
    const suppliedType=String(payload.type??'').trim();
    const legacyCategory=String(payload.category??'').trim();
    if(!name)throw new LocalStoreError('请填写商品或课程名称',400,'name');
    if(!reason)throw new LocalStoreError('请填写你为什么想要它',400,'reason');
    if(!Number.isFinite(price)||price<0||price>99_999_999.99)throw new LocalStoreError('请填写有效价格',400,'price');
    if(!concern)throw new LocalStoreError('请填写或选择你最担心的问题',400,'concern');
    if((!suppliedType&&!legacyCategory)||(suppliedType&&!isKnownWishType(suppliedType)))throw new LocalStoreError('请选择类型',400,'type');
    const typeRaw=canonicalWishType(suppliedType,legacyCategory);
    const id=crypto.randomUUID();
    const ts=now();
    const images:Array<{id:string;url:string;sortOrder:number;isCover:boolean}>=Array.isArray(payload.images)?(payload.images as Array<Record<string,unknown>>).slice(0,6).map((img,index)=>({id:String(img.id??crypto.randomUUID()),url:String(img.url??''),sortOrder:Number(img.sortOrder??index),isCover:Boolean(img.isCover)})):[];
    if(images.length&&!images.some(img=>img.isCover))images[0].isCover=true;
    const request:PurchaseRequest={ id,name,price,reason,category:typeToCategory(typeRaw),total_units:payload.total_units==null&&payload.totalUnits==null?null:Number(payload.total_units??payload.totalUnits),usage_frequency:payload.usage_frequency?String(payload.usage_frequency):payload.usageFrequency?String(payload.usageFrequency):null,expiry_date:payload.expiry_date?String(payload.expiry_date):payload.expiryDate?String(payload.expiryDate):null,product_url:payload.product_url?String(payload.product_url):payload.productUrl?String(payload.productUrl):null,similar_item:concern,status:'REVIEWING',review_token:token(),created_at:ts,updatedAt:ts,review_count:0,revision:1,sourceType:(payload.sourceType??payload.source_type??'MANUAL') as PurchaseRequest['sourceType'],type:typeRaw,concern,brand:String(payload.brand??'').slice(0,80),skuLabel:String(payload.skuLabel??payload.sku_label??'').slice(0,120),details:String(payload.details??'').slice(0,2000),sourcePlatform:String(payload.sourcePlatform??payload.source_platform??'').slice(0,40),productUrl:payload.product_url?String(payload.product_url):payload.productUrl?String(payload.productUrl):null,images,totalUnits:payload.total_units==null&&payload.totalUnits==null?null:Number(payload.total_units??payload.totalUnits),usageFrequency:payload.usage_frequency?String(payload.usage_frequency):payload.usageFrequency?String(payload.usageFrequency):null,expiryDate:payload.expiry_date?String(payload.expiry_date):payload.expiryDate?String(payload.expiryDate):null,reviewToken:undefined,decisionNote:undefined };
    const invites:ReviewInvite[]=[1,2,3].map(index=>({id:crypto.randomUUID(),request_id:id,token:token(),label:`朋友 ${index}`,used_by:null,used_at:null,revoked:0,created_at:ts}));
    data.requests.unshift(request); data.invites.push(...invites);
    return { request:normalizeWish(request as unknown as Record<string,unknown>), invites };
  }
  if (body.action === 'update_request') {
    const requestId=String(body.requestId??'');
    const request=data.requests.find(item=>item.id===requestId);
    if(!request)throw new LocalStoreError('没有找到这个心愿',404);
    if(request.status!=='REVIEWING')throw new LocalStoreError('这个决定已经保存，可以复制为新心愿后继续调整。',409,'REQUEST_READ_ONLY');
    const expected=Number(body.expectedRevision);
    const currentRev=Number(request.revision??1);
    if(!Number.isFinite(expected)||expected!==currentRev)throw new LocalStoreError('心愿已在其他页面更新，请刷新后重试。',409,'REVISION_CONFLICT');
    const payload=body.payload as Record<string,unknown>;
    if(typeof payload.name==='string')request.name=payload.name.trim().slice(0,80);
    if(typeof payload.price==='number')request.price=payload.price;
    if(typeof payload.reason==='string')request.reason=payload.reason.trim().slice(0,500);
    if(typeof payload.concern==='string')request.concern=payload.concern.trim().slice(0,200);
    if(typeof payload.type==='string'){
      if(!isKnownWishType(payload.type))throw new LocalStoreError('请选择类型',400,'type');
      request.type=canonicalWishType(payload.type);request.category=typeToCategory(request.type);
    }else if(typeof payload.category==='string'){
      request.type=canonicalWishType(undefined,payload.category);request.category=typeToCategory(request.type);
    }
    if(typeof payload.brand==='string')request.brand=payload.brand.slice(0,80);
    if(typeof payload.skuLabel==='string'||typeof payload.sku_label==='string')request.skuLabel=String(payload.skuLabel??payload.sku_label).slice(0,120);
    if(typeof payload.details==='string')request.details=payload.details.slice(0,2000);
    if(typeof payload.productUrl==='string'||typeof payload.product_url==='string')request.productUrl=String(payload.productUrl??payload.product_url);
    if(typeof payload.sourcePlatform==='string'||typeof payload.source_platform==='string')request.sourcePlatform=String(payload.sourcePlatform??payload.source_platform).slice(0,40);
    if(payload.totalUnits!==undefined||payload.total_units!==undefined){request.total_units=payload.totalUnits==null&&payload.total_units==null?null:Number(payload.totalUnits??payload.total_units);request.totalUnits=request.total_units}
    if(payload.usageFrequency!==undefined||payload.usage_frequency!==undefined){request.usage_frequency=String(payload.usageFrequency??payload.usage_frequency??'')||null;request.usageFrequency=request.usage_frequency}
    if(payload.expiryDate!==undefined||payload.expiry_date!==undefined){request.expiry_date=String(payload.expiryDate??payload.expiry_date??'')||null;request.expiryDate=request.expiry_date}
    if(Array.isArray(payload.images)){request.images=(payload.images as Array<Record<string,unknown>>).slice(0,6).map((img,index)=>({id:String(img.id??crypto.randomUUID()),url:String(img.url??''),sortOrder:Number(img.sortOrder??index),isCover:Boolean(img.isCover)}));if(request.images.length&&!request.images.some(img=>img.isCover))request.images[0].isCover=true}
    if(!request.name.trim())throw new LocalStoreError('请填写商品或课程名称',400,'name');
    if(!request.reason.trim())throw new LocalStoreError('请填写你为什么想要它',400,'reason');
    if(!Number.isFinite(request.price)||request.price<0||request.price>99_999_999.99)throw new LocalStoreError('请填写有效价格',400,'price');
    if(!String(request.concern??'').trim())throw new LocalStoreError('请填写或选择你最担心的问题',400,'concern');
    if(!request.type||!isKnownWishType(request.type))throw new LocalStoreError('请选择类型',400,'type');
    request.revision=currentRev+1; request.updatedAt=now(); request.similar_item=request.concern;
    return { request:normalizeWish(request as unknown as Record<string,unknown>) };
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
    const type=request?assetTypeForRequest(request):'ITEM';
    const assetId=request?`asset-${request.id}`:`asset-${goal.id}`;
    let asset=data.assets.find(item=>item.id===assetId);
    if(!asset){asset={id:assetId,request_id:request?.id??null,name:goal.name,type,purchase_price:goal.target,total_units:type==='EXPERIENCE'?1:request?.total_units??null,used_units:0,current_balance:type==='STORED_VALUE'?goal.target:null,expiry_date:request?.expiry_date??null,usage_count:0,last_used_at:null,bloom_until:new Date(Date.now()+20_000).toISOString()};data.assets.unshift(asset)}
    if(request)request.status='PURCHASED';
    data.savingGoals=data.savingGoals.filter(item=>item.id!==goal.id); globalThis.__worthBloomLocalStore=data;
    return {goal,completed:true,asset};
  }
  if (body.action === 'add_asset') {
    let asset:Asset;
    try{asset=parseAssetPayload(crypto.randomUUID(),body.payload as Record<string,unknown>)}catch(error){if(error instanceof AssetRuleError)throw new LocalStoreError(error.message,error.status);throw error}
    data.assets.unshift(asset); return {asset};
  }
  if (body.action === 'delete_asset') {
    const id=String(body.assetId??''); data.assets=data.assets.filter(item=>item.id!==id); globalThis.__worthBloomLocalStore=data; return {ok:true};
  }
  if (body.action === 'use_asset') {
    const asset=data.assets.find(item=>item.id===String(body.assetId??'')); if(!asset)throw new LocalStoreError('没有找到这个物资',404);
    try{const usage=applyAssetUsage(asset,body.amount);asset.used_units=usage.used_units;asset.usage_count=usage.usage_count;asset.current_balance=usage.current_balance}catch(error){if(error instanceof AssetRuleError)throw new LocalStoreError(error.message,error.status);throw error}
    asset.last_used_at=new Date().toISOString().slice(0,10); asset.recovering_until=new Date(Date.now()+10_000).toISOString(); return {ok:true,asset};
  }
  if (body.action === 'add_asset_reflection') {
    const asset=data.assets.find(item=>item.id===String(body.assetId??''));if(!asset)throw new LocalStoreError('没有找到这个物资',404);
    let reflectionInput:ReturnType<typeof parseAssetReflectionPayload>;
    try{reflectionInput=parseAssetReflectionPayload(body)}catch(error){if(error instanceof AssetRuleError)throw new LocalStoreError(error.message,error.status);throw error}
    const {feeling,rating,wouldBuyAgain,note,trigger}=reflectionInput;const createdAt=now();
    const reflection:AssetReflection={id:crypto.randomUUID(),asset_id:asset.id,asset_name:asset.name,asset_type:asset.type,feeling,rating,would_buy_again:wouldBuyAgain,note,trigger,usage_count:asset.usage_count,cost_per_use:costPerUse(asset),created_at:createdAt};data.assetReflections.unshift(reflection);if(trigger!=='MANUAL')asset.archived_at??=createdAt;awardLocalGrowth('owner-preview','asset_reflection',asset.id,15);return{reflection,asset};
  }
  if (body.action === 'save_decision_note') {
    const request=data.requests.find(item=>item.id===String(body.requestId??'')); if(!request)throw new LocalStoreError('没有找到这个心愿',404);
    request.decision_note=String(body.note??'').trim().slice(0,2000); return {ok:true};
  }
  if (body.action === 'decide') {
    const decision=String(body.decision) as ReviewChoice; if(!['BUY_NOW','SAVE_FIRST','WAIT'].includes(decision))throw new LocalStoreError('无效决定');
    const request=data.requests.find(item=>item.id===String(body.requestId??'')); if(!request||request.status!=='REVIEWING')throw new LocalStoreError('这个心愿已经完成决定',409);
    const decidedAt=now();request.status=decision==='BUY_NOW'?'PURCHASED':decision==='SAVE_FIRST'?'SAVING':'ARCHIVED'; if(body.note)request.decision_note=String(body.note).trim().slice(0,2000); data.invites.filter(item=>item.request_id===request.id&&!item.used_at).forEach(item=>item.revoked=1);
    const existingDecision=data.decisions.find(item=>item.request_id===request.id);if(existingDecision){existingDecision.decision=decision;existingDecision.decided_at=decidedAt}else data.decisions.unshift({request_id:request.id,decision,decided_at:decidedAt});
    if(decision==='SAVE_FIRST'&&!data.savingGoals.some(item=>item.request_id===request.id))data.savingGoals.unshift({id:`saving-${request.id}`,request_id:request.id,name:request.name,target:request.price,current:0,weekly_plan:null,created_at:now()});
    let asset:Asset|null=null;const goal=data.savingGoals.find(item=>item.request_id===request.id)??null;
    if(decision==='BUY_NOW'&&!data.assets.some(item=>item.id===`asset-${request.id}`)){const type=assetTypeForRequest(request);asset={id:`asset-${request.id}`,request_id:request.id,name:request.name,type,purchase_price:request.price,total_units:type==='EXPERIENCE'?1:request.total_units ?? null,used_units:0,current_balance:type==='STORED_VALUE'?request.price:null,expiry_date:request.expiry_date ?? null,usage_count:0,last_used_at:null,bloom_until:new Date(Date.now()+20_000).toISOString()};data.assets.unshift(asset)}else if(decision==='BUY_NOW')asset=data.assets.find(item=>item.id===`asset-${request.id}`)??null;
    if(request.decision_note)awardLocalGrowth('owner-preview','decision_with_reason',request.id,20);
    return {ok:true,target:decision==='BUY_NOW'?'assets':decision==='SAVE_FIRST'?'saving':'wishes',goal,asset};
  }
  throw new LocalStoreError('不支持的操作');
}

export function recordLocalDeviceUsage(assetId:string, clientEventId:string) {
  globalThis.__worthBloomDeviceEvents ??= new Set<string>();
  if (globalThis.__worthBloomDeviceEvents.has(clientEventId)) return {ok:true,duplicate:true};
  const asset=store().assets.find(item=>item.id===assetId);
  if(!asset)throw new LocalStoreError('没有找到这个物资',404);
  if(asset.type==='STORED_VALUE')throw new LocalStoreError('储值类需要在网页填写本次消费金额',400);
  try{const usage=applyAssetUsage(asset);asset.used_units=usage.used_units;asset.usage_count=usage.usage_count;asset.current_balance=usage.current_balance}catch(error){if(error instanceof AssetRuleError)throw new LocalStoreError(error.message,error.status);throw error}
  asset.last_used_at=new Date().toISOString().slice(0,10);
  asset.recovering_until=new Date(Date.now()+10_000).toISOString();
  globalThis.__worthBloomDeviceEvents.add(clientEventId);
  return {ok:true,duplicate:false};
}

export function claimLocalReview(reviewId: string, claimToken: string, userId: string) {
  const data = store();
  const review = data.reviews.find(item => item.id === reviewId) as (Review & { claimTokenDigest?: string }) | undefined;
  if (!review) throw new LocalStoreError('回信不存在', 404, 'REVIEW_NOT_FOUND');
  const digest = (review as Review & { claimTokenDigest?: string }).claimTokenDigest;
  if (!digest || digest !== claimToken) throw new LocalStoreError('认领凭据无效', 410, 'CLAIM_EXPIRED');
  if (review.claimedBy) {
    if (review.claimedBy !== userId) throw new LocalStoreError('认领凭据已经使用', 410, 'CLAIM_ALREADY_USED');
    const growth=getLocalGrowth(userId);return { claimed: true, pointsAwarded: growth.entries.find(entry=>entry.idempotencyKey===`review_claim:${reviewId}`)?.delta??0, dailyLimitReached: false, growthAccount: growth.account };
  }
  review.claimedBy = userId;
  review.claimedAt = now();
  awardLocalGrowth(userId,'review_claim',reviewId,10);return { claimed: true, pointsAwarded: 10, dailyLimitReached: false, growthAccount: getLocalGrowth(userId).account };
}

export function getLocalReview(tokenValue:string) {
  const data=store(); const invite=data.invites.find(item=>item.token===tokenValue);
  if(!invite)throw new LocalStoreError('链接不存在或已撤销',404,'REVIEW_LINK_NOT_FOUND');
  const request=data.requests.find(item=>item.id===invite.request_id);
  let linkState:'ACTIVE'|'USED'|'REVOKED'|'REQUEST_DECIDED'|'EXPIRED'='ACTIVE';
  if(invite.revoked)linkState='REVOKED';
  else if(invite.used_at)linkState='USED';
  else if(!request||request.status!=='REVIEWING')linkState='REQUEST_DECIDED';
  if(linkState!=='ACTIVE')throw new LocalStoreError('这张邀请卡已经完成使命了',410,linkState);
  const normalized=normalizeWish(request! as unknown as Record<string,unknown>);
  const wish:Partial<PurchaseRequest>={ id:normalized.id,name:normalized.name,price:normalized.price,type:normalized.type,reason:normalized.reason,concern:normalized.concern,brand:normalized.brand,skuLabel:normalized.skuLabel,details:normalized.details,sourcePlatform:normalized.sourcePlatform,productUrl:normalized.productUrl,images:normalized.images,revision:normalized.revision };
  return { request:wish, ownerDisplay:null as null, linkState:'ACTIVE' as const };
}

export function submitLocalReview(body:{token?:string;reviewerName?:string;reviewerRole?:string;stamp?:string;reasons?:string[];note?:string;choice?:ReviewChoice;comment?:string}) {
  const data=store(); const name=(body.reviewerName?.trim()||'匿名朋友').slice(0,20);
  const reasons=Array.isArray(body.reasons)?body.reasons.filter(Boolean):[];
  const note=body.note?String(body.note).slice(0,80):'';
  if(!body.token)throw new LocalStoreError('链接不完整',400);
  if(!body.stamp&&!body.choice)throw new LocalStoreError('请完成判断章',400);
  const commentParts=[reasons.join('；'),note?`备注：${note}`:''].filter(Boolean).join('\n');
  const comment=commentParts||'';
  if(!comment)throw new LocalStoreError('请完成理由',400);
  const invite=data.invites.find(item=>item.token===body.token); const request=invite?data.requests.find(item=>item.id===invite.request_id):null;
  if(!invite||invite.revoked||invite.used_at||!request||request.status!=='REVIEWING')throw new LocalStoreError('这张邀请卡已使用或心愿已结束',409,'REVIEW_LINK_USED');
  const stamp=body.stamp as string|undefined;
  const stampToChoice:Record<string,ReviewChoice>={FITS:'BUY_NOW',CONDITIONAL:'SAVE_FIRST',WAIT:'WAIT',NOT_FIT:'WAIT',NEED_INFO:'WAIT'};
  const choice=(body.choice??(stamp?stampToChoice[stamp]:'WAIT')) as ReviewChoice;
  const rev=Number(request.revision??1);
  const reviewId=crypto.randomUUID();
  const review:Review={ id:reviewId, request_id:request.id, reviewer_name:name, choice, comment:comment.slice(0,500), created_at:now(), requestRevision:rev, reviewerRole:(body.reviewerRole as Review['reviewerRole'])??undefined, stamp:(stamp as Review['stamp'])??undefined, reasons:reasons.length?reasons:undefined, note:note||undefined, claimedBy:null, claimedAt:null, legacyContext:false };
  invite.used_by=name; invite.used_at=now(); request.review_count=(request.review_count??0)+1;
  data.reviews.unshift(review);
  const claimToken=crypto.randomUUID().replaceAll('-','');
  // local preview only: stash claim token on review for later claim (round 6)
  (review as Review & { claimTokenDigest?:string }).claimTokenDigest=claimToken;
  return { reviewId, claimToken, successText:'感谢你的真实视角，已送到朋友手里。' };
}
