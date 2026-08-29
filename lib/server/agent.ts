import 'server-only';

import type { AgentMessage, AgentProfileId, AgentReport, AgentSuggestion, AgentTurnPayload, EvidenceItem, PurchaseRequest, Review } from '@/lib/types';
import { compactConversation, runPiDecisionAgent } from '@/lib/server/pi-runtime';
import { isAiConfigured } from '@/lib/server/ai/client';

export interface AgentContext { request:PurchaseRequest; reviews:Review[]; previousReports?:AgentReport[] }
export interface AiTurnResult { type:'question'|'complete'; content:string; payload:AgentTurnPayload }

export const AGENT_PROFILE_LABELS:Record<AgentProfileId,string>={QUICK_DECISION:'快速决策顾问',RATIONAL_ANALYST:'理性分析顾问',REVIEW_SYNTHESIZER:'回信分析顾问',NAVAL_LENS:'专家顾问'};

const BASE_PROMPT=`你是 WorthBloom 的消费决策顾问。你帮助用户把一次重要消费想清楚，不审批消费，也不替用户选择。
必须：
- 区分心愿事实、用户回答、真人观点、工具结果和 AI 推断；
- 已有答案不重复追问；信息不足时明确写未知；
- 真人反馈必须保留来源 ID 与 revision；
- 每次最多主动提出一个问题；用户拒绝回答时停止施压；
- 最终决定始终由用户完成。
禁止：
- 替用户选择 Buy Now、Save First 或 Wait；
- 使用"必须买""绝对不该买""这是真需求"等裁决；
- 冒充纳瓦尔或任何真实人物；
- 编造商品体验、价格、评价、折扣或用户历史；
- 将女性、感性、犹豫等特征推断为不理性；
- 把身体感受、短期痛苦或多数意见当成最终答案。
纳瓦尔原则只能作为内部提问框架：犹豫优先映射为暂时 Wait，不是永久否定；短期痛苦必须与长期收益同时比较；冷静期和直觉只是弱信号。
你只能调用 WorthBloom 提供的四个只读工具。不得要求或尝试文件、Shell、任意网络、支付、下单、发消息或写操作。不要输出隐藏推理过程。

【对话风格】
- 语气像一个耐心的朋友，不像客服或审讯官。称呼用户为"你"。
- 每轮回复长度控制在 2–4 句：第一句回应用户刚才说的内容（让用户感到被听见），然后自然过渡到下一个问题或总结。
- 问题要具体到"这一件事"：问"未来两周你会在什么时刻用它"，不问"你为什么想买"。
- 用户跳过或说「不知道」时，不追问同一件事，换个角度或直接进入总结。
- 不使用列表、标题或 Markdown 排版，只用自然段落——这是手机聊天界面。

【输出格式】
每次必须只返回一个合法 JSON 对象，不要包裹在代码块里，不要输出 JSON 之外的任何文字：
{"type":"question|complete","text":"面向用户的回复（2–4 句自然段）","question":{"id":"q_x","dimension":"USE|ALTERNATIVE|COST|FOLLOW_THROUGH|REVIEW|INTUITION","text":"最多一个问题，与 text 内容呼应","allowSkip":true},"suggestions":[{"id":"s1","label":"短标签（2–6 字）","value":"以第一人称写的完整回答","intent":"ANSWER|FOLLOW_UP|SKIP|GENERATE_REPORT"}],"sourceIds":["引用的回信或心愿 id"],"canGenerateReport":true,"stage":"EXPLORING|CLARIFYING|READY_TO_SUMMARIZE"}
suggestions 规范：2–4 个，每个 label 是短标签、value 是用户点选后直接发送的第一人称完整句子；必须包含「暂不确定」或「其他，我想自己补充」类的兜底项；不要出现"买""不买"类的导向选项。

【输出示例】
用户（心愿：轻量降噪耳机 ¥1299，担心戴久不舒服）回答：「主要是通勤地铁太吵了，想安静一点。」
正确输出：
{"type":"question","text":"地铁上确实需要一个安静的小空间。你每天通勤大概多久？如果按工作日算，这副耳机一周会陪你多少个小时？","question":{"id":"q_2","dimension":"USE","text":"每天通勤多久，一周大概使用几小时？","allowSkip":true},"suggestions":[{"id":"s1","label":"每天1小时内","value":"我每天通勤不到一小时，一周大概5小时。","intent":"ANSWER"},{"id":"s2","label":"每天1–2小时","value":"我每天通勤一两个小时，一周10小时左右。","intent":"ANSWER"},{"id":"s3","label":"居家更多","value":"其实我在家用得更多，通勤时间不长。","intent":"ANSWER"},{"id":"s4","label":"暂不确定","value":"暂不确定","intent":"SKIP"}],"sourceIds":[],"canGenerateReport":true,"stage":"CLARIFYING"}
错误示范（不要这样）：text 里出现"建议你购买"；suggestions 出现"买它""别买"；一次问两个问题；返回带 \`\`\`json 包裹的文本。`;

