import type { ReviewChoice } from '@/lib/types';

export type WishCategory = '高价值实物' | '一次性体验/消耗品' | '会员/订阅' | '储值/余额' | '课程/次卡' | '其他';

export interface ProductAnalysis {
  name: string | null;
  price: number | null;
  category: WishCategory;
  total_units: number | null;
  usage_frequency: string | null;
  expiry_date: string | null;
  summary: string;
  confidence: number;
  evidence: string[];
  warnings: string[];
}

export interface PurchaseAdvice {
  recommendation: ReviewChoice;
  headline: string;
  summary: string;
  friend_consensus: string;
  considerations: string[];
  questions: string[];
  confidence: number;
}

export interface PurchaseHabitProfile {
  tracked_asset_count: number;
  tracked_spend: number;
  asset_type_counts: Record<string, number>;
  usage_events: number;
  consumable_utilization: number | null;
  active_saving_count: number;
  average_saving_progress: number | null;
  prior_wish_status_counts: Record<string, number>;
}

export interface AiApiMeta {
  provider: 'zhipu';
  model: string;
}
