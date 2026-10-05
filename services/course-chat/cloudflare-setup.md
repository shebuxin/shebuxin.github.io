# ECE 685 聊天服务账户配置

本指南用于把已经通过本地验证的聊天后端接入现有 Cloudflare 网站。2026-10-04 已通过 Chrome 核对现有 Pages 项目，创建 Preview D1 并保存绑定及运行参数。1,104 份文档已完成真实索引并导入 staging；GPT-6 Astra 的 20 题实测均完成，17 题达到完整标准，3 题需改进出处及资料定位。用户随后要求在线测试，专用 Preview 数据库已激活并导入教师邀请码，专用测试分支已部署并通过线上登录、回答和追问测试。用户进一步要求将入口扩展至所有已完成讲次；原三处来源质量待办仍保留，不视为评估已全部通过。

## 个人主页入口与课程地址

个人主页镜像使用 `https://shebuxin.pages.dev`，仍发布整个个人主页。Pages 项目 `shebuxin` 连接同一仓库，发布分支为 `codex/ece685-chat-preview`，构建命令 `bash scripts/build_shebuxin_pages.sh`，输出 `_site`。Cloudflare 的 Rename 只修改项目标识，原 `pages.dev` hostname 不会随之改变，因此保留 `power-edu` 并使用具名镜像作为公开入口。

课程正式路径统一为 `/teaching/ece685/`、`/teaching/ibr/`、`/teaching/physics-informed-gnn/`；中文加 `/zh`。原 `/teaching/course-development/…` 的页面和旧模块地址保留跳转，保留查询参数和章节位置，且在当前网站内跳转。

新镜像的 AI 入口复用 `https://codex-ece685-chat-preview.power-edu.pages.dev/api/course-chat`。原项目 Preview 的允许来源为原预览域名和 `https://shebuxin.pages.dev`；密钥、D1、限额、定时清理和邀请码仍由原服务管理。新镜像排除全部 Functions 路由，不需要复制 Secret。原索引中的旧课程 URL 在 API 和前端显示时转换为新路径，无需重复上传资料。按用户最新要求，入口覆盖全部 16 个已完成讲次的 32 个中英文页面；`lectures: ['*']` 配合 `status: live` 判定，未完成讲次不显示入口。邀请码仍通过服务端 HMAC 和 D1 校验；拥有者指定的课程代码支持 6–128 位字符，原码更换后撤销，原额度与到期时间保留。

## 原项目已核对与配置的环境

| 字段 | 当前值 |
| --- | --- |
| Pages 项目 | `power-edu` |
| 公开网址 | `https://power-edu.pages.dev` |
| Git 仓库 | `shebuxin/shebuxin.github.io` |
| Production 分支 | `master`，自动部署已启用 |
| Preview 分支 | 全部非 Production 分支；聊天使用 `codex/ece685-chat-preview` |
| 原构建命令（变更前） | `RUBYOPT='-EUTF-8' bundle exec jekyll build` |
| 构建输出 / 系统 | `_site` / Version 3 |
| Preview D1 | `ece685-chat-preview` |
| Preview binding | `CHAT_DB` → `ece685-chat-preview`，已在聊天 Preview 生效 |
| D1 ID | `cd2eb255-a596-4098-b8cb-d61ad62df9b8` |
| Preview schema | 已应用 `0001.sql`：8 张课程表、5 个触发器；1,104 份文档；`ece685-2cb02ab2374b55da3f58` 已为教师测试设为 ready / active |
| Preview 运行参数 | 已保存下表中的 `CHAT_MODE`、来源限制及六项会话/请求限额 |
| 当前 `ALLOWED_ORIGINS` | `https://codex-ece685-chat-preview.power-edu.pages.dev,https://shebuxin.pages.dev`；拒绝其他 origin |
| Preview API key | 用户已手动保存 `OPENAI_API_KEY` 为 Secret；控制台确认 Value encrypted，未读取密钥 |
| Preview 模型参数 | 已保存 `CHAT_MODEL=gpt-6-astra`、`CHAT_REASONING_EFFORT=medium`、输出预算 `8192`、超时 `75`；模型 API 和 20 题实测已验证 |
| Preview 邀请密钥 | 用户已保存 `INVITE_PEPPER` Secret，控制台确认 Value encrypted |
| 本机上传凭证 | 用户已填写私有 API key；已验证模型访问及本机邀请码 HMAC 一致 |

