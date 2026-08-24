export type ReviewChoice = 'BUY_NOW' | 'SAVE_FIRST' | 'WAIT';
export type RequestStatus = 'REVIEWING' | 'SAVING' | 'PURCHASED' | 'ARCHIVED';
export interface PurchaseRequest { id:string; name:string; price:number; reason:string; category:string; total_units:number|null; usage_frequency:string|null; expiry_date:string|null; product_url:string|null; similar_item:string|null; status:RequestStatus; review_token:string; created_at:string; review_count:number; decision_note?:string; }
export interface Review { id:string; request_id:string; reviewer_name:string; choice:ReviewChoice; comment:string; created_at:string; }
export interface ReviewInvite { id:string; request_id:string; token:string; label:string; used_by:string|null; used_at:string|null; revoked:number; created_at:string; }
export interface SavingGoal { id:string; request_id:string|null; name:string; target:number; current:number; weekly_plan:number|null; created_at:string; }
export interface Asset { id:string; name:string; type:'COURSE'|'MEMBERSHIP'|'STORED_VALUE'|'ITEM'; purchase_price:number; total_units:number|null; used_units:number; current_balance:number|null; expiry_date:string|null; usage_count:number; last_used_at:string|null; bloom_until?:string|null; recovering_until?:string|null; }
export interface AppData { requests:PurchaseRequest[]; reviews:Review[]; invites:ReviewInvite[]; savingGoals:SavingGoal[]; assets:Asset[]; }

export type FlowerMode = 'SEED'|'WAITING'|'GROWING'|'BLOOM'|'HEALTHY'|'STRESSED'|'THIRSTY'|'RECOVERING';
export interface DeviceState {
  mode:FlowerMode;
  title:string;
  progress:number;
  flower_health:number;
  remaining:number|null;
  days_left:number|null;
  message:string;
  asset_id:string|null;
}
