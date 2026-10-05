import {ChatError,contextId} from './validation.mjs';
export class Store {
  constructor(db) { this.db=db; }
  stmt(sql,...values) { return this.db.prepare(sql).bind(...values); }
  async active() {
    const row=await this.stmt(`SELECT v.* FROM courses c JOIN course_versions v ON v.version=c.active_version
      WHERE c.course_id='ECE685' AND v.status='ready'`).first();
    if (!row) throw new ChatError('service_unavailable',503);
    return row;
  }
  async doc(version,id) {
    const row=await this.stmt('SELECT * FROM documents WHERE version=? AND doc_id=?',version,id).first();
    return row ? {...JSON.parse(row.metadata_json),text:row.text,file_id:row.file_id} : null;
  }
  async background(version,body) {
    const lecture=await this.doc(version,`ECE685:${body.lecture_id}:lesson:${body.language}:lecture-overview`);
    if (!lecture) throw new ChatError('invalid_context');
    const id=contextId(body), current=id ? await this.doc(version,id) : null;
    if (id && !current) throw new ChatError('invalid_context');
    const rows=await this.stmt(`SELECT * FROM documents WHERE version=?
      AND json_extract(metadata_json,'$.source_type')='verified_reference_note'
      AND EXISTS (SELECT 1 FROM json_each(documents.metadata_json,'$.lecture_ids') WHERE value=?)
      ORDER BY doc_id LIMIT 6`,version,body.lecture_id).all();
    return {current,notes:rows.results.map(row=>({...JSON.parse(row.metadata_json),text:row.text,file_id:row.file_id}))};
  }
  async authAttempt(bucket,expires,limit) {
    const row=await this.stmt(`INSERT INTO auth_attempts VALUES(?,1,?)
      ON CONFLICT(bucket) DO UPDATE SET count=count+1 WHERE count<? RETURNING count`,bucket,expires,limit).first();
    if (!row) throw new ChatError('rate_limited',429);
  }
  async createSession(hash,invite,now,expiry) {
    try { await this.stmt('INSERT INTO sessions(token_hash,invite_hash,created_at,expires_at) VALUES(?,?,?,?)',hash,invite,now,expiry).run(); }
    catch (e) { throw databaseError(e); }
  }
  async session(hash,now) {
    const row=await this.stmt(`SELECT s.* FROM sessions s JOIN invitations i USING(invite_hash)
      WHERE s.token_hash=? AND s.expires_at>? AND i.expires_at>? AND i.enabled=1`,hash,now,now).first();
    if (!row) throw new ChatError('unauthorized',401);
    return row;
  }
  async reserve(hash,id,version,now,config) {
    try { await this.stmt(`INSERT INTO requests(session_hash,request_id,version,started_at,lease_until,day,
      session_limit,daily_limit,concurrency_limit) VALUES(?,?,?,?,?,?,?,?,?)`,
      hash,id,version,now,now+config.timeoutSeconds+30,new Date(now*1000).toISOString().slice(0,10),
      config.sessionLimit,config.dailyLimit,config.concurrencyLimit).run(); }
    catch (e) { throw databaseError(e); }
  }
  async finish(hash,id,status,error,usage,duration,history,version) {
    const statements=[this.stmt(`UPDATE requests SET status=?,error_code=?,input_tokens=?,output_tokens=?,duration_ms=?
      WHERE session_hash=? AND request_id=? AND status='running'`,status,error,
      usage?.input_tokens ?? null,usage?.output_tokens ?? null,duration,hash,id)];
    if (history) statements.push(this.stmt(`UPDATE sessions SET history_json=?,history_version=? WHERE token_hash=?
      AND expires_at>unixepoch()`,JSON.stringify(history),version,hash));
    await this.db.batch(statements);
  }
  async source(version,fileId,language) {
    const row=await this.stmt('SELECT * FROM documents WHERE version=? AND file_id=?',version,fileId).first();
    if (!row) throw new ChatError('source_mapping_error',502);
    return citation(JSON.parse(row.metadata_json),language);
  }
  async cleanup(now) {
    await this.db.batch([
      this.stmt('DELETE FROM sessions WHERE expires_at<=?',now),
      this.stmt('DELETE FROM auth_attempts WHERE expires_at<=?',now),
      this.stmt('DELETE FROM daily_usage WHERE day<?',new Date((now-7*86400)*1000).toISOString().slice(0,10))
    ]);
  }
}
export function databaseError(error) {
  for (const code of ['invite_invalid','unauthorized','quota_exceeded','rate_limited','duplicate_request','service_unavailable'])
    if (String(error.message).includes(code)) return new ChatError(code,['invite_invalid','unauthorized'].includes(code)?401:code==='service_unavailable'?503:429);
  return new ChatError('service_error',503);
}
export function citation(doc,language,prefix='') {
  const sections=language==='zh' ? {'lecture-overview':'概念说明','lecture-experiment':'参数实验',
    'lecture-code':'教学代码','lecture-practice':'练习'} : {'lecture-overview':'Concepts',
    'lecture-experiment':'Experiment','lecture-code':'Teaching code','lecture-practice':'Practice'};
  const label=doc.kind==='reference' ? doc.citation.label : `${doc.lecture_id} · ${doc.kind==='slide' ?
    (language==='zh'?`课件第 ${doc.page_number} 页`:`slide ${doc.page_number}`):(sections[doc.section_id] || doc.lecture_id)}`;
  return {doc_id:doc.doc_id,label:prefix+label,url:doc.kind==='reference'?null:doc.source_urls[language]};
}
