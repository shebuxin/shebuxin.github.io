const assert = require('node:assert/strict');
const { test } = require('node:test');
const chat = require('../assets/js/ece685-chat.js');

const start = 'event: start\ndata: {"mode":"demo"}\n\n';
const delta = text => 'event: delta\ndata: ' + JSON.stringify({text}) + '\n\n';
const done = 'event: done\ndata: {"complete":true}\n\n';
function response(parts, headers = {'Content-Type':'text/event-stream'}) {
  return new Response(new ReadableStream({start(controller) { for (const part of parts) controller.enqueue(part); controller.close(); }}), {headers});
}
const bytes = text => new TextEncoder().encode(text);

test('message captures a fixed context and sends only the student contract', () => {
  const context = {kind:'slide',slide_number:12,section_id:'lecture-overview',selection_text:'',model:'override'};
  const body = chat.messageRequest('L05','zh',context,'  这里是什么意思？  ','request-1');
  context.slide_number = 13;
  assert.equal(body.context.slide_number,12);
  assert.equal(body.message,'这里是什么意思？');
  assert.equal(body.context.model,undefined);
  assert.deepEqual(Object.keys(body).sort(),['client_request_id','context','course_id','language','lecture_id','message']);
  assert(Object.isFrozen(body.context));
  assert.equal(chat.messageRequest('L05','en',null,'Question','request-2').context,null);
});

test('invalid page, section and oversized attached text fail before a request', () => {
  for (const context of [
    {kind:'slide',slide_number:0,section_id:'lecture-overview'},
    {kind:'slide',slide_number:1,section_id:'lecture-code'},
    {kind:'lesson',section_id:'teacher-solutions'},
    {kind:'code',section_id:'lecture-overview',selection_text:'print(1)'},
    {kind:'selection',section_id:'lecture-overview',selection_text:'x'.repeat(4001)}
  ]) assert.throws(()=>chat.messageRequest('L05','en',context,'Question','request'),/invalid_context/);
});

test('API configuration allows HTTPS and loopback preview, without credentials in URLs', () => {
  const page='https://shebuxin.github.io/lesson/';
  assert.equal(chat.apiBase('',page),null);
  assert.equal(chat.apiBase('/api/course-chat',page),'https://shebuxin.github.io/api/course-chat');
  assert.equal(chat.apiBase('http://127.0.0.1:8788/api/course-chat/',page),'http://127.0.0.1:8788/api/course-chat');
  for(const value of ['http://remote.example/api','javascript:alert(1)','https://key:secret@remote.example/api','https://remote.example/api?key=secret','https://remote.example/api#token']) assert.equal(chat.apiBase(value,page),null,value);
});

test('citations open known course sections and reject arbitrary or future URLs', () => {
  const page='https://shebuxin.github.io/teaching/ece685/l05-single-phase-ac-i/';
  const slugs=['l05-single-phase-ac-i'];
  const good='/zh/teaching/ece685/l05-single-phase-ac-i/?slide=12#lecture-overview';
  assert.equal(chat.citationHref(good,page,'',slugs),'https://shebuxin.github.io'+good);
  for(const value of ['javascript:alert(1)','https://evil.example'+good,'/assets/private/textbook.pdf',good.replace('l05-single-phase-ac-i','l20-three-phase-transformers-i'),good.replace('12','0'),good+'&secret=true',good.replace('lecture-overview','lecture-code'),'https://user:password@shebuxin.github.io'+good]) assert.equal(chat.citationHref(value,page,'',slugs),null,value);
  const base='/personal'+good;
  assert(chat.citationHref(base,'https://example.org/personal/lesson/','/personal',slugs));
  const legacy=good.replace('/teaching/','/teaching/course-development/');
  assert.equal(chat.citationHref(legacy,page,'',slugs),'https://shebuxin.github.io'+good);
  assert.equal(chat.citationHref('/personal'+legacy,'https://example.org/personal/lesson/','/personal',slugs),'https://example.org/personal'+good);
  assert.equal(chat.citationHref(legacy.replace('l05-single-phase-ac-i','l20-three-phase-transformers-i'),page,'',slugs),null);
});

