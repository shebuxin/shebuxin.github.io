# 自托管网站访问统计

本目录提供独立的 Python 后端、SQLite 数据库和管理员统计面板。采集脚本来自自己的主页，后端不调用 GoatCounter、Google Analytics 或其他分析服务。部署到自己的 VPS 或支持持久磁盘的服务器即可，主页继续使用 GitHub Pages。

当前仓库仍使用 GoatCounter。只有完成部署并修改 `_config.yml` 后才切换，不会在没有后端时中断现有统计。历史 GoatCounter 数据保留，不与新系统的去重访客数合并；新系统从启用当天开始记录。

## 能记录和查看什么

- 页面访问次数（PV）、所选时间段的去重访客数（UV）、30 分钟无访问后重开的会话数。
- 每日趋势、热门页面、来源网站域名、UTM 推广来源 / 媒介 / 活动。
- 设备、浏览器、操作系统和浏览器语言。
- 配置离线 GeoIP City 数据库后，可查看近似国家、地区和城市。
- 带服务端时间、匿名访客标识和匿名会话标识的逐条记录，每页 50 条；CSV 导出每次最多 10,000 条，可缩短日期范围分批导出。

日期和每日统计均使用 UTC。访客按浏览器里的随机标识去重，标识在一年后重建；清除存储、换浏览器或换设备会重复计算。无法识别访客真实身份。禁用浏览器存储时仅保留当前页面的内存标识，UV 可能偏高。会话在同一浏览器的页面之间共享，以首个页面的来源归因。没有来源可能是直接访问、书签、邮件、应用或浏览器隐藏了来源，统一标为“直接访问 / 来源未知”。机器人过滤是基础启发式，不代表全部记录一定来自真人。

数据库不保存原始 IP、完整 User-Agent、URL 查询字符串或 URL 片段。浏览器随机标识以服务端 HMAC 转换后保存；身份密钥需长期保持不变。支持 Do Not Track、Global Privacy Control 和隐私页的退出链接。详细记录和导出 API 要求管理员令牌，仅采集接口接受配置的网站 Origin；Origin 限制不能阻止非浏览器伪造请求，因此生产环境需使用下方反向代理限流。

## 本地预览（无需安装 Python 依赖）

从仓库根目录运行下面的命令。生成的 `.env` 被 Git 忽略；不要提交或把其中的令牌放进网页。

```sh
python3 - <<'PY'
import secrets
from pathlib import Path
path = Path('services/analytics/.env')
with path.open('x') as output:
    output.write('ANALYTICS_ADMIN_TOKEN=' + secrets.token_urlsafe(32) + '\n')
    output.write('ANALYTICS_ID_SECRET=' + secrets.token_urlsafe(32) + '\n')
    output.write('ANALYTICS_ORIGINS=https://shebuxin.github.io\n')
path.chmod(0o600)
PY
cd services/analytics
set -a
source .env
set +a
python3 server.py
```

打开 `http://127.0.0.1:8787`，输入 `.env` 中的 `ANALYTICS_ADMIN_TOKEN`。无真实访问时显示零值，不填充虚构记录。此开发服务器只监听本机；生产使用下面的 Gunicorn 容器。

验证命令（仓库根目录）：

```sh
python3 -m unittest discover -s tests -p 'test_owned_*.py'
node --test tests/owned_analytics_test.cjs
```

## 部署到自己的服务器

1. 在服务器复制 `services/analytics/`，按上述方法生成 `.env`（已有文件不要覆盖）。没有 Docker 时，用 Python 3.10+ 安装 `requirements.txt` 并运行 `gunicorn --bind 127.0.0.1:8787 --workers 2 --threads 4 'server:create_app()'`，环境变量加载方法同上。
2. 有 Docker 时在该目录运行 `docker compose up -d --build`。SQLite 位于持久卷 `analytics-data`。服务仅通过 `127.0.0.1:8787` 提供给反向代理，不直接开放到公网。
3. 配置自己域名的 DNS 和 HTTPS 证书，使用反向代理发布服务。下方是 Nginx 示例；替换域名和证书路径，`limit_req_zone` 放在 `http` 块内。Nginx 在此站点关闭访问日志，避免额外保存 IP。管理员令牌、身份密钥和数据库只保存在服务器。

