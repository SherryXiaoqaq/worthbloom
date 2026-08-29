'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { AgentMessage, AgentProfileId, AgentReport, AgentSession, AgentSuggestion, EvidenceItem, PurchaseRequest } from '@/lib/types';
import { cloudBaseFetch } from '@/lib/cloudbase/client';
import styles from './worthbloom-v2.module.css';

const PROFILES:{id:AgentProfileId;name:string;short:string;description:string}[]=[
  {id:'QUICK_DECISION',name:'快速决策顾问',short:'快',description:'三问找到当前更偏向哪边'},
  {id:'RATIONAL_ANALYST',name:'理性分析顾问',short:'理',description:'预算、频率、替代和机会成本'},
  {id:'REVIEW_SYNTHESIZER',name:'回信分析顾问',short:'信',description:'看见回信里的共识与分歧'},
  {id:'NAVAL_LENS',name:'专家顾问',short:'纳',description:'长期收益、冷静期与直觉信号'},
];
const PROFILE_NAME=Object.fromEntries(PROFILES.map(item=>[item.id,item.name])) as Record<AgentProfileId,string>;
const REPORT_GROUPS:{key:keyof AgentReport;label:string}[]=[{key:'confirmedFacts',label:'已确认事实'},{key:'motives',label:'你的动机'},{key:'signalsForPurchase',label:'支持行动的信号'},{key:'signalsForWaiting',label:'支持等待的信号'},{key:'unknowns',label:'仍然未知'},{key:'humanConsensus',label:'朋友共识'},{key:'humanDisagreements',label:'朋友分歧'}];
const SOURCE_LABEL:Record<string,string>={WISH_FACT:'心愿事实',USER_ANSWER:'你的回答',HUMAN_REVIEW:'真人回信',AI_INFERENCE:'AI 推断'};
type SessionSummary={id:string;mode:'SINGLE'|'ROUNDTABLE';agentProfileId:AgentProfileId;status:AgentSession['status'];summary:string;updatedAt:string;requestRevision:number;stale?:boolean};

async function json<T>(response:Response){const data=await response.json() as T&{error?:string};if(!response.ok)throw new Error(data.error||'操作失败');return data}
const api=<T,>(body:Record<string,unknown>)=>cloudBaseFetch('/api/agent',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}).then(json<T>);

function EvidenceList({items}:{items:EvidenceItem[]}){return items.length?<ul className={styles.evidenceList}>{items.map(item=><li key={item.id}><small className={styles.evidenceSource}>{SOURCE_LABEL[item.source]||item.source}</small><span>{item.text}</span></li>)}</ul>:null}
function Report({report}:{report:AgentReport}){const conclusion=report.workingConclusion||{direction:'COLLECT_MORE_INFO' as const,summary:'这份历史报告没有保存阶段判断，请结合下方证据自行确认。'},label=conclusion.direction==='MOVE_FORWARD'?'更偏向继续推进':conclusion.direction==='PAUSE'?'更偏向先暂停':'还需要补一条信息';return <section className={styles.agentReport}><header><span>当前判断</span><b>{report.generatedBy==='MODEL'?'AI 模型':'演示逻辑'}</b></header><div className={styles.workingConclusion}><small>{label}</small><p>{conclusion.summary}</p></div>{REPORT_GROUPS.map(group=>{const items=report[group.key] as EvidenceItem[];return items.length?<div key={group.key} className={styles.reportGroup}><h3>{group.label}</h3><EvidenceList items={items}/></div>:null})}<p className={styles.reportDisclaimer}>{report.disclaimer}</p></section>}