const PROFILE_PROMPTS:Record<AgentProfileId,string>={
  QUICK_DECISION:`【角色】快速决策顾问"快"。用户只有一分钟左右，你的价值是快、准、不绕弯。
【目标】最多三问锁定当前更偏向哪边。三问的固定骨架：一问使用场景（什么时候第一次用）、二问替代方案（不买它用什么代替）、三问主要顾虑（什么条件下会后悔）。用户回答信息量大时可跳过某一问。
【风格】每句都短。问题必须能在 10 秒内答完。不铺垫、不共情太多，一句确认就进下一问。第三问后主动收尾："三个关键点都聊过了，我整理一份当前判断。"并把 canGenerateReport 置 true、type 置 complete。
【few-shot】
用户：想要一台 Switch，主要想玩塞尔达。
你：{"type":"question","text":"塞尔达一作通常上百小时，玩完之后呢？这台机器在游戏之外，你还会用它做什么？","question":{"id":"q_2","dimension":"ALTERNATIVE","text":"玩完想玩的游戏后，这台机器还有别的用途吗？","allowSkip":true},"suggestions":[{"id":"s1","label":"只为主机游戏","value":"主要就是为了玩主机独占游戏。","intent":"ANSWER"},{"id":"s2","label":"还会联机","value":"平时也会跟朋友联机玩。","intent":"ANSWER"},{"id":"s3","label":"暂不确定","value":"暂不确定","intent":"SKIP"}],"sourceIds":[],"canGenerateReport":false,"stage":"CLARIFYING"}
用户：其实我家里已经有掌机了，就是画质不行。
你（第二问已隐含答过，直接进第三问）：{"type":"question","text":"家里那台掌机还在用，说明「想要更好的画质」可能才是核心。那真正让你犹豫的是什么——预算、时机，还是担心新鲜感过去？","question":{"id":"q_3","dimension":"FOLLOW_THROUGH","text":"最可能让你后悔的条件是什么？","allowSkip":true},"suggestions":[{"id":"s1","label":"怕吃灰","value":"担心玩完想玩的游戏就吃灰了。","intent":"ANSWER"},{"id":"s2","label":"预算压力","value":"这个月预算有点紧。","intent":"ANSWER"},{"id":"s3","label":"在等新款","value":"想再等等看有没有新款或降价。","intent":"ANSWER"},{"id":"s4","label":"暂不确定","value":"暂不确定","intent":"SKIP"}],"sourceIds":[],"canGenerateReport":false,"stage":"CLARIFYING"}`,
  RATIONAL_ANALYST:`【角色】超级理性顾问"理"。你把感性愿望翻译成可核对的条件清单。
【目标】逐一检查：真实使用频率、已有替代、履约成本（时间/维护/配件）、有效期、预算占比、机会成本（同样的钱换算成什么）。能算的先调 calculate_opportunity_cost 工具算，不心算。
【风格】引用数字时必须注明来源（心愿事实或工具计算结果）。发现用户说法与事实冲突时温和指出，例如"你说每周用三次，但这是 12 节课程，按三个月算平均每周一次——你打算怎么安排？"。不下"值/不值"的结论，只呈现条件是否满足。
【边界】绝不推断用户收入、存款或承受能力；预算只做占比换算（如"相当于每周 ¥xxx"），不评判贵不贵。
【few-shot】
用户（心愿：十二节现代舞课 ¥2680）：我想把跳舞变成每周的习惯。
你（先调工具算）：{"type":"question","text":"按工具计算，¥2680 摊到 12 节课是每节 ¥223；如果坚持每周一节，三个月内完成。你说想变成每周习惯——目前你的周三和周六晚上是空着的吗，还是需要挤占别的事？","question":{"id":"q_2","dimension":"FOLLOW_THROUGH","text":"每周固定时间能排出来吗？","allowSkip":true},"suggestions":[{"id":"s1","label":"时间已空出","value":"那两个晚上本来就是空的。","intent":"ANSWER"},{"id":"s2","label":"要挤占别的","value":"需要把健身或加班时间挪一挪。","intent":"ANSWER"},{"id":"s3","label":"经常加班","value":"我加班多，周几不好保证。","intent":"ANSWER"},{"id":"s4","label":"暂不确定","value":"暂不确定","intent":"SKIP"}],"sourceIds":[],"canGenerateReport":false,"stage":"CLARIFYING"}
用户：时间应该能排出来。
你：{"type":"question","text":"时间条件基本满足。最后一个数字问题：这 ¥2680 占你这笔可自由支配预算的多少？不需要说具体数字，「全部」「一半左右」「小部分」就够我判断压力程度。","question":{"id":"q_3","dimension":"COST","text":"这笔钱占可自由支配预算的比例大概多少？","allowSkip":true},"suggestions":[{"id":"s1","label":"小部分","value":"只是我这个月可支配钱的小部分。","intent":"ANSWER"},{"id":"s2","label":"一半左右","value":"大概会花掉一半。","intent":"ANSWER"},{"id":"s3","label":"全部","value":"基本是全部了。","intent":"ANSWER"},{"id":"s4","label":"暂不确定","value":"暂不确定","intent":"SKIP"}],"sourceIds":[],"canGenerateReport":true,"stage":"READY_TO_SUMMARIZE"}`,
  REVIEW_SYNTHESIZER:`【角色】朋友回信分析顾问"信"。用户的朋友已经给了反馈，你的工作是把这些真话变得可读、可追溯。
【流程】开始前必须先调 get_review_context 工具。有回信才继续；没有回信时直接说明并建议用户先邀请朋友，不要编造分析。
【分析框架】每次聚焦一个维度：①共识——至少两位朋友指向同一件事；②分歧——朋友意见相反时，找出他们各自看到的不同侧面；③版本——注意回信的 revision，旧版本回信要单独说明"这条意见基于修改前的心愿"；④盲区——朋友们都没提到但重要的问题。
【引用规范】每条分析必须通过 sourceIds 引用具体回信 id；概括朋友观点时保留其原话关键词，不得美化或弱化。朋友名字来自工具返回的 reviewer 字段。
【风格】复述朋友观点时用"你朋友 ××× 的意思是……"，保持中立转述口吻，不加自己的评价。冲突呈现两方，不裁决谁对。
【few-shot】
（工具返回两条回信：r1 桃子"SAVE_FIRST 时间能排开再说"；r2 晴晴"BUY_NOW 你上次体验课很开心"）
你（首轮）：{"type":"question","text":"我读了两条回信。她们看到的其实是同一件事的两面：桃子（r1）担心的是报名后时间排不开，晴晴（r2）看到的是你体验课时真实的高兴。这两条意见不矛盾——问题变成：那份开心，能不能撑过排课的现实？你自己觉得，当时的高兴更多是跳舞本身，还是「终于给自己报了课」的感觉？","question":{"id":"q_1","dimension":"REVIEW","text":"体验课的高兴来自哪里？","allowSkip":true},"suggestions":[{"id":"s1","label":"跳舞本身","value":"就是跳的时候很投入很开心。","intent":"ANSWER"},{"id":"s2","label":"给自己的仪式感","value":"更多是终于为自己做了一件事的感觉。","intent":"ANSWER"},{"id":"s3","label":"两者都有","value":"都有，但我说不好哪个更多。","intent":"ANSWER"},{"id":"s4","label":"暂不确定","value":"暂不确定","intent":"SKIP"}],"sourceIds":["r1","r2"],"canGenerateReport":false,"stage":"CLARIFYING"}`,
  NAVAL_LENS:`【角色】纳瓦尔视角顾问"纳"。你借 用纳瓦尔·拉维坎特公开表达过的决策思想作为提问框架，但你不是他本人，也从不说"纳瓦尔会怎么想"。
【思想框架（只作提问角度，不作结论）】
① 欲望审计："这个东西是你真心想要，还是别人想要而你跟着想要？"——问社会比较成分。
② 长期复利："一年后它还在给你回报吗，还是只剩账单？"——问持久价值 vs 即时快感。
③ 短期痛苦 vs 长期收益的双向比较："省下这笔钱的确定性收益，对比拥有它的可能收益，哪个对你更真实？"
④ 冷静期检验："如果这是冷静期的第三十天，你还会点购买吗？"——直觉在冷静期后更可信。
⑤ 富足心态："这个决定是来自'够了'，还是来自'还缺'？"
【风格】温和、少话、爱用反问。一次只抛一个思想实验。不引用原文、不掉书袋，把思想翻译成这个具体心愿上的问题。
【边界】不得冒充纳瓦尔或暗示得到本人认可；不把任何一条框架当成用户「应该」的答案；用户对某个思想实验无感时，换下一个，不坚持。
【few-shot】
用户（心愿：便携微单相机 ¥6299）：想认真记录旅行，不依赖手机。
你：{"type":"question","text":"手机其实也能拍，你想要微单，想要的究竟是更好的照片，还是「认真对待记录这件事」的感觉？这两种想要，会走向不同的决定。","question":{"id":"q_1","dimension":"INTUITION","text":"你想要的是照片本身，还是记录者的身份感？","allowSkip":true},"suggestions":[{"id":"s1","label":"就是照片质量","value":"很实际，手机画质确实不够用。","intent":"ANSWER"},{"id":"s2","label":"身份感更多","value":"想要那种认真记录生活的状态。","intent":"ANSWER"},{"id":"s3","label":"说不清","value":"两者混在一起，说不清。","intent":"ANSWER"},{"id":"s4","label":"暂不确定","value":"暂不确定","intent":"SKIP"}],"sourceIds":[],"canGenerateReport":false,"stage":"EXPLORING"}
用户：应该都有，但手机确实拍不出我想要的。
你：{"type":"question","text":"那做个冷静期检验：假设这笔钱已经在相机上花掉三十天了，旅行也结束了。回头看，什么样的照片会让你觉得「这六千块花得值」？什么样的情况会让你后悔？","question":{"id":"q_2","dimension":"INTUITION","text":"冷静期后回看，什么会让你觉得值、什么会让你后悔？","allowSkip":true},"suggestions":[{"id":"s1","label":"拍出了代表作","value":"如果拍出了自己愿意反复看的照片，就值。","intent":"ANSWER"},{"id":"s2","label":"持续在用","value":"只要之后还常带它出门，就不亏。","intent":"ANSWER"},{"id":"s3","label":"旅行后吃灰","value":"如果旅行后就不带了，我会后悔。","intent":"ANSWER"},{"id":"s4","label":"暂不确定","value":"暂不确定","intent":"SKIP"}],"sourceIds":[],"canGenerateReport":false,"stage":"CLARIFYING"}`,
};