```nginx
limit_req_zone $binary_remote_addr zone=owned_analytics:10m rate=5r/s;

server {
    listen 443 ssl;
    server_name stats.example.org;
    ssl_certificate /etc/letsencrypt/live/stats.example.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/stats.example.org/privkey.pem;
    access_log off;
    client_max_body_size 8k;

    location = /collect {
        limit_req zone=owned_analytics burst=20 nodelay;
        limit_req_status 429;
        proxy_pass http://127.0.0.1:8787;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

4. 检查 `https://stats.example.org/health` 返回 `{"status":"ok"}`，打开该域名并登录面板。
5. 修改主页 `_config.yml`，提交并发布主页：

```yaml
analytics:
  provider: "self-hosted"
  self_hosted:
    endpoint: "https://stats.example.org/collect"
```

启用后只加载自己的采集脚本，不加载 GoatCounter。`_config.dev.yml` 的禁用设置继续有效；本地浏览器访问也默认不采集。用真实浏览器打开已发布主页，再在面板刷新，确认 PV 增加且来源 / 页面正确。不支持脚本或被拦截的访问无法采集。

## 国家和城市（可选）

准备有授权使用的 GeoIP2/GeoLite2 City `.mmdb` 离线数据库，将路径设置为 `ANALYTICS_GEOIP_DATABASE`。后端使用随部署安装的 `geoip2` 读取本地文件；每次查询不访问在线定位 API。数据库的下载、授权和定期更新由你管理。未配置时显示 `Unknown`，不会以语言或时区猜测国家。

Docker 下将文件挂载为只读，例如在 `compose.yml` 的 `volumes` 增加 `./GeoLite2-City.mmdb:/geoip/GeoLite2-City.mmdb:ro`，在 `.env` 设置 `ANALYTICS_GEOIP_DATABASE=/geoip/GeoLite2-City.mmdb` 后重建容器。

反向代理环境中，设置 `ANALYTICS_TRUSTED_PROXIES` 为连接后端的**准确代理地址或受控 CIDR**。本机直接运行 Gunicorn 时通常为 `127.0.0.1/32`；Docker 端口转发时应检查 Compose 网络的网关，使用该网关的 `/32`，而非假设容器看到的来源仍是 `127.0.0.1`。不要设置为所有地址。Nginx 必须覆盖 `X-Real-IP`；后端仅信任这些代理的该字段。没有正确配置时，后端不信任浏览器提供的地址，地理结果可能未知。IP 仅用于当前请求的离线定位，不写入事件表。

## 主页访客地图

切换到 `self-hosted` 后，地图读取独立的 `_data/owned_visitor_countries.json`。旧的 GoatCounter 历史文件保留；两个时期和统计口径不混合。新地图明确使用**页面访问次数**，UV 在私人面板查看。

在仓库根目录，安装已有的地图依赖 `npm ci`，设置后端 URL 和管理员令牌后运行：

```sh
export OWNED_ANALYTICS_URL=https://stats.example.org
# 从安全的本地环境中加载 ANALYTICS_ADMIN_TOKEN，勿写入仓库文件
python3 scripts/update_owned_visitor_countries.py
```

提交生成的 `_data/owned_visitor_countries.json` 并发布主页。脚本只读取国家汇总，不导出私人访问记录、城市或匿名标识；默认隐藏访问少于 2 次的国家，无法定位的访问不显示。地图是同步快照，私人面板直接查询数据库。此版本没有创建定时任务。

## 数据保存和迁移

后端持续追加记录，没有自动清除策略。SQLite + WAL 适用于个人主页流量。用 SQLite 在线备份 API 备份数据库，避免只复制正在写入的 `.sqlite3` 而遗漏 WAL；同时单独备份 `.env` 中的身份密钥。通过 Docker 部署时不要使用 `docker compose down -v`，该命令会删除持久卷。换服务器时恢复数据库和原来的身份密钥即可继续去重。

服务端代码、部署文件和数据库已从 Jekyll 发布目录排除。逐条记录保持私有，不提交数据库、令牌或地理数据库。GoatCounter 的历史汇总无法还原成本系统的逐条记录或跨页面去重 UV。