function Chat({request,wish,revision,profileId,embedded=false,selectedSessionId,newChatNonce,onSessionChange,onProfileMention,draft,onDraftChange}:{request:PurchaseRequest;wish:{name:string;price:number;concern?:string|null;reason:string};revision:number;profileId:AgentProfileId;embedded?:boolean;selectedSessionId?:string;newChatNonce?:number;onSessionChange?:(session:AgentSession)=>void;onProfileMention?:(profile:AgentProfileId)=>void;draft?:string;onDraftChange?:(value:string)=>void}){
  const requestId=request.id;
  const [session,setSession]=useState<AgentSession|null>(null),[busy,setBusy]=useState(''),[error,setError]=useState(''),[ready,setReady]=useState(false),[loading,setLoading]=useState(true);
  const messageEnd=useRef<HTMLDivElement>(null),listRef=useRef<HTMLDivElement>(null),atBottom=useRef(true),lastFailedSend=useRef<{mid:string;answer:string;skipped:boolean}|null>(null);
  const answer=draft??'',setAnswer=(value:string)=>onDraftChange?onDraftChange(value):undefined;
  useEffect(()=>{let active=true;
    // 无历史时不自动 start（避免一次 LLM 首问调用）：先 load 找现存会话，
    // 没有就呈现空态引导，由用户显式点「开始对话」再触发 LLM。
    const body=selectedSessionId?{action:'load_session',sessionId:selectedSessionId}:{action:'load',requestId,expectedRevision:revision,profileId,mode:'SINGLE',forceNew:Boolean(newChatNonce)};
    void api<{session:AgentSession|null;readyToComplete:boolean}>(body).then(result=>{if(active){setSession(result.session);setReady(result.readyToComplete)}}).catch(reason=>active&&setError(reason instanceof Error?reason.message:'无法打开对话')).finally(()=>active&&setLoading(false));return()=>{active=false}},[requestId,revision,profileId,selectedSessionId,newChatNonce]);
  useEffect(()=>{if(atBottom.current)messageEnd.current?.scrollIntoView({behavior:'smooth',block:'nearest'})},[session?.messages.length,busy]);
  function update(next:AgentSession,nextReady=false){setSession(next);setReady(nextReady);onSessionChange?.(next)}
  async function send(skip=false){if(!session||(!skip&&!answer.trim()))return;setBusy('reply');setError('');
    const previous=lastFailedSend.current,reuse=previous&&previous.skipped===skip&&previous.answer===(skip?'':answer.trim()),mid=reuse?previous.mid:crypto.randomUUID(),sentAnswer=skip?'':answer.trim();
    // 乐观更新：用户消息立即上屏，不等 LLM 轮次返回
    const optimisticMessage:AgentMessage={id:`local-${mid}`,role:'USER',content:sentAnswer,skipped:skip,agentProfileId:session.agentProfileId,payload:{clientMessageId:mid} as AgentMessage['payload'],createdAt:new Date().toISOString()};
    setSession({...session,messages:[...session.messages,optimisticMessage]});setAnswer('');
    try{
      const result=await api<{session:AgentSession;readyToComplete:boolean;duplicate?:boolean}>({action:'reply',sessionId:session.id,answer:sentAnswer,skipped:skip,clientMessageId:mid});
      update(result.session,result.readyToComplete);lastFailedSend.current=null;
    }catch(reason){
      // 失败回滚乐观消息，恢复输入框内容供重试
      setSession(current=>current?{...current,messages:current.messages.filter(m=>m.id!==optimisticMessage.id)}:current);
      setAnswer(sentAnswer);
      lastFailedSend.current={mid,answer:sentAnswer,skipped:skip};setError(reason instanceof Error?reason.message:'发送失败');
    }finally{setBusy('')}}

  async function report(){if(!session)return;setBusy('report');setError('');try{const result=await api<{session:AgentSession}>({action:'generate_report',sessionId:session.id});update(result.session)}catch(reason){setError(reason instanceof Error?reason.message:'报告生成失败')}finally{setBusy('')}}
  async function pause(){if(!session)return;setBusy('pause');try{const result=await api<{session:AgentSession}>({action:'pause_session',sessionId:session.id});update(result.session)}catch(reason){setError(reason instanceof Error?reason.message:'保存失败')}finally{setBusy('')}}
  async function restartLatest(){setBusy('start');setError('');try{const result=await api<{session:AgentSession;readyToComplete:boolean}>({action:'start_session',requestId,expectedRevision:revision,profileId,mode:'SINGLE',forceNew:true});update(result.session,result.readyToComplete);setAnswer('')}catch(reason){setError(reason instanceof Error?reason.message:'无法开始新对话')}finally{setBusy('')}}
  async function startFirst(){setBusy('start');setError('');try{const result=await api<{session:AgentSession;readyToComplete:boolean}>({action:'start_session',requestId,expectedRevision:revision,profileId,mode:'SINGLE',forceNew:true});update(result.session,result.readyToComplete)}catch(reason){setError(reason instanceof Error?reason.message:'无法开始对话')}finally{setBusy('')}}
  function choose(item:AgentSuggestion){if(item.intent==='GENERATE_REPORT'){void report();return}setAnswer(item.intent==='SKIP'?'暂不确定':item.value||item.label)}
  function changeAnswer(value:string){const matched=PROFILES.find(item=>value.trim()===`@${item.name}`);if(matched&&onProfileMention){onProfileMention(matched.id);setAnswer('');return}setAnswer(value)}
  if(loading)return <section className={`${styles.agentPanel} ${embedded?styles.agentEmbedded:''}`}><div className={styles.agentLoading}><i/><span>正在找回这次对话…</span></div></section>;
  if(error&&!session)return <section className={styles.agentPanel}><div className={styles.agentError}><b>对话暂时没有打开</b><p>{error}</p><button onClick={()=>location.reload()}>重新加载</button></div></section>;
  if(!session)return <section className={`${styles.agentPanel} ${embedded?styles.agentEmbedded:''}`}>
    <div className={styles.agentEmptyState}>
      {busy==='start'&&<div className={styles.agentTyping}><i/><i/><i/></div>}
      <div className={styles.agentEmptyWish}><b>{wish.name}</b><span>¥{wish.price.toLocaleString()}{wish.concern?` · 最担心：${wish.concern}`:''}</span><p>{wish.reason}</p></div>
      <h3>还没有和{PROFILE_NAME[profileId]}聊过这次心愿</h3>
      <p>{PROFILES.find(item=>item.id===profileId)?.description}。开启对话后，顾问会结合心愿事实，一次问一个关键问题。</p>
      <button className={styles.agentReportAction} disabled={busy==='start'} onClick={()=>void startFirst()}>{busy==='start'?'顾问正在想第一个问题…':`和${PROFILE_NAME[profileId]}聊聊`}</button>
    </div>
    {error&&<p className={styles.agentInlineError}>{error}</p>}
  </section>;
  if(session.status==='COMPLETED'&&session.report)return <Report report={session.report}/>;
  const stale=session.requestRevision!==revision,suggestions=stale?[]:session.messages.at(-1)?.payload?.suggestions||[];
  if(stale)return <section className={`${styles.agentPanel} ${embedded?styles.agentEmbedded:''}`}>
    <div className={styles.agentStaleBadge}>这段对话基于旧版本心愿（v{session.requestRevision}），仅供回看。</div>
    <div className={styles.agentMessages} aria-live="polite" ref={listRef}>{session.messages.map(message=><article key={message.id} className={message.role==='USER'?styles.msgUser:styles.msgAssistant}>{message.role==='ASSISTANT'&&<small>{PROFILE_NAME[message.agentProfileId||session.agentProfileId]}{message.payload?.generatedBy==='RULE_FALLBACK'?' · 演示逻辑':''}</small>}<p>{message.skipped?'暂不确定':message.content}</p></article>)}<div ref={messageEnd}/></div>
    <button className={styles.agentReportAction} disabled={!!busy} onClick={()=>void restartLatest()}>{busy==='start'?'正在开始…':'基于最新版本开始新对话'}</button>
    {error&&<p className={styles.agentInlineError}>{error}</p>}
  </section>;
  return <section className={`${styles.agentPanel} ${embedded?styles.agentEmbedded:''}`}>
    {embedded&&<div className={styles.quickAgentIntro}><span>约 1 分钟</span><div><b>回答 3 个关键问题</b><p>只问会改变判断的信息，跳过也会被记为未知。</p></div></div>}
    <div className={styles.agentMessages} aria-live="polite" ref={listRef} onScroll={()=>{const el=listRef.current;if(el)atBottom.current=el.scrollHeight-el.scrollTop-el.clientHeight<80}}>{session.messages.map(message=><article key={message.id} className={message.role==='USER'?styles.msgUser:styles.msgAssistant}>{message.role==='ASSISTANT'&&<small>{PROFILE_NAME[message.agentProfileId||session.agentProfileId]}{message.payload?.generatedBy==='RULE_FALLBACK'?(message.payload?.degraded?' · AI 暂不可用，已用预设问题':' · 演示逻辑'):''}</small>}<p>{message.skipped?'暂不确定':message.content}</p></article>)}{busy==='reply'&&<div className={styles.agentTyping}><i/><i/><i/></div>}<div ref={messageEnd}/></div>
    {suggestions.length>0&&<div className={styles.agentSuggestions}>{suggestions.map(item=><button key={item.id} onClick={()=>choose(item)}>{item.label}</button>)}</div>}
    <div className={styles.agentComposer}><textarea rows={2} value={answer} onChange={event=>changeAnswer(event.target.value)} placeholder={session.status==='PAUSED'?'继续输入即可恢复对话':'说说真实想法；输入 @顾问名称 可切换'} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&typeof window!=='undefined'&&!window.matchMedia('(pointer:coarse)').matches){event.preventDefault();if(answer.trim()&&!busy)void send()}}}/><div><button className={styles.agentQuietAction} onClick={()=>void pause()} disabled={!!busy}>先放一放</button>{ready&&<button className={styles.agentReportAction} onClick={()=>void report()} disabled={!!busy}>{busy==='report'?'整理中…':'生成报告'}</button>}<button className={styles.agentSend} aria-label="发送" onClick={()=>void send()} disabled={!!busy||!answer.trim()}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5m0 0-6 6m6-6 6 6"/></svg></button></div></div>
    {error&&<p className={styles.agentInlineError}>{error}</p>}
  </section>;
}

