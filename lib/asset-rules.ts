import type { Asset, AssetReflection, AssetReflectionFeeling, PurchaseRequest, WishType } from '@/lib/types';

export class AssetRuleError extends Error {
  constructor(message:string, public status=400) { super(message); }
}

const assetTypes:Asset['type'][]=['COURSE','MEMBERSHIP','STORED_VALUE','ITEM','EXPERIENCE','OTHER'];
const reflectionFeelings:AssetReflectionFeeling[]=['BECAME_PART_OF_LIFE','SOMETIMES_USEFUL','BARELY_USED','NOT_FOR_ME'];
const roundMoney=(value:number)=>Math.round((value+Number.EPSILON)*100)/100;

function nonNegativeInteger(value:unknown, label:string) {
  const number=Number(value ?? 0);
  if(!Number.isInteger(number) || number<0)throw new AssetRuleError(`${label}必须是大于或等于 0 的整数`);
  return number;
}

export function effectiveUsedUnits(asset:Asset) {
  if(asset.type!=='COURSE')return asset.used_units;
  const total=asset.total_units ?? 0;
  return Math.min(total,Math.max(0,asset.used_units,asset.usage_count));
}

export function remainingUnits(asset:Asset) {
  if((asset.type!=='COURSE'&&asset.type!=='EXPERIENCE') || asset.total_units==null)return null;
  return Math.max(0,asset.total_units-effectiveUsedUnits(asset));
}

export function assetTypeForWish(type?:WishType|null, category=''):Asset['type'] {
  if(type==='COURSE_TRAINING')return 'COURSE';
  if(type==='MEMBERSHIP')return 'MEMBERSHIP';
  if(type==='STORED_VALUE')return 'STORED_VALUE';
  if(type==='SINGLE_USE'||type==='EXPERIENCE')return 'EXPERIENCE';
  if(type==='OTHER')return 'OTHER';
  if(category.includes('课程')||category.includes('次卡'))return 'COURSE';
  if(category.includes('会员')||category.includes('订阅'))return 'MEMBERSHIP';
  if(category.includes('储值')||category.includes('余额'))return 'STORED_VALUE';
  if(category.includes('体验')||category.includes('旅行')||category.includes('单次')||category.includes('一次性')||category.includes('消耗品'))return 'EXPERIENCE';
  if(category.includes('其他'))return 'OTHER';
  return 'ITEM';
}

export function assetTypeForRequest(request:Pick<PurchaseRequest,'type'|'category'>):Asset['type'] {
  return assetTypeForWish(request.type,request.category??'');
}

export function costPerUse(asset:Asset) {
  if(asset.usage_count<=0)return null;
  const consumed=asset.type==='STORED_VALUE'
    ? Math.max(0,asset.purchase_price-Number(asset.current_balance??asset.purchase_price))
    : asset.purchase_price;
  return roundMoney(consumed/asset.usage_count);
}

export function isAssetExpired(asset:Asset, date=new Date()) {
  const expiryDate=String(asset.expiry_date ?? '').slice(0,10);
  const currentDate=date.toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'});
  return /^\d{4}-\d{2}-\d{2}$/.test(expiryDate) && expiryDate<currentDate;
}

export function assetFinished(asset:Asset) {
  if(asset.type==='COURSE'||asset.type==='EXPERIENCE')return remainingUnits(asset)===0;
  if(asset.type==='STORED_VALUE')return Number(asset.current_balance ?? 0)<=0;
  return false;
}

export function reflectionFeelingFromRating(value:unknown):AssetReflectionFeeling {
  const rating=Number(value);
  if(rating>=5)return 'BECAME_PART_OF_LIFE';
  if(rating>=3)return 'SOMETIMES_USEFUL';
  if(rating>=2)return 'BARELY_USED';
  return 'NOT_FOR_ME';
}

export function normalizeAssetReflection(reflection:AssetReflection):AssetReflection {
  const rating=Number(reflection.rating);
  const normalizedRating=Number.isInteger(rating)&&rating>=1&&rating<=5 ? rating as 1|2|3|4|5 : null;
  const feeling=reflectionFeelings.includes(reflection.feeling)
    ? reflection.feeling
    : reflectionFeelingFromRating(normalizedRating);
  const trigger=['MANUAL','COMPLETED','EXPIRED'].includes(reflection.trigger) ? reflection.trigger : 'MANUAL';
  return {...reflection,feeling,rating:normalizedRating,trigger};
}

