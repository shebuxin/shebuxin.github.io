import io
import json
import tempfile
import unittest
import uuid
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from services.analytics.server import Analytics


class AnalyticsTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.app = Analytics(Path(self.directory.name) / "stats.sqlite3", "t" * 40, "s" * 40,
                             ["https://shebuxin.github.io"])
        self.visitor, self.session = str(uuid.uuid4()), str(uuid.uuid4())

    def event(self, **overrides):
        event = {"event_id": str(uuid.uuid4()), "visitor_id": self.visitor,
                 "session_id": self.session, "path": "/research/",
                 "referrer": "https://www.google.com/search?q=private", "language": "zh-CN"}
        event.update(overrides)
        return event

    def request(self, path="/collect", data=None, auth=False, **overrides):
        body = json.dumps(data if data is not None else self.event()).encode()
        environ = {"REQUEST_METHOD": "POST" if path == "/collect" else "GET", "PATH_INFO": path,
                   "HTTP_ORIGIN": "https://shebuxin.github.io", "CONTENT_LENGTH": str(len(body)),
                   "wsgi.input": io.BytesIO(body), "REMOTE_ADDR": "203.0.113.1",
                   "HTTP_USER_AGENT": "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36"}
        if auth:
            environ["HTTP_AUTHORIZATION"] = "Bearer " + "t" * 40
        environ.update(overrides)
        response = {}

        def start(status, headers):
            response.update(status=status, headers=dict(headers))

        response["body"] = b"".join(self.app(environ, start))
        return response

    def test_counts_unique_visitors_sessions_and_duplicate_events(self):
        event = self.event()
        for _ in range(2):
            self.assertEqual(self.request(data=event)["status"], "204 No Content")
        self.request(data=self.event(path="/publications/"))
        self.request(data=self.event(session_id=str(uuid.uuid4())))
        self.request(data=self.event(visitor_id=str(uuid.uuid4()), session_id=str(uuid.uuid4())))
        report = json.loads(self.request("/api/stats", auth=True)["body"])
        self.assertEqual(report["totals"], {"pageviews": 4, "visitors": 2, "sessions": 3})
        self.assertEqual(report["groups"]["source"][0]["label"], "www.google.com")

    def test_dates_include_end_day_and_exclude_next_day_and_zero_fill(self):
        for moment in ("2026-01-01T23:59:59", "2026-01-02T00:00:00", "2026-01-03T00:00:00"):
            with patch("services.analytics.server.time.time", return_value=datetime.fromisoformat(moment).replace(tzinfo=timezone.utc).timestamp()):
                self.request()
        report = json.loads(self.request("/api/stats", auth=True, QUERY_STRING="start=2025-12-31&end=2026-01-02")["body"])
        self.assertEqual(report["totals"]["pageviews"], 2)
        self.assertEqual(report["totals"]["visitors"], 1)
        self.assertEqual([day["pageviews"] for day in report["daily"]], [0, 1, 1])

    def test_no_raw_identity_ip_queries_or_user_agent_persisted(self):
        self.request(data=self.event(path="/research/?token=private#fragment"))
        with self.app.connect() as db:
            row = dict(db.execute("SELECT * FROM events").fetchone())
        self.assertNotEqual(row["visitor"], self.visitor)
        self.assertEqual(row["path"], "/research/")
        self.assertEqual(row["referrer"], "www.google.com")
        self.assertNotIn("203.0.113.1", json.dumps(row))
        self.assertNotIn("private", json.dumps(row))
        self.assertEqual(row["browser"], "Chrome")

    def test_admin_endpoints_require_bearer_and_do_not_allow_cors(self):
        for path in ("/api/stats", "/api/records", "/api/export", "/api/countries"):
            self.assertEqual(self.request(path)["status"], "401 Unauthorized")
            response = self.request(path, auth=True)
            self.assertEqual(response["status"], "200 OK")
            self.assertNotIn("Access-Control-Allow-Origin", response["headers"])

    def test_invalid_origins_payloads_dates_and_sizes(self):
        self.assertEqual(self.request(HTTP_ORIGIN="https://evil.example")["status"], "403 Forbidden")
        for event in ([], self.event(path="https://evil.example/"), self.event(path="//evil.example/"),
                      self.event(visitor_id="invalid"), self.event(language=42)):
            self.assertEqual(self.request(data=event)["status"], "400 Bad Request")
        self.assertEqual(self.request(CONTENT_LENGTH="9000")["status"], "413 Content Too Large")
        self.assertEqual(self.request("/api/stats", auth=True, QUERY_STRING="start=2026-02-02&end=2026-01-01")["status"], "400 Bad Request")
        self.assertEqual(self.request("/api/records", auth=True, QUERY_STRING="offset=-1")["status"], "400 Bad Request")

    def test_bot_and_privacy_preference_are_not_counted(self):
        self.request(HTTP_USER_AGENT="Googlebot")
        self.request(HTTP_DNT="1")
        self.request(HTTP_SEC_GPC="1")
        report = json.loads(self.request("/api/stats", auth=True)["body"])
        self.assertEqual(report["totals"]["pageviews"], 0)

    def test_geoip_uses_only_trusted_proxy_address(self):
        result = SimpleNamespace(country=SimpleNamespace(iso_code="US"),
                                 subdivisions=SimpleNamespace(most_specific=SimpleNamespace(name="Kansas")),
                                 city=SimpleNamespace(name="Manhattan"))
        from unittest.mock import Mock
        reader = Mock()
        reader.city.return_value = result
        self.app.geoip = reader
        self.request(HTTP_X_REAL_IP="8.8.8.8")
        reader.city.assert_called_with("203.0.113.1")
        import ipaddress
        self.app.trusted_proxies = [ipaddress.ip_network("127.0.0.1/32")]
        self.request(REMOTE_ADDR="127.0.0.1", HTTP_X_REAL_IP="8.8.8.8")
        reader.city.assert_called_with("8.8.8.8")
        records = json.loads(self.request("/api/records", auth=True)["body"])
        self.assertEqual(records[0]["country"], "US")
        self.assertEqual(records[0]["city"], "Manhattan")

    def test_campaign_attribution_internal_referrer_and_csv_safety(self):
        self.request(data=self.event(referrer="https://shebuxin.github.io/", utm_source="newsletter",
                                    utm_medium="email", utm_campaign="=HYPERLINK(\"bad\")"))
        records = json.loads(self.request("/api/records", auth=True)["body"])
        self.assertEqual(records[0]["source"], "newsletter")
        self.assertEqual(records[0]["referrer"], "")
        exported = self.request("/api/export", auth=True)["body"].decode("utf-8-sig")
        self.assertIn("'=HYPERLINK", exported)

    def test_pagination_and_country_totals(self):
        for _ in range(51):
            self.request()
        self.assertEqual(len(json.loads(self.request("/api/records", auth=True)["body"])), 50)
        self.assertEqual(len(json.loads(self.request("/api/records", auth=True, QUERY_STRING="offset=50")["body"])), 1)
        countries = json.loads(self.request("/api/countries", auth=True)["body"])
        self.assertEqual(countries["countries"], [{"id": "Unknown", "count": 51}])
        self.assertEqual(countries["metric"], "pageviews")

    def test_dashboard_has_strict_policy_and_no_secret(self):
        response = self.request("/")
        self.assertEqual(response["status"], "200 OK")
        self.assertIn("frame-ancestors 'none'", response["headers"]["Content-Security-Policy"])
        self.assertNotIn(b"t" * 40, response["body"])


if __name__ == "__main__":
    unittest.main()
