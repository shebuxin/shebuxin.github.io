import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {Worker} from 'node:worker_threads';
import {createRequire} from 'node:module';
import {handle,configuration} from '../services/course-chat/src/worker.mjs';
import {Store} from '../services/course-chat/src/store.mjs';
import {sha256,keyedHash,messageBody} from '../services/course-chat/src/validation.mjs';
import {prompt,openAI,shortHistory,readHistory} from '../services/course-chat/src/provider.mjs';
import {scheduled} from '../services/course-chat/src/cleanup.mjs';

const migration=readFileSync(new URL('../services/course-chat/migrations/0001.sql',import.meta.url),'utf8');
const {consumeStream}=createRequire(import.meta.url)('../assets/js/ece685-chat.js');
const pepper='test-only-pepper-with-more-than-32-characters',invite='test-invitation-123456789',version='ece685-test';
const currentId='ECE685:L05:slide:012',choiceId='ECE685:reference:platform-textbook-selection:decision:edition';
class D1 {
  constructor(db) { this.db=db; }
  prepare(sql) {
    const db=this.db;
    const statement={args:[],bind(...args) { this.args=args;return this; },
      async first() { return db.prepare(sql).get(...this.args) || null; },
      async all() { return {results:db.prepare(sql).all(...this.args)}; },
      async run() { return {meta:db.prepare(sql).run(...this.args)}; }};
    return statement;
  }
  async batch(statements) {
    this.db.exec('BEGIN');
    try { const result=[];for (const stmt of statements) result.push(await stmt.run());this.db.exec('COMMIT');return result; }
    catch (e) { this.db.exec('ROLLBACK');throw e; }
  }
}
async function fixture(path=':memory:',mode='mock',limits={}) {
  const db=new DatabaseSync(path);db.exec(migration);
  const now=Math.floor(Date.now()/1000),hash=await keyedHash(pepper,'invite:'+invite);
  db.prepare('INSERT INTO invitations(invite_hash,expires_at,max_messages,max_sessions) VALUES(?,?,?,?)').run(hash,now+86400,100,50);
  db.prepare('INSERT INTO course_versions VALUES(?,?,?,?,?,?,?,?,?)').run(version,'ECE685','vs_test',mode==='mock'?'mock':'openai',4,choiceId,'manifest','ready',now);
  const docs=[
    {doc_id:currentId,kind:'slide',source_type:'student_slides',lecture_id:'L05',page_number:12,
      text:'RMS',source_urls:{en:'/teaching/course-development/ece685/l05-single-phase-ac-i/?slide=12#lecture-overview',zh:'/zh/teaching/course-development/ece685/l05-single-phase-ac-i/?slide=12#lecture-overview'}},
    {doc_id:'ECE685:L05:lesson:zh:lecture-overview',kind:'lesson',source_type:'platform_lesson',lecture_id:'L05',section_id:'lecture-overview',text:'Concepts',source_urls:{en:'/x',zh:'/x'}},
    {doc_id:choiceId,kind:'reference',source_type:'course_material_selection',edition:6,text:'Sixth edition, preserve original syllabus.',citation:{label:'Instructor textbook selection'}},
    {doc_id:'ECE685:reference:book:verified:rms',kind:'reference',source_type:'verified_reference_note',lecture_ids:['L05'],text:'RMS = peak / sqrt(2)',citation:{label:'Sixth edition printed p. 40 (PDF p. 60)'}}
  ];
  for (let i=0;i<docs.length;i++) { const d=docs[i];db.prepare('INSERT INTO documents VALUES(?,?,?,?,?,?)').run(version,d.doc_id,'file-'+i,await sha256(d.text),d.text,JSON.stringify(d)); }
  db.prepare('UPDATE courses SET active_version=?').run(version);
  const env={CHAT_DB:new D1(db),INVITE_PEPPER:pepper,CHAT_MODE:mode,ALLOWED_ORIGINS:'http://127.0.0.1:8790',
    OPENAI_API_KEY:'test-no-network',CHAT_MODEL:'test-model',...limits};
  return {db,env,now,hash,docs};
}
function request(path,body,token,origin='http://127.0.0.1:8790',signal) {
  return new Request('http://127.0.0.1:8790/api/course-chat/'+path,{method:'POST',
    headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(origin?{Origin:origin}:{})},body:JSON.stringify(body),signal});
}
async function connect(f) {
  const response=await handle(request('session',{course_id:'ECE685',language:'zh',invitation_code:invite}),f.env);
  assert.equal(response.status,200);return (await response.json()).session_token;
}
function question(id='req-1',context={kind:'slide',section_id:'lecture-overview',slide_number:12,selection_text:''}) {
  return {course_id:'ECE685',lecture_id:'L05',language:'zh',context,message:'什么意思？',client_request_id:id};
}
const quiet={log:()=>{}};
function providerResponse(events,fragment=7) {
  const text=events.map(e=>'event: '+e.type+'\r\ndata: '+JSON.stringify(e)+'\r\n\r\n').join('');
  const bytes=new TextEncoder().encode(text);
  return new Response(new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=fragment)c.enqueue(bytes.slice(i,i+fragment));c.close();}}),
    {headers:{'Content-Type':'text/event-stream'}});
}
function completed(ids=[]) { return {type:'response.completed',response:{status:'completed',usage:{input_tokens:50,output_tokens:10},
  output:[{type:'message',content:[{type:'output_text',annotations:ids.map(file_id=>({type:'file_citation',file_id,filename:'model-invented-name'}))}]}]}}; }