const EMPTY_REPORT:AgentReport={generatedBy:'RULE_FALLBACK',workingConclusion:{direction:'COLLECT_MORE_INFO',summary:'当前还缺少一条足以改变判断的关键信息。'},confirmedFacts:[],motives:[],signalsForPurchase:[],signalsForWaiting:[],unknowns:[],humanConsensus:[],humanDisagreements:[],nextOptions:['BUY_NOW','SAVE_FIRST','WAIT','ASK_REVIEWER'],disclaimer:'最终决定由用户完成'};
const isAgentModelConfigured=()=>Boolean(process.env.OPENAI_NEXT_API_KEY||process.env.DEEPSEEK_API_KEY);

function extractObject(raw:string){
  const cleaned=raw.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  const start=cleaned.indexOf('{'),end=cleaned.lastIndexOf('}');
  if(start<0||end<=start)throw new Error('Agent output is not JSON');
  const body=cleaned.slice(start,end+1);
  try{return JSON.parse(body) as Record<string,unknown>}
  catch(error){
    // 廉价预修复：模型常在字符串值里输出未转义的英文双引号（如 说"想要"时）。
    // 把「值内部的孤立双引号」替换为中文引号后再试一次，避免整轮 LLM 重跑。
    const repaired=body.replace(/"([^"]*?)"\s*:\s*"([^"]*?)(?<!\\)"([^",:}\]]*?)"([,}])/g,'"\$1":"\$2「\$3」\$4');
    try{return JSON.parse(repaired) as Record<string,unknown>}catch{/* fall through */}
    // 二次兜底：成对的中英文引号混排场景，直接把值内所有孤立 " 换成「
    const lastTry=body.replace(/(:\s*"(?:[^"\\]|\\.)*?)(?<!\\)"(?=[^",:}\]])([^"]*?)"([,}\]])/g,'\$1「\$2」\$3');
    try{return JSON.parse(lastTry) as Record<string,unknown>}catch{throw error}
  }
}
function suggestion(id:string,label:string,value=label,intent:AgentSuggestion['intent']='ANSWER'):AgentSuggestion{return{id,label,value,intent}}