export function AgentPanel({request,revision}:{request:PurchaseRequest;revision:number}){const wish={name:request.name,price:request.price,concern:request.concern,reason:request.reason};return <Chat request={request} wish={wish} revision={revision} profileId="QUICK_DECISION" embedded/>}

export function AgentCouncil({request,hasReviews,historyTrigger=0}:{request:PurchaseRequest;hasReviews:boolean;historyTrigger?:number}){
  const [profileId,setProfileId]=useState<AgentProfileId>('QUICK_DECISION'),[view,setView]=useState<'SINGLE'|'ROUNDTABLE'>('SINGLE'),[history,setHistory]=useState<SessionSummary[]>([]),[closedHistoryTrigger,setClosedHistoryTrigger]=useState(0),[selectedSession,setSelectedSession]=useState<string|undefined>(),[newChatNonce,setNewChatNonce]=useState(0);
  const [roundProfiles,setRoundProfiles]=useState<AgentProfileId[]>(['QUICK_DECISION','RATIONAL_ANALYST']),[topic,setTopic]=useState('我现在最需要看清楚的冲突是什么？'),[roundSession,setRoundSession]=useState<AgentSession|null>(null),[roundFollowup,setRoundFollowup]=useState(''),[roundBusy,setRoundBusy]=useState(false),[error,setError]=useState('');
  // 每个 profile 一份草稿：切顾问/切会话不打断正在输入的内容
  const [drafts,setDrafts]=useState<Partial<Record<AgentProfileId,string>>>({});
  const activeProfiles=useMemo(()=>PROFILES.filter(item=>item.id!=='REVIEW_SYNTHESIZER'||hasReviews),[hasReviews]);
  async function loadHistory(){try{const result=await api<{sessions:SessionSummary[]}>({action:'list_sessions',requestId:request.id,expectedRevision:request.revision??1});setHistory(result.sessions)}catch(reason){setError(reason instanceof Error?reason.message:'历史记录读取失败')}}
  useEffect(()=>{let active=true;void api<{sessions:SessionSummary[]}>({action:'list_sessions',requestId:request.id,expectedRevision:request.revision??1}).then(result=>{if(active)setHistory(result.sessions)}).catch(reason=>{if(active)setError(reason instanceof Error?reason.message:'历史记录读取失败')});return()=>{active=false}},[request.id,request.revision]);
  const historyOpen=historyTrigger>closedHistoryTrigger;
  // 切换 profile 不递增 newChatNonce：Chat remount 后 forceNew=false，
  // 服务端直接找回同 profile 的现存会话（毫秒级），不再触发 LLM 新建首问。
  // newChatNonce 只由「开启新对话」按钮递增。
  function selectProfile(id:AgentProfileId){if(id==='REVIEW_SYNTHESIZER'&&!hasReviews)return;setProfileId(id);setSelectedSession(undefined)}
  function toggleRound(id:AgentProfileId){setRoundProfiles(items=>items.includes(id)?items.filter(item=>item!==id):items.length<3?[...items,id]:items)}
  async function dismissSession(id:string){if(!confirm('放弃这段对话？已回答的内容保留审计记录，但不会生成报告。'))return;try{await api({action:'dismiss',sessionId:id,confirmed:true});void loadHistory()}catch(reason){setError(reason instanceof Error?reason.message:'放弃失败')}}
  const [roundLive,setRoundLive]=useState<{profile:AgentProfileId;text:string}[]>([]),[roundStage,setRoundStage]=useState<{stage:string;profile?:AgentProfileId;index?:number;total?:number}|null>(null);
  // 重新配置的快照保底：进入配置态前存档当前结果，左上角「返回刚才的结果」可无损还原
  const [roundSnapshot,setRoundSnapshot]=useState<{session:AgentSession|null;live:{profile:AgentProfileId;text:string}[]}|null>(null);
  async function runRound(){
    setRoundBusy(true);setError('');setRoundSession(null);setRoundLive([]);setRoundStage(null);
    try{
      const response=await cloudBaseFetch('/api/agent',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'start_roundtable',requestId:request.id,expectedRevision:request.revision??1,profiles:roundProfiles,topic})});
      if(!response.ok||!response.body){const data=await response.json().catch(()=>({}))as {error?:string};throw new Error(data.error||'圆桌讨论失败')}
      const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
      for(;;){
        const {done,value}=await reader.read();if(done)break;
        buffer+=decoder.decode(value,{stream:true});
        const chunks=buffer.split('\n\n');buffer=chunks.pop()||'';
        for(const chunk of chunks){
          const line=chunk.split('\n').find(l=>l.startsWith('data: '));if(!line)continue;
          let event:Record<string,unknown>;try{event=JSON.parse(line.slice(6))}catch{continue}
          if(event.type==='stage')setRoundStage({stage:String(event.stage),profile:event.profile as AgentProfileId|undefined,index:event.index as number|undefined,total:event.total as number|undefined});
          else if(event.type==='view')setRoundLive(previous=>[...previous,{profile:event.profile as AgentProfileId,text:String(event.content)}]);
          else if(event.type==='done')setRoundSession(event.session as AgentSession);
          else if(event.type==='error')throw new Error(String(event.error||'圆桌讨论失败'));
        }
      }
      void loadHistory();
    }catch(reason){setError(reason instanceof Error?reason.message:'圆桌讨论失败')}finally{setRoundBusy(false);setRoundStage(null)}
  }
  async function followRound(){
    if(!roundSession||!roundFollowup.trim())return;
    setRoundBusy(true);setError('');
    // 补充讨论的提问也进对话流（用户视角：我问了一句，顾问们回应）
    const askedQuestion=roundFollowup.trim();
    setRoundLive(previous=>[...previous,{profile:'QUICK_DECISION' as AgentProfileId,text:`（补充提问）${askedQuestion}`}]);
    try{
      const result=await api<{session:AgentSession}>({action:'roundtable_followup',sessionId:roundSession.id,answer:roundFollowup});
      setRoundSession(result.session);
      // 把顾问的新回应同步进 transcript（roundLive 优先渲染，不追加就看不到）
      const existingCount=roundLive.length+1; // 已有 view + 本次提问
      const newMessages=result.session.messages.slice(existingCount).filter(message=>message.role==='ASSISTANT');
      setRoundLive(previous=>[...previous,...newMessages.map(message=>({profile:message.agentProfileId||'QUICK_DECISION' as AgentProfileId,text:message.content}))]);
      setRoundFollowup('');void loadHistory();
    }catch(reason){setError(reason instanceof Error?reason.message:'补充讨论失败')}finally{setRoundBusy(false)}
  }
  async function openHistory(item:SessionSummary){setClosedHistoryTrigger(historyTrigger);if(item.mode==='ROUNDTABLE'){setView('ROUNDTABLE');setError('');try{const result=await api<{session:AgentSession}>({action:'load_session',sessionId:item.id});setRoundSession(result.session);const profiles=Array.isArray(result.session.metadata?.profiles)?result.session.metadata?.profiles as AgentProfileId[]:[];if(profiles.length)setRoundProfiles(profiles);if(result.session.metadata?.topic)setTopic(String(result.session.metadata.topic))}catch(reason){setError(reason instanceof Error?reason.message:'历史圆桌读取失败')}return}setSelectedSession(item.id);setProfileId(item.agentProfileId);setView('SINGLE')}
  // 圆桌结果态判定：有报告或正在生成 → 折叠配置区，报告优先呈现
  const roundResultMode=Boolean(roundSession?.report||roundBusy||roundLive.length>0);
  const roundSummaryProfiles=(roundSession?.metadata?.profiles as AgentProfileId[]|undefined)?.map(p=>PROFILE_NAME[p]).join('、')||roundProfiles.map(p=>PROFILE_NAME[p]).join('、');
  const roundSummaryTopic=String(roundSession?.metadata?.topic||topic);
  return <section className={styles.agentCouncil}>
    <div className={styles.agentCouncilToolbar}><div className={styles.agentModeTabs}><button className={view==='SINGLE'?styles.agentModeActive:''} onClick={()=>setView('SINGLE')}>单聊</button><button className={view==='ROUNDTABLE'?styles.agentModeActive:''} onClick={()=>setView('ROUNDTABLE')}>圆桌</button></div></div>
    {view==='SINGLE'?<>
      <div className={styles.agentProfileRail}>{PROFILES.map(item=><button key={item.id} disabled={item.id==='REVIEW_SYNTHESIZER'&&!hasReviews} className={profileId===item.id?styles.agentProfileActive:''} onClick={()=>selectProfile(item.id)}><span>{item.short}</span><b>{item.name}</b><small>{item.id==='REVIEW_SYNTHESIZER'&&!hasReviews?'收到回信后可用':item.description}</small></button>)}</div>
      <Chat key={`${request.id}-${profileId}-${newChatNonce}-${selectedSession||''}`} request={request} wish={{name:request.name,price:request.price,concern:request.concern,reason:request.reason}} revision={request.revision??1} profileId={profileId} selectedSessionId={selectedSession} newChatNonce={newChatNonce} onSessionChange={()=>void loadHistory()} onProfileMention={selectProfile} draft={drafts[profileId]??''} onDraftChange={value=>setDrafts(previous=>({...previous,[profileId]:value}))}/>
    </>:<section className={styles.roundtableSetup}>
      {/* 结果态：配置折叠成一行摘要，可展开重跑 */}
      {roundResultMode?<div className={styles.roundtableCollapsedBar}>
        <div className={styles.roundtableCollapsedInfo}><b>{roundBusy?'圆桌进行中…':'圆桌结论已生成'}</b><small>顾问：{roundSummaryProfiles} · 议题：{roundSummaryTopic.slice(0,24)}{roundSummaryTopic.length>24?'…':''}</small></div>
        <button className={styles.roundtableReset} onClick={()=>{setRoundSnapshot({session:roundSession,live:roundLive});setRoundSession(null);setRoundLive([]);setRoundStage(null);setError('')}}>重新配置</button>
      </div>:<header><span>受控圆桌</span><h2>让 2–3 位顾问先独立判断，再只回应一次核心冲突</h2><p>不是无限辩论，也不会用多数票替你决定。</p></header>}
      {/* 重新配置的返回保底：误点可无损回到刚才的结果 */}
      {!roundResultMode&&roundSnapshot&&<div className={styles.roundtableBackBar}>
        <button className={styles.roundtableBackBtn} onClick={()=>{setRoundSession(roundSnapshot.session);setRoundLive(roundSnapshot.live);setRoundSnapshot(null)}}><svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>返回刚才的圆桌结果</button>
        <button className={styles.roundtableBackDismiss} onClick={()=>setRoundSnapshot(null)} aria-label="不再保留">×</button>
      </div>}
      {/* 配置态完整表单：仅未进入结果态时展示 */}
      {!roundResultMode&&<><div className={styles.roundtableProfiles}>{activeProfiles.map(item=><button key={item.id} className={roundProfiles.includes(item.id)?styles.roundtableSelected:''} onClick={()=>toggleRound(item.id)}><span>{item.short}</span><b>{item.name}</b></button>)}</div>
      <label><span>这次想讨论什么？</span><textarea rows={3} value={topic} onChange={event=>setTopic(event.target.value)}/></label>
      <button className={styles.roundtableRun} disabled={roundBusy||roundProfiles.length<2||!topic.trim()} onClick={()=>void runRound()}>开始圆桌</button></>}
      {/* 结果态布局：报告优先（置顶），对话流收纳进限高滚动框 */}
      {roundResultMode&&<>
        {roundSession?.report&&<div className={styles.roundtableResultReport}><Report report={roundSession.report}/></div>}
        <div className={styles.roundtableTranscript}>
          <div className={styles.roundtableTranscriptHead}><b>顾问交流过程</b><small>过程回看，结论以上方报告为准</small></div>
          <div className={styles.roundtableTranscriptBody}>
            {roundStage&&roundBusy&&<div className={styles.roundtableStage}>{roundStage.stage==='FIRST_ROUND'?`${PROFILE_NAME[roundStage.profile||'QUICK_DECISION']} 正在独立判断…`:roundStage.stage==='CROSS_ROUND'?`${PROFILE_NAME[roundStage.profile||'QUICK_DECISION']} 正在回应分歧…`:'正在汇总各方观点…'}</div>}
            {roundLive.map((item,i)=><article key={i} className={styles.roundtableView}><span>{PROFILE_NAME[item.profile]}</span><p>{item.text}</p></article>)}
            {!roundBusy&&!roundLive.length&&roundSession?.messages.map(message=><article key={message.id} className={styles.roundtableView}><span>{PROFILE_NAME[message.agentProfileId||'QUICK_DECISION']}</span><p>{message.content}</p></article>)}
            {!roundLive.length&&roundBusy&&<div className={styles.agentTyping}><i/><i/><i/></div>}
          </div>
        </div>
        {roundBusy&&!roundSession?.report&&<button className={styles.roundtableRun} disabled>{roundStage?.stage==='SYNTHESIS'?'正在汇总结论…':'顾问正在发言…'}</button>}
        {roundSession?.report&&Number(roundSession.metadata?.followupsUsed||0)<1&&<div className={styles.roundtableFollowup}><label><span>还差一个关键问题？可补充讨论一次</span><textarea rows={2} value={roundFollowup} onChange={event=>setRoundFollowup(event.target.value)} placeholder="只问最可能改变判断的那一件事"/></label><button disabled={roundBusy||!roundFollowup.trim()} onClick={()=>void followRound()}>{roundBusy?'正在补充回应…':'发起一次补充讨论'}</button></div>}
        {roundSession?.report&&Number(roundSession.metadata?.followupsUsed||0)>=1&&<p className={styles.roundtableFollowupDone}>补充讨论已完成，本次圆桌不会继续扩张。</p>}
      </>}
    </section>}
    {historyOpen&&<div className={styles.agentDrawerBackdrop} onClick={()=>setClosedHistoryTrigger(historyTrigger)}><aside className={styles.agentHistoryDrawer} onClick={event=>event.stopPropagation()}><header><div><small>当前心愿</small><h2>历史对话</h2></div><button onClick={()=>setClosedHistoryTrigger(historyTrigger)}>×</button></header><button className={styles.newAgentSession} onClick={()=>{setSelectedSession(undefined);setNewChatNonce(value=>value+1);setView('SINGLE');setClosedHistoryTrigger(historyTrigger)}}>＋ 开启新对话</button><div>{history.map(item=><div key={item.id} className={styles.agentHistoryRow}><button className={styles.agentHistoryMain} onClick={()=>void openHistory(item)}><span>{item.mode==='ROUNDTABLE'?'圆桌':PROFILE_NAME[item.agentProfileId]}{item.requestRevision!==(request.revision??1)?' · 旧版本':''}</span><b>{item.summary}</b><small>{new Date(item.updatedAt).toLocaleString('zh-CN')} · {item.status==='COMPLETED'?'已整理':item.status==='PAUSED'?'已暂停':item.status==='DISMISSED'?'已放弃':'进行中'}</small></button>{['IN_PROGRESS','PAUSED'].includes(item.status)&&<button className={styles.agentHistoryDismiss} onClick={()=>void dismissSession(item.id)} aria-label="放弃这段对话">放弃</button>}</div>)}</div>{!history.length&&<p>还没有历史对话。</p>}</aside></div>}
    {error&&<p className={styles.agentInlineError}>{error}</p>}
  </section>;
}
