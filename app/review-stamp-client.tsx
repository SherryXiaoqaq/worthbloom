'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { ReviewRole, ReviewStamp, ReviewLinkState, WishImage, WishType } from '@/lib/types';
import { typeToCategory } from '@/lib/wish-compat';
import { cloudBaseFetch } from '@/lib/cloudbase/client';
import styles from './review-stamp-v2.module.css';

type ReviewWish = { id:string; name:string; price:number; reason:string; concern?:string; type?:WishType; brand?:string; skuLabel?:string; details?:string; sourcePlatform?:string; productUrl?:string|null; images?:WishImage[]; revision?:number };

const roles:Array<{id:ReviewRole;label:string;note:string}>=[{id:'KNOWS_YOU',label:'我了解她',note:'更懂她是否适合、能否坚持'},{id:'USED_IT',label:'我体验过',note:'更懂产品真实体验和隐藏条件'},{id:'BOTH',label:'两者都是',note:'既了解她，也体验过'}];
const stamps:Array<{id:ReviewStamp;label:string;note:string}>=[{id:'FITS',label:'适合她',note:'这件事和她很匹配'},{id:'CONDITIONAL',label:'有条件',note:'满足一些条件就值得'},{id:'WAIT',label:'先等等',note:'现在还不是最好时机'},{id:'NOT_FIT',label:'不太适合',note:'可能不是她真正需要的'},{id:'NEED_INFO',label:'信息不足',note:'还缺一个关键答案'}];
const reasons=['她是真的喜欢','可能坚持下来','使用频率会很高','预算需要准备','最近时间不够','可以先试用','有更合适替代','隐藏成本要确认'];

const LINK_STATE_COPY:Record<string,string>={USED:'这张链接已经停止收集',REVOKED:'这张链接已被关闭',REQUEST_DECIDED:'这个心愿已经完成决定',EXPIRED:'这张链接已过期'};
const CTA_TEXT='如果你也经常面对选择困难，可以登录或注册好好花，把自己的犹豫整理成一个清楚的决定。';