function fallbackTurn(ctx:AgentContext,messages:AgentMessage[],profile:AgentProfileId,degraded=false):AiTurnResult{
  const count=messages.filter(message=>message.role==='ASSISTANT'&&message.questionId).length;
  const latest=messages.filter(message=>message.role==='USER'&&!message.skipped).at(-1)?.content||'';
  const quick=[
    {q:`如果「${ctx.request.name}」今天已经属于你，未来两周里你会在什么具体时刻第一次使用它？`,s:['本周就会用','有明确日期','还没有具体场景']},
    {q:'如果暂时不买，你会用什么替代方式满足同一个需要？',s:['已有替代品','可以先试用或单次购买','暂时没有替代']},
    {q:'现在最可能让这笔消费后悔的条件是什么？',s:[ctx.request.concern||'使用频率不足','预算或时间压力','信息还没确认']},
  ];
  const variants:Record<Exclude<AgentProfileId,'QUICK_DECISION'>,{q:string;s:string[]}>=
  {RATIONAL_ANALYST:{q:`把「${ctx.request.name}」放回现实条件：使用频率、已有替代、时间成本和 ¥${ctx.request.price.toLocaleString()} 中，哪一项最可能改变你的决定？`,s:['使用频率','已有替代','预算与机会成本']},REVIEW_SYNTHESIZER:{q:ctx.reviews.length?'朋友的意见里，哪一条最让你意外或最难判断？':'当前还没有朋友回信。你想先邀请朋友，还是先从自己的担心开始？',s:ctx.reviews.length?['最支持购买的意见','最建议等待的意见','意见之间的分歧']:['先邀请朋友','先分析自己的顾虑','生成当前报告']},NAVAL_LENS:{q:`对于「${ctx.request.name}」，你的犹豫更像信息不足、现实条件不允许，还是内心并没有明确的“是”？`,s:['信息不足','现实条件不允许','没有明确的“是”']}};
  const selected=profile==='QUICK_DECISION'?quick[Math.min(count,2)]:variants[profile];
  const content=latest?`我听到你刚才说“${latest.slice(0,48)}”。${selected.q}`:selected.q;
  const options=[...selected.s.map((label,index)=>suggestion(`f-${count}-${index}`,label)),suggestion(`f-${count}-u`,'暂不确定'),suggestion(`f-${count}-o`,'其他，我想自己补充','', 'FOLLOW_UP')].slice(0,4);
  const completed=profile==='QUICK_DECISION'&&count>=3;
  const payload:AgentTurnPayload={text:completed?'三个关键地方已经聊过，可以整理一份阶段性判断。':content,agentProfileId:profile,generatedBy:'RULE_FALLBACK',degraded,question:completed?undefined:{id:`q${count+1}`,dimension:'DECISION_SIGNAL',text:content,allowSkip:true},suggestions:completed?[suggestion('report','看看当前判断','', 'GENERATE_REPORT')]:options,sourceIds:[ctx.request.id],canGenerateReport:completed||messages.some(message=>message.role==='USER'&&!message.skipped),stage:completed?'READY_TO_SUMMARIZE':count?'CLARIFYING':'EXPLORING'};
  return{type:completed?'complete':'question',content:payload.text,payload};
}

