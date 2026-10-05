export class ChatError extends Error {
  constructor(code, status=400) { super(code); this.code=code; this.status=status; }
}
export const SECTIONS=new Set(['lecture-overview','lecture-experiment','lecture-code','lecture-practice']);
function object(value, allowed) {
  return value && typeof value==='object' && !Array.isArray(value) && Object.keys(value).every(k=>allowed.includes(k));
}
export function sessionBody(body) {
  if (!object(body,['course_id','language','invitation_code']) || body.course_id!=='ECE685' ||
      !['en','zh'].includes(body.language) || typeof body.invitation_code!=='string' ||
      !/^[a-zA-Z0-9_-]{16,128}$/.test(body.invitation_code)) throw new ChatError('invite_invalid',401);
  return body;
}
export function messageBody(body) {
  if (!object(body,['course_id','lecture_id','language','context','message','client_request_id']) ||
      body.course_id!=='ECE685' || !/^L\d{2}b?$/.test(body.lecture_id) || !['en','zh'].includes(body.language) ||
      typeof body.message!=='string' || !body.message.trim() || body.message.length>4000 ||
      typeof body.client_request_id!=='string' || !/^[a-zA-Z0-9-]{1,128}$/.test(body.client_request_id))
    throw new ChatError('invalid_request');
  const c=body.context;
  if (c===null) return body;
  if (!object(c,['kind','section_id','slide_number','selection_text']) ||
      !['slide','lesson','selection','code'].includes(c.kind) || !SECTIONS.has(c.section_id) ||
      typeof c.selection_text!=='string' || c.selection_text.length>4000) throw new ChatError('invalid_context');
  if (c.slide_number!==null && (!Number.isSafeInteger(c.slide_number) || c.slide_number<1 ||
      c.section_id!=='lecture-overview' || !['slide','selection'].includes(c.kind))) throw new ChatError('invalid_context');
  if ((c.kind==='slide' && c.slide_number===null) || (c.kind==='code' && c.section_id!=='lecture-code'))
    throw new ChatError('invalid_context');
  return body;
}
export function contextId(body) {
  if (!body.context) return null;
  const c=body.context;
  return c.slide_number===null ? `ECE685:${body.lecture_id}:lesson:${body.language}:${c.section_id}` :
    `ECE685:${body.lecture_id}:slide:${String(c.slide_number).padStart(3,'0')}`;
}
export async function readJSON(request) {
  if (request.headers.get('Content-Type')?.split(';')[0].trim()!=='application/json') throw new ChatError('invalid_request');
  const reader=request.body?.getReader();
  if (!reader) throw new ChatError('invalid_request');
  let size=0, chunks=[];
  try {
    for (;;) {
      const {value,done}=await reader.read(); if (done) break;
      size+=value.byteLength;
      if (size>32768) { await reader.cancel(); throw new ChatError('invalid_request',413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes=new Uint8Array(size); let offset=0;
  for (const chunk of chunks) { bytes.set(chunk,offset); offset+=chunk.length; }
  try { return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)); }
  catch { throw new ChatError('invalid_request'); }
}
export async function sha256(value) {
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export async function keyedHash(secret,value) {
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const bytes=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export function randomToken() {
  return [...crypto.getRandomValues(new Uint8Array(32))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
