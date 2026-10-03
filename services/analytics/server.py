"""Owned analytics storage and authenticated reporting; no analytics SaaS calls."""

import csv
import hashlib
import hmac
import io
import ipaddress
import json
import os
import re
import sqlite3
import time
import uuid
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlsplit


SCHEMA = """
CREATE TABLE IF NOT EXISTS events (
    event_id TEXT PRIMARY KEY, at INTEGER NOT NULL,
    visitor TEXT NOT NULL, session TEXT NOT NULL, path TEXT NOT NULL,
    referrer TEXT NOT NULL, source TEXT NOT NULL, medium TEXT NOT NULL,
    campaign TEXT NOT NULL, country TEXT NOT NULL, region TEXT NOT NULL,
    city TEXT NOT NULL, device TEXT NOT NULL, browser TEXT NOT NULL,
    os TEXT NOT NULL, language TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_at ON events(at);
CREATE INDEX IF NOT EXISTS events_visitor_at ON events(visitor, at);
"""


def text_field(value, maximum=120):
    if not isinstance(value, str):
        raise ValueError("Expected text")
    return re.sub(r"[\x00-\x1f\x7f]", "", value)[:maximum]


def client_info(ua):
    ua = ua.lower()
    device = "Tablet" if "ipad" in ua or ("android" in ua and "mobile" not in ua) else (
        "Mobile" if any(word in ua for word in ("mobile", "iphone")) else "Desktop")
    browser = next((label for word, label in (
        ("edg", "Edge"), ("opr/", "Opera"), ("firefox", "Firefox"),
        ("chrome", "Chrome"), ("crios", "Chrome"), ("safari", "Safari"))
        if word in ua), "Other")
    system = next((label for word, label in (
        ("android", "Android"), ("iphone", "iOS"), ("ipad", "iOS"),
        ("windows", "Windows"), ("macintosh", "macOS"), ("linux", "Linux"))
        if word in ua), "Other")
    return device, browser, system