test('SSE preserves Unicode across byte and frame boundaries', async () => {
  const data=bytes((start+delta('为什么 √2？')+done).replaceAll('\n','\r\n'));
  let text='',mode='';
  await chat.consumeStream(response(Array.from(data,value=>new Uint8Array([value]))), {start(value){mode=value.mode;},delta(value){text+=value;}});
  assert.equal(mode,'demo');
  assert.equal(text,'为什么 √2？');
});

test('truncated streams preserve received text and never report completion', async () => {
  let text='';
  await assert.rejects(chat.consumeStream(response([bytes(start+delta('partial answer'))]),{delta(value){text+=value;}}),/incomplete_stream/);
  assert.equal(text,'partial answer');
  await assert.rejects(chat.consumeStream(response([bytes(start+delta('partial')+'event: done\ndata: {"complete":false}\n\n')]),{}),/incomplete_stream/);
});

test('malformed events and deltas before start cannot become successful replies', async () => {
  await assert.rejects(chat.consumeStream(response([bytes(delta('without start')+done)]),{}),/invalid_stream/);
  await assert.rejects(chat.consumeStream(response([bytes(start+'event: delta\ndata: not-json\n\n')]),{}),/invalid_stream/);
  await assert.rejects(chat.consumeStream(response([bytes(start+done+delta('after done'))]),{}),/invalid_stream/);
  await assert.rejects(chat.consumeStream(new Response('html error',{headers:{'Content-Type':'text/html'}}),{}),/invalid_stream/);
});

test('stream cancellation retains text and leaves the answer incomplete', async () => {
  let read=0,cancelled=false,text='';
  const reader={async read(){if(!read++)return {value:bytes(start+delta('partial')),done:false};throw new DOMException('Aborted','AbortError');},async cancel(){cancelled=true;},releaseLock(){}};
  const result={ok:true,headers:new Headers({'Content-Type':'text/event-stream'}),body:{getReader(){return reader;}}};
  await assert.rejects(chat.consumeStream(result,{delta(value){text+=value;}}),error=>error.name==='AbortError');
  assert.equal(text,'partial');assert.equal(cancelled,true);
});

test('quota and authentication failures retain stable codes without showing raw errors', async () => {
  const result=new Response(JSON.stringify({error:{code:'quota_exceeded',message:'private upstream details'}}),{status:429,headers:{'Content-Type':'application/json'}});
  await assert.rejects(chat.consumeStream(result,{}),error=>error.code==='quota_exceeded'&&!error.message.includes('private'));
});

class Element {
  constructor(tag){this.tagName=tag;this.children=[];this.value='';}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(){this.children=[];this.value='';}
  set textContent(value){this.value=String(value);this.children=[];}
  get textContent(){return this.value+this.children.map(node=>node.textContent).join('');}
}
const document={createElement(tag){return new Element(tag);},createTextNode(text){const node=new Element('#text');node.textContent=text;return node;}};
function tags(node){return [node.tagName,...node.children.flatMap(tags)];}

test('live citation tokens stay hidden across streaming boundaries and final Markdown', () => {
  const token='fileciteturn0file1turn0file5';
  for(let end=1;end<token.length;end++) assert.equal(chat.visibleAnswer('RMS formula. '+token.slice(0,end)),'RMS formula. ');
  assert.equal(chat.visibleAnswer('RMS formula. '+token+' More text.'),'RMS formula.  More text.');
  const body=new Element('div');
  chat.renderMarkdown(body,'**RMS** '+token+' $V/\\sqrt2$',document,null);
  assert(!body.textContent.includes('filecite'));
  assert(body.textContent.includes('RMS'));
  assert(body.textContent.includes('$V/\\sqrt2$'));
  assert.equal(chat.visibleAnswer('Literal other text'),'Literal other text');
});