export function parseAssetReflectionPayload(payload:Record<string,unknown>) {
  const rawRating=payload.rating;
  let rating:AssetReflection['rating']=null;
  if(rawRating!==undefined&&rawRating!==null&&rawRating!=='') {
    const numericRating=Number(rawRating);
    if(!Number.isInteger(numericRating)||numericRating<1||numericRating>5)throw new AssetRuleError('旧版评分需要是 1 到 5 之间的整数');
    rating=numericRating as 1|2|3|4|5;
  }
  const rawFeeling=String(payload.feeling ?? '');
  const feeling=reflectionFeelings.includes(rawFeeling as AssetReflectionFeeling)
    ? rawFeeling as AssetReflectionFeeling
    : rating ? reflectionFeelingFromRating(rating) : null;
  if(!feeling)throw new AssetRuleError('请选择一句最接近这次真实感受的话');
  const wouldBuyAgain=String(payload.wouldBuyAgain ?? payload.would_buy_again ?? 'MAYBE') as AssetReflection['would_buy_again'];
  if(!['YES','MAYBE','NO'].includes(wouldBuyAgain))throw new AssetRuleError('请选择如果重新决定，你会怎么做');
  const note=String(payload.note ?? '').trim().slice(0,500);
  if(!note)throw new AssetRuleError('请写下一句想留给以后的话');
  const rawTrigger=String(payload.trigger ?? 'MANUAL');
  const trigger:AssetReflection['trigger']=rawTrigger==='COMPLETED'||rawTrigger==='EXPIRED'?rawTrigger:'MANUAL';
  return {feeling,rating,wouldBuyAgain,note,trigger};
}

export function parseAssetPayload(id:string, payload:Record<string,unknown>):Asset {
  const name=String(payload.name ?? '').trim();
  const type=String(payload.type ?? 'ITEM') as Asset['type'];
  const purchasePrice=Number(payload.purchase_price);
  if(!name || !assetTypes.includes(type) || !Number.isFinite(purchasePrice) || purchasePrice<0) {
    throw new AssetRuleError('请完整填写物资名称、类型和购入金额');
  }

  const history=nonNegativeInteger(payload.usage_count,'历史使用次数');
  const expiryDate=payload.expiry_date?String(payload.expiry_date):null;
  let totalUnits:number|null=null;
  let usedUnits=0;
  let currentBalance:number|null=null;

  if(type==='COURSE') {
    totalUnits=nonNegativeInteger(payload.total_units,'购买总次数');
    if(totalUnits<=0)throw new AssetRuleError('课程的购买总次数必须大于 0');
    if(history>totalUnits)throw new AssetRuleError('已经使用的次数不能超过购买总次数');
    usedUnits=history;
  }

  if(type==='STORED_VALUE') {
    if(payload.current_balance==null || payload.current_balance==='')throw new AssetRuleError('请填写储值卡的当前余额');
    currentBalance=roundMoney(Number(payload.current_balance));
    if(!Number.isFinite(currentBalance) || currentBalance<0)throw new AssetRuleError('当前余额不能小于 0');
    if(currentBalance>purchasePrice)throw new AssetRuleError('当前余额不能大于累计储值金额');
  }

  if(type==='EXPERIENCE'){
    totalUnits=1;
    if(history>1)throw new AssetRuleError('单次体验最多记录 1 次历史使用');
    usedUnits=history;
  }

  return {
    id,
    name,
    type,
    purchase_price:roundMoney(purchasePrice),
    total_units:totalUnits,
    used_units:usedUnits,
    current_balance:currentBalance,
    expiry_date:expiryDate,
    usage_count:history,
    last_used_at:history?new Date().toISOString().slice(0,10):null,
    archived_at:null,
  };
}

export function applyAssetUsage(asset:Asset, rawAmount?:unknown) {
  if(asset.archived_at)throw new AssetRuleError('这项物资已经收进过往记录',409);
  if(isAssetExpired(asset))throw new AssetRuleError('这项物资已经到期，请先留下使用感受',409);
  if(asset.type==='STORED_VALUE') {
    const amount=roundMoney(Number(rawAmount));
    const balance=roundMoney(Number(asset.current_balance ?? 0));
    if(!Number.isFinite(amount) || amount<=0)throw new AssetRuleError('请输入本次实际消费金额');
    if(amount>balance)throw new AssetRuleError(`本次消费不能超过当前余额 ¥${balance.toLocaleString()}`);
    return {used_units:asset.used_units,usage_count:asset.usage_count+1,current_balance:roundMoney(balance-amount),amount};
  }

  if(asset.type==='COURSE'||asset.type==='EXPERIENCE') {
    const total=asset.total_units ?? 0;
    const used=effectiveUsedUnits(asset);
    if(!total || used>=total)throw new AssetRuleError('这项物资的次数已经全部用完',409);
    return {used_units:used+1,usage_count:Math.max(asset.usage_count,used)+1,current_balance:asset.current_balance,amount:null};
  }

  return {used_units:asset.used_units,usage_count:asset.usage_count+1,current_balance:asset.current_balance,amount:null};
}
