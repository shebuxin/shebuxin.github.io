# ECE 685 Chat 本地预览与接口

页面聊天组件与 Cloudflare 后端已实现，默认生产配置关闭。2026-10-04 已使用 GPT-6 Astra 完成 1,104 份文档的真实索引和 20 题实际问答：20 题调用完成，17 题达到完整标准，3 题的参考出处或资料定位需改进。用户已要求在线测试，专用 Preview D1 已激活该版本并导入教师测试邀请码；`codex/ece685-chat-preview` 已通过 Git 集成部署到 Cloudflare，只在 L05 开启聊天。学生开放仍等待来源修复与评估。原页面演示服务继续可用。

本机真实模型页面位于 `http://127.0.0.1:8853/zh/teaching/course-development/ece685/l05-single-phase-ac-i/?slide=12#lecture-overview`，使用独立的私有本地 D1、配置及邀请码；它会产生真实 API 调用。Chrome 已验证两次连续问答、公式和已校验的来源链接。运行配置和日志位于忽略的 `tmp/ece685-chat/live-local/`，本机 key 不进入网页资源。

## 在线教师测试

[打开 L05 中文测试页](https://codex-ece685-chat-preview.power-edu.pages.dev/zh/teaching/course-development/ece685/l05-single-phase-ac-i/?slide=12#lecture-overview)。点击“问 AI”，使用本机私有 `tmp/ece685-chat/preview-account/invitation-code.txt` 中的邀请码。该文件不提交 Git，不作为网页资产。邀请码最多 200 次问题、20 个会话，到期时间来自 `invitation-private.json`；每个会话最多 30 次问题，有效两小时。

2026-10-04 已在实际 HTTPS 页面验证邀请码登录、RMS 解释、含直流偏置的连续追问和返回课件第 12 页的引用。D1 确认两次请求均完成，平均 15.15 秒。粗体与斜体内的公式排版问题已补充回归检查并修复。此记录是教师操作测试，20 题质量评估仍为 17/20。

## 打开本地预览

从仓库根目录运行：

```sh
JEKYLL_ENV=production bundle exec jekyll build --strict_front_matter --config _config.yml,services/course-chat/preview.yml --destination tmp/ece685-chat/site
python3 scripts/serve_ece685_chat_preview.py --corpus tmp/ece685-chat/ece685-2cb02ab2374b55da3f58
```

然后打开 `http://127.0.0.1:8788/zh/teaching/course-development/ece685/l05-single-phase-ac-i/?slide=12#lecture-overview`，点击“问 AI”，输入演示邀请码 `DEMO`。英文路径去掉 `/zh`。默认只开启已发布的 L05。重新生成语料后，将命令中的版本目录换成新 manifest 所属目录。

服务只监听 `127.0.0.1`，静态根目录为已经构建的预览网站，不提供教材 PDF 或原始课程包。固定回答用于核对操作和排版，每次回答明确显示“界面演示”；它不构成检索或模型质量评估。修改资源或重新构建后刷新浏览器。

## 页面操作

- 在正文中选择文字，再打开聊天；预览会显示所附内容。点击“解释选中内容”填写问题，仍由学生点击发送。
- 可选择当前课件页、概念、实验、教学代码、练习，或移除背景，直接问课程问题。
- 学生代码通过“附加选中代码”按钮显式附加；仅附编辑框中选中的片段。超过 4,000 字符时显示截取说明和实际将发送的内容。
- 发送时复制位置和选区。之后翻页更新下一条问题的背景，不修改已发送消息。
- 回答支持文字、列表、强调、代码块和 KaTeX 公式。HTML 按文字显示；可点击的课程引用由独立来源数组提供。
- 模型内部 `filecite` 标记在流式和最终渲染中隐藏，来源位置使用服务器校验的卡片；卡片使用学生可读的双语段落名称。
- 支持继续追问、Ctrl/Cmd + Enter 发送、停止、Escape 关闭及焦点返回。停止或网络中断保留已收到文字，标为未完成；不会自动重复请求。
- 清除聊天会清空当前界面并结束当前客户端会话，重新输入邀请码建立新对话。原演示会话仅在 Python 服务内存保存。Cloudflare 后端按短期会话保存最近三轮对话，过期后拒绝访问；每次请求和定时清理会删除过期记录。

`_config.yml` 的公开字段为 `course_chat.enabled`、`course_chat.lectures`、`course_chat.api_base`。`lectures: [L05]` 用于首轮，`['*']` 覆盖所有已发布讲次，未发布页面不显示组件。API 地址包含 `/api/course-chat` 前缀，使用 HTTPS 或本地回环地址。为空时显示服务尚未配置，不发送请求。API key 不属于前端配置。

## 会话与消息协议

`POST /api/course-chat/session`：

```json
{"course_id":"ECE685","language":"zh","invitation_code":"DEMO"}
```

响应：

```json
{"session_token":"opaque-session-token","expires_at":"2026-10-04T23:00:00Z","mode":"demo"}
```

正式服务使用 `mode: live`，并在服务端验证邀请码。前端仅在当前页面内存保存会话凭证。正式邀请码由私有生成工具创建，至少 16 字符；`DEMO` 仅供原 Python 界面演示服务使用。

`POST /api/course-chat/messages` 使用 `Authorization: Bearer <session_token>`：

```json
{
  "course_id":"ECE685",
  "lecture_id":"L05",
  "language":"zh",
  "context":{"kind":"slide","slide_number":12,"section_id":"lecture-overview","selection_text":""},
  "message":"这里是什么意思？",
  "client_request_id":"unique-request-id"
}
```

`context` 可为 null；`kind` 可为 `slide`、`lesson`、`selection`、`code`。只有 `slide` 或来自课件区的 `selection` 使用课件页号；其他情形页号为 null。选中的代码使用 `kind: code`、`section_id: lecture-code` 与显式 `selection_text`。用户问题和附加文本各限 4,000 字符。客户端不发送模型名、系统提示或知识库 ID。

两个本地服务均按语料文档 ID 检查已发布讲次、页面范围与段落位置。Cloudflare 后端从启用语料版本读取背景、核验说明和平台教材选择，学生选区始终作为学生提供的内容。

消息响应为 `Content-Type: text/event-stream`，每个事件含 JSON：

```text
event: start
data: {"request_id":"unique-request-id","mode":"demo","corpus_version":"ece685-..."}

event: delta
data: {"text":"An explanation fragment"}

event: sources
data: {"sources":[{"doc_id":"ECE685:L05:slide:012","label":"L05 · 课件第 12 页","url":"/zh/teaching/course-development/ece685/l05-single-phase-ac-i/?slide=12#lecture-overview"}]}

event: done
data: {"complete":true}
```

失败使用 HTTP JSON `{"error":{"code":"..."}}`，或已经开始流式传输后的 `error` 事件 `{"code":"..."}`。稳定错误码包括 `invite_invalid`、`unauthorized`、`invalid_context`、`quota_exceeded`、`rate_limited`、`duplicate_request`、`request_timeout`、`incomplete_stream`、`source_mapping_error`、`service_unavailable`、`service_error`。前端显示本地化说明，不直接显示提供商原始错误。必须收到 `done` 且 `complete: true` 才标为完成。

`source.url` 为当前站点已发布课程段落或课件页的来源地址；教材与其他私有参考资料使用 `url: null` 和真实书目位置标签。后端按当前版本的提供商文件 ID 映射生成引用，不采用模型自写的 URL 或 filename。当前页来源单独标注“当前背景”；出现版本外文件引用时回答标为未完成。

`GET /api/course-chat/health` 返回服务状态、演示/正式模式和语料版本。

## 验证与下一阶段

```sh
python3 -m unittest discover -s tests -p 'test_ece685_chat_*.py'
node --test tests/ece685_chat_test.cjs tests/ece685_slides_test.cjs
node --test tests/ece685_chat_backend_test.mjs
python3 tests/ece685_chat_ui_rendered_test.py
python3 tests/ece685_chat_ui_rendered_test.py --site-dir tmp/ece685-chat/site --enabled
```

浏览器验证已覆盖中文/英文、正文选区、显式代码附加、发送后翻页、停止生成、Ctrl + Enter、Escape 焦点返回和 390 × 844 手机布局。CI 检查生产开关与 L05 双语预览，不依赖私有 PDF 或真实模型凭证。

后端使用原生 JavaScript 模块与 Web API，Pages / Workers 共用实现，不增加 TypeScript 编译步骤。根目录 `functions/api/course-chat/[[path]].js` 为 Pages 入口；`src/worker.mjs` 为 Worker 入口。`src/cleanup.mjs` 为 Pages 配套的定时清理 Worker。后端源码、私有材料和本地 Secrets 均排除静态发布。

## 本地 Cloudflare 后端

Wrangler 固定为 4.147.0，独立依赖位于本目录。以下命令在仓库根目录运行，均为本地操作：

```sh
npm ci --prefix services/course-chat --ignore-scripts
python3 scripts/sync_ece685_chat_index.py --corpus tmp/ece685-chat/ece685-2cb02ab2374b55da3f58 --output tmp/ece685-chat/index-local --mock
```

将 `.dev.vars.example` 复制到本目录的 `.dev.vars`，填入随机 `INVITE_PEPPER`；不要覆盖已经生成的本地文件。使用同一 secret 运行 `scripts/create_ece685_chat_invite.py --output tmp/ece685-chat/local-account`，提示时在终端输入。它只写私有的邀请码与 SQL，不打印值。以下定义仅指向模拟器：

```sh
services/course-chat/node_modules/.bin/wrangler d1 execute CHAT_DB --local --config services/course-chat/wrangler.local.jsonc --persist-to tmp/ece685-chat/wrangler-state --file services/course-chat/migrations/0001.sql
```

按 `tmp/ece685-chat/index-local/sql-import-plan.json` 的顺序执行每个 `import-*.sql`，再执行 `activate.sql` 和 `local-account/invitation.sql`；每次均保留相同的 `--local`、`--config`、`--persist-to`。迁移和导入文件只执行一次；部分导入失败时核对成功批次，在 staging 版本修复后继续，不直接重新执行已完成插入。

```sh
services/course-chat/node_modules/.bin/wrangler dev --local --config services/course-chat/wrangler.local.jsonc --persist-to tmp/ece685-chat/wrangler-state
```

API 地址为 `http://127.0.0.1:8790/api/course-chat`。给已有页面预览使用这一 API 时，在仅本地的 Jekyll overlay 中改 `api_base` 并重建；默认 8788 预览仍使用原 Python 固定演示服务。Wrangler mock 回答也显示 demo，且在公网域名上拒绝运行；mock 索引不能配合 live 模式使用。本地配置文件不能用于发布。

常规 4000 端口的 Jekyll 开发服务使用 `_config.dev.yml`，输出到独立的 `tmp/ece685-chat/dev-site`，避免后台自动重建覆盖 `_site` 的生产检查。修改排除规则后重启旧的开发服务，使它加载新配置。

## 后端会话与限额

邀请码 HMAC、会话 token SHA-256 保存在 D1；secret 和明文邀请码不进入数据库。默认会话 2 小时、30 次调用，全课程 UTC 日上限 200 次、最多 3 个同时运行请求；邀请码另有总调用与新建会话限额。一次 INSERT 和数据库触发器完成有效性、额度和并发检查及计数，重复请求 ID 不扣第二次。获准调用即计数，取消和失败不退回，避免重复调用绕过额度；调用次数上限不能替代提供商金额预算。

会话保存最近最多三轮对话，总计最多 12,000 字符，仅用于追问；失败/取消的半截回答不进入历史。更换材料版本后不复用旧版对话。过期后拒绝访问并由清理任务物理删除；每次 API 请求也清理过期记录。Pages 上线时需配套每 15 分钟运行的清理 Worker，配置示例为 `wrangler.cleanup.example.jsonc`；独立 Worker 可使用自身的 scheduled handler。专用 `ece685-chat-cleanup-preview` Worker 已通过 Chrome 发布并绑定同一个 Preview D1，`*/15 * * * *` 已保存并在重新加载后确认；HTTP 及版本预览 URL 均关闭。清理 Worker 不含模型 key。

请求默认 60 秒超时、输出上限 1,600 tokens、最多两次工具调用。停止会取消上游请求，异常退出的并发占位最长在超时加 30 秒后失效。日志仅含请求 ID、版本、耗时、用量与错误码，不含问题、代码选区、回答、邀请码或 token。Responses 使用 `store: false` 和本地短期历史；这不等同于提供商 Zero Data Retention，API 的其他数据处理按[官方数据控制文档](https://developers.openai.com/api/docs/guides/your-data)执行。

用户已指定采用最新模型。当前 Preview 使用 `gpt-6-astra`、`CHAT_REASONING_EFFORT=medium`、`MAX_OUTPUT_TOKENS=8192` 和 `REQUEST_TIMEOUT_SECONDS=75`；已用项目 key 验证 Astra API 可调用。输出预算包括推理和可见文字，避免仍使用 1,600 token 的旧预算使解释中断。服务接受 256–16,384 token 的显式预算，推理强度限定为 `low`、`medium`、`high`、`xhigh`、`max`。模型名称与限额均来自服务器，学生不能覆盖。[GPT-6 官方兼容说明](https://developers.openai.com/api/docs/guides/latest-model)

## 索引准备与真实上传

```sh
python3 scripts/sync_ece685_chat_index.py --corpus tmp/ece685-chat/ece685-2cb02ab2374b55da3f58
```

默认只验证 manifest、内容版本、文档/上传哈希、允许列表、教材选择和隔离标记，写入私有 sync-plan。不会读取未枚举文件或上传 PDF 原件。

配置模型账户后，使用 `--upload`。脚本提示输入 API key，或从本地环境读取 `OPENAI_API_KEY`；不保存密钥。可用 `OPENAI_PROJECT_ID` 固定项目。每次最多新附加 100 文件，可重跑继续；哈希缓存复用未改变的文件。POST 不自动重试未知结果；网络中断可能留下孤立提供商文件，应核对后清理。新版本单独建立 vector store，默认 30 天不活跃后过期。每个文件完成且远端成员与 manifest 完全一致后才生成导入和激活 SQL。`ready` 表示索引处理完成，不表示教学质量评估通过。

也可显式传入 `--credentials-file tmp/ece685-chat/preview-account/credentials.env`，复用由你手动填写的私有 key。文件只能包含未加引号的 `OPENAI_API_KEY=value`、`INVITE_PEPPER=value` 和注释；权限须为 `600`，仓库内路径须位于允许的忽略目录。读取工具不执行 shell 插值或输出值；文件中的 key 优先，空值直接停止。邀请码脚本支持同一选项，确保使用和 Preview Secret 相同的 pepper。该文件只在本机保存，不作为构建输入。

上传支持 `--concurrency 4`，默认仍为 1；每组最多 4 文件，JSON 缓存与状态写入串行，失败时保存已完成组并停止新增。远端进度按分页列表读取；GET 的临时 429/5xx 最多重试三次，POST 未知结果不自动重复。已确认的上传文件先写哈希缓存；丢失附加响应时，只能在远端文件属性与该文档完全一致后恢复记录。8 项索引检查覆盖并发范围、断点恢复、额外/缺失文件和 GET/POST 重试区别。

## 真实课程评估

```sh
python3 scripts/evaluate_ece685_chat.py --corpus tmp/ece685-chat/ece685-2cb02ab2374b55da3f58
python3 scripts/evaluate_ece685_chat.py --corpus tmp/ece685-chat/ece685-2cb02ab2374b55da3f58 --run --credentials-file tmp/ece685-chat/preview-account/credentials.env
```

第一条只核对 20 个固定问题的预期来源，不读密钥或调用模型；第二条明确执行真实模型调用，要求全部 OpenAI 文件索引完成。它将 staging SQL 导入本机一次性的内存 SQLite，使用同一 `handle` 后端、提示词、会话历史和前端 SSE 消费器，不接触 Cloudflare 或生产版本。包含实际 File Search 的命中文档、验证后的引用、用量、延迟和回答；连续追问共用会话，其余问题独立。

记录位于忽略的 `tmp/ece685-chat/evaluations/<语料版本>/<模型>/results-private.json`，不含 key、邀请码或会话 token。已完成的同配置问题可复用；失败问题只有显式加 `--retry-failed` 才会重新调用。完成接口不等于解释正确，必须按每题 `criteria` 对照来源复核后记录质量结论，不能把来源命中数当成准确率。

首轮复核见 [`evaluation-review-2026-10-04.json`](../../_source/ece685-rag/evaluation-review-2026-10-04.json)。20 题技术完成，17 题完整通过，另 3 题需补齐教材 p.41 / PDF p.61 出处、syllabus 对 fuel mix 的 Supplement 对应、EIA 封面 January 2024 与原归档文件身份。响应中位时间 15.92 秒、最长 38.52 秒。当前未达到计划中的 90% 学生试用门槛；用户随后明确要求教师本人在线测试，因此先发布邀请码限制的 Preview。三处来源问题仍需针对性修复和复测；数据库 ready 仅表示索引可用，不能代替回答质量通过。

上传 SQL 默认位于忽略的 `tmp/ece685-chat/index/<版本>/`，包含教材摘录，不能复制到 `_site`。先导入 staging 数据，再做真实模型/来源评估，最后执行 `activate.sql`。触发器拒绝缺文档或缺教材选择说明的激活。普通更新失败保留旧版本；材料撤回先将受影响版本置为 paused，停止新调用，再清理旧索引。已经开始的回答不能撤回已显示文字，应在撤回操作时结束试用并等待最长运行窗口结束。

真实模型与 Cloudflare 配置步骤见 [账户配置指南](cloudflare-setup.md)。账户所有者已填写两处凭证，Preview Secrets、D1 与模型参数已核对。教师 Preview 已发布并验证，下一步完善来源检索与引用显示后针对性复测；Production 使用独立资源并另行验证。