class Analytics:
    def __init__(self, database, token, secret, origins, geoip=None, trusted_proxies=()):
        if len(token) < 32 or len(secret) < 32:
            raise ValueError("Admin token and identity secret must each be at least 32 characters")
        self.database = str(database)
        self.token, self.secret = token, secret.encode()
        self.origins = frozenset(origins)
        if not self.origins:
            raise ValueError("At least one allowed website origin is required")
        for origin in self.origins:
            parsed = urlsplit(origin)
            if parsed.scheme not in ("https", "http") or not parsed.netloc or parsed.path or parsed.query or parsed.fragment:
                raise ValueError("Origins must have a scheme and host, without a trailing slash")
        self.hosts = {urlsplit(origin).hostname for origin in self.origins}
        self.geoip = geoip
        self.trusted_proxies = [ipaddress.ip_network(network) for network in trusted_proxies]
        Path(self.database).parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.execute("PRAGMA journal_mode=WAL")
            db.executescript(SCHEMA)
        Path(self.database).chmod(0o600)

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.database, timeout=15)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def identity(self, value):
        identifier = str(uuid.UUID(value))
        return hmac.new(self.secret, identifier.encode(), hashlib.sha256).hexdigest()

    def location(self, environ):
        address = environ.get("REMOTE_ADDR", "")
        try:
            peer = ipaddress.ip_address(address)
            if any(peer in network for network in self.trusted_proxies):
                # Only a configured reverse proxy can supply this header.
                address = environ.get("HTTP_X_REAL_IP", address)
            ipaddress.ip_address(address)
            if self.geoip is not None:
                result = self.geoip.city(address)
                return (result.country.iso_code or "Unknown",
                        result.subdivisions.most_specific.name or "",
                        result.city.name or "")
        except (ValueError, LookupError):
            pass
        except Exception:
            # GeoIP misses must not prevent collection; no IP is persisted.
            pass
        return "Unknown", "", ""

    def collect(self, payload, environ):
        if not isinstance(payload, dict):
            raise ValueError("Expected a JSON object")
        event_id = str(uuid.UUID(payload["event_id"]))
        visitor = self.identity(payload["visitor_id"])
        session = self.identity(payload["session_id"])
        path = text_field(payload["path"], 1024)
        parsed_path = urlsplit(path)
        if not path.startswith("/") or path.startswith("//") or parsed_path.netloc or parsed_path.scheme:
            raise ValueError("Page path must be relative to the website")
        path = parsed_path.path  # Query strings and fragments are never stored.
        referrer_url = text_field(payload.get("referrer", ""), 2048)
        referrer = urlsplit(referrer_url)
        referrer = (referrer.hostname or "").lower() if referrer.scheme in ("http", "https") else ""
        if referrer in self.hosts:
            referrer = ""
        source = text_field(payload.get("utm_source", "")) or referrer or "Direct / unknown"
        medium = text_field(payload.get("utm_medium", ""))
        campaign = text_field(payload.get("utm_campaign", ""))
        language = text_field(payload.get("language", ""), 32)
        ua = environ.get("HTTP_USER_AGENT", "")[:1024]
        if re.search(r"bot|crawler|spider|headless|preview|slurp", ua, re.I):
            return  # Basic bot filtering, not a guarantee of human traffic.
        device, browser, system = client_info(ua)
        country, region, city = self.location(environ)
        with self.connect() as db:
            db.execute("INSERT OR IGNORE INTO events VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", (
                event_id, int(time.time()), visitor, session, path, referrer, source,
                medium, campaign, country, region, city, device, browser, system, language))

    def interval(self, query):
        today = datetime.now(timezone.utc).date()
        start = date.fromisoformat(query.get("start", [(today - timedelta(days=29)).isoformat()])[0])
        end = date.fromisoformat(query.get("end", [today.isoformat()])[0])
        if start > end or (end - start).days > 3660:
            raise ValueError("Choose a valid date range of at most ten years")
        begin = int(datetime.combine(start, datetime.min.time(), timezone.utc).timestamp())
        finish = int(datetime.combine(end + timedelta(days=1), datetime.min.time(), timezone.utc).timestamp())
        return start, end, begin, finish

    def stats(self, query):
        start, end, begin, finish = self.interval(query)
        where = "at >= ? AND at < ?"
        with self.connect() as db:
            totals = dict(db.execute(f"SELECT count(*) pageviews, count(DISTINCT visitor) visitors, "
                                     f"count(DISTINCT session) sessions FROM events WHERE {where}", (begin, finish)).fetchone())
            daily_rows = {row["day"]: dict(row) for row in db.execute(
                f"SELECT date(at, 'unixepoch') day, count(*) pageviews, "
                f"count(DISTINCT visitor) visitors, count(DISTINCT session) sessions "
                f"FROM events WHERE {where} GROUP BY day ORDER BY day", (begin, finish))}
            daily = []
            current = start
            while current <= end:
                day = current.isoformat()
                daily.append(daily_rows.get(day, {"day": day, "pageviews": 0, "visitors": 0, "sessions": 0}))
                current += timedelta(days=1)
            groups = {}
            for field in ("path", "source", "campaign", "country", "device", "browser", "os"):
                groups[field] = [dict(row) for row in db.execute(
                    f"SELECT {field} label, count(*) pageviews, count(DISTINCT visitor) visitors "
                    f"FROM events WHERE {where} GROUP BY {field} ORDER BY pageviews DESC, label LIMIT 30",
                    (begin, finish))]
        return {"start": start.isoformat(), "end": end.isoformat(), "timezone": "UTC",
                "totals": totals, "daily": daily, "groups": groups, "geoip_enabled": self.geoip is not None}

    def records(self, query, export=False):
        _, _, begin, finish = self.interval(query)
        limit = 10001 if export else 50
        offset = 0 if export else int(query.get("offset", ["0"])[0])
        if offset < 0:
            raise ValueError("Invalid offset")
        with self.connect() as db:
            # Full hashes and event IDs stay private in the database.
            rows = db.execute("SELECT at, substr(visitor,1,12) visitor, substr(session,1,12) session, "
                              "path, referrer, source, medium, campaign, country, region, city, "
                              "device, browser, os, language FROM events WHERE at >= ? AND at < ? "
                              "ORDER BY at DESC, event_id LIMIT ? OFFSET ?", (begin, finish, limit, offset))
            records = [dict(row) for row in rows]
        for record in records:
            record["at"] = datetime.fromtimestamp(record["at"], timezone.utc).isoformat()
        return records

    def __call__(self, environ, start_response):
        method, path = environ.get("REQUEST_METHOD", "GET"), environ.get("PATH_INFO", "/")
        origin = environ.get("HTTP_ORIGIN", "")
        headers = [("Cache-Control", "no-store"), ("X-Content-Type-Options", "nosniff"),
                   ("Referrer-Policy", "no-referrer")]

        def respond(status, data=b"", content_type="application/json; charset=utf-8"):
            if isinstance(data, (dict, list)):
                data = json.dumps(data, ensure_ascii=False).encode()
            headers.extend([("Content-Type", content_type), ("Content-Length", str(len(data)))])
            start_response(status, headers)
            return [data]

        if path == "/collect":
            if origin not in self.origins:
                return respond("403 Forbidden", {"error": "Website origin is not allowed"})
            headers.extend([("Access-Control-Allow-Origin", origin), ("Vary", "Origin")])
            if method == "OPTIONS":
                headers.extend([("Access-Control-Allow-Methods", "POST"),
                                ("Access-Control-Allow-Headers", "Content-Type")])
                return respond("204 No Content")
            if method != "POST":
                return respond("405 Method Not Allowed")
            if environ.get("HTTP_DNT") == "1" or environ.get("HTTP_SEC_GPC") == "1":
                return respond("204 No Content")
            try:
                length = int(environ.get("CONTENT_LENGTH") or "0")
                if length < 1 or length > 8192:
                    return respond("413 Content Too Large")
                payload = json.loads(environ["wsgi.input"].read(length))
                self.collect(payload, environ)
            except (ValueError, KeyError, TypeError, AttributeError, OverflowError):
                return respond("400 Bad Request", {"error": "Invalid analytics event"})
            return respond("204 No Content")

        if method != "GET":
            return respond("405 Method Not Allowed")
        if path == "/health":
            return respond("200 OK", {"status": "ok"})
        if path in ("/", "/dashboard.js", "/dashboard.css"):
            name = "dashboard.html" if path == "/" else path[1:]
            mime = {"dashboard.html": "text/html", "dashboard.js": "text/javascript", "dashboard.css": "text/css"}[name]
            headers.append(("Content-Security-Policy", "default-src 'self'; connect-src 'self'; "
                            "script-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"))
            return respond("200 OK", Path(__file__).with_name(name).read_bytes(), mime + "; charset=utf-8")
        if path not in ("/api/stats", "/api/records", "/api/export", "/api/countries"):
            return respond("404 Not Found")
        authorization = environ.get("HTTP_AUTHORIZATION", "")
        if not hmac.compare_digest(authorization.encode(), ("Bearer " + self.token).encode()):
            return respond("401 Unauthorized", {"error": "Admin token required"})
        try:
            query = parse_qs(environ.get("QUERY_STRING", ""))
            if path == "/api/countries":
                with self.connect() as db:
                    period = db.execute("SELECT date(min(at), 'unixepoch') start, date(max(at), 'unixepoch') end FROM events").fetchone()
                    countries = [dict(row) for row in db.execute("SELECT country id, count(*) count FROM events GROUP BY country ORDER BY country")]
                return respond("200 OK", {"period": dict(period), "countries": countries, "metric": "pageviews"})
            if path == "/api/stats":
                return respond("200 OK", self.stats(query))
            records = self.records(query, export=path == "/api/export")
            if path == "/api/records":
                return respond("200 OK", records)
            if len(records) > 10000:
                return respond("413 Content Too Large", {"error": "Export is limited to 10,000 rows; choose a shorter period"})
            output = io.StringIO()
            fields = ["at", "visitor", "session", "path", "referrer", "source", "medium", "campaign",
                      "country", "region", "city", "device", "browser", "os", "language"]
            writer = csv.DictWriter(output, fieldnames=fields)
            writer.writeheader()
            for record in records:
                # Prevent untrusted URLs/campaigns from becoming spreadsheet formulas.
                writer.writerow({key: "'" + value if value.lstrip().startswith(("=", "+", "-", "@")) else value
                                 for key, value in record.items()})
            headers.append(("Content-Disposition", 'attachment; filename="analytics.csv"'))
            return respond("200 OK", ("\ufeff" + output.getvalue()).encode(), "text/csv; charset=utf-8")
        except (ValueError, OverflowError):
            return respond("400 Bad Request", {"error": "Invalid date range or pagination"})