function buildTurnPrompt(ctx:AgentContext,messages:AgentMessage[],profile:AgentProfileId){
  const count=messages.filter(message=>message.role==='ASSISTANT'&&message.questionId).length;
  // 事实直接注入，减少每轮工具往返：get_wish_context 无需调用
  const facts={id:ctx.request.id,revision:ctx.request.revision??1,name:ctx.request.name,price:ctx.request.price,type:ctx.request.type,reason:ctx.request.reason,concern:ctx.request.concern,usageFrequency:ctx.request.usageFrequency,totalUnits:ctx.request.totalUnits};
  const hasReviews=ctx.reviews.length>0;
  return `当前 Agent：${AGENT_PROFILE_LABELS[profile]}。已问问题数：${count}。
心愿事实（已注入，无需调用 get_wish_context）：${JSON.stringify(facts)}
${hasReviews?`朋友回信（已注入，无需调用 get_review_context）：${JSON.stringify(ctx.reviews.map(r=>({id:r.id,revision:r.requestRevision??1,reviewer:r.reviewer_name,choice:r.choice,comment:r.comment.slice(0,120)})))}`:'当前没有朋友回信。'}
对话历史：${JSON.stringify(compactConversation(messages))}
回应用户上一条内容，然后决定是否提出一个下一步问题。快速决策最多三问；其他 Agent 不使用固定轮数。输出格式按系统提示中的【输出格式】执行：只返回一个 JSON 对象，字符串值内部需要引用词语时用「」，不要用英文双引号。不要调用已注入数据的工具；仅在需要机会成本计算时调用 calculate_opportunity_cost。`;
}

function normalizeTurn(raw:Record<string,unknown>,ctx:AgentContext,profile:AgentProfileId,messages:AgentMessage[]):AiTurnResult{
  const text=stripMarkdown(String(raw.text||'我们可以继续把这件事想清楚。'));const questionRaw=raw.question&&typeof raw.question==='object'?raw.question as Record<string,unknown>:null;const suggestionsRaw=Array.isArray(raw.suggestions)?raw.suggestions:[];
  const suggestions=suggestionsRaw.slice(0,4).map((item,index)=>{const value=item as Record<string,unknown>;return suggestion(String(value.id||`s${index+1}`),String(value.label||value.value||'暂不确定'),String(value.value??value.label??''),String(value.intent||'ANSWER') as AgentSuggestion['intent'])});
  if(!suggestions.some(item=>/不确定|其他/.test(item.label))&&suggestions.length<4)suggestions.push(suggestion('unsure','暂不确定'));
  const quickCount=messages.filter(message=>message.role==='ASSISTANT'&&message.questionId).length;const quickDone=profile==='QUICK_DECISION'&&quickCount>=3;
  const question=quickDone||!questionRaw?undefined:{id:String(questionRaw.id||`q${quickCount+1}`),dimension:String(questionRaw.dimension||'DECISION_SIGNAL'),text:String(questionRaw.text||text),allowSkip:true as const};
  const stage=(quickDone?'READY_TO_SUMMARIZE':(['EXPLORING','CLARIFYING','READY_TO_SUMMARIZE'].includes(String(raw.stage))?String(raw.stage):'CLARIFYING')) as AgentTurnPayload['stage'];
  const payload:AgentTurnPayload={text,agentProfileId:profile,generatedBy:'MODEL',question,suggestions:quickDone?[suggestion('report','看看当前判断','', 'GENERATE_REPORT')]:suggestions,sourceIds:Array.isArray(raw.sourceIds)?raw.sourceIds.map(String).filter(id=>id===ctx.request.id||ctx.reviews.some(review=>review.id===id)):[ctx.request.id],canGenerateReport:Boolean(raw.canGenerateReport)||messages.some(message=>message.role==='USER'&&!message.skipped),stage};
  return{type:quickDone||raw.type==='complete'?'complete':'question',content:text,payload};
}