首次网页 Console 和 Wrangler 远端迁移均返回 `incomplete input: SQLITE_ERROR`，失败后未留下部分课程表。将触发器的 `SELECT CASE … END;` 改成等价的 `SELECT (CASE … END);` 后，Wrangler 已成功应用 `0001.sql`，迁移记录、8 张课程表和 5 个触发器均在控制台查询确认。这个写法兼容 D1 远端 SQL 拆分；相关上游问题见 [Cloudflare SDK issue #4326](https://github.com/cloudflare/workers-sdk/issues/4326)。19 项本地后端检查通过；远端无效会话探测得到预期的 `invite_invalid`，未留下记录。保留大写 `BEGIN` 和 LF 换行，未来迁移仍需远端验证。

Wrangler 已成功登录，使用账户拥有者确认的 `Account Read`、`D1 Write` 和 `Background Access`。第一次授权时本机回调因等待超时关闭，Chrome 跳到 `localhost:8976` 后无法访问；重开同样权限登录并及时完成回调后，CLI 和浏览器都确认授权成功。登录命令使用 `--use-keyring`，凭证保存到本机钥匙串。这些权限可管理该账户的 D1，维护命令明确限定上面的 Preview 数据库。云端模型 key 已保存，已调用简短连通性测试，课程索引已完成，20题真实问答已复核。已完成的初始化命令为：

```sh
cd services/course-chat
npx wrangler d1 migrations apply ece685-chat-preview --remote --config wrangler.d1-preview.jsonc
```

保存/绑定及迁移操作均针对 Preview；构建命令已加入专用分支脚本，Production 参数仍沿用现有配置。只有聊天测试分支使用启用聊天的 overlay，其他分支执行原 Jekyll 构建。数据库激活不代表聊天代码已经上线。Pages 的 Preview 变量作用于所有非生产分支，新代码部署前需核对要用的分支、实际允许域名和功能开关。

## 先确认现有项目

在 Chrome 打开 Cloudflare 的 Workers & Pages，找到链接本 GitHub repo 的网站，记录项目名称、公开网址、Pages 或 Workers 类型、生产分支、构建命令和输出目录。分享这些公开字段即可，无需分享凭证。

若为 Pages，沿用当前 Git 集成和 Jekyll 构建，根目录 Functions 随源目录编译；若为 Workers，部署 `src/worker.mjs` 并用固定 API 地址连接现有页面。项目类型未确认前，不修改已有构建配置，不把本地 wrangler.local.jsonc 当作线上配置。[Pages Functions 绑定](https://developers.cloudflare.com/pages/functions/bindings/)

## 模型账户准备

在 OpenAI Platform 建立或选定用于 ECE 685 的项目，启用 API 计费并创建项目 API key。配置项目预算/限额，选择该账户实际可用、支持 Responses 和 File Search 的模型；模型名填入 `CHAT_MODEL`，当前代码没有强行指定型号。ChatGPT 登录或订阅不能作为这份 API key 的替代输入。

本地上传与模型评估时，在脚本的隐藏输入中填入 key，或在本机私有环境配置；云端使用 Secrets。不要把 key 写入 Jekyll、GitHub 仓库、网页 JavaScript 或聊天消息。[OpenAI API 凭证说明](https://developers.openai.com/api/reference/overview)

按用户要求，Preview 使用最新 GPT-6 系列中官方当前最高能力的 `gpt-6-astra`。已验证模型查询、简短 Responses 调用和 20 题真实课程问答；配置 `CHAT_REASONING_EFFORT=medium`、输出预算 `8192`（包括推理 tokens）及超时 `75` 秒。复核为 17 题完整通过，3 题需补齐参考定位；中位响应 15.92 秒，最长 38.52 秒。见 [`课程评估记录`](../../_source/ece685-rag/evaluation-review-2026-10-04.json)。[模型文档](https://developers.openai.com/api/docs/models/gpt-6-astra)

已准备本机私有文件 `tmp/ece685-chat/preview-account/credentials.env`，权限为 `600`，目录为 `700`，Git 忽略。`OPENAI_API_KEY` 已由账户拥有者填写同一项目 key，随机生成的 `INVITE_PEPPER` 已由拥有者保存到 Cloudflare Preview 同名 Secret。按照浏览器凭证交接规则，新的 Secret 值由拥有者手动输入并提交；拥有者已完成填写，两项 Secrets 均已加密保存。Cloudflare 加密保存后无法回读 key，本机文件用于向 OpenAI 上传允许的课程 Markdown 和后续评估，不发送到聊天。脚本仅解析两个指定字段，不执行文件内容，不在错误中输出值；显式选择文件时不回退到环境中的其他 key。

填好并保存后，分批上传和邀请码命令为：

```sh
python3 scripts/sync_ece685_chat_index.py --corpus tmp/ece685-chat/ece685-2cb02ab2374b55da3f58 --upload --credentials-file tmp/ece685-chat/preview-account/credentials.env
python3 scripts/create_ece685_chat_invite.py --output tmp/ece685-chat/preview-account --credentials-file tmp/ece685-chat/preview-account/credentials.env
```

第一条最多新附加 100 文件，重跑继续；第二条仅在本机生成邀请码及 SQL，不自动导入数据库。当前索引已 ready，17 个 SQL 批次均已一次性导入已确认的 Preview D1；远端先确认 1,104 份文档及 staging / 空 active 状态，再按用户在线测试请求一次性执行激活 SQL 与教师邀请码导入。上传曾遇到临时 503 和短暂列表不一致，已先只读核对后恢复，未自动重复未知 POST。三个评估缺口保留为学生开放前的修复项；教师在线测试使用独立 Preview 和邀请码。

本机真实页面使用独立 D1 与回环地址 `http://127.0.0.1:8853`，Chrome 已验证两次问答、公式及来源卡片；不改变 Cloudflare 的启用状态。Preview 清理 Worker `ece685-chat-cleanup-preview` 已通过 Chrome 创建、部署编译后的 `src/cleanup.mjs`、绑定专用 D1；每 15 分钟的 Cron 保存并在重新加载后确认。公开 HTTP 和版本预览 URL 均关闭，无模型凭证。当前 Wrangler 授权只有账户读取和 D1 写入，不包含 Workers/Pages 发布权限；代码发布仍按现有 Git 集成安排。

## 已发布的教师测试

- 分支别名：`https://codex-ece685-chat-preview.power-edu.pages.dev`；此 origin 和具名主页可调用当前 Preview 聊天。
- 聊天入口：[L05 中文第 12 页](https://codex-ece685-chat-preview.power-edu.pages.dev/zh/teaching/ece685/l05-single-phase-ac-i/?slide=12#lecture-overview)，英文 L05 同时启用。
- 初次代码提交：`975140b9a279434e3849d7c00c8e8304bc75cfb3`；[GitHub CI](https://github.com/shebuxin/shebuxin.github.io/actions/runs/37259376873) 成功。Cloudflare 首次部署 `e5550aa9-e628-461a-942a-247e8ad795db` 成功；随后修复强调文字内的行内公式并更新记录。
- Chrome 真实 HTTPS 验证：邀请码登录、两次连续问答、公式及课件引用跳转。D1 记录两次 completed、无错误，平均 15.15 秒。命令行健康探测被 Cloudflare 浏览器检查拒绝（1010）；直接页面导航 JSON 被客户端拦截，因此没有把这两项写成健康接口通过。浏览器课程 API 登录与实际问答已成功。
- 私有邀请码保存于本机 `tmp/ece685-chat/preview-account/invitation-code.txt`，未放入仓库或静态网站；会话只存最近三轮短期历史。

## Cloudflare Preview 配置

1. 在 Cloudflare 创建专用的 Preview D1 数据库；记录数据库名称与 ID。在 Pages 项目的 Preview 环境添加名为 `CHAT_DB` 的 D1 binding，选择这个数据库。Production 之后使用独立数据库和邀请码，避免试用记录混入生产。[D1 绑定步骤](https://developers.cloudflare.com/pages/functions/bindings/)
2. 在 Preview 的 Variables and Secrets 配置下表。生成随机的 `INVITE_PEPPER`，本地邀请码生成工具使用同一个值；修改它会令旧邀请码失效。
3. 初始化 `migrations/0001.sql`，导入索引同步工具生成的私有 SQL，建立试用邀请码。大量语料使用一次性 Wrangler 批量导入；由你通过 Chrome 完成 Wrangler 的浏览器登录，再针对已确认的数据库执行导入。无需提前提供全账户 token。导入过程我可以在目标确认后完成。[D1 官方批量导入](https://developers.cloudflare.com/d1/best-practices/import-export-data/)
4. Pages 配套创建定时清理 Worker，绑定同一个 Preview D1，使用 `src/cleanup.mjs` 每 15 分钟删除过期会话；独立 Worker 可直接配置同样的 cron。清理任务只需 D1 binding，不需要模型 key。

| 名称 | 类型 | 内容 |
| --- | --- | --- |
| `CHAT_DB` | D1 binding | Preview 专用数据库 |
| `OPENAI_API_KEY` | Secret | 项目 API key |
| `INVITE_PEPPER` | Secret | 至少 32 字符的随机值 |
| `CHAT_MODE` | Variable | `live` |
| `CHAT_MODEL` | Variable | `gpt-6-astra` |
| `CHAT_REASONING_EFFORT` | Variable | `medium` |
| `ALLOWED_ORIGINS` | Variable | 完整站点 origin，逗号分隔；不使用通配符 |
| `SESSION_TTL_SECONDS` | Variable | 默认 `7200` |
| `SESSION_MESSAGE_LIMIT` | Variable | 默认 `30` |
| `GLOBAL_DAILY_LIMIT` | Variable | 默认 `200`，按 UTC 日计数 |
| `GLOBAL_CONCURRENCY_LIMIT` | Variable | 默认 `3` |
| `MAX_OUTPUT_TOKENS` | Variable | Preview `8192`，含推理与可见输出 |
| `REQUEST_TIMEOUT_SECONDS` | Variable | Preview `75` |

知识库 ID 从启用的 D1 语料版本读取，不接受前端传入。跨域 GitHub Pages 使用 Cloudflare 的完整 HTTPS API 地址，并将 `https://shebuxin.github.io` 加入允许列表。Cloudflare Pages 同域使用 `/api/course-chat`。Preview 分支域名逐个登记；CORS 不能替代邀请码鉴权。

## 完成评估再开启入口

账户就绪后运行 `sync_ece685_chat_index.py --upload`，检查全部允许文档索引完成，导入 D1 staging 数据。先用固定问题和 L05 当前页做真实检索、公式/单位、引用和连续追问评估，再激活版本。

Pages 预览构建可以使用 `services/course-chat/cloudflare.yml` 作为附加 Jekyll 配置，构建结束把 `services/course-chat/routes.json` 复制为 `_site/_routes.json`，仅 `/api/course-chat/*` 进入 Functions。控制台已保存：

```bash
if [ -f scripts/build_cloudflare_pages.sh ]; then bash scripts/build_cloudflare_pages.sh; else RUBYOPT='-EUTF-8' bundle exec jekyll build; fi
```

`scripts/build_cloudflare_pages.sh` 仅在 `CF_PAGES_BRANCH=codex/ece685-chat-preview` 时加载聊天 overlay；原 master 没有此脚本时仍使用原构建命令。GitHub Pages 的默认构建继续关闭聊天；跨域正式 API 验证后再单独修改公开配置。[Pages 路由说明](https://developers.cloudflare.com/pages/functions/routing/)

检查 HTTPS 健康接口、有效/无效邀请码、L05 第 12 页回答、至少一个跨讲次问题、追问、取消、额度耗尽、来源跳转及过期记录清理。Preview 通过后，把同一流程应用到独立的 Production 资源，保存资源归属和限额。当前的模拟索引或演示邀请码不能用于真实服务。