test('Markdown creates text and safe elements; HTML stays inert and math is untrusted', () => {
  const body=new Element('div'),math=[];
  chat.renderMarkdown(body,'<img src=x onerror=alert(1)>\n\n**Bold** and `safe code`\n\n- list item\n\n$$\\href{javascript:alert(1)}{x}$$\n\n```html\n<script>alert(1)</script>\n```',document,{render(formula,node,options){math.push({formula,options});node.textContent='math';}});
  assert(body.textContent.includes('<img src=x onerror=alert(1)>'));
  assert(body.textContent.includes('<script>alert(1)</script>'));
  assert(!tags(body).includes('img'));
  assert(!tags(body).includes('script'));
  assert(tags(body).includes('strong'));
  assert(tags(body).includes('li'));
  assert.equal(math[0].options.trust,false);
  assert.equal(math[0].options.maxExpand,1000);
});

test('math inside emphasized explanations renders without interpreting code or HTML', () => {
  const body=new Element('div'),math=[];
  chat.renderMarkdown(body,'**不会直接增加 $3\\ \\mathrm V$**，*RMS 是 $\\sqrt{59}$*。 `**$code$**` **<img src=x>**',document,
    {render(formula,node,options){math.push({formula,options});node.textContent='math';}});
  assert.deepEqual(math.map(item=>item.formula),['3\\ \\mathrm V','\\sqrt{59}']);
  assert(math.every(item=>item.options.trust===false));
  assert(!body.textContent.includes('$3'));
  assert(body.textContent.includes('**$code$**'));
  assert(body.textContent.includes('<img src=x>'));
  assert(!tags(body).includes('img'));
  assert(tags(body).includes('strong'));
  assert(tags(body).includes('em'));
});

test('a browser-reported editor selection is attached only after the explicit code action', () => {
  const nodes=new Map(),listeners={};
  function element(name) {
    const node=new Element('div');
    node.dataset={};node.value=name==='context'?'current':'';node.events={};
    node.addEventListener=(event,callback)=>{node.events[event]=callback;};
    node.setAttribute=()=>{};node.focus=()=>{};
    return node;
  }
  const root={dataset:{lang:'en',lectureId:'L05',apiBase:'/api/course-chat',liveSlugs:'l05-single-phase-ac-i',baseurl:''},querySelector(selector){
    const name=selector.slice('[data-chat-'.length,-1);
    if(!nodes.has(name))nodes.set(name,element(name));
    return nodes.get(name);
  },querySelectorAll(){return [];}};
  const panel={id:'lecture-code'};
  const ancestor={nodeType:1,closest(selector){return selector==='[data-panel]'?panel:null;}};
  const content={contains(node){return node===ancestor;},events:{},addEventListener(event,callback){this.events[event]=callback;}};
  const platform={querySelector(selector){return selector==='.ece-body'?content:null;},addEventListener(){}};
  const fakeDocument={querySelector(selector){return selector==='[data-course-chat]'?root:platform;},addEventListener(event,callback){listeners[event]=callback;}};
  const fakeWindow={location:{href:'https://example.org/teaching/ece685/l05-single-phase-ac-i/#lecture-code',hash:'#lecture-code'},addEventListener(){},getSelection(){return {rangeCount:1,toString(){return 'result = solve(case)';},getRangeAt(){return {commonAncestorContainer:ancestor};}};}};
  chat.init(fakeDocument,fakeWindow);
  const dialog=nodes.get('dialog');dialog.showModal=()=>{dialog.open=true;};
  const editor={value:'result = solve(case)\nprint(result)',selectionStart:0,selectionEnd:'result = solve(case)'.length,matches(){return true;},closest(){return panel;}};
  content.events.focusin({target:editor});
  nodes.get('open').events.click();
  assert.equal(nodes.get('selection-preview').hidden,true);
  assert.equal(nodes.get('selection-text').textContent,'');
  nodes.get('attach-code').events.click();
  assert.equal(nodes.get('selection-preview').hidden,false);
  assert.equal(nodes.get('selection-text').textContent,'result = solve(case)');
  assert(!nodes.get('selection-text').textContent.includes('print(result)'));
});