export default function ReviewStampClient(){
  const params=useParams<{token:string}>();const token=params?.token||'';
  const [wish,setWish]=useState<ReviewWish|null>(null);
  const [linkState,setLinkState]=useState<ReviewLinkState>('ACTIVE');
  const [role,setRole]=useState<ReviewRole|null>(null);const [stamp,setStamp]=useState<ReviewStamp|null>(null);const [picked,setPicked]=useState<string[]>([]);const [name,setName]=useState('');const [note,setNote]=useState('');
  const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [done,setDone]=useState(false);const [stamping,setStamping]=useState(false);
  const [claimResult,setClaimResult]=useState<{points:number|null;claimed:boolean;reason:string|null}|null>(null);
  const [claimCredentials,setClaimCredentials]=useState<{reviewId:string;claimToken:string}|null>(null);
  const [imgIndex,setImgIndex]=useState(0);

  useEffect(()=>{let mounted=true;if(!token)return;async function load(){await Promise.resolve();try{const saved=sessionStorage.getItem(`wb-review-claim:${token}`);if(saved){const credentials=JSON.parse(saved) as {reviewId?:string;claimToken?:string};if(credentials.reviewId&&credentials.claimToken){if(mounted){setClaimCredentials({reviewId:credentials.reviewId,claimToken:credentials.claimToken});setDone(true);setLoading(false)}return}}}catch{/* 继续加载邀请 */}fetch(`/api/review?token=${encodeURIComponent(token)}`,{cache:'no-store'}).then(async response=>{const data=await response.json() as {request?:ReviewWish;ownerDisplay?:{nickname?:string}|null;linkState?:ReviewLinkState;error?:string;code?:string};if(!response.ok||!data.request){const ls=data.linkState||'EXPIRED';throw Object.assign(new Error(data.error||'链接无法打开'),{linkState:ls});}if(mounted){setWish(data.request);setLinkState(data.linkState||'ACTIVE')}}).catch(reason=>{if(mounted){const ls=(reason as {linkState?:ReviewLinkState})?.linkState||'EXPIRED';setLinkState(ls);setError(reason instanceof Error?reason.message:'加载失败')}}).finally(()=>{if(mounted)setLoading(false)})}void load();return()=>{mounted=false}},[token]);

  function toggle(reason:string){setPicked(previous=>previous.includes(reason)?previous.filter(item=>item!==reason):previous.length<2?[...previous,reason]:[previous[1],reason])}
  function chooseStamp(value:ReviewStamp){setStamp(value);setStamping(true);navigator.vibrate?.(35);setTimeout(()=>setStamping(false),380)}

  async function submit(event:FormEvent){event.preventDefault();if(!role||!stamp||!picked.length){setError('请先选择你的身份、判断章和至少一个理由。');return}setBusy(true);setError('');try{const response=await fetch('/api/review',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token,reviewerName:name.trim()||'匿名朋友',reviewerRole:role,stamp,reasons:picked,note})});const data=await response.json() as {reviewId?:string;claimToken?:string;error?:string;code?:string};if(!response.ok)throw new Error(data.error||'提交失败');if(!data.reviewId||!data.claimToken)throw new Error('反馈已提交，但认领凭据缺失，请联系心愿主人。');const credentials={reviewId:data.reviewId,claimToken:data.claimToken};setClaimCredentials(credentials);sessionStorage.setItem(`wb-review-claim:${token}`,JSON.stringify(credentials));setDone(true)}catch(reason){setError(reason instanceof Error?reason.message:'提交失败')}finally{setBusy(false)}}

  async function tryClaim(){if(!claimCredentials){setClaimResult({claimed:false,points:null,reason:'认领凭据缺失'});return}setBusy(true);try{const response=await cloudBaseFetch('/api/review/claim',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(claimCredentials)});const data=await response.json() as {pointsAwarded?:number;code?:string;error?:string};if(response.ok){setClaimResult({claimed:true,points:data.pointsAwarded??null,reason:null});sessionStorage.removeItem(`wb-review-claim:${token}`)}else if(data.code==='AUTH_REQUIRED')setClaimResult({claimed:false,points:null,reason:'请先登录，再返回本页认领好好值'});else setClaimResult({claimed:false,points:null,reason:data.error||'认领失败'})}catch{setClaimResult({claimed:false,points:null,reason:'认领失败，请稍后重试'})}finally{setBusy(false)}}

  if(loading)return <main className={styles.stage}><section className={styles.card}>愿望正在展开…</section></main>;
  if((error&&!wish)||linkState!=='ACTIVE')return <main className={styles.stage}><section className={styles.card}><span className={styles.brand}>WORTHBLOOM · 好好花</span><h1>这张邀请卡已经合上</h1><p>{error||LINK_STATE_COPY[linkState]||'链接已失效'}</p><small>心愿主人完成决定或关闭征集后，这个链接会停止收集回信。</small></section></main>;
  if(done)return <main className={styles.stage}><section className={`${styles.card} ${styles.thanks}`}><div className={styles.seal}>收到</div><span className={styles.brand}>你的视角已经送达</span><h1>谢谢你认真看完，<br/>决定仍然属于她。</h1><p>你不会看到群聊里其他人的回答；同一链接仍可以由其他朋友独立填写。</p><p className={styles.cta}>{CTA_TEXT}</p>{!claimResult?.claimed&&<button type="button" className={styles.submit} disabled={busy||!claimCredentials} onClick={()=>void tryClaim()}>{busy?'正在认领…':'登录后认领好好值'}</button>}{claimResult?.claimed&&<small className={styles.claimOk}>已认领 {claimResult.points} 好好值</small>}{claimResult&&!claimResult.claimed&&claimResult.reason&&<small className={styles.claimHint}>{claimResult.reason}</small>}<Link className={styles.claimHome} href="/">前往好好花登录或注册</Link></section></main>;

  const images=wish?.images??[];const clampIndex=(n:number)=>Math.max(0,Math.min(n,Math.max(0,images.length-1)));
  const carousel=(<div className={styles.wishImage}>{images.length===0?<span className={styles.wishPlaceholder}>心愿</span>:<><img src={images[clampIndex(imgIndex)].url} alt={wish?.name||''}/>{images.length>1&&<><button type="button" className={styles.carouselPrev} onClick={()=>setImgIndex(i=>clampIndex(i-1))} aria-label="上一张">‹</button><button type="button" className={styles.carouselNext} onClick={()=>setImgIndex(i=>clampIndex(i+1))} aria-label="下一张">›</button><span className={styles.carouselDots}>{clampIndex(imgIndex)+1} / {images.length}</span></>}</>}</div>);

  return <main className={styles.stage}><div className={styles.shell}><header><span className={styles.brand}>WORTHBLOOM · 一封只给你的心愿卡</span><small>无需注册 · 看不到其他人的回答</small></header>
    {wish&&<>
      <section className={styles.wish}>{carousel}
        <span>{typeToCategory(wish.type)}</span><h1>{wish.name}</h1><b>¥{wish.price.toLocaleString()}</b><blockquote>“{wish.reason}”</blockquote>{wish.concern&&<p>她最担心：{wish.concern}</p>}
        {(wish.brand||wish.skuLabel||wish.details||wish.sourcePlatform||wish.productUrl)&&<details className={styles.detailFold}><summary>详情</summary><div className={styles.detailGrid}><span>品牌：{wish.brand||'—'}</span><span>规格：{wish.skuLabel||'—'}</span><span>来源：{wish.sourcePlatform||'—'}</span>{wish.details&&<p>{wish.details}</p>}{wish.productUrl&&<a href={wish.productUrl} target="_blank" rel="noreferrer">查看原商品</a>}</div></details>}
      </section>
      <form onSubmit={submit}>
        <section className={styles.step}><i>01</i><h2>你从哪个角度了解这件事？</h2><div className={styles.roles}>{roles.map(item=><button type="button" className={role===item.id?styles.selected:''} key={item.id} onClick={()=>setRole(item.id)}><b>{item.label}</b><span>{item.note}</span></button>)}</div></section>
        <section className={styles.step}><i>02</i><h2>盖下你此刻的判断</h2><p>这不是批准或驳回，只是给她一个真实视角。</p><div className={styles.stamps}>{stamps.map(item=><button type="button" className={`${stamp===item.id?styles.stampSelected:''} ${stamp===item.id&&stamping?styles.stamping:''}`} key={item.id} onClick={()=>chooseStamp(item.id)}><b>{item.label}</b><span>{item.note}</span></button>)}</div></section>
        <section className={styles.step}><i>03</i><h2>为什么这样判断？</h2><p>选 1–2 个最关键的理由就够了。</p><div className={styles.reasons}>{reasons.map(item=><button type="button" className={picked.includes(item)?styles.selected:''} key={item} onClick={()=>toggle(item)}>{item}</button>)}</div><label><span>想再补一句，可以写在这里</span><textarea maxLength={80} rows={3} value={note} onChange={event=>setNote(event.target.value)} placeholder="选填，最多 80 字"/></label><label><span>你的昵称</span><input maxLength={20} value={name} onChange={event=>setName(event.target.value)} placeholder="选填，默认匿名朋友"/></label></section>
        {error&&<p className={styles.error}>{error}</p>}
        <button className={styles.submit} disabled={busy}>{busy?'正在送出…':'把这个视角送给她'}</button>
      </form>
    </>}
  </div></main>;
}
