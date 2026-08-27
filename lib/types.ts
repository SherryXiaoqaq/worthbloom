// WorthBloom types — aligned with wish-decision-review-spec v1.1
// Migration period: new spec fields are optional (?) so legacy records/demos
// compile; the compat layer (lib/wish-compat.ts) guarantees presence on read.

export type ReviewChoice = 'BUY_NOW' | 'SAVE_FIRST' | 'WAIT';
export type WishDecision = ReviewChoice;
export type RequestStatus = 'REVIEWING' | 'SAVING' | 'PURCHASED' | 'ARCHIVED';
export type WishStatus = 'DRAFT'|'CLARIFYING'|'SEEKING_PERSPECTIVE'|'READY_TO_DECIDE'|'BUY_NOW'|'SAVE_FIRST'|'WAIT';
export type WishSourceType = 'MANUAL'|'LINK'|'SCREENSHOT';
export type ReviewRole = 'KNOWS_YOU'|'USED_IT'|'BOTH';
export type ReviewStamp = 'FITS'|'CONDITIONAL'|'WAIT'|'NOT_FIT'|'NEED_INFO';
export type PerspectiveSource = 'FACT'|'HUMAN'|'AI';

// Spec §1
export type WishType =
  | 'COURSE_TRAINING'
  | 'DURABLE_GOOD'
  | 'SINGLE_USE'
  | 'MEMBERSHIP'
  | 'EXPERIENCE'
  | 'OTHER';

export type AgentSessionStatus = 'IN_PROGRESS' | 'COMPLETED' | 'DISMISSED';
export type EvidenceSource = 'WISH_FACT' | 'USER_ANSWER' | 'HUMAN_REVIEW' | 'AI_INFERENCE';
export type ReviewLinkState = 'ACTIVE' | 'USED' | 'REVOKED' | 'REQUEST_DECIDED' | 'EXPIRED';
export type ClaimStatus = 'PENDING' | 'CLAIMED' | 'EXPIRED';

export interface WishSource { type:WishSourceType; raw?:string; file_name?:string; mime_type?:string; }
export interface ProductSnapshot {
  name:string;
  price:number|null;
  brand:string|null;
  // spec uses `type`; legacy used `category`. Keep category for legacy UI; snapshot.type added.
  type?:WishType|null;
  category?:string;
  image_url?:string|null;
  source_text?:string;
  skuLabel?:string|null;
  details?:string|null;
  sourcePlatform?:string|null;
  images?:WishImage[];
  confidence:number;
  needs_confirmation:true;
}
export interface ClarificationQuestion {
  id:'frequency'|'constraint'|'alternative';
  prompt:string;
  options:string[];
  allowSkip:boolean;
  allowCustom?:boolean;
  customMaxLength?:number;
}
export interface ClarificationAnswer { question_id:string; value:string|null; skipped:boolean; }
export interface PerspectiveItem { id:string; title:string; content:string; source_type:PerspectiveSource; source_ids:string[]; }
export interface PerspectiveSummary { consensus:PerspectiveItem[]; disagreements:PerspectiveItem[]; risks:PerspectiveItem[]; unknowns:PerspectiveItem[]; fallback:boolean; }
export interface StructuredReviewInput { reviewerRole:ReviewRole; stamp:ReviewStamp; reasons:string[]; note?:string; }

// Spec §4.4
export interface WishImage { id:string; url:string; sortOrder:number; isCover:boolean; }

// Spec §4.5
export const usageFrequencyOptions: Record<WishType, string[]> = {
  COURSE_TRAINING: ['每周多次', '每周一次', '每月一至两次', '暂不确定'],
  DURABLE_GOOD: ['每天', '每周', '每月', '偶尔', '暂不确定'],
  SINGLE_USE: ['单次使用', '偶尔复购', '经常复购', '暂不确定'],
  MEMBERSHIP: ['每天', '每周', '每月', '暂不确定'],
  EXPERIENCE: ['单次参与', '周期参与', '暂不确定'],
  OTHER: ['经常', '偶尔', '单次使用', '暂不确定'],
};

export interface PurchaseRequest {
  id:string;
  name:string;
  price:number;
  reason:string;
  // Legacy (kept for migration; compat layer fills spec fields on read)
  category?:string;
  similar_item?:string|null;
  image_url?:string|null;
  // Spec §4.4
  revision?:number;
  sourceType?:WishSourceType;
  type?:WishType;
  concern?:string;
  brand?:string;
  skuLabel?:string;
  details?:string;
  productUrl?:string|null;
  product_url?:string|null;     // legacy alias
  sourcePlatform?:string;
  images?:WishImage[];
  total_units?:number|null;     // legacy
  totalUnits?:number|null;      // spec
  usage_frequency?:string|null; // legacy
  usageFrequency?:string|null;  // spec
  expiry_date?:string|null;     // legacy
  expiryDate?:string|null;      // spec
  status:RequestStatus;
  review_token?:string;         // legacy
  reviewToken?:string;          // spec
  created_at?:string;           // legacy
  createdAt?:string;            // spec
  updatedAt?:string;
  review_count?:number;         // legacy
  reviewCount?:number;          // spec
  decision_note?:string;        // legacy
  decisionNote?:string;         // spec
}