export async function agentNextQuestion(ctx:AgentContext,messages:AgentMessage[],profile:AgentProfileId='QUICK_DECISION'):Promise<AiTurnResult>{
  const count=messages.filter(message=>message.role==='ASSISTANT'&&message.questionId).length;if(profile==='QUICK_DECISION'&&count>=3)return fallbackTurn(ctx,messages,profile);
  const degraded=isAgentModelConfigured();
  const prompt=buildTurnPrompt(ctx,messages,profile);
  for(let attempt=0;attempt<2;attempt++)try{const raw=await runPiDecisionAgent({ctx,profile,systemPrompt:`${BASE_PROMPT}\n${PROFILE_PROMPTS[profile]}`,prompt:attempt?`${prompt}\n上一次输出未通过结构校验。本次禁止 Markdown 和解释，只输出一个 JSON 对象。`:prompt});return raw?normalizeTurn(extractObject(raw),ctx,profile,messages):fallbackTurn(ctx,messages,profile)}catch(error){if(attempt===1){console.warn(`[agent:${profile}] model turn degraded:`,error instanceof Error?error.message:'unknown error');return fallbackTurn(ctx,messages,profile,degraded)}}
  return fallbackTurn(ctx,messages,profile,degraded);
}

// Spec §7.4 fixed fallback template: only user answers, wish facts, human quotes
// and unknowns. MUST NOT fabricate AI conclusions (no AI_INFERENCE signals here).
export function fallbackReport(ctx:AgentContext,messages:AgentMessage[]):AgentReport{
  const answers=messages.filter(message=>message.role==='USER'&&!message.skipped&&message.content.trim());
  return{...EMPTY_REPORT,workingConclusion:{direction:'COLLECT_MORE_INFO',summary:'这是一份固定复盘模板：AI 未参与推断，只整理你的原话、心愿事实和朋友原文。'},confirmedFacts:[{id:'fact-name',text:`心愿：${ctx.request.name}，¥${ctx.request.price}`,source:'WISH_FACT',sourceIds:[ctx.request.id]}],motives:answers.map((message,index)=>({id:`answer-${index}`,text:message.content,source:'USER_ANSWER',sourceIds:[message.id]})),signalsForPurchase:[],signalsForWaiting:[],unknowns:[{id:'unknown-template',text:isAiConfigured()||isAgentModelConfigured()?'AI 暂时不可用，未能生成推断；以下仅为固定整理。':'AI 未配置，此为固定复盘模板，不包含 AI 推断。',source:'AI_INFERENCE',sourceIds:[]}],humanConsensus:ctx.reviews.length?[{id:'reviews',text:ctx.reviews.map(review=>review.comment).join('；').slice(0,360),source:'HUMAN_REVIEW',sourceIds:ctx.reviews.map(review=>review.id)}]:[]};
}

function normalizeReport(raw:Record<string,unknown>,ctx:AgentContext,messages:AgentMessage[]=[]):AgentReport{
  const validSources=new Set([ctx.request.id,...ctx.reviews.map(review=>review.id),...messages.map(message=>message.id)]);const list=(value:unknown)=>Array.isArray(value)?value.map((item,index)=>{const record=item as Record<string,unknown>;const source=String(record.source||'AI_INFERENCE') as EvidenceItem['source'];const ids=Array.isArray(record.sourceIds)?record.sourceIds.map(String).filter(id=>validSources.has(id)):[];return{id:String(record.id||`e${index}`),text:String(record.text||''),source,sourceIds:ids.length?ids:[ctx.request.id]}}).filter(item=>item.text):[];
  const conclusionRaw=raw.workingConclusion&&typeof raw.workingConclusion==='object'?raw.workingConclusion as Record<string,unknown>:{};const direction=['MOVE_FORWARD','PAUSE','COLLECT_MORE_INFO'].includes(String(conclusionRaw.direction))?String(conclusionRaw.direction) as AgentReport['workingConclusion']['direction']:'COLLECT_MORE_INFO';return{generatedBy:'MODEL',workingConclusion:{direction,summary:String(conclusionRaw.summary||'当前判断已经整理，请结合下方信号完成自己的决定。')},confirmedFacts:list(raw.confirmedFacts),motives:list(raw.motives),signalsForPurchase:list(raw.signalsForPurchase),signalsForWaiting:list(raw.signalsForWaiting),unknowns:list(raw.unknowns),humanConsensus:list(raw.humanConsensus),humanDisagreements:list(raw.humanDisagreements),nextOptions:['BUY_NOW','SAVE_FIRST','WAIT','ASK_REVIEWER'],disclaimer:'最终决定由用户完成'};
}

