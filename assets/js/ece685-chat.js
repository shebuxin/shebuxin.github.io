/* Course chat: context snapshots, escaped rendering, and an explicit SSE contract. */
(function (scope, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (scope.document) api.init(scope.document, scope);
})(typeof window === "undefined" ? globalThis : window, function () {
  "use strict";
  const SECTIONS = new Set(["lecture-overview", "lecture-experiment", "lecture-code", "lecture-practice"]);
  const MAX_TEXT = 4000;
  class ChatError extends Error {
    constructor(code) { super(code); this.code = code; }
  }

  function apiBase(value, href) {
    if (!value || !value.trim()) return null;
    try {
      const url = new URL(value, href);
      const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
      if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) || url.username || url.password || url.search || url.hash) return null;
      return url.href.replace(/\/+$/, "");
    } catch (_) { return null; }
  }

  function messageRequest(lecture, language, context, message, requestId) {
    message = message.trim();
    const courseHome = lecture === "COURSE";
    if ((!courseHome && !/^L\d{2}b?$/.test(lecture)) || !["en", "zh"].includes(language) || !message || message.length > MAX_TEXT) throw new ChatError("invalid_request");
    let snapshot = null;
    if (context) {
      if (courseHome ? !["lesson", "selection"].includes(context.kind) || context.section_id !== "course-overview" : !["slide", "lesson", "selection", "code"].includes(context.kind) || !SECTIONS.has(context.section_id)) throw new ChatError("invalid_context");
      const page = context.slide_number ?? null;
      if (courseHome && page !== null) throw new ChatError("invalid_context");
      if (page !== null && (!Number.isInteger(page) || page < 1)) throw new ChatError("invalid_context");
      if (context.kind === "slide" && (page === null || context.section_id !== "lecture-overview")) throw new ChatError("invalid_context");
      const selection = context.selection_text || "";
      if (typeof selection !== "string" || selection.length > MAX_TEXT || (context.kind === "code" && context.section_id !== "lecture-code")) throw new ChatError("invalid_context");
      snapshot = Object.freeze({ kind: context.kind, section_id: context.section_id, slide_number: page, selection_text: selection });
    }
    return Object.freeze({ course_id: "ECE685", lecture_id: lecture, language, context: snapshot, message, client_request_id: requestId });
  }

  function citationHref(value, href, baseurl, slugs) {
    if (typeof value !== "string" || !value || value.includes("\\")) return null;
    try {
      const base = new URL(href), url = new URL(value, base);
      if (url.origin !== base.origin || url.username || url.password) return null;
      const prefix = (baseurl || "").replace(/\/$/, "");
      const paths = slugs.flatMap(slug => [`${prefix}/teaching/ece685/${slug}/`, `${prefix}/zh/teaching/ece685/${slug}/`]);
      // Existing indexed course documents still carry the previous public paths.
      const legacyPrefix = prefix + "/teaching/course-development/ece685/";
      const legacyZhPrefix = prefix + "/zh/teaching/course-development/ece685/";
      if (url.pathname.startsWith(legacyPrefix)) url.pathname = prefix + "/teaching/ece685/" + url.pathname.slice(legacyPrefix.length);
      if (url.pathname.startsWith(legacyZhPrefix)) url.pathname = prefix + "/zh/teaching/ece685/" + url.pathname.slice(legacyZhPrefix.length);
      if (!paths.includes(url.pathname) || ![...SECTIONS].some(id => url.hash === "#" + id)) return null;
      if (url.search) {
        const pairs = [...url.searchParams];
        if (pairs.length !== 1 || pairs[0][0] !== "slide" || !/^[1-9]\d*$/.test(pairs[0][1]) || url.hash !== "#lecture-overview") return null;
      }
      return url.href;
    } catch (_) { return null; }
  }

  function sseParser(onEvent) {
    let buffer = "";
    return {
      push(chunk) {
        buffer += chunk;
        if (buffer.length > 1048576) throw new ChatError("invalid_stream");
        let match;
        while ((match = /\r\n\r\n|\n\n|\r\r/.exec(buffer))) {
          const frame = buffer.slice(0, match.index);
          buffer = buffer.slice(match.index + match[0].length);
          let event = "message";
          const data = [];
          for (const line of frame.split(/\r\n|\r|\n/)) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
          }
          if (!data.length || !["start", "delta", "sources", "done", "error"].includes(event)) continue;
          let value;
          try { value = JSON.parse(data.join("\n")); } catch (_) { throw new ChatError("invalid_stream"); }
          onEvent(event, value);
        }
      },
      finish() { if (buffer.trim() && !buffer.trim().startsWith(":")) throw new ChatError("incomplete_stream"); }
    };
  }

  async function consumeStream(response, callbacks) {
    if (!response.ok) {
      let code = response.status === 401 ? "unauthorized" : response.status === 429 ? "rate_limited" : "service_error";
      try { const body = await response.json(); code = body.error?.code || code; } catch (_) { /* No raw provider errors in UI. */ }
      throw new ChatError(code);
    }
    if (!response.body || !response.headers.get("content-type")?.includes("text/event-stream")) throw new ChatError("invalid_stream");
    let started = false, done = false, length = 0;
    const parser = sseParser((event, data) => {
      if (done) throw new ChatError("invalid_stream");
      if (!data || typeof data !== "object") throw new ChatError("invalid_stream");
      if (event === "error") throw new ChatError(data.code || "service_error");
      if (event === "start") {
        if (started || !["demo", "live"].includes(data.mode)) throw new ChatError("invalid_stream");
        started = true;
        callbacks.start?.(data);
      } else {
        if (!started) throw new ChatError("invalid_stream");
        if (event === "delta") {
          if (typeof data.text !== "string" || (length += data.text.length) > 96000) throw new ChatError("invalid_stream");
          callbacks.delta?.(data.text);
        } else if (event === "sources") {
          if (!Array.isArray(data.sources) || data.sources.length > 20) throw new ChatError("invalid_stream");
          callbacks.sources?.(data.sources);
        } else if (event === "done") {
          if (data.complete !== true) throw new ChatError("incomplete_stream");
          done = true;
        }
      }
    });
    const reader = response.body.getReader(), decoder = new TextDecoder();
    try {
      while (!done) {
        const chunk = await reader.read();
        if (chunk.done) break;
        parser.push(decoder.decode(chunk.value, { stream: true }));
      }
      parser.push(decoder.decode());
      parser.finish();
      if (!done) throw new ChatError("incomplete_stream");
    } finally {
      try { await reader.cancel(); } catch (_) { /* Interrupted network read. */ }
      reader.releaseLock();
    }
  }

  function visibleAnswer(text) {
    // Provider citation tokens are internal; verified source cards carry the labels and links.
    const opener = "filecite";
    text = text.replace(/filecite[^]*/g, "");
    const start = text.lastIndexOf("");
    if (start >= 0) {
      const tail = text.slice(start);
      if (opener.startsWith(tail) || (tail.startsWith(opener) && !tail.includes(""))) text = text.slice(0, start);
    }
    return text;
  }

  function renderMarkdown(container, text, document, katex) {
    text = visibleAnswer(text);
    container.replaceChildren();
    function inline(node, content) {
      const pattern = /\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|(?<!\\)\$[^\n$]+(?<!\\)\$|`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*/g;
      let position = 0, match;
      while ((match = pattern.exec(content))) {
        node.append(document.createTextNode(content.slice(position, match.index)));
        const token = match[0];
        let child;
        if (token.startsWith("`")) { child = document.createElement("code"); child.textContent = token.slice(1, -1); }
        else if (token.startsWith("**")) { child = document.createElement("strong"); inline(child, token.slice(2, -2)); }
        else if (token.startsWith("*")) { child = document.createElement("em"); inline(child, token.slice(1, -1)); }
        else {
          child = document.createElement("span");
          const display = token.startsWith("$$") || token.startsWith("\\[");
          const size = token.startsWith("$") && !display ? 1 : 2;
          if (katex) {
            try { katex.render(token.slice(size, -size), child, { displayMode: display, throwOnError: false, trust: false, strict: "ignore", maxExpand: 1000, maxSize: 10 }); }
            catch (_) { child.textContent = token; }
          } else child.textContent = token;
        }
        node.append(child);
        position = match.index + token.length;
      }
      node.append(document.createTextNode(content.slice(position)));
    }
    let paragraph = [], code = null, list = null;
    function flush() {
      if (paragraph.length) { const p = document.createElement("p"); inline(p, paragraph.join("\n")); container.append(p); paragraph = []; }
    }
    for (const line of text.split("\n")) {
      if (/^\s*```/.test(line)) {
        flush(); list = null;
        if (code !== null) { const pre = document.createElement("pre"), element = document.createElement("code"); element.textContent = code.join("\n"); pre.append(element); container.append(pre); code = null; }
        else code = [];
      } else if (code !== null) code.push(line);
      else if (!line.trim()) { flush(); list = null; }
      else {
        const item = /^\s*(?:([-*])|\d+[.)])\s+(.+)$/.exec(line);
        if (item) {
          flush();
          const type = item[1] ? "ul" : "ol";
          if (!list || list.tagName.toLowerCase() !== type) { list = document.createElement(type); container.append(list); }
          const li = document.createElement("li"); inline(li, item[2]); list.append(li);
        } else { list = null; paragraph.push(line.replace(/^#{1,6}\s+/, "")); }
      }
    }
    flush();
    if (code !== null) { const pre = document.createElement("pre"); pre.textContent = code.join("\n"); container.append(pre); }
  }

  function init(document, window) {
    const root = document.querySelector("[data-course-chat]"), platform = document.querySelector("[data-ece-platform]");
    if (!root || !platform) return;
    const find = name => root.querySelector(`[data-chat-${name}]`);
    const lang = root.dataset.lang === "zh" ? "zh" : "en", zh = lang === "zh", lecture = root.dataset.lectureId;
    const courseHome = lecture === "COURSE";
    const dialog = find("dialog"), question = find("question"), status = find("status"), messages = find("messages");
    const content = platform.querySelector(".ece-body"), reader = platform.querySelector("[data-slide-reader]");
    const base = apiBase(root.dataset.apiBase, window.location.href);
    const slugs = root.dataset.liveSlugs.split(/\s+/).filter(Boolean);
    const text = zh ? {
      ready: "可以发送问题。", connecting: "正在验证邀请码…", thinking: "正在回答…", complete: "回答已完成。", stopped: "已停止，回答未完成。", incomplete: "回答未完成，请检查连接后再提问。", failed: "服务暂时不可用，请稍后再试。", unauthorized: "会话已过期，请重新输入课程邀请码。", invite_invalid: "邀请码无效，请检查后重试。", quota_exceeded: "课程调用额度已用完。", rate_limited: "请求过于频繁，请稍后再试。", timeout: "请求超时，回答未完成。", not_configured: "聊天服务尚未配置。", invalid_context: "提问背景不可用，请重新选择。", noSelection: "先在课程正文中选择需要解释的文字，再打开聊天。", noCode: "先在 Python 编辑框中选中代码，再点击附加。", reset: "已清除聊天。输入邀请码开始新对话。", course: "ECE 685 · 课程问题", selected: "选中内容", code: "选中代码", slide: "课件第", page: "页", user: "你", assistant: "学习助手", demo: "界面演示", demoNote: "界面演示：用于核对提问背景、消息和引用，不生成真实 AI 回答。", liveNote: "教材依据：第六版。可请求解释，也可继续追问。", meaning: "这里是什么意思？", simpler: "请把刚才的解释再说得简单一点。", example: "请用一个具体例子说明。", explain: "请解释我附上的这段内容。", explainCode: "请解释我附上的代码。", sections: { "lecture-overview": "概念说明", "lecture-experiment": "参数实验", "lecture-code": "教学代码", "lecture-practice": "练习" }
    } : {
      ready: "Ready for your question.", connecting: "Checking the invitation code…", thinking: "Answering…", complete: "Answer complete.", stopped: "Stopped. This answer is incomplete.", incomplete: "Answer incomplete. Check your connection before asking again.", failed: "The service is unavailable. Please try later.", unauthorized: "Your session expired. Enter the course invitation code again.", invite_invalid: "Invalid invitation code. Check it and try again.", quota_exceeded: "The course usage allowance has been reached.", rate_limited: "Too many requests. Please try later.", timeout: "Request timed out. This answer is incomplete.", not_configured: "The chat service has not been configured.", invalid_context: "This context is unavailable. Choose it again.", noSelection: "Select text in the lesson, then open chat.", noCode: "Select text in a Python editor, then attach it.", reset: "Chat cleared. Enter the invitation code for a new conversation.", course: "ECE 685 · course question", selected: "selected text", code: "selected code", slide: "slide", page: "", user: "You", assistant: "Learning assistant", demo: "UI demonstration", demoNote: "UI demonstration: checks context, messages and citations. It does not generate real AI answers.", liveNote: "Textbook basis: sixth edition. Ask for an explanation or follow up.", meaning: "What does this mean?", simpler: "Please explain your last answer more simply.", example: "Please give a concrete example.", explain: "Please explain the attached text.", explainCode: "Please explain the attached code.", sections: { "lecture-overview": "Concepts", "lecture-experiment": "Experiment", "lecture-code": "Teaching code", "lecture-practice": "Practice" }
    };
    let session = null, busy = false, epoch = 0, controller = null, lastEditor = null, selection = null, context = null;
    text.overview = zh ? "请根据课程 syllabus 和课程资料，概述 ECE 685 的主要内容和学习目标。" : "Using the syllabus and course materials, summarize what ECE 685 covers and its learning goals.";
    text.prerequisites = zh ? "学习 ECE 685 需要哪些先修知识？请区分 syllabus 的正式要求和你的复习建议。" : "What background do I need for ECE 685? Distinguish official syllabus prerequisites from your review suggestions.";
    text.start = zh ? "我是刚开始学习 ECE 685 的学生，应该从哪里开始？请根据已经开放的课程内容建议学习顺序。" : "I am new to ECE 685. Where should I start? Suggest a learning sequence using the available course material.";
    let position = { kind: "lesson", section_id: courseHome ? "course-overview" : "lecture-overview", slide_number: null, selection_text: "" };
    function notify(message, error) { status.textContent = message; status.dataset.state = error ? "error" : "ready"; }
    function controls() {
      find("send").disabled = busy || !session || !base;
      find("connect").disabled = busy || !base;
      find("invite").disabled = busy || !base;
      find("stop").disabled = !busy;
      find("access").hidden = !!session;
      find("form").setAttribute("aria-busy", String(busy));
    }
    function contextLabel(value) {
      if (!value) return text.course;
      const place = courseHome ? (zh ? "课程概览" : "Course overview") : value.slide_number ? `${text.slide} ${value.slide_number} ${text.page}`.trim() : text.sections[value.section_id];
      return `${courseHome ? "ECE 685" : lecture} · ${place}${value.selection_text ? " · " + (value.kind === "code" ? text.code : text.selected) : ""}${value.selection_truncated ? (zh ? "（仅附前 4000 字符）" : " (first 4,000 characters only)") : ""}`;
    }
    function setContext(value) {
      context = value ? { ...value } : null;
      find("context-label").textContent = contextLabel(context);
      find("selection-preview").hidden = !context?.selection_text;
      find("selection-text").textContent = context?.selection_text || "";
    }
    function slideContext() {
      const number = Number(reader?.dataset.currentPage);
      return Number.isInteger(number) && number > 0 ? { kind: "slide", section_id: "lecture-overview", slide_number: number, selection_text: "" } : null;
    }
    function currentContext() {
      if (position.kind === "slide") return slideContext() || { ...position, kind: "lesson", slide_number: null };
      return { ...position };
    }
    function captureSelection() {
      // Some browsers expose a textarea selection through window.getSelection()
      // with an ancestor outside the textarea. Code requires the attach action.
      if (lastEditor && lastEditor.selectionStart !== lastEditor.selectionEnd) return;
      const range = window.getSelection();
      if (!range || !range.rangeCount || !range.toString().trim()) return;
      const node = range.getRangeAt(0).commonAncestorContainer;
      const element = node.nodeType === 1 ? node : node.parentElement;
      if (!element || !content.contains(element) || element.closest("textarea,input,[contenteditable='true']")) return;
      const panel = element.closest("[data-panel]");
      if (!courseHome && (!panel || !SECTIONS.has(panel.id))) return;
      const selected = range.toString().trim();
      selection = { kind: "selection", section_id: courseHome ? "course-overview" : panel.id, slide_number: element.closest("[data-slide-reader]") ? slideContext()?.slide_number || null : null, selection_text: selected.slice(0, MAX_TEXT), selection_truncated: selected.length > MAX_TEXT };
    }
    function open() {
      captureSelection();
      if (!dialog.open) {
        if (selection) { setContext(selection); find("context").value = "current"; }
        else if (find("context").value === "current") setContext(currentContext());
        dialog.showModal();
      }
      (session ? question : find("invite")).focus();
    }
    function newMessage(role, value, attached) {
      find("empty").hidden = true;
      const article = document.createElement("article"), header = document.createElement("header"), body = document.createElement("div"), sources = document.createElement("div"), outcome = document.createElement("small");
      article.className = "ece-chat__message"; article.dataset.role = role;
      header.textContent = (role === "user" ? text.user : text.assistant) + (attached ? " · " + contextLabel(attached) : "");
      sources.className = "ece-chat__sources"; sources.hidden = true;
      outcome.className = "ece-chat__outcome";
      body.textContent = value;
      article.append(header, body, sources, outcome); messages.append(article);
      messages.scrollTop = messages.scrollHeight;
      return { article, header, body, sources, outcome };
    }
    function showSources(node, values) {
      node.replaceChildren();
      for (const source of values) {
        if (typeof source?.doc_id !== "string" || !source.doc_id.startsWith("ECE685:") || typeof source.label !== "string") continue;
        const href = citationHref(source.url, window.location.href, root.dataset.baseurl, slugs);
        const item = document.createElement(href ? "a" : "span");
        item.textContent = source.label.slice(0, 400);
        if (href) { item.href = href; item.target = "_blank"; item.rel = "noopener"; }
        node.append(item);
      }
      node.hidden = !node.childNodes.length;
    }
    function errorMessage(error) { return error.code === "request_timeout" ? text.timeout : text[error.code] || text.failed; }
    async function connect(event) {
      event.preventDefault();
      if (busy || !base) return;
      const invite = find("invite").value.trim();
      if (!invite) return;
      const turn = ++epoch;
      busy = true; controller = new AbortController(); controls(); notify(text.connecting);
      const timer = window.setTimeout(() => controller?.abort(), 20000);
      try {
        const response = await window.fetch(base + "/session", { method: "POST", credentials: "omit", referrerPolicy: "no-referrer", signal: controller.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ course_id: "ECE685", language: lang, invitation_code: invite }) });
        const value = await response.json();
        if (!response.ok) throw new ChatError(value.error?.code || (response.status === 401 ? "invite_invalid" : "service_error"));
        if (typeof value.session_token !== "string" || !value.session_token || !["live", "demo"].includes(value.mode) || !Number.isFinite(Date.parse(value.expires_at)) || Date.parse(value.expires_at) <= Date.now()) throw new ChatError("service_error");
        if (turn !== epoch) return;
        session = value; find("invite").value = "";
        find("service-note").textContent = value.mode === "demo" ? text.demoNote : text.liveNote;
        notify(text.ready); question.focus();
      } catch (error) { if (turn === epoch) notify(errorMessage(error), true); }
      finally { window.clearTimeout(timer); if (turn === epoch) { busy = false; controller = null; controls(); } }
    }
    async function send(event) {
      event.preventDefault();
      if (busy || !session || !base) return;
      if (Date.parse(session.expires_at) <= Date.now()) { session = null; controls(); notify(text.unauthorized, true); return; }
      let payload;
      try { payload = messageRequest(lecture, lang, context, question.value, window.crypto.randomUUID()); }
      catch (error) { notify(errorMessage(error), true); return; }
      const turn = ++epoch, token = session.session_token;
      newMessage("user", payload.message, payload.context);
      const reply = newMessage("assistant", "");
      question.value = ""; busy = true; controller = new AbortController(); controls(); notify(text.thinking);
      let answer = "", timedOut = false;
      const timer = window.setTimeout(() => { timedOut = true; controller?.abort(); }, 90000);
      try {
        const response = await window.fetch(base + "/messages", { method: "POST", credentials: "omit", referrerPolicy: "no-referrer", signal: controller.signal, headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify(payload) });
        await consumeStream(response, {
          start(value) { if (turn === epoch) { reply.header.textContent = text.assistant + (value.mode === "demo" ? " · " + text.demo : ""); if (value.mode === "demo") find("service-note").textContent = text.demoNote; } },
          delta(value) { if (turn === epoch) { answer += value; reply.body.textContent = visibleAnswer(answer); messages.scrollTop = messages.scrollHeight; } },
          sources(value) { if (turn === epoch) showSources(reply.sources, value); }
        });
        if (turn === epoch) { renderMarkdown(reply.body, answer, document, window.katex); reply.article.dataset.complete = "true"; reply.outcome.textContent = text.complete; notify(text.complete); messages.scrollTop = messages.scrollHeight; }
      } catch (error) {
        if (turn !== epoch) return;
        if (error.code === "unauthorized") session = null;
        renderMarkdown(reply.body, answer, document, window.katex);
        const message = timedOut ? text.timeout : error.name === "AbortError" ? text.stopped : error.code === "incomplete_stream" || error.code === "invalid_stream" ? text.incomplete : errorMessage(error);
        reply.article.dataset.complete = "false"; reply.outcome.textContent = message; notify(message, error.name !== "AbortError");
      } finally { window.clearTimeout(timer); if (turn === epoch) { busy = false; controller = null; controls(); } }
    }
    content.addEventListener("pointerdown", event => {
      const panel = event.target.closest("[data-panel]");
      if (!panel || !SECTIONS.has(panel.id)) return;
      selection = null;
      if (!event.target.matches("[data-experiment-editor],[data-solver-editor]")) lastEditor = null;
      position = { kind: event.target.closest("[data-slide-reader]") ? "slide" : "lesson", section_id: panel.id, slide_number: null, selection_text: "" };
      if (find("context").value === "current") setContext(currentContext());
    });
    content.addEventListener("focusin", event => {
      const panel = event.target.closest("[data-panel]");
      if (panel && SECTIONS.has(panel.id)) position = { kind: event.target.closest("[data-slide-reader]") ? "slide" : "lesson", section_id: panel.id, slide_number: null, selection_text: "" };
      if (event.target.matches("[data-experiment-editor],[data-solver-editor]")) { lastEditor = event.target; selection = null; }
    });
    document.addEventListener("selectionchange", captureSelection);
    platform.addEventListener("ece685:slide-change", () => { if (context?.kind === "slide") setContext(slideContext()); });
    find("open").hidden = false;
    find("open").addEventListener("click", open);
    find("close").addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => find("open").focus());
    find("access").addEventListener("submit", connect);
    find("form").addEventListener("submit", send);
    find("stop").addEventListener("click", () => controller?.abort());
    find("context").addEventListener("change", event => {
      const choice = event.target.value;
      selection = null;
      if (choice === "none") setContext(null);
      else if (choice === "slide") { setContext(slideContext()); if (!context) notify(text.invalid_context, true); }
      else if (choice === "current") setContext(currentContext());
      else setContext({ kind: "lesson", section_id: choice, slide_number: null, selection_text: "" });
    });
    find("explain-selection").addEventListener("click", () => {
      captureSelection();
      if (!selection) { notify(text.noSelection, true); return; }
      setContext(selection); find("context").value = "current"; question.value = text.explain; question.focus();
    });
    find("attach-code").addEventListener("click", () => {
      const code = lastEditor ? lastEditor.value.slice(lastEditor.selectionStart, lastEditor.selectionEnd) : "";
      if (!code.trim()) { notify(text.noCode, true); return; }
      setContext({ kind: "code", section_id: "lecture-code", slide_number: null, selection_text: code.slice(0, MAX_TEXT), selection_truncated: code.length > MAX_TEXT });
      find("context").value = "lecture-code"; question.value = text.explainCode; question.focus();
    });
    root.querySelectorAll("[data-chat-prompt]").forEach(button => button.addEventListener("click", () => { question.value = text[button.dataset.chatPrompt]; question.focus(); }));
    question.setAttribute("aria-keyshortcuts", "Control+Enter Meta+Enter");
    question.addEventListener("keydown", event => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); find("form").requestSubmit(); } });
    find("clear").addEventListener("click", () => {
      ++epoch; controller?.abort(); controller = null; busy = false; session = null; selection = null;
      messages.querySelectorAll(".ece-chat__message").forEach(node => node.remove());
      find("empty").hidden = false; question.value = ""; find("context").value = "current"; setContext(currentContext()); controls(); notify(text.reset); find("invite").focus();
    });
    window.addEventListener("pagehide", () => { ++epoch; controller?.abort(); });
    const hash = window.location.hash.slice(1);
    if (!courseHome && SECTIONS.has(hash)) position.section_id = hash;
    if (!courseHome && new URL(window.location.href).searchParams.has("slide") && position.section_id === "lecture-overview") position.kind = "slide";
    setContext(currentContext()); controls();
    if (!base) notify(text.not_configured, true);
  }

  return { apiBase, messageRequest, citationHref, sseParser, consumeStream, visibleAnswer, renderMarkdown, init, ChatError };
});
