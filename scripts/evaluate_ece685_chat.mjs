// Called only by the validating Python entry point; never prints job/credentials.
import {readFileSync,writeFileSync,renameSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createRequire} from 'node:module';
import {randomBytes} from 'node:crypto';
import {handle} from '../services/course-chat/src/worker.mjs';
import {keyedHash,sha256} from '../services/course-chat/src/validation.mjs';
import {shortHistory} from '../services/course-chat/src/provider.mjs';
const {consumeStream}=createRequire(import.meta.url)('../assets/js/ece685-chat.js');
const root=resolve(new URL('..',import.meta.url).pathname);
class LocalD1 {
  constructor(db){this.db=db;}
  prepare(sql){
    const db=this.db;
    return {args:[],bind(...args){this.args=args;return this;},
      async first(){return db.prepare(sql).get(...this.args)||null;},
      async all(){return {results:db.prepare(sql).all(...this.args)};},
      async run(){return {meta:db.prepare(sql).run(...this.args)};}};
  }
  async batch(statements){
    this.db.exec('BEGIN');
    try{const values=[];for(const statement of statements)values.push(await statement.run());this.db.exec('COMMIT');return values;}
    catch(error){this.db.exec('ROLLBACK');throw error;}
  }
}
function save(path,value){const temporary=path+'.tmp';writeFileSync(temporary,JSON.stringify(value,null,2)+'\n',{mode:0o600});renameSync(temporary,path);}
function completedAudit(text){
  for(const frame of text.replace(/\r\n/g,'\n').split('\n\n')){
    const raw=frame.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');
    if(!raw||raw==='[DONE]')continue;
    const event=JSON.parse(raw);if(event.type==='response.completed')return event.response;
  }
  return null;
}
async function main(){
  let input='';for await(const part of process.stdin)input+=part;
  const job=JSON.parse(input);input='';
  if(!Array.isArray(job.cases)||job.cases.length>50)throw new Error('invalid_evaluation');
  const db=new DatabaseSync(':memory:');db.exec(readFileSync(join(root,'services/course-chat/migrations/0001.sql'),'utf8'));
  const plan=JSON.parse(readFileSync(join(job.index,'sql-import-plan.json'),'utf8'));
  const mapping=JSON.parse(readFileSync(join(job.index,'index-state.json'),'utf8'));
  for(const file of plan.files)db.exec(readFileSync(join(job.index,file),'utf8'));
  // Activate only this disposable in-memory DB. No Cloudflare connection is made here.
  db.exec(readFileSync(join(job.index,'activate.sql'),'utf8'));
  const env={CHAT_DB:new LocalD1(db),INVITE_PEPPER:randomBytes(48).toString('hex'),CHAT_MODE:'live',
    OPENAI_API_KEY:job.api_key,CHAT_MODEL:job.model,CHAT_REASONING_EFFORT:job.reasoning,
    MAX_OUTPUT_TOKENS:String(job.max_output_tokens),REQUEST_TIMEOUT_SECONDS:String(job.timeout_seconds),
    ALLOWED_ORIGINS:'http://127.0.0.1:8853',GLOBAL_DAILY_LIMIT:'100',SESSION_MESSAGE_LIMIT:'30'};
  delete job.api_key;
  const invitation=randomBytes(24).toString('base64url'),now=Math.floor(Date.now()/1000);
  db.prepare('INSERT INTO invitations(invite_hash,expires_at,max_messages,max_sessions) VALUES(?,?,100,50)')
    .run(await keyedHash(env.INVITE_PEPPER,'invite:'+invitation),now+7200);
  const path=join(job.output,'results-private.json');
  const report=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):
    {fingerprint:job.fingerprint,model:job.model,reasoning:job.reasoning,corpus_version:job.corpus_version,
      vector_store_id:mapping.vector_store_id,criterion_review:'pending',results:[]};
  if(report.fingerprint!==job.fingerprint||report.vector_store_id!==mapping.vector_store_id)
    throw new Error('evaluation_configuration_changed');
  const fileDocs=new Map(Object.entries(mapping.files).map(([id,entry])=>[entry.file_id,id]));
  const sessions=new Map();
  function request(endpoint,body,token){return new Request('http://127.0.0.1:8853/api/course-chat/'+endpoint,
    {method:'POST',headers:{'Content-Type':'application/json',Origin:'http://127.0.0.1:8853',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});}
  for(const test of job.cases){
    const previous=report.results.find(row=>row.id===test.id);
    if(previous&&(!job.retry_failed||previous.status==='completed'))continue;
    const group=test.group||test.id;
    if(!sessions.has(group)){
      const response=await handle(request('session',{course_id:'ECE685',language:test.language||'zh',invitation_code:invitation}),env);
      const data=await response.json();if(!response.ok)throw new Error(data.error?.code||'session_failed');
      sessions.set(group,data.session_token);
      let history=[];
      for(const earlier of report.results.filter(row=>row.group===group&&row.status==='completed'))
        history=shortHistory(history,earlier.request,earlier.answer);
      if(history.length)db.prepare('UPDATE sessions SET history_json=?,history_version=? WHERE token_hash=?')
        .run(JSON.stringify(history),job.corpus_version,await sha256(data.session_token));
    }
    const body={course_id:'ECE685',lecture_id:test.lecture_id||'L05',language:test.language||'zh',
      context:test.context??null,message:test.question,client_request_id:test.id};
    let auditPromise=Promise.resolve(null),answer='',sources=[],provider=null;
    const fetcher=async(url,options)=>{
      const payload=JSON.parse(options.body);payload.include=['file_search_call.results'];
      const response=await fetch(url,{...options,body:JSON.stringify(payload)});
      if(!response.ok||!response.body)return response;
      const [live,audit]=response.body.tee();
      auditPromise=new Response(audit).text().then(completedAudit).catch(()=>null);
      return new Response(live,{status:response.status,headers:response.headers});
    };
    const started=Date.now();
    const result={id:test.id,group,question:test.question,criteria:test.criteria,request:body,
      expected_docs:test.expected_docs,status:'running',answer:'',sources:[],criterion_review:'pending'};
    try{
      const response=await handle(request('messages',body,sessions.get(group)),env,{}, {fetch:fetcher,log:()=>{}});
      await consumeStream(response,{delta:part=>{answer+=part;},sources:rows=>{sources=rows;}});
      provider=await auditPromise;
      if(!provider)throw new Error('missing_provider_completion');
      const retrieved=(provider.output||[]).filter(item=>item.type==='file_search_call')
        .flatMap(item=>item.results||[]).map(item=>fileDocs.get(item.file_id)).filter(Boolean);
      const cited=sources.map(source=>source.doc_id);
      Object.assign(result,{status:'completed',answer,sources,usage:provider.usage,
        retrieved_docs:[...new Set(retrieved)],retrieval_expected_hits:test.expected_docs.filter(id=>retrieved.includes(id)),
        citation_expected_hits:test.expected_docs.filter(id=>cited.includes(id))});
    }catch(error){Object.assign(result,{status:'failed',error_code:error.code||'evaluation_failed',answer,sources});}
    result.duration_ms=Date.now()-started;
    report.results=report.results.filter(row=>row.id!==test.id);report.results.push(result);save(path,report);
    console.log(`Evaluation ${test.id}: ${result.status}, ${result.duration_ms} ms, citations ${sources.length}`);
    if(result.status==='failed'){db.close();process.exitCode=1;return;}
  }
  db.close();console.log(`Private evaluation results: ${path}; criterion review remains required.`);
}
try{await main();}catch{console.error('Evaluation stopped; no credentials or raw provider errors printed.');process.exitCode=1;}
