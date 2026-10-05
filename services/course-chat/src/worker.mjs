import {ChatError,messageBody,sessionBody,readJSON,sha256,keyedHash,randomToken} from './validation.mjs';
import {Store,citation} from './store.mjs';
import {prompt,openAI,mockProvider,readHistory,shortHistory} from './provider.mjs';
import {scheduled} from './cleanup.mjs';

function number(env,key,value,min,max) {
  const n=Number(env[key] ?? value);
  if (!Number.isSafeInteger(n) || n<min || n>max) throw new ChatError('service_unavailable',503);
  return n;
}
export function configuration(env,url) {
  const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname), mode=env.CHAT_MODE || 'live';
  if (!env.CHAT_DB || typeof env.INVITE_PEPPER!=='string' || env.INVITE_PEPPER.length<32 ||
      !['live','mock'].includes(mode) || (mode==='mock' && !local)) throw new ChatError('service_unavailable',503);
  if (mode==='live' && (!env.OPENAI_API_KEY || !/^[a-zA-Z0-9_.:-]{1,100}$/.test(env.CHAT_MODEL || '')))
    throw new ChatError('service_unavailable',503);
  const reasoningEffort=env.CHAT_REASONING_EFFORT ||
    (['gpt-6-astra','gpt-6.1-sol'].includes(env.CHAT_MODEL)?'medium':undefined);
  if (reasoningEffort && !['low','medium','high','xhigh','max'].includes(reasoningEffort))
    throw new ChatError('service_unavailable',503);
  const origins=(env.ALLOWED_ORIGINS || '').split(',').map(x=>x.trim()).filter(Boolean);
  if (!origins.length || origins.some(value=>{
    try { const u=new URL(value); return u.origin!==value || (u.protocol!=='https:' && !(local && ['localhost','127.0.0.1','[::1]'].includes(u.hostname) && u.protocol==='http:')); }
    catch { return true; }
  })) throw new ChatError('service_unavailable',503);
  return {mode,model:env.CHAT_MODEL,reasoningEffort,origins,
    sessionSeconds:number(env,'SESSION_TTL_SECONDS',7200,300,86400),
    sessionLimit:number(env,'SESSION_MESSAGE_LIMIT',30,1,200),
    dailyLimit:number(env,'GLOBAL_DAILY_LIMIT',200,1,10000),
    concurrencyLimit:number(env,'GLOBAL_CONCURRENCY_LIMIT',3,1,20),
    maxTokens:number(env,'MAX_OUTPUT_TOKENS',1600,256,16384),
    timeoutSeconds:number(env,'REQUEST_TIMEOUT_SECONDS',60,5,75)};
}
function json(body,status,headers) {
  return Response.json(body,{status,headers:{...headers,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
export async function handle(request,env,ctx={},deps={}) {
  const url=new URL(request.url),path=url.pathname;
  let now=Math.floor(Date.now()/1000);
  const cors={'Vary':'Origin'};
  let store;
  try {
    const config=configuration(env,url), origin=request.headers.get('Origin');
    if (origin && !config.origins.includes(origin)) throw new ChatError('origin_rejected',403);
    if (origin) cors['Access-Control-Allow-Origin']=origin;
    if (request.method==='OPTIONS') {
      if (!origin) throw new ChatError('origin_rejected',403);
      return new Response(null,{status:204,headers:{...cors,'Access-Control-Allow-Methods':'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Max-Age':'600'}});
    }
    store=new Store(env.CHAT_DB);
    if (path==='/api/course-chat/health' && request.method==='GET') {
      const version=await store.active();
      if ((config.mode==='mock')!==(version.provider==='mock')) throw new ChatError('service_unavailable',503);
      return json({status:'ok',mode:config.mode==='mock'?'demo':'live',course_id:'ECE685',corpus_version:version.version},200,cors);
    }
    if (!['/api/course-chat/session','/api/course-chat/messages'].includes(path)) throw new ChatError('not_found',404);
    if (request.method!=='POST') throw new ChatError('method_not_allowed',405);
    // Cleanup is awaited: expired transcript rows are not left to a best-effort response task.
    await store.cleanup(now);
    const body=await readJSON(request);
    now=Math.floor(Date.now()/1000);
    if (path.endsWith('/session')) {
      const hour=Math.floor(now/3600), minute=Math.floor(now/60);
      const ip=request.headers.get('CF-Connecting-IP') || 'local';
      await store.authAttempt('ip:'+await keyedHash(env.INVITE_PEPPER,'ip:'+ip)+':'+hour,(hour+1)*3600,20);
      await store.authAttempt('global:'+minute,(minute+1)*60,100);
      sessionBody(body);
      const active=await store.active();
      if ((config.mode==='mock')!==(active.provider==='mock')) throw new ChatError('service_unavailable',503);
      const invite=await keyedHash(env.INVITE_PEPPER,'invite:'+body.invitation_code),token=randomToken();
      const expiry=now+config.sessionSeconds;
      await store.createSession(await sha256(token),invite,now,expiry);
      return json({session_token:token,expires_at:new Date(expiry*1000).toISOString(),mode:config.mode==='mock'?'demo':'live'},200,cors);
    }
    const auth=request.headers.get('Authorization') || '';
    if (!/^Bearer [a-f0-9]{64}$/.test(auth)) throw new ChatError('unauthorized',401);
    const hash=await sha256(auth.slice(7));await store.session(hash,now);
    messageBody(body);
    const version=await store.active(),background=await store.background(version.version,body);
    if ((config.mode==='mock')!==(version.provider==='mock')) throw new ChatError('service_unavailable',503);
    const selection=await store.doc(version.version,version.selection_doc_id);
    if (selection?.source_type!=='course_material_selection' || selection.edition!==6)
      throw new ChatError('service_unavailable',503);
    await store.reserve(hash,body.client_request_id,version.version,Math.floor(Date.now()/1000),config);
    // Read history after acquiring the session reservation; another turn may have just completed.
    const session=await store.session(hash,Math.floor(Date.now()/1000));
    return stream(request,env,ctx,deps,store,hash,session,body,version,background,selection,config,cors);
  } catch (e) {
    const error=e instanceof ChatError ? e : new ChatError('service_error',503);
    return json({error:{code:error.code}},error.status,cors);
  }
}

function stream(request,env,ctx,deps,store,hash,session,body,version,background,selection,config,cors) {
  const abort=new AbortController(),start=Date.now(),history=readHistory(session,version.version);
  let disconnected=false,timedOut=false;
  const stop=()=>{disconnected=true;abort.abort(new Error('cancelled'));};
  request.signal.addEventListener('abort',stop,{once:true});
  if (request.signal.aborted) stop();
  const timer=setTimeout(()=>{timedOut=true;abort.abort(new Error('timeout'));},config.timeoutSeconds*1000);
  const encode=new TextEncoder();
  const readable=new ReadableStream({
    start(controller) {
      const emit=(event,data)=>{
        if (disconnected) return;
        controller.enqueue(encode.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      const run=async()=>{
        let answer='',status='failed',error=null,usage=null,nextHistory=null;
        try {
          emit('start',{request_id:body.client_request_id,mode:config.mode==='mock'?'demo':'live',corpus_version:version.version});
          const events=config.mode==='mock' ? mockProvider(body,background,abort.signal) :
            openAI(prompt(body,background,selection,history,version,config),env.OPENAI_API_KEY,abort.signal,deps.fetch || fetch);
          let complete=false;
          for await (const event of events) {
            if (abort.signal.aborted) throw abort.signal.reason;
            if (event.type==='delta') { answer+=event.text;emit('delta',{text:event.text}); }
            else if (event.type==='completed') {
              usage=event.usage;
              const sources=new Map();
              if (background.current) {
                const source=citation(background.current,body.language,body.language==='zh'?'当前背景 · ':'Current context · ');
                sources.set(source.doc_id,source);
              }
              if (event.fileIds.length>20) throw new ChatError('source_mapping_error',502);
              for (const id of event.fileIds) { const source=await store.source(version.version,id,body.language);sources.set(source.doc_id,source); }
              if (sources.size>20) throw new ChatError('source_mapping_error',502);
              emit('sources',{sources:[...sources.values()]});
              complete=true;
            }
          }
          if (!complete || !answer) throw new ChatError('incomplete_stream',502);
          // Complete persisted turn before sending done. Failed/incomplete answers never become history.
          nextHistory=shortHistory(history,body,answer);
          await store.finish(hash,body.client_request_id,'completed',null,usage,Date.now()-start,nextHistory,version.version);
          status='completed';emit('done',{complete:true});
        } catch (e) {
          error=timedOut?'request_timeout':disconnected?'cancelled':e instanceof ChatError?e.code:'service_error';
          status=disconnected?'cancelled':'failed';
          emit('error',{code:error});
        } finally {
          clearTimeout(timer);request.signal.removeEventListener('abort',stop);
          if (status!=='completed') {
            try { await store.finish(hash,body.client_request_id,status,error,usage,Date.now()-start,null,version.version); }
            catch { /* The expiring lease releases concurrency if D1 is temporarily unavailable. */ }
          }
          // Logs contain no invitation, token, question, selected code or answer.
          (deps.log || console.log)(JSON.stringify({event:'course_chat_request',request_id:body.client_request_id,
            corpus_version:version.version,status,error_code:error,duration_ms:Date.now()-start,usage}));
          if (!disconnected) controller.close();
        }
      };
      const work=run();
      ctx.waitUntil?.(work);
    },
    cancel() { stop(); }
  });
  return new Response(readable,{headers:{...cors,'Content-Type':'text/event-stream; charset=utf-8',
    'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
export default {fetch:handle,scheduled};