test('invitation/session tokens are hashed; origin rejects before model or DB changes',async()=>{
  const f=await fixture();
  const rejected=await handle(request('session',{course_id:'ECE685',language:'zh',invitation_code:invite},null,'https://evil.test'),f.env);
  assert.equal(rejected.status,403);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM sessions').get().n,0);
  const token=await connect(f),row=f.db.prepare('SELECT * FROM sessions').get();
  assert.equal(row.token_hash,await sha256(token));assert.ok(!JSON.stringify(row).includes(token));
  const bad=await handle(request('messages',question(),'a'.repeat(64)),f.env);
  assert.equal(bad.status,401);f.db.close();
});
test('expired/disabled invitations invalidate existing sessions',async()=>{
  const f=await fixture(),token=await connect(f);
  f.db.exec('UPDATE invitations SET enabled=0');
  assert.equal((await handle(request('messages',question(),token),f.env)).status,401);
  f.db.exec('UPDATE invitations SET enabled=1; UPDATE sessions SET expires_at=0');
  assert.equal((await handle(request('messages',question(),token),f.env)).status,401);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM sessions').get().n,0);f.db.close();
});
test('scheduled cleanup removes expired transcript/request rows without refunding course quota',async()=>{
  const f=await fixture(),token=await connect(f);
  await (await handle(request('messages',question(),token),f.env,{},quiet)).text();
  f.db.exec('UPDATE sessions SET expires_at=0');
  await scheduled({},f.env);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM sessions').get().n,0);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM requests').get().n,0);
  assert.equal(f.db.prepare('SELECT messages_used FROM invitations').get().messages_used,1);
  assert.equal(f.db.prepare('SELECT messages_used FROM daily_usage').get().messages_used,1);f.db.close();
});
test('physical page and published lecture gates reject client overrides without quota charge',async()=>{
  const f=await fixture(),token=await connect(f);
  for(const body of [{...question(),model:'fake'},{...question(),lecture_id:'L20'},
    {...question(),context:{...question().context,slide_number:35}},
    {...question(),context:{...question().context,kind:'code'}},
    {...question(),context:{...question().context,slide_number:true}}]) {
    assert.equal((await handle(request('messages',body,token),f.env)).status,400);
  }
  assert.equal(f.db.prepare('SELECT messages_used FROM sessions').get().messages_used,0);f.db.close();
});
test('complete streaming persists bounded follow-up history; duplicates cannot charge twice',async()=>{
  const f=await fixture(),token=await connect(f),logs=[];
  const response=await handle(request('messages',question(),token),f.env,{}, {log:v=>logs.push(v)});
  const text=await response.text();assert.match(text,/event: done/);assert.match(text,/Current context|当前背景/);
  const session=f.db.prepare('SELECT * FROM sessions').get();assert.equal(JSON.parse(session.history_json).length,2);
  const duplicate=await handle(request('messages',question(),token),f.env);
  assert.equal((await duplicate.json()).error.code,'duplicate_request');assert.equal(session.messages_used,1);
  assert.ok(!logs.join('').includes('什么意思'));assert.ok(!logs.join('').includes(token));f.db.close();
});
test('existing browser stream consumer accepts the backend response contract end to end',async()=>{
  const f=await fixture(),token=await connect(f),events=[];
  const response=await handle(request('messages',question(),token),f.env,{},quiet);
  await consumeStream(response,{start:d=>events.push(['start',d]),delta:d=>events.push(['delta',d]),
    sources:d=>events.push(['sources',d])});
  assert.equal(events[0][1].mode,'demo');assert.ok(events.some(e=>e[0]==='sources'));
  assert.equal(f.db.prepare('SELECT status FROM requests').get().status,'completed');f.db.close();
});
test('session, invitation and global day caps apply across cleared/new sessions',async()=>{
  const f=await fixture(':memory:','mock',{SESSION_MESSAGE_LIMIT:'1',GLOBAL_DAILY_LIMIT:'2'}),a=await connect(f);
  await (await handle(request('messages',question('one'),a),f.env,{},quiet)).text();
  assert.equal((await (await handle(request('messages',question('two'),a),f.env)).json()).error.code,'quota_exceeded');
  const b=await connect(f);await (await handle(request('messages',question('three'),b),f.env,{},quiet)).text();
  const c=await connect(f);assert.equal((await (await handle(request('messages',question('four'),c),f.env)).json()).error.code,'quota_exceeded');
  assert.equal(f.db.prepare('SELECT messages_used FROM daily_usage').get().messages_used,2);
  f.db.exec('UPDATE invitations SET max_messages=messages_used');
  assert.equal((await (await handle(request('session',{course_id:'ECE685',language:'zh',invitation_code:invite}),f.env)).json()).error.code,'quota_exceeded');
  f.db.close();
});
test('per-session/global concurrency leases and duplicate IDs survive different store instances',async()=>{
  const f=await fixture(),a=await connect(f),b=await connect(f);
  const config={timeoutSeconds:60,sessionLimit:5,dailyLimit:10,concurrencyLimit:1};
  const first=new Store(f.env.CHAT_DB),second=new Store(f.env.CHAT_DB),ah=await sha256(a),bh=await sha256(b);
  await first.reserve(ah,'one',version,f.now,config);
  await assert.rejects(second.reserve(ah,'one',version,f.now,config),e=>e.code==='duplicate_request');
  await assert.rejects(second.reserve(ah,'two',version,f.now,config),e=>e.code==='rate_limited');
  await assert.rejects(second.reserve(bh,'two',version,f.now,config),e=>e.code==='rate_limited');
  await first.finish(ah,'one','cancelled','cancelled',null,10,null,version);
  await second.reserve(bh,'two',version,f.now,config);
  assert.equal(f.db.prepare('SELECT messages_used FROM invitations').get().messages_used,2);f.db.close();
});
test('live provider request uses server model/active index, store=false, and mapped citations',async()=>{
  const f=await fixture(':memory:','live'),token=await connect(f);let payload;
  const fakeFetch=async(url,options)=>{assert.equal(url,'https://api.openai.com/v1/responses');payload=JSON.parse(options.body);
    return providerResponse([{type:'response.output_text.delta',delta:'解释 √2'},completed(['file-3'])]);};
  const response=await handle(request('messages',question(),token),f.env,{}, {...quiet,fetch:fakeFetch});
  const text=await response.text();assert.match(text,/event: done/);assert.match(text,/printed p. 40/);assert.ok(!text.includes('model-invented-name'));
  assert.equal(payload.store,false);assert.equal(payload.model,'test-model');assert.deepEqual(payload.tools[0].vector_store_ids,['vs_test']);
  assert.match(payload.instructions,/SIXTH edition/);assert.match(payload.input[0].content,/student_slides/);
  assert.equal(f.db.prepare('SELECT input_tokens FROM requests').get().input_tokens,50);
  await (await handle(request('messages',question('follow-up',null),token),f.env,{}, {...quiet,fetch:fakeFetch})).text();
  assert.equal(payload.input.length,3);assert.match(payload.input[0].content,/slide_number/);f.db.close();
});
test('flagship reasoning budget reaches the Responses request; unsupported effort fails before a model call',async()=>{
  const f=await fixture(':memory:','live',{CHAT_MODEL:'gpt-6-astra',CHAT_REASONING_EFFORT:'medium',MAX_OUTPUT_TOKENS:'8192'});
  const token=await connect(f);let payload,calls=0;
  const fakeFetch=async(url,options)=>{calls++;payload=JSON.parse(options.body);
    return providerResponse([{type:'response.output_text.delta',delta:'Explanation'},completed(['file-3'])]);};
  const response=await handle(request('messages',question(),token),f.env,{}, {...quiet,fetch:fakeFetch});
  assert.match(await response.text(),/event: done/);assert.deepEqual(payload.reasoning,{effort:'medium'});
  assert.equal(payload.max_output_tokens,8192);assert.equal(payload.model,'gpt-6-astra');
  f.env.CHAT_REASONING_EFFORT='none';
  const invalid=await handle(request('messages',question('invalid'),token),f.env,{}, {...quiet,fetch:fakeFetch});
  assert.equal(invalid.status,503);assert.equal(calls,1);f.db.close();
});
test('a turn reads the latest committed history after acquiring its reservation',async()=>{
  const f=await fixture(':memory:','live'),token=await connect(f);let payload;
  const base=f.env.CHAT_DB.prepare.bind(f.env.CHAT_DB);
  f.env.CHAT_DB.prepare=sql=>{
    const stmt=base(sql),run=stmt.run;
    if(sql.startsWith('INSERT INTO requests')) stmt.run=async function(){
      f.db.prepare('UPDATE sessions SET history_json=?,history_version=?').run(JSON.stringify([
        {role:'user',content:'a prior question'},{role:'assistant',content:'the most recent committed explanation'}]),version);
      return run.call(this);
    };
    return stmt;
  };
  const fetcher=async(url,options)=>{payload=JSON.parse(options.body);return providerResponse([
    {type:'response.output_text.delta',delta:'follow-up'},completed()]);};
  await (await handle(request('messages',question(),token),f.env,{}, {...quiet,fetch:fetcher})).text();
  assert.equal(payload.input[1].content,'the most recent committed explanation');f.db.close();
});
test('truncated, incomplete and unknown citation streams fail without saving answer history',async()=>{
  for (const events of [[{type:'response.output_text.delta',delta:'partial'}],
    [{type:'response.output_text.delta',delta:'partial'},{type:'response.incomplete'}],
    [{type:'response.output_text.delta',delta:'partial'},completed(['file-outside-version'])]]) {
    const f=await fixture(':memory:','live'),token=await connect(f);
    const text=await (await handle(request('messages',question(),token),f.env,{}, {...quiet,fetch:async()=>providerResponse(events)})).text();
    assert.match(text,/partial/);assert.match(text,/event: error/);assert.ok(!text.includes('event: done'));
    assert.equal(f.db.prepare('SELECT history_json FROM sessions').get().history_json,'[]');
    assert.equal(f.db.prepare('SELECT status FROM requests').get().status,'failed');f.db.close();
  }
});
test('cancellation aborts upstream, releases concurrency and excludes partial history',async()=>{
  const f=await fixture(':memory:','live'),token=await connect(f);let seenSignal;
  const fetcher=async(url,{signal})=>{seenSignal=signal;return new Response(new ReadableStream({
    start(c){c.enqueue(new TextEncoder().encode('data: {"type":"response.output_text.delta","delta":"partial"}\n\n'));
      signal.addEventListener('abort',()=>c.error(new Error('aborted')),{once:true});}
  }),{headers:{'Content-Type':'text/event-stream'}});};
  const tasks=[],response=await handle(request('messages',question(),token),f.env,{waitUntil:p=>tasks.push(p)},{...quiet,fetch:fetcher});
  const reader=response.body.getReader();await reader.read();await reader.cancel();await Promise.all(tasks);
  assert.equal(seenSignal.aborted,true);assert.equal(f.db.prepare('SELECT status FROM requests').get().status,'cancelled');
  assert.equal(f.db.prepare('SELECT history_json FROM sessions').get().history_json,'[]');f.db.close();
});
test('auth attempts are capped and mock mode cannot run on an internet hostname',async()=>{
  const f=await fixture();
  for(let i=0;i<20;i++) assert.equal((await handle(request('session',{course_id:'ECE685',language:'zh',invitation_code:'wrong-invitation-1234'}),f.env)).status,401);
  assert.equal((await handle(request('session',{course_id:'ECE685',language:'zh',invitation_code:invite}),f.env)).status,429);
  assert.throws(()=>configuration(f.env,new URL('https://course.test')),e=>e.code==='service_unavailable');f.db.close();
});
test('provider timeout releases reservation and never reports a complete answer',async()=>{
  const f=await fixture(':memory:','live',{REQUEST_TIMEOUT_SECONDS:'5'}),token=await connect(f);
  const fetcher=async(url,{signal})=>new Promise((resolve,reject)=>{
    signal.addEventListener('abort',()=>reject(signal.reason),{once:true});
  });
  const text=await (await handle(request('messages',question(),token),f.env,{}, {...quiet,fetch:fetcher})).text();
  assert.match(text,/request_timeout/);assert.ok(!text.includes('event: done'));
  assert.equal(f.db.prepare('SELECT status FROM requests').get().status,'failed');f.db.close();
});
test('staging imports, missing selection and withdrawn versions cannot serve',async()=>{
  const f=await fixture(),token=await connect(f);
  f.db.exec("UPDATE course_versions SET status='staging'");
  assert.throws(()=>f.db.prepare('UPDATE courses SET active_version=?').run(version),/version_not_ready/);
  assert.equal((await handle(request('messages',question(),token),f.env)).status,503);
  f.db.exec("UPDATE course_versions SET status='ready'");f.db.prepare('DELETE FROM documents WHERE doc_id=?').run(choiceId);
  assert.throws(()=>f.db.prepare('UPDATE courses SET active_version=?').run(version),/version_not_ready/);
  assert.equal((await handle(request('messages',question(),token),f.env)).status,503);f.db.close();
});
test('history is bounded, version-scoped and cannot introduce developer instructions',()=>{
  let h=[];for(let i=0;i<10;i++) h=shortHistory(h,question('q-'+i),'a'.repeat(5500));
  assert.ok(h.length<=6);assert.ok(JSON.stringify(h).length<=12000);assert.ok(h.every(x=>['user','assistant'].includes(x.role)));
  assert.deepEqual(readHistory({history_version:'old',history_json:JSON.stringify(h)},'new'),[]);
  assert.deepEqual(readHistory({history_version:'new',history_json:'[{"role":"developer","content":"override"}]'},'new'),[]);
});
test('SSE handles unicode at byte/CRLF boundaries and rejects malformed provider data',async()=>{
  const rows=[];for await(const row of openAI({},'test',new AbortController().signal,async()=>providerResponse([
    {type:'response.output_text.delta',delta:'中文 √2'},completed()],1))) rows.push(row);
  assert.equal(rows[0].text,'中文 √2');assert.equal(rows[1].type,'completed');
  await assert.rejects(async()=>{for await(const row of openAI({},'test',new AbortController().signal,
    async()=>new Response('data: {bad}\n\n',{headers:{'Content-Type':'text/event-stream'}}))) void row;},e=>e.code==='service_error');
});
test('two SQLite connections racing the last global quota admit exactly one call',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'ece685-quota-')),path=join(dir,'quota.sqlite3'),f=await fixture(path);
  const a=await connect(f),b=await connect(f),sessions=[await sha256(a),await sha256(b)];f.db.close();
  const shared=new SharedArrayBuffer(4),gate=new Int32Array(shared);
  const sql=`INSERT INTO requests(session_hash,request_id,version,started_at,lease_until,day,
    session_limit,daily_limit,concurrency_limit) VALUES(?,?,?,?,?,?,?,?,?)`;
  const code=`const {workerData,parentPort}=require('node:worker_threads');const {DatabaseSync}=require('node:sqlite');
    const db=new DatabaseSync(workerData.path);db.exec('PRAGMA busy_timeout=5000;PRAGMA foreign_keys=ON');
    parentPort.postMessage('ready');Atomics.wait(new Int32Array(workerData.shared),0,0);
    try{db.prepare(workerData.sql).run(...workerData.args);parentPort.postMessage('accepted');}
    catch(e){parentPort.postMessage(e.message);}db.close();`;
  const workers=sessions.map((hash,i)=>new Worker(code,{eval:true,workerData:{path,shared,sql,
    args:[hash,'race-'+i,version,f.now,f.now+90,new Date().toISOString().slice(0,10),10,1,10]}}));
  let ready=0;
  const results=await Promise.all(workers.map(w=>new Promise((resolve,reject)=>{
    w.on('error',reject);w.on('message',m=>{if(m==='ready'){if(++ready===2){Atomics.store(gate,0,1);Atomics.notify(gate,0);}}else resolve(m);});
  })));
  assert.equal(results.filter(x=>x==='accepted').length,1);assert.equal(results.filter(x=>x.includes('quota_exceeded')).length,1);
  const db=new DatabaseSync(path);assert.equal(db.prepare('SELECT messages_used FROM daily_usage').get().messages_used,1);db.close();
  await Promise.all(workers.map(w=>w.terminate()));rmSync(dir,{recursive:true});
});
