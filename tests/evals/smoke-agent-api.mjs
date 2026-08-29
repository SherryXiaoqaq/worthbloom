const baseUrl=process.env.AGENT_TEST_BASE_URL||'http://127.0.0.1:3002';
const requestId=process.env.AGENT_TEST_REQUEST_ID||'request-iceland';
const expectedRevision=Number(process.env.AGENT_TEST_REVISION||1);

const cases=[
  {id:'move-forward',expected:'MOVE_FORWARD',answers:['我已经请好假，也确定了出发日期','我没有替代方案，这个计划想了很久','预算可控，并且已经完成基础计划']},
  {id:'pause',expected:'PAUSE',answers:['我没有具体使用场景，也有已有替代','最近预算压力很大','我担心只是冲动，而且没时间']},
  {id:'collect-more',expected:'COLLECT_MORE_INFO',answers:['我有一点想去，但暂不确定日期','可能有替代，也可能没有','预算大概可以，不过还没有确认']},
];

async function post(body){
  const response=await fetch(`${baseUrl}/api/agent`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const data=await response.json();
  if(!response.ok)throw new Error(`${response.status} ${data.code||''}: ${data.error||'Agent API failed'}`);
  return data;
}

const results=[];
for(const item of cases){
  const started=await post({action:'start_session',requestId,expectedRevision,profileId:'QUICK_DECISION',mode:'SINGLE',forceNew:true});
  const sessionId=started.session.id;
  for(const answer of item.answers)await post({action:'reply',sessionId,answer});
  const completed=await post({action:'generate_report',sessionId});
  const report=completed.session.report;
  if(report?.workingConclusion?.direction!==item.expected)throw new Error(`${item.id}: expected ${item.expected}, got ${report?.workingConclusion?.direction}`);
  if(!report.workingConclusion.summary)throw new Error(`${item.id}: missing working conclusion summary`);
  results.push({id:item.id,direction:report.workingConclusion.direction,generatedBy:report.generatedBy});
}

console.log(JSON.stringify({ok:true,scope:'live local Agent API',externalModelExpected:false,results},null,2));
