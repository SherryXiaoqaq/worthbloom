'use client';

import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import type { AssetReflection, ClarificationQuestion, ProductSnapshot, PurchaseRequest, ReviewInvite, WishImage, WishSourceType, WishType } from '@/lib/types';
import { usageFrequencyOptions } from '@/lib/types';
import { cloudBaseFetch } from '@/lib/cloudbase/client';
import { extractUrls } from '@/lib/url-extract';
import { canonicalWishType, typeToCategory, WISH_TYPE_OPTIONS } from '@/lib/wish-compat';
import { assetTypeForWish } from '@/lib/asset-rules';
import { buildMultiProductLine } from '@/lib/multi-product';
import { Icon } from './worthbloom-views';
import styles from './worthbloom-v2.module.css';

type CreateStep = 'product' | 'choose' | 'multi' | 'source' | 'confirm' | 'clarify';

type Draft = {
  sourceType: WishSourceType;
  raw: string;
  images: WishImage[];
  name: string;
  price: string;
  type: WishType;
  reason: string;
  concern: string;
  brand: string;
  skuLabel: string;
  details: string;
  productUrl: string;
  sourcePlatform: string;
  usageFrequency: string;
  totalUnits:string;
  expiryDate:string;
};

type MultiProductItem = {
  id: string;
  image: WishImage | null;
  price: string;
  name: string;
  brand: string;
};

const emptyDraft: Draft = {
  sourceType: 'MANUAL', raw: '', images: [], name: '', price: '', type: 'DURABLE_GOOD',
  reason: '', concern: '', brand: '', skuLabel: '', details: '', productUrl: '', sourcePlatform: '', usageFrequency: '',
  totalUnits:'',expiryDate:'',
};

const CONSTRAINT_OPTIONS = ['时间安排', '预算压力', '距离或携带', '动力与坚持', '其他原因', '暂时不确定'];
const ALTERNATIVE_OPTIONS = ['可以先试用/体验', '可以买基础款', '可以等一等', '暂时没有'];
const REFLECTION_FEELING_LABELS:Record<AssetReflection['feeling'],string>={BECAME_PART_OF_LIFE:'成了生活的一部分',SOMETIMES_USEFUL:'偶尔派上用场',BARELY_USED:'没有想象中常用',NOT_FOR_ME:'这次不太适合我'};

function makeId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function makeMultiProduct(): MultiProductItem {
  return { id: makeId(), image: null, price: '', name: '', brand: '' };
}

function productLabel(index: number) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return alphabet[index] ?? String(index + 1);
}

async function json<T>(response: Response): Promise<T> {
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || '操作失败');
  return data;
}

