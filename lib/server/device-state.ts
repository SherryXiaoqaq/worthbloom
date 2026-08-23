import type { AppData, Asset, DeviceState } from '@/lib/types';

const clamp=(value:number,min=0,max=1)=>Math.min(max,Math.max(min,value));
const dayMs=86_400_000;

function daysBetween(date:string|null|undefined, now:number) {
  if(!date)return null;
  const value=new Date(`${date.slice(0,10)}T23:59:59`).getTime();
  return Number.isFinite(value)?Math.ceil((value-now)/dayMs):null;
}

function assetProgress(asset:Asset) {
  if(asset.total_units!=null && asset.total_units>0)return clamp(asset.used_units/asset.total_units);
  return clamp(asset.usage_count/30);
}

function assetState(asset:Asset, now:number):DeviceState {
  const remaining=asset.total_units==null?null:Math.max(0,asset.total_units-asset.used_units);
  const daysLeft=daysBetween(asset.expiry_date,now);
  const progress=assetProgress(asset);
  const lastUsed=asset.last_used_at?new Date(`${asset.last_used_at.slice(0,10)}T12:00:00`).getTime():NaN;
  const idleDays=Number.isFinite(lastUsed)?Math.floor((now-lastUsed)/dayMs):null;

  if(asset.bloom_until && new Date(asset.bloom_until).getTime()>now) {
    return {mode:'BLOOM',title:asset.name,progress:1,flower_health:100,remaining,days_left:daysLeft,message:'A wish came true',asset_id:asset.id};
  }
  if(asset.recovering_until && new Date(asset.recovering_until).getTime()>now) {
    return {mode:'RECOVERING',title:asset.name,progress,flower_health:88,remaining,days_left:daysLeft,message:'Feeling better',asset_id:asset.id};
  }
  if((daysLeft!=null && daysLeft<=14) || (remaining!=null && asset.total_units!=null && remaining/Math.max(1,asset.total_units)<=0.2)) {
    return {mode:'THIRSTY',title:asset.name,progress,flower_health:48,remaining,days_left:daysLeft,message:'Use me before I fade',asset_id:asset.id};
  }
  if(idleDays==null || idleDays>=21) {
    return {mode:'STRESSED',title:asset.name,progress,flower_health:58,remaining,days_left:daysLeft,message:'I miss our time',asset_id:asset.id};
  }
  return {mode:'HEALTHY',title:asset.name,progress,flower_health:90,remaining,days_left:daysLeft,message:'Value grows in use',asset_id:asset.id};
}

export function deriveDeviceState(data:AppData, timestamp=Date.now()):DeviceState {
  const blooming=data.assets.find(asset=>asset.bloom_until && new Date(asset.bloom_until).getTime()>timestamp);
  if(blooming)return assetState(blooming,timestamp);
  const recovering=data.assets.find(asset=>asset.recovering_until && new Date(asset.recovering_until).getTime()>timestamp);
  if(recovering)return assetState(recovering,timestamp);

  const goal=data.savingGoals[0];
  if(goal) {
    const progress=goal.target>0?clamp(goal.current/goal.target):0;
    return {mode:'GROWING',title:goal.name,progress,flower_health:Math.round(65+progress*30),remaining:Math.max(0,goal.target-goal.current),days_left:null,message:'Getting closer',asset_id:null};
  }

  const wish=data.requests.find(item=>item.status==='REVIEWING');
  if(wish) {
    const invites=data.invites.filter(item=>item.request_id===wish.id && !item.revoked);
    const replies=invites.filter(item=>item.used_at).length;
    return {mode:'WAITING',title:wish.name,progress:invites.length?clamp(replies/invites.length):0,flower_health:78,remaining:Math.max(0,invites.length-replies),days_left:null,message:`Waiting for ${Math.max(0,invites.length-replies)} friends`,asset_id:null};
  }

  if(data.assets[0])return assetState(data.assets[0],timestamp);
  return {mode:'SEED',title:'A new beginning',progress:0.06,flower_health:72,remaining:null,days_left:null,message:'Plant your first wish',asset_id:null};
}
