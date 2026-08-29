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
  | 'STORED_VALUE'
  | 'EXPERIENCE'
  | 'OTHER';

export type AgentSessionStatus = 'IN_PROGRESS' | 'PAUSED' | 'COMPLETED' | 'DISMISSED';
export type AgentProfileId = 'QUICK_DECISION'|'RATIONAL_ANALYST'|'REVIEW_SYNTHESIZER'|'NAVAL_LENS';
export type AgentSessionMode = 'SINGLE'|'ROUNDTABLE';
export type AgentStage = 'EXPLORING'|'CLARIFYING'|'READY_TO_SUMMARIZE';
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
  totalUnits?:number|null;
  usageFrequency?:string|null;
  expiryDate?:string|null;
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
  SINGLE_USE: ['单次使用 / 参与', '偶尔复购 / 再次参与', '经常复购', '暂不确定'],
  MEMBERSHIP: ['每天', '每周', '每月', '暂不确定'],
  STORED_VALUE: ['每周', '每月', '偶尔', '暂不确定'],
  EXPERIENCE: ['单次使用 / 参与', '偶尔复购 / 再次参与', '经常复购', '暂不确定'],
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
export interface Asset { id:string; request_id?:string|null; name:string; type:'COURSE'|'MEMBERSHIP'|'STORED_VALUE'|'ITEM'|'EXPERIENCE'|'OTHER'; purchase_price:number; total_units:number|null; used_units:number; current_balance:number|null; expiry_date:string|null; usage_count:number; last_used_at:string|null; archived_at?:string|null; bloom_until?:string|null; recovering_until?:string|null; }
export type AssetReflectionFeeling = 'BECAME_PART_OF_LIFE'|'SOMETIMES_USEFUL'|'BARELY_USED'|'NOT_FOR_ME';
export interface AssetReflection {
  id:string;
  asset_id:string;
  asset_name:string;
  asset_type:Asset['type'];
  feeling:AssetReflectionFeeling;
  rating?:1|2|3|4|5|null;
  would_buy_again:'YES'|'MAYBE'|'NO';
  note:string;
  trigger:'MANUAL'|'COMPLETED'|'EXPIRED';
  usage_count:number;
  cost_per_use:number|null;
  created_at:string;
}
export interface AppData { requests:PurchaseRequest[]; reviews:Review[]; invites:ReviewInvite[]; decisions:Decision[]; savingGoals:SavingGoal[]; assets:Asset[]; assetReflections:AssetReflection[]; }

// Spec §7.1 Agent
export interface AgentMessage {
  id:string;
  role:'ASSISTANT'|'USER';
  content:string;
  agentProfileId?:AgentProfileId;
  payload?:AgentTurnPayload;
  questionId?:string;
  skipped?:boolean;
  createdAt:string;
}
export interface AgentSuggestion {
  id:string;
  label:string;
  value:string;
  intent:'ANSWER'|'FOLLOW_UP'|'SKIP'|'GENERATE_REPORT';
}
export interface AgentTurnPayload {
  text:string;
  agentProfileId:AgentProfileId;
  generatedBy:'MODEL'|'RULE_FALLBACK';
  degraded?:boolean;
  clientMessageId?:string;
  question?:{id:string;dimension:string;text:string;allowSkip:true};
  suggestions:AgentSuggestion[];
  sourceIds:string[];
  canGenerateReport:boolean;
  stage:AgentStage;
}
export interface EvidenceItem {
  id:string;
  text:string;
  source:EvidenceSource;
  sourceIds:string[];
}
export interface AgentReport {
  generatedBy:'MODEL'|'RULE_FALLBACK';
  workingConclusion:{direction:'MOVE_FORWARD'|'PAUSE'|'COLLECT_MORE_INFO';summary:string};
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
  mode:AgentSessionMode;
  agentProfileId:AgentProfileId;
  promptVersion:string;
  summary?:string;
  metadata?:Record<string,unknown>;
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
  level:1|2|3|4|5;
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
  request_id?:string|null;
}
export interface ShoppingProfileItem {
  id:string;
  name:string;
  type:WishType;
  category:string;
  price:number|null;
  sourceImageIndex:number;
  confidence:number;
}
export interface ShoppingProfile {
  userId:string;
  source:'REGISTER_SCREENSHOTS';
  consentedAt:string;
  items:ShoppingProfileItem[];
  categoryCounts:Record<string,number>;
  updatedAt:string;
}