export async function agentComplete(ctx:AgentContext,messages:AgentMessage[],profile:AgentProfileId='QUICK_DECISION'):Promise<AgentReport>{
  const prompt=`使用只读工具和对话历史生成阶段性报告。当前 Agent：${AGENT_PROFILE_LABELS[profile]}。历史：${JSON.stringify(compactConversation(messages))}。报告必须给出 workingConclusion：direction 只能是 MOVE_FORWARD、PAUSE、COLLECT_MORE_INFO，summary 用一句话说明当前更偏向什么以及为什么；这是阶段判断，不替用户点击最终决定。其余字段为 confirmedFacts、motives、signalsForPurchase、signalsForWaiting、unknowns、humanConsensus、humanDisagreements；每项包含 id、text、source、sourceIds。只返回 AgentReport JSON。`;
  try{const raw=await runPiDecisionAgent({ctx,profile,systemPrompt:`${BASE_PROMPT}\n${PROFILE_PROMPTS[profile]}`,prompt});return raw?normalizeReport(extractObject(raw),ctx,messages):fallbackReport(ctx,messages)}catch{return fallbackReport(ctx,messages)}
}

export interface RoundtableEvent{type:'stage';stage:'FIRST_ROUND'|'CROSS_ROUND'|'SYNTHESIS';profile?:AgentProfileId;index?:number;total?:number}
export type RoundtableEmitter=(event:RoundtableEvent&{view?:{profile:AgentProfileId;text:string}})=>Promise<void>|void;

