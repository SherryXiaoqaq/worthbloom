import type { PurchaseRequest, WishImage } from './types';

export type MultiProductOption = {
  label: string;
  price: number | null;
  image: WishImage | null;
  name?: string;
  brand?: string;
};

// 每行格式：`A 商品：¥1999 · 名称：小米电视 · 品牌：小米`（名称 / 品牌为选填段，向后兼容旧的 `A 商品：¥1999`）
const PRODUCT_LINE = /^\s*([A-Z])\s*商品[:：]\s*(?:¥?\s*([\d.]+))?(?:\s*·\s*名称[:：]\s*([^\n]+?))?(?:\s*·\s*品牌[:：]\s*([^\n]+))?$/;
const MULTI_PRODUCT_NAME = /^多个商品\s*[（(]\s*\d+\s*件\s*[）)]/;

export function isMultiProductWish(request: Pick<PurchaseRequest, 'name' | 'details' | 'images'>) {
  return MULTI_PRODUCT_NAME.test(request.name);
}

/** 把单个商品序列化成 details 里的一行。价格、名称、品牌都是选填。 */
export function buildMultiProductLine(label: string, price: number | null, name?: string, brand?: string): string {
  const pricePart = price != null && Number.isFinite(price) && price >= 0 ? `¥${price % 1 === 0 ? String(price) : price.toFixed(2)}` : '';
  let line = `${label} 商品：${pricePart}`;
  const cleanName = name?.trim();
  const cleanBrand = brand?.trim();
  if (cleanName) line += ` · 名称：${cleanName}`;
  if (cleanBrand) line += ` · 品牌：${cleanBrand}`;
  return line;
}

export function parseMultiProductOptions(request: Pick<PurchaseRequest, 'details' | 'images'>): MultiProductOption[] {
  const images = request.images ?? [];
  const lines = String(request.details ?? '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const parsed = lines.map((line, index) => {
    const match = line.match(PRODUCT_LINE);
    const price = match?.[2] ? Number(match[2]) : null;
    return {
      label: match?.[1] || String.fromCharCode(65 + index),
      price: Number.isFinite(price) ? price : null,
      name: match?.[3]?.trim() || undefined,
      brand: match?.[4]?.trim() || undefined,
      image: images[index] ?? null,
    };
  }).filter(item => item.image || item.price !== null || item.name || item.brand);
  if (parsed.length) return parsed;
  return images.map((image, index) => ({ label: String.fromCharCode(65 + index), price: null, image }));
}
