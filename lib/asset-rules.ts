import type { Asset } from '@/lib/types';

export class AssetRuleError extends Error {
  constructor(message:string, public status=400) { super(message); }
}

const assetTypes:Asset['type'][]=['COURSE','MEMBERSHIP','STORED_VALUE','ITEM'];
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
  if(asset.type!=='COURSE' || asset.total_units==null)return null;
  return Math.max(0,asset.total_units-effectiveUsedUnits(asset));
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
  };
}

export function applyAssetUsage(asset:Asset, rawAmount?:unknown) {
  if(asset.type==='STORED_VALUE') {
    const amount=roundMoney(Number(rawAmount));
    const balance=roundMoney(Number(asset.current_balance ?? 0));
    if(!Number.isFinite(amount) || amount<=0)throw new AssetRuleError('请输入本次实际消费金额');
    if(amount>balance)throw new AssetRuleError(`本次消费不能超过当前余额 ¥${balance.toLocaleString()}`);
    return {used_units:asset.used_units,usage_count:asset.usage_count+1,current_balance:roundMoney(balance-amount),amount};
  }

  if(asset.type==='COURSE') {
    const total=asset.total_units ?? 0;
    const used=effectiveUsedUnits(asset);
    if(!total || used>=total)throw new AssetRuleError('这项课程的次数已经全部用完',409);
    return {used_units:used+1,usage_count:Math.max(asset.usage_count,used)+1,current_balance:asset.current_balance,amount:null};
  }

  return {used_units:asset.used_units,usage_count:asset.usage_count+1,current_balance:asset.current_balance,amount:null};
}