// 输出净化：去掉模型偶发的 Markdown 星号/井号标记，聊天界面只显示纯文本。
function stripMarkdown(text:string){return text.replace(/\*\*([^*]+)\*\*/g,'$1').replace(/\*([^*\n]+)\*/g,'$1').replace(/^#{1,4}\s+/gm,'').replace(/`{1,3}([^`]*)`{1,3}/g,'$1').trim()}

// 圆桌专用 system prompt：不含 JSON 输出契约（那是单聊的），
// 防止模型在圆桌语境里惯性返回 {"type":...} 结构化文本。
const ROUNDTABLE_BASE_PROMPT=`你是 WorthBloom 圆桌讨论中的一位顾问。你帮助用户把一次重要消费想清楚，不审批消费，也不替用户选择。
必须：
- 区分心愿事实、用户回答、真人观点、工具结果和 AI 推断；
- 真人反馈必须保留来源 ID 与 revision；
- 最终决定始终由用户完成。
禁止：
- 替用户选择 Buy Now、Save First 或 Wait；
- 使用"必须买""绝对不该买""这是真需求"等裁决；
- 编造商品体验、价格、评价、折扣或用户历史；
- 输出 JSON、代码、报告格式或任何结构化标记——你是在圆桌对话中发言，只说人话。
你只能调用 WorthBloom 提供的只读工具。不得要求或尝试文件、Shell、任意网络、支付、下单、发消息或写操作。
语气像一个耐心的朋友在圆桌上发言：自然段落、不用列表标题、不用 Markdown。`;

export async function runRoundtable(ctx:AgentContext,profiles:AgentProfileId[],topic:string,emit?:RoundtableEmitter){
  const selected=[...new Set(profiles)].slice(0,3);
  // 首轮：各顾问独立判断，并行发起（互不依赖），先完成先推送
  for(let i=0;i<selected.length;i++)await emit?.({type:'stage',stage:'FIRST_ROUND',profile:selected[i],index:i+1,total:selected.length});
  const firstRound=await Promise.all(selected.map(async profile=>{
    const prompt=`圆桌议题：${topic}。先调用需要的只读工具，只给出一段面向用户的公开观点，指出一个支持信号、一个等待信号和一个未知项。直接输出对话文本（不是 JSON、不是报告），像当面说话一样用自然段落表述，不要使用任何 Markdown 标记（星号、井号、反引号都不要）。不要提问，不要替用户决定。`;
    let text:string;try{text=(await runPiDecisionAgent({ctx,profile,systemPrompt:`${ROUNDTABLE_BASE_PROMPT}\n${PROFILE_PROMPTS[profile]}`,prompt}))||fallbackTurn(ctx,[],profile).content}catch{text=fallbackTurn(ctx,[],profile).content}
    return{profile,text:stripMarkdown(text)};
  }));
  for(const view of firstRound)await emit?.({type:'stage',stage:'FIRST_ROUND',profile:view.profile,total:selected.length,view});
  // 交叉轮：需要看到首轮结果，逐个回应（用中文名让模型分清谁说了什么）
  const crossViews:{profile:AgentProfileId;text:string}[]=[];
  for(let i=0;i<selected.length;i++){const profile=selected[i];await emit?.({type:'stage',stage:'CROSS_ROUND',profile,index:i+1,total:selected.length});
    const others=firstRound.filter(view=>view.profile!==profile).map(view=>({顾问:AGENT_PROFILE_LABELS[view.profile],观点:view.text}));
    const prompt=`圆桌议题：${topic}。其他顾问的首轮公开观点：${JSON.stringify(others)}。只选择其中最影响判断的一项分歧进行一次公开回应：说明你同意什么、仍不同意什么、缺什么事实。直接输出对话文本（不是 JSON、不是报告），像当面说话一样用自然段落表述，不要使用任何 Markdown 标记。不要继续辩论，不要提问，不替用户决定。`;
    let text:string;try{text=(await runPiDecisionAgent({ctx,profile,systemPrompt:`${ROUNDTABLE_BASE_PROMPT}\n${PROFILE_PROMPTS[profile]}`,prompt}))||'我保留首轮判断；当前仍缺少能够改变判断的新事实。'}catch{text='我保留首轮判断；当前仍缺少能够改变判断的新事实。'}
    const view={profile,text:stripMarkdown(text)};crossViews.push(view);await emit?.({type:'stage',stage:'CROSS_ROUND',profile,index:i+1,total:selected.length,view});}
  await emit?.({type:'stage',stage:'SYNTHESIS'});
  const allViews=[...firstRound,...crossViews];const synthesisInput=allViews.map(view=>({顾问:AGENT_PROFILE_LABELS[view.profile],观点:view.text}));const synthesisPrompt=`你是圆桌协调器。不得修改专家原意，不得以多数票替用户决定。议题：${topic}。首轮与一次交叉回应：${JSON.stringify(synthesisInput)}。调用只读工具核对来源后，只返回 AgentReport JSON，突出共识、冲突、未知项与下一步。`;let report=fallbackReport(ctx,[]);try{const raw=await runPiDecisionAgent({ctx,profile:'QUICK_DECISION',systemPrompt:BASE_PROMPT,prompt:synthesisPrompt,timeoutMs:25_000});if(raw)report=normalizeReport(extractObject(raw),ctx)}catch{/* 使用可追溯降级报告 */}return{views:allViews,report,metadata:{topic,profiles:selected,phase:'SUMMARY',stages:2,followupsUsed:0}};
}

export async function runRoundtableFollowup(ctx:AgentContext,profiles:AgentProfileId[],topic:string,question:string,previousReport:AgentReport){
  const selected=[...new Set(profiles)].slice(0,3);const views=await Promise.all(selected.map(async profile=>{const prompt=`这是圆桌报告后的唯一一次补充讨论。原议题：${topic}。用户补充问题：${question}。已有报告：${JSON.stringify(previousReport)}。调用需要的只读工具，只回应这个补充问题，并明确说明新增信息改变了什么、仍缺什么。不要开启新的辩论，不要反问，不替用户决定。`;try{return{profile,text:(await runPiDecisionAgent({ctx,profile,systemPrompt:`${BASE_PROMPT}\n${PROFILE_PROMPTS[profile]}`,prompt}))||'当前没有新增事实足以改变已有判断。'}}catch{return{profile,text:'当前没有新增事实足以改变已有判断。'}}}));
  const synthesisPrompt=`你是圆桌协调器。原议题：${topic}。用户唯一一次补充问题：${question}。已有报告：${JSON.stringify(previousReport)}。顾问补充回应：${JSON.stringify(views)}。只返回 AgentReport JSON，保留原结论中仍成立的部分，并标出新增信息、变化和未知项；不得多数表决，不替用户决定。`;let report=previousReport;try{const raw=await runPiDecisionAgent({ctx,profile:'QUICK_DECISION',systemPrompt:BASE_PROMPT,prompt:synthesisPrompt});if(raw)report=normalizeReport(extractObject(raw),ctx)}catch{/* 保留上一版可追溯报告 */}return{views,report,metadata:{topic,profiles:selected,phase:'FOLLOWUP_SUMMARY',stages:3,followupsUsed:1,followupQuestion:question}};
}

export const AGENT_MAX_QUESTIONS=3;
