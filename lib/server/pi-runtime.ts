import 'server-only';

import { Agent, type AgentTool, type StreamFn } from '@earendil-works/pi-agent-core';
import { Type, type Api, type Model } from '@earendil-works/pi-ai';
import { deepseekProvider } from '@earendil-works/pi-ai/providers/deepseek';
import type { AgentMessage, AgentProfileId, AgentReport, PurchaseRequest, Review } from '@/lib/types';
const AGENT_PROFILE_LABELS={QUICK_DECISION:'快速决策顾问',RATIONAL_ANALYST:'理性分析顾问',REVIEW_SYNTHESIZER:'回信分析顾问',NAVAL_LENS:'专家顾问'} as const;
import { AiServiceError } from '@/lib/server/ai/client';

export interface PiDecisionContext {
  request:PurchaseRequest;
  reviews:Review[];
  previousReports?:AgentReport[];
}

function configuredModel():{model:Model<Api>;streamFn:StreamFn;apiKey:string}|null{
  const apiKey=process.env.OPENAI_NEXT_API_KEY||process.env.DEEPSEEK_API_KEY;
  if(!apiKey)return null;
  const provider=deepseekProvider();
  const modelId=process.env.DEEPSEEK_AGENT_MODEL||'deepseek-v4-flash';
  const source=provider.getModels().find(item=>item.id===modelId)||provider.getModels().find(item=>item.id==='deepseek-v4-flash');
  if(!source)throw new AiServiceError(`Pi Runtime 没有可用的 DeepSeek 模型定义：${modelId}`,503);
  const baseUrl=(process.env.OPENAI_NEXT_BASE_URL||process.env.DEEPSEEK_BASE_URL||'https://api.deepseek.com').replace(/\/$/,'');
  // 收紧输出上限：单轮回复是 2–4 句 + 一个 JSON 结构，400 token 足够。
  // 生成 token 是延迟的主导项，砍掉一半输出预算直接砍一半尾延迟。
  const model={...source,id:modelId,name:modelId,baseUrl,provider:'deepseek',samplingParams:{...(source as {samplingParams?:Record<string,unknown>}).samplingParams,max_tokens:400}} as Model<Api>;
  return{model,streamFn:provider.streamSimple.bind(provider) as StreamFn,apiKey};
}

function textFromMessage(message:unknown){
  const value=message as {role?:string;content?:Array<{type?:string;text?:string}>};
  if(value.role!=='assistant'||!Array.isArray(value.content))return'';
  return value.content.filter(part=>part.type==='text').map(part=>part.text||'').join('').trim();
}

function safeJson(value:unknown){return JSON.stringify(value,null,0).slice(0,14_000)}

function toolsFor(ctx:PiDecisionContext):AgentTool[]{
  const noArgs=Type.Object({});
  return[
    {
      name:'get_wish_context',label:'读取当前心愿',description:'读取当前用户已经确认的心愿事实。只读。',parameters:noArgs,
      execute:async()=>({content:[{type:'text',text:safeJson({id:ctx.request.id,revision:ctx.request.revision??1,name:ctx.request.name,price:ctx.request.price,type:ctx.request.type,reason:ctx.request.reason,concern:ctx.request.concern,brand:ctx.request.brand,sku:ctx.request.skuLabel,details:ctx.request.details,usageFrequency:ctx.request.usageFrequency})}],details:{requestId:ctx.request.id}}),
    },
    {
      name:'get_review_context',label:'读取朋友回信',description:'读取当前心愿下的真人反馈及其 revision。只读。',parameters:noArgs,
      execute:async()=>({content:[{type:'text',text:safeJson(ctx.reviews.map(review=>({id:review.id,revision:review.requestRevision??1,reviewer:review.reviewer_name,choice:review.choice,comment:review.comment})))}],details:{count:ctx.reviews.length}}),
    },
    {
      name:'get_previous_agent_reports',label:'读取历史报告',description:'读取同一心愿已完成的结构化 Agent 报告。只读。',parameters:noArgs,
      execute:async()=>({content:[{type:'text',text:safeJson(ctx.previousReports||[])}],details:{count:ctx.previousReports?.length||0}}),
    },
    {
      name:'calculate_opportunity_cost',label:'计算机会成本',description:'只按心愿价格进行纯算术拆分，不推断收入或承受能力。',parameters:Type.Object({weeks:Type.Optional(Type.Number({minimum:1,maximum:52}))}),
      execute:async(_id,input)=>{const args=input as {weeks?:number};const weeks=Math.max(1,Math.min(52,Number(args.weeks||4)));const weekly=ctx.request.price/weeks;return{content:[{type:'text',text:safeJson({price:ctx.request.price,weeks,weeklyAmount:Number(weekly.toFixed(2)),warning:'仅为算术拆分，不代表财务建议'})}],details:{weeks}}},
    },
  ];
}

export async function runPiDecisionAgent({
  ctx,profile,systemPrompt,prompt,timeoutMs,
}:{ctx:PiDecisionContext;profile:AgentProfileId;systemPrompt:string;prompt:string;timeoutMs?:number}){
  const configured=configuredModel();
  if(!configured)return null;
  // spec §7.4: 超时必须真正中断底层请求（agent.abort() 会 cancel 内部 fetch），
  // 否则超时后连接仍在悬挂、重试时新旧请求并发堆积。
  const PI_TIMEOUT_MS=timeoutMs??15_000;
  let finalText='';
  const agent=new Agent({
    initialState:{systemPrompt,model:configured.model,tools:toolsFor(ctx),thinkingLevel:'off'},
    streamFn:configured.streamFn,
    getApiKey:()=>configured.apiKey,
    sessionId:`worthbloom-${ctx.request.id}-${profile}`,
    toolExecution:'sequential',
    beforeToolCall:async({toolCall})=>{
      const allowed=new Set(toolsFor(ctx).map(tool=>tool.name));
      return allowed.has(toolCall.name)?undefined:{block:true,reason:'该工具不在 WorthBloom 只读白名单中',terminate:true};
    },
  });
  agent.subscribe(event=>{
    if(event.type==='message_end'){
      const text=textFromMessage(event.message);
      if(text)finalText=text;
    }
  });
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{
    await Promise.race([
      agent.prompt(prompt),
      new Promise((_,reject)=>{timer=setTimeout(()=>{agent.abort();reject(new AiServiceError('AI 响应超时，已中断',504))},PI_TIMEOUT_MS)}),
    ]);
    if(agent.state.errorMessage)throw new AiServiceError(agent.state.errorMessage,502);
    if(!finalText)throw new AiServiceError('Pi Runtime 没有返回可展示内容',502);
    return finalText;
  }finally{
    if(timer)clearTimeout(timer);
    // 兜底：任何路径退出都确保底层请求不再悬挂
    try{agent.abort()}catch{/* already finished */}
  }
}

export function compactConversation(messages:AgentMessage[]){
  // 保留 payload 中的问题和建议选项，模型复盘时能看到自己之前问过什么、给过哪些选项。
  return messages.slice(-12).map(message=>({role:message.role,content:message.content,skipped:Boolean(message.skipped),顾问:message.agentProfileId?AGENT_PROFILE_LABELS[message.agentProfileId]:undefined,上轮问题:message.payload?.question?.text,上轮选项:message.payload?.suggestions?.map(item=>item.label).slice(0,4)}));
}