def create_app():
    geoip = None
    if os.environ.get("ANALYTICS_GEOIP_DATABASE"):
        import geoip2.database
        geoip = geoip2.database.Reader(os.environ["ANALYTICS_GEOIP_DATABASE"])
    return Analytics(
        os.environ.get("ANALYTICS_DATABASE", "data/analytics.sqlite3"),
        os.environ.get("ANALYTICS_ADMIN_TOKEN", ""), os.environ.get("ANALYTICS_ID_SECRET", ""),
        [origin.strip() for origin in os.environ.get("ANALYTICS_ORIGINS", "https://shebuxin.github.io").split(",") if origin.strip()],
        geoip=geoip,
        trusted_proxies=[network.strip() for network in os.environ.get("ANALYTICS_TRUSTED_PROXIES", "").split(",") if network.strip()])


if __name__ == "__main__":
    from wsgiref.simple_server import WSGIRequestHandler, make_server

    class QuietHandler(WSGIRequestHandler):
        def log_message(self, format, *args):
            pass  # The local preview does not log IP addresses or request URLs.

    app = create_app()
    with make_server("127.0.0.1", 8787, app, handler_class=QuietHandler) as server:
        print("Local analytics dashboard: http://127.0.0.1:8787 (development only)")
        server.serve_forever()