export interface Review {
  id:string;
  request_id:string;
  reviewer_name:string;
  choice:ReviewChoice;
  comment:string;
  created_at?:string;
  // Spec §5.3 additions
  requestRevision?:number;
  wishSnapshot?:ReviewContext['wishSnapshot'];
  reviewerRole?:ReviewRole;
  stamp?:ReviewStamp;
  reasons?:string[];
  note?:string;
  claimedBy?:string|null;
  claimedAt?:string|null;
  legacyContext?:boolean;
}

// Spec §5.3
export interface ReviewContext {
  requestId:string;
  requestRevision:number;
  wishSnapshot: Pick<PurchaseRequest, 'name'|'price'|'type'|'reason'|'concern'>;
}

export interface ReviewInvite { id:string; request_id:string; token:string; label:string; used_by:string|null; used_at:string|null; revoked:number; created_at:string; }
export interface Decision { request_id:string; decision:ReviewChoice; decided_at:string; }
export interface SavingGoal { id:string; request_id:string|null; name:string; target:number; current:number; weekly_plan:number|null; created_at:string; }
export interface Asset { id:string; name:string; type:'COURSE'|'MEMBERSHIP'|'STORED_VALUE'|'ITEM'; purchase_price:number; total_units:number|null; used_units:number; current_balance:number|null; expiry_date:string|null; usage_count:number; last_used_at:string|null; bloom_until?:string|null; recovering_until?:string|null; }
export interface AppData { requests:PurchaseRequest[]; reviews:Review[]; invites:ReviewInvite[]; decisions:Decision[]; savingGoals:SavingGoal[]; assets:Asset[]; }

// Spec §7.1 Agent
export interface AgentMessage {
  id:string;
  role:'ASSISTANT'|'USER';
  content:string;
  questionId?:string;
  skipped?:boolean;
  createdAt:string;
}
export interface EvidenceItem {
  id:string;
  text:string;
  source:EvidenceSource;
  sourceIds:string[];
}
export interface AgentReport {
  confirmedFacts:EvidenceItem[];
  motives:EvidenceItem[];
  signalsForPurchase:EvidenceItem[];
  signalsForWaiting:EvidenceItem[];
  unknowns:EvidenceItem[];
  humanConsensus:EvidenceItem[];
  humanDisagreements:EvidenceItem[];
  nextOptions:Array<'BUY_NOW'|'SAVE_FIRST'|'WAIT'|'ASK_REVIEWER'>;
  disclaimer:'最终决定由用户完成';
}
export interface AgentSession {
  id:string;
  requestId:string;
  requestRevision:number;
  status:AgentSessionStatus;
  messages:AgentMessage[];
  report?:AgentReport;
  questionCount:number;
  createdAt:string;
  updatedAt:string;
}

// Spec §8.4 / §10 Claim & Growth
export interface ClaimToken {
  tokenDigest:string;
  reviewId:string;
  expiresAt:string;
  status:ClaimStatus;
}
export interface UserProfile {
  userId:string;
  nickname:string;
  avatarUrl?:string;
  bio?:string;
  shareIdentityDefault:'ANONYMOUS'|'NICKNAME';
  createdAt:string;
  updatedAt:string;
}
export interface GrowthAccount {
  userId:string;
  points:number;
  level:1|2|3|4;
  nextLevelPoints?:number;
  updatedAt?:string;
}
export interface GrowthLedgerEntry {
  id:string;
  userId:string;
  actionType:string;
  referenceId:string;
  delta:number;
  idempotencyKey:string;
  limited:boolean;
  createdAt:string;
}
export interface ProfileTask {
  id:string;
  type:'UNREAD_REVIEW'|'READY_TO_DECIDE'|'SAVING_PROGRESS'|'ADD_OUTCOME';
  title:string;
  targetRoute:string;
  priority:number;
}
export interface ProfileSummary {
  profile:UserProfile;
  growth:GrowthAccount|null;
  tasks:ProfileTask[];
  counts:{activeWishes:number;decisions:number;unreadReviews:number;savingGoals:number;reviewsGiven:number;agentReports:number};
  device:{bound:boolean;focusRequestId?:string};
}

export interface InboxItem {
  review:Review;
  requestName:string;
  isRead:boolean;
  readAt?:string;
}

export interface InboxPage {
  items:InboxItem[];
  nextCursor:string|null;
  unreadCount:number;
}

// API error (spec §9)
export interface ApiError { error:string; code:string; field?:string; retryable?:boolean; }

export type FlowerMode = 'SEED'|'SPROUT'|'WAITING'|'GROWING'|'BLOOM'|'HEALTHY'|'STRESSED'|'THIRSTY'|'RECOVERING';
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