export default function CreateWishSheet({ open, onClose, onCreated, editRequest, pastReflections=[] }: { open: boolean; onClose: () => void; onCreated: (request: PurchaseRequest, invites: ReviewInvite[]) => void; editRequest?: PurchaseRequest | null; pastReflections?:AssetReflection[] }) {
  const [step, setStep] = useState<CreateStep>('product');
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [multiItems, setMultiItems] = useState<MultiProductItem[]>(() => [makeMultiProduct()]);
  const [multiEntry, setMultiEntry] = useState(false);
  const [snapshot, setSnapshot] = useState<ProductSnapshot | null>(null);
  const [urlCandidates, setUrlCandidates] = useState<string[]>([]);
  const [questions, setQuestions] = useState<ClarificationQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string | null>>({});
  const [customText, setCustomText] = useState<Record<string, string>>({});
  const [multiRecognizing, setMultiRecognizing] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!open || !editRequest) return;
    const frame=requestAnimationFrame(()=>{
      const imgs = Array.isArray(editRequest.images) ? editRequest.images : [];
      setDraft({
        sourceType: editRequest.sourceType ?? 'MANUAL', raw: editRequest.productUrl ?? editRequest.product_url ?? '', images: imgs,
        name: editRequest.name, price: String(editRequest.price), type: canonicalWishType(editRequest.type, editRequest.category),
        reason: editRequest.reason, concern: editRequest.concern ?? editRequest.similar_item ?? '',
        brand: editRequest.brand ?? '', skuLabel: editRequest.skuLabel ?? '', details: editRequest.details ?? '',
        productUrl: editRequest.productUrl ?? editRequest.product_url ?? '', sourcePlatform: editRequest.sourcePlatform ?? '',
        usageFrequency: editRequest.usageFrequency ?? editRequest.usage_frequency ?? '', totalUnits:editRequest.totalUnits==null&&editRequest.total_units==null?'':String(editRequest.totalUnits??editRequest.total_units),expiryDate:editRequest.expiryDate??editRequest.expiry_date??'',
      });
      setSnapshot(null); setUrlCandidates([]); setQuestions([]); setAnswers({}); setCustomText({}); setMultiRecognizing({}); setMessage(''); setMultiEntry(false); setMultiItems([makeMultiProduct()]);
      setStep('confirm');
    });
    return()=>cancelAnimationFrame(frame);
  }, [open, editRequest]);
  if (!open) return null;

  function start(sourceType: WishSourceType) {
    setDraft({ ...emptyDraft, sourceType });
    setSnapshot(null); setUrlCandidates([]); setQuestions([]); setAnswers({}); setCustomText({}); setMultiRecognizing({}); setMessage(''); setMultiEntry(false); setMultiItems([makeMultiProduct()]);
    setStep(sourceType === 'MANUAL' ? 'confirm' : 'source');
  }
  function startMulti() {
    setDraft({ ...emptyDraft, sourceType: 'MANUAL' });
    setSnapshot(null); setUrlCandidates([]); setQuestions([]); setAnswers({}); setCustomText({}); setMultiRecognizing({}); setMessage(''); setMultiEntry(true); setMultiItems([makeMultiProduct()]);
    setStep('multi');
  }
  function close() { setStep('product'); setDraft(emptyDraft); setSnapshot(null); setUrlCandidates([]); setQuestions([]); setAnswers({}); setCustomText({}); setMultiRecognizing({}); setMessage(''); setMultiEntry(false); setMultiItems([makeMultiProduct()]); onClose(); }
  function back() {
    setMessage('');
    if (step === 'choose') setStep('product');
    else if (step === 'multi') setStep('product');
    else if (step === 'source') setStep('choose');
    else if (step === 'confirm') setStep(multiEntry ? 'multi' : draft.sourceType === 'MANUAL' ? 'choose' : 'source');
    else if (step === 'clarify') setStep('confirm');
    else close();
  }

  function addImage(file: File) {
    if (draft.images.length >= 6) { setMessage('最多 6 张图片。'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result || '');
      setDraft(prev => {
        const images = [...prev.images, { id: crypto.randomUUID(), url, sortOrder: prev.images.length, isCover: prev.images.length === 0 }];
        return { ...prev, images };
      });
    };
    reader.readAsDataURL(file);
  }
  function removeImage(id: string) {
    setDraft(prev => {
      let images = prev.images.filter(img => img.id !== id);
      if (images.length && !images.some(img => img.isCover)) images[0].isCover = true;
      images = images.map((img, i) => ({ ...img, sortOrder: i }));
      return { ...prev, images };
    });
  }
  function setCover(id: string) {
    setDraft(prev => ({ ...prev, images: prev.images.map(img => ({ ...img, isCover: img.id === id })) }));
  }

  function setMultiImage(itemId: string, file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result || '');
      setMultiItems(prev => prev.map((item, index) => item.id === itemId ? {
        ...item,
        image: { id: makeId(), url, sortOrder: index, isCover: index === 0 },
      } : item));
      void identifyMultiPrice(itemId, file);
    };
    reader.readAsDataURL(file);
  }

  async function identifyMultiPrice(itemId: string, file: File) {
    setMultiRecognizing(prev => ({ ...prev, [itemId]: true }));
    setMessage('');
    try {
      const form = new FormData();
      form.append('type', 'SCREENSHOT');
      form.append('image', file);
      form.append('hint', '请优先识别图片底部或商品标题附近的人民币价格，包括券后价、到手价、现价、¥ 或 ￥ 后面的金额。');
      const result = await json<{ snapshot?: ProductSnapshot; fallback?: boolean; sourceWarning?: string | null }>(
        await cloudBaseFetch('/api/import', { method: 'POST', body: form })
      );
      const price = result.snapshot?.price;
      if (typeof price === 'number' && Number.isFinite(price) && price >= 0) {
        setMultiItems(prev => prev.map(item => item.id === itemId ? { ...item, price: price % 1 === 0 ? String(price) : price.toFixed(2) } : item));
        return;
      }
      setMessage(result.sourceWarning ? `${result.sourceWarning}，价格可以留空或手动填写。` : '这张图片没有识别到明确价格，可以留空或手动填写。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '价格识别失败，可以留空或手动填写。');
    } finally {
      setMultiRecognizing(prev => ({ ...prev, [itemId]: false }));
    }
  }

  function addMultiProduct() {
    if (multiItems.length >= 6) { setMessage('最多添加 6 个商品。'); return; }
    setMessage('');
    setMultiItems(prev => [...prev, makeMultiProduct()]);
  }

  function removeMultiProduct(itemId: string) {
    setMessage('');
    setMultiItems(prev => prev.length > 1 ? prev.filter(item => item.id !== itemId) : prev);
    setMultiRecognizing(prev => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  }

  async function continueMulti() {
    if (Object.values(multiRecognizing).some(Boolean)) {
      setMessage('正在识别价格，请稍等一下。');
      return;
    }
    if (multiItems.some(item => !item.image)) {
      setMessage('请为每个商品上传图片。');
      return;
    }
    const prices = multiItems.map(item => {
      const trimmed = item.price.trim();
      if (!trimmed) return null;
      const value = Number(trimmed);
      return Number.isFinite(value) && value >= 0 ? value : NaN;
    });
    if (prices.some(value => value !== null && Number.isNaN(value))) {
      setMessage('请填写有效价格，或留空。');
      return;
    }
    const images = multiItems.map((item, index) => ({ ...item.image!, sortOrder: index, isCover: index === 0 }));
    const total = prices.reduce<number>((sum, price) => sum + (price ?? 0), 0);
    const details = multiItems.map((item, index) => buildMultiProductLine(productLabel(index), prices[index], item.name, item.brand)).join('\n');
    const payload = {
      sourceType: 'MANUAL',
      images,
      name: `多个商品（${multiItems.length} 件）`,
      price: total % 1 === 0 ? String(total) : total.toFixed(2),
      type: 'DURABLE_GOOD' as WishType,
      category: typeToCategory('DURABLE_GOOD'),
      reason: draft.reason.trim() || '我在这几个商品之间犹豫，想听听朋友更建议哪一个。',
      concern: '不知道哪一个更适合',
      brand: '',
      skuLabel: '',
      details,
      productUrl: null,
      sourcePlatform: '',
      usageFrequency: null,
      totalUnits: null,
      expiryDate: null,
    };
    setBusy('create'); setMessage('');
    try {
      const output = await json<{ request: PurchaseRequest; invites: ReviewInvite[] }>(
        await cloudBaseFetch('/api/data', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'create_request', payload }) })
      );
      close(); onCreated(output.request, output.invites);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存失败');
    } finally {
      setBusy('');
    }
  }

  // LINK: pre-extract URLs client-side (spec §4.2). 0 → message; 1 → identify; >1 → selection.
  function beginLinkIdentify() {
    const { candidates } = extractUrls(draft.raw);
    if (candidates.length === 0) { setMessage('未识别到商品链接，可以重新粘贴或转手动创建。'); return; }
    if (candidates.length === 1) { void identifyLink(candidates[0]); return; }
    setUrlCandidates(candidates);
  }

  async function identifyLink(selectedUrl: string) {
    setBusy('extract'); setMessage('');
    try {
      const result = await json<{ status?: string; urlCandidates?: string[]; selectedUrl?: string | null; snapshot?: ProductSnapshot; fallback?: boolean; sourceWarning?:string|null }>(
        await cloudBaseFetch('/api/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ source: { type: 'LINK', raw: draft.raw }, selectedUrl }) })
      );
      setUrlCandidates([]);
      if (result.snapshot) {
        setSnapshot(result.snapshot);
        setDraft(prev => ({
          ...prev,
          name: result.snapshot!.name || prev.name,
          price: result.snapshot!.price == null ? prev.price : String(result.snapshot!.price),
          type: canonicalWishType(result.snapshot!.type, result.snapshot!.category),
          brand: result.snapshot!.brand ?? prev.brand,
          skuLabel: result.snapshot!.skuLabel ?? prev.skuLabel,
          details: result.snapshot!.details ?? prev.details,
          productUrl: selectedUrl,
          sourcePlatform: result.snapshot!.sourcePlatform ?? prev.sourcePlatform,
          totalUnits:result.snapshot!.totalUnits==null?prev.totalUnits:String(result.snapshot!.totalUnits),
          usageFrequency:result.snapshot!.usageFrequency??prev.usageFrequency,
          expiryDate:result.snapshot!.expiryDate??prev.expiryDate,
          images:prev.images.length?prev.images:(result.snapshot!.images??[]),
        }));
      }
      setStep('confirm');
      setMessage(result.fallback ? '这次没能完整读取页面，已尽量整理分享文案，请逐项核对。' : result.sourceWarning ? `${result.sourceWarning}。结果主要来自分享文案，建议补一张截图核对。` : '页面信息已经整理好，请逐项核对。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '识别失败，请手动填写');
      setStep('confirm');
    } finally { setBusy(''); }
  }

  async function identifyScreenshot() {
    const cover = draft.images.find(img => img.isCover) ?? draft.images[0];
    if (!cover) { setMessage('请先添加至少一张截图。'); return; }
    setBusy('extract'); setMessage('');
    try {
      const result = await json<{ status?: string; snapshot?: ProductSnapshot; fallback?: boolean }>(
        await cloudBaseFetch('/api/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ source: { type: 'SCREENSHOT', raw: cover.url } }) })
      );
      if (result.snapshot) {
        setSnapshot(result.snapshot);
        setDraft(prev => ({
          ...prev,
          name: result.snapshot!.name || prev.name,
          price: result.snapshot!.price == null ? prev.price : String(result.snapshot!.price),
          type: canonicalWishType(result.snapshot!.type, result.snapshot!.category),
          brand: result.snapshot!.brand ?? prev.brand,
          skuLabel: result.snapshot!.skuLabel ?? prev.skuLabel,
          details: result.snapshot!.details ?? prev.details,
          totalUnits:result.snapshot!.totalUnits==null?prev.totalUnits:String(result.snapshot!.totalUnits),
          usageFrequency:result.snapshot!.usageFrequency??prev.usageFrequency,
          expiryDate:result.snapshot!.expiryDate??prev.expiryDate,
        }));
      }
      setStep('confirm');
      setMessage(result.fallback ? '这次没能完整识别截图，请手动补全。' : '截图信息已经整理好，请逐项核对。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '识别失败，请手动填写');
      setStep('confirm');
    } finally { setBusy(''); }
  }

  function confirm(event: FormEvent) {
    event.preventDefault();
    const name = draft.name.trim();
    const reason = draft.reason.trim();
    const concern = draft.concern.trim();
    if (!name || name.length > 80) { setMessage('请填写 1–80 字的名称。'); return; }
    if (!Number.isFinite(Number(draft.price)) || Number(draft.price) < 0 || Number(draft.price) > 99_999_999.99) { setMessage('请填写有效价格。'); return; }
    if (!reason || reason.length > 500) { setMessage('请填写 1–500 字的购买理由。'); return; }
    if (!concern || concern.length > 200) { setMessage('请填写或选择 1–200 字的最担心问题。'); return; }
    const freqOpts = usageFrequencyOptions[draft.type];
    setAnswers(previous=>({...previous,frequency:draft.usageFrequency||previous.frequency}));
    setQuestions([
      { id: 'frequency', prompt: '如果买下它，你最可能多久使用一次？', options: freqOpts, allowSkip: true },
      { id: 'constraint', prompt: '真正阻碍你使用它的条件是什么？', options: CONSTRAINT_OPTIONS, allowSkip: true, allowCustom: true, customMaxLength: 80 },
      { id: 'alternative', prompt: '有没有更小、更可逆的尝试方式？', options: ALTERNATIVE_OPTIONS, allowSkip: true },
    ]);
    setStep('clarify'); setMessage('');
  }

  async function createWish() {
    setBusy('create'); setMessage('');
    try {
      const payload = {
        sourceType: draft.sourceType,
        name: draft.name.trim(), price: Number(draft.price), type: draft.type, category:typeToCategory(draft.type),
        reason: draft.reason.trim(), concern: draft.concern.trim(),
        brand: draft.brand.trim(), skuLabel: draft.skuLabel.trim(), details: draft.details.trim(),
        productUrl: draft.productUrl || null, sourcePlatform: draft.sourcePlatform.trim(),
        images: draft.images.map((img, i) => ({ id: img.id, url: img.url, sortOrder: i, isCover: img.isCover })),
        usageFrequency: answers.frequency ?? draft.usageFrequency ?? null,totalUnits:draft.totalUnits?Number(draft.totalUnits):null,expiryDate:draft.expiryDate||null,
      };
      if (editRequest) {
        const output = await json<{ request: PurchaseRequest }>(
          await cloudBaseFetch('/api/data', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'update_request', requestId: editRequest.id, expectedRevision: editRequest.revision ?? 1, payload }) })
        );
        close(); onCreated(output.request, []);
      } else {
        const output = await json<{ request: PurchaseRequest; invites: ReviewInvite[] }>(
          await cloudBaseFetch('/api/data', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'create_request', payload }) })
        );
        close(); onCreated(output.request, output.invites);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存失败');
    } finally { setBusy(''); }
  }

  const relatedReflections=pastReflections.filter(item=>item.asset_type===assetTypeForWish(draft.type)).slice(0,2);
  const title = step === 'product' ? '选择心愿类型' : step === 'choose' || step === 'multi' ? '记下一个新心愿' : step === 'source' ? '导入商品信息' : step === 'confirm' ? '确认心愿信息' : '再想三个小问题';
  return <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="create-title"><button className={styles.scrim} onClick={close} aria-label="关闭创建窗口" /><section className={styles.sheet}>
    <header className={styles.sheetHeader}>{step === 'product' ? <span aria-hidden="true" /> : <button onClick={back} aria-label="返回"><Icon name="back" /></button>}<div><small>PLANT A WISH</small><h2 id="create-title">{title}</h2></div><button onClick={close} aria-label="关闭">×</button></header>

    {step === 'product' && (
      <div className={`${styles.createChoices} ${styles.productChoices}`}>
        <button onClick={() => setStep('choose')}><i>01</i><span><b>单个商品</b><small>记录一个明确想买的东西</small></span><Icon name="wish" size={18} /></button>
        <button onClick={startMulti}><i>02</i><span><b>多个商品</b><small>逐个上传图片并填写价格</small></span><Icon name="plus" size={18} /></button>
      </div>
    )}

    {step === 'choose' && (
      <div className={styles.createChoices}>
        <button onClick={() => start('LINK')}><i>01</i><span><b>从链接导入</b><small>读取商品页或分享文案</small></span><Icon name="external" size={17} /></button>
        <button onClick={() => start('MANUAL')}><i>02</i><span><b>手动创建</b><small>用选择和少量文字完成</small></span><Icon name="plus" size={18} /></button>
        <button onClick={() => start('SCREENSHOT')}><i>03</i><span><b>从截图导入</b><small>先整理画面信息，再由你确认</small></span><Icon name="sparkle" size={17} /></button>
      </div>
    )}

    {step === 'multi' && (
      <div className={styles.multiProductStep}>
        <div className={styles.multiProductList}>
          {multiItems.map((item, index) => (
            <div className={styles.multiProductRow} key={item.id}>
              <span className={styles.multiLetter}>{productLabel(index)}</span>
              <label className={styles.multiUpload}>
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (file) setMultiImage(item.id, file); event.target.value = ''; }} />
                {item.image ? <span className={styles.multiImagePreview} style={{ backgroundImage: `url(${item.image.url})` }} /> : <Icon name="camera" size={20} />}
                <b>{item.image ? '更换图片' : '上传图片'}</b>
              </label>
              <label className={styles.multiPrice}>
                <span>{multiRecognizing[item.id] ? '识别中…' : '价格（选填）'}</span>
                <input type="number" min="0" step="0.01" value={item.price} onChange={event => setMultiItems(prev => prev.map(target => target.id === item.id ? { ...target, price: event.target.value } : target))} placeholder="¥ 0" />
              </label>
              {multiItems.length > 1 && <button type="button" className={styles.multiRemove} onClick={() => removeMultiProduct(item.id)} aria-label={`删除商品 ${productLabel(index)}`}><Icon name="close" size={16} /></button>}
              <details className={styles.multiDetail}>
                <summary>商品详情（选填）</summary>
                <div className={styles.multiDetailFields}>
                  <label><span>名称</span><input maxLength={80} value={item.name} onChange={event => setMultiItems(prev => prev.map(target => target.id === item.id ? { ...target, name: event.target.value } : target))} placeholder="如：小米电视 65 英寸" /></label>
                  <label><span>品牌</span><input maxLength={80} value={item.brand} onChange={event => setMultiItems(prev => prev.map(target => target.id === item.id ? { ...target, brand: event.target.value } : target))} placeholder="如：小米" /></label>
                </div>
              </details>
            </div>
          ))}
        </div>
        <button type="button" className={styles.multiAddButton} onClick={addMultiProduct}><Icon name="plus" size={18} />添加商品</button>
        <label className={styles.multiNote}>
          <span>想请朋友帮你看什么？</span>
          <textarea
            rows={4}
            maxLength={500}
            value={draft.reason}
            onChange={event => setDraft(prev => ({ ...prev, reason: event.target.value }))}
            placeholder="比如：我更喜欢 A 的样子，但 B 好像更实用；也可以写你纠结预算、使用频率、送礼合不合适。"
          />
        </label>
        <button className={styles.primary} disabled={busy === 'create' || Object.values(multiRecognizing).some(Boolean)} onClick={() => void continueMulti()}>{busy === 'create' ? '正在种下…' : '继续'}</button>
      </div>
    )}

    {step === 'source' && (
      <div className={styles.sourceStep}>
        {draft.sourceType === 'LINK' ? (
          urlCandidates.length > 1 ? (
            <div>
              <span>检测到多个链接，请选择一个</span>
              <div className={styles.chips}>
                {urlCandidates.map(url => <button key={url} type="button" className={styles.chipActive} onClick={() => void identifyLink(url)}>{url.replace(/^https?:\/\//, '').slice(0, 40)}</button>)}
              </div>
            </div>
          ) : (
            <label><span>商品链接或分享文案</span><textarea autoFocus rows={6} value={draft.raw} onChange={event => setDraft(prev => ({ ...prev, raw: event.target.value }))} placeholder="粘贴淘宝、京东、拼多多、美团等分享内容" /></label>
          )
        ) : (
          <div>
            <label className={styles.upload}><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e: ChangeEvent<HTMLInputElement>) => { const files = Array.from(e.target.files ?? []); for (const f of files) addImage(f); e.target.value = ''; }} />{draft.images.length === 0 ? <><Icon name="sparkle" size={30} /><b>选择商品截图</b><span>支持 JPG、PNG、WebP，最多 6 张；第一张默认为封面</span></> : <b>继续添加截图</b>}</label>
            {draft.images.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 8 }}>
                {draft.images.map(img => (
                  <div key={img.id} style={{ position: 'relative' }}>
                    <img src={img.url} alt="" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 10, border: img.isCover ? '2px solid #e6b328' : '1px solid #e5e6eb' }} />
                    {img.isCover && <small style={{ position: 'absolute', top: 4, left: 4, background: '#fff2a8', borderRadius: 6, padding: '1px 5px' }}>封面</small>}
                    <button type="button" onClick={() => removeImage(img.id)} style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,.5)', color: '#fff', border: 0, borderRadius: '50%', width: 20, height: 20, cursor: 'pointer' }}>×</button>
                    {!img.isCover && <button type="button" onClick={() => setCover(img.id)} style={{ position: 'absolute', bottom: 4, right: 4, background: '#fff', border: '1px solid #e5e6eb', borderRadius: 6, fontSize: 10, padding: '1px 5px', cursor: 'pointer' }}>设封面</button>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <button className={styles.primary} disabled={busy === 'extract' || (draft.sourceType === 'LINK' ? !draft.raw : draft.images.length === 0)} onClick={() => draft.sourceType === 'LINK' ? beginLinkIdentify() : void identifyScreenshot()}>
          {busy === 'extract' ? '正在识别…' : '开始识别'}
        </button>
      </div>
    )}

    {step === 'confirm' && (
      <form className={styles.form} onSubmit={confirm}>
        {snapshot && <div className={styles.aiNotice}><b>识别结果</b><span>把握 {Math.round(snapshot.confidence * 100)}% · 请核对</span></div>}
        <label><span>它是什么 *</span><input value={draft.name} maxLength={80} onChange={event => setDraft(prev => ({ ...prev, name: event.target.value }))} placeholder="例如：十二节现代舞训练课" /></label>
        <div className={styles.formPair}>
          <label><span>价格 *</span><input type="number" min="0" step="0.01" value={draft.price} onChange={event => setDraft(prev => ({ ...prev, price: event.target.value }))} placeholder="¥ 0" /></label>
          <label><span>类型 *</span><select value={draft.type} onChange={event => { const t = event.target.value as WishType; setDraft(prev => ({ ...prev, type: t, usageFrequency: usageFrequencyOptions[t].includes(prev.usageFrequency) ? prev.usageFrequency : '' })); }}><option value="" disabled>请选择</option>{WISH_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
        </div>
        <label><span>为什么想要它？ *</span><textarea rows={3} maxLength={500} value={draft.reason} onChange={event => setDraft(prev => ({ ...prev, reason: event.target.value }))} placeholder="先说最真实的理由" /></label>
        <label><span>最担心什么？ *</span><input maxLength={200} value={draft.concern} onChange={event => setDraft(prev => ({ ...prev, concern: event.target.value }))} placeholder="例如：戴久不舒服 / 坚持不下来" />
          <div className={styles.chips} style={{ marginTop: 6 }}>{['坚持不下来', '预算压力', '不适合自己', '买完闲置'].map(item => <button type="button" className={draft.concern === item ? styles.chipActive : ''} key={item} onClick={() => setDraft(prev => ({ ...prev, concern: item }))}>{item}</button>)}</div>
        </label>
        <div className={styles.formPair}>{draft.type==='COURSE_TRAINING'&&<label><span>总次数 / 节数</span><input type="number" min="1" value={draft.totalUnits} onChange={event=>setDraft(prev=>({...prev,totalUnits:event.target.value}))} placeholder="例如 12"/></label>}<label><span>有效期</span><input type="date" value={draft.expiryDate} onChange={event=>setDraft(prev=>({...prev,expiryDate:event.target.value}))}/></label></div>
        {!editRequest&&relatedReflections.length>0&&<aside className={styles.historyReminder}><b>你以前留下过类似体验</b>{relatedReflections.map(item=><p key={item.id}><span>{item.asset_name} · {REFLECTION_FEELING_LABELS[item.feeling]}</span>{item.note}</p>)}<small>这不是结论，只是把过去的真实使用感受放回眼前。</small></aside>}
        <details style={{ marginTop: 8 }}>
          <summary style={{ cursor: 'pointer', fontSize: 13, color: '#646a73' }}>更多选填字段（品牌 / 规格 / 详情 / 来源）</summary>
          <div className={styles.formPair} style={{ marginTop: 8 }}>
            <label><span>品牌</span><input maxLength={80} value={draft.brand} onChange={event => setDraft(prev => ({ ...prev, brand: event.target.value }))} placeholder="选填" /></label>
            <label><span>规格 / SKU</span><input maxLength={120} value={draft.skuLabel} onChange={event => setDraft(prev => ({ ...prev, skuLabel: event.target.value }))} placeholder="选填" /></label>
          </div>
          <label style={{ marginTop: 8 }}><span>详情</span><textarea rows={2} maxLength={2000} value={draft.details} onChange={event => setDraft(prev => ({ ...prev, details: event.target.value }))} placeholder="选填，补充说明" /></label>
          {draft.sourceType === 'LINK' && <label style={{ marginTop: 8 }}><span>商品链接</span><input value={draft.productUrl} onChange={event => setDraft(prev => ({ ...prev, productUrl: event.target.value }))} placeholder="已从导入识别" /></label>}
          <label style={{ marginTop: 8 }}><span>来源平台</span><input maxLength={40} value={draft.sourcePlatform} onChange={event => setDraft(prev => ({ ...prev, sourcePlatform: event.target.value }))} placeholder="选填，如淘宝 / 京东" /></label>
        </details>
        <div style={{ marginTop: 10 }}>
            <span style={{ fontSize: 13, color: '#646a73' }}>图片（选填，{draft.images.length}/6）</span>
            <label className={styles.upload} style={{minHeight:72,marginTop:6}}><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event:ChangeEvent<HTMLInputElement>)=>{for(const file of Array.from(event.target.files??[]))addImage(file);event.target.value=''}}/><Icon name="camera" size={22}/><b>{draft.images.length?'继续添加':'添加商品图或实拍图'}</b><span>没有图片也可以继续，系统会显示对应类型图标</span></label>
            {draft.images.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 6 }}>
              {draft.images.map(img => (
                <div key={img.id} style={{ position: 'relative' }}>
                  <img src={img.url} alt="" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 8, border: img.isCover ? '2px solid #e6b328' : '1px solid #e5e6eb' }} />
                  {!img.isCover && <button type="button" onClick={() => setCover(img.id)} style={{ position: 'absolute', bottom: 3, right: 3, background: '#fff', border: '1px solid #e5e6eb', borderRadius: 5, fontSize: 9, padding: '1px 4px', cursor: 'pointer' }}>封面</button>}
                  <button type="button" onClick={() => removeImage(img.id)} style={{ position: 'absolute', top: 3, right: 3, background: 'rgba(0,0,0,.5)', color: '#fff', border: 0, borderRadius: '50%', width: 18, height: 18, cursor: 'pointer', fontSize: 11 }}>×</button>
                </div>
              ))}
            </div>
            )}
          </div>
        <button className={styles.primary}>继续</button>
      </form>
    )}

    {step === 'clarify' && (
      <div className={styles.clarify}>
        {questions.map((question, index) => (
          <fieldset key={question.id}>
            <legend><i>0{index + 1}</i>{question.prompt}</legend>
            <div>
              {question.options.map(option => (
                <button key={option} className={answers[question.id] === option ? styles.answerActive : ''} onClick={() => setAnswers(prev => ({ ...prev, [question.id]: option }))}>{option}</button>
              ))}
            </div>
            {question.allowCustom && answers[question.id] === '其他原因' && (
              <input maxLength={question.customMaxLength ?? 80} value={customText[question.id] ?? ''} onChange={event => setCustomText(prev => ({ ...prev, [question.id]: event.target.value }))} placeholder="请简要说明（最多 80 字）" style={{ width: '100%', marginTop: 8, padding: 8, border: '1px solid #dfe1e5', borderRadius: 10 }} />
            )}
            {question.allowSkip && (
              <button type="button" className={answers[question.id] === null ? styles.answerActive : ''} style={{ marginTop: 8, display: 'block', background: 'none', border: '1px dashed #c9ccd2', borderRadius: 10, padding: '6px 12px', color: '#646a73', cursor: 'pointer' }} onClick={() => setAnswers(prev => ({ ...prev, [question.id]: null }))}>暂时跳过</button>
            )}
          </fieldset>
        ))}
        <button className={styles.primary} disabled={busy === 'create'} onClick={() => void createWish()}>{busy === 'create' ? '正在种下…' : '种下这个心愿'}</button>
      </div>
    )}

    {message && <p className={styles.sheetMessage} role="status">{message}</p>}
  </section></div>;
}
