import { readFile } from 'node:fs/promises';

const source=new URL('./agent-council-cases.json',import.meta.url);
const cases=JSON.parse(await readFile(source,'utf8'));
const counts=new Map();
const ids=new Set();
for(const item of cases){
  if(!item.id||!item.profile||!item.category||!item.query||!item.expected||!item.risk)throw new Error(`Invalid fixture: ${JSON.stringify(item)}`);
  if(ids.has(item.id))throw new Error(`Duplicate id: ${item.id}`);
  ids.add(item.id);counts.set(item.profile,(counts.get(item.profile)||0)+1);
}
if(cases.length<48)throw new Error(`Expected at least 48 cases, got ${cases.length}`);
for(const required of ['QUICK_DECISION','RATIONAL_ANALYST','REVIEW_SYNTHESIZER','NAVAL_LENS','ROUNDTABLE'])if(!counts.has(required))throw new Error(`Missing profile: ${required}`);
console.log(JSON.stringify({ok:true,fixtureValidationOnly:true,modelCalls:0,total:cases.length,profiles:Object.fromEntries(counts)},null,2));
