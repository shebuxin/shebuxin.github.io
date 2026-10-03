(function () {
  "use strict";
  var token = "", offset = 0, activeQuery = "", pending = false;
  var labels = { path: "访问页面", source: "流量来源", campaign: "推广活动", country: "访客国家", device: "设备类型", browser: "浏览器", os: "操作系统" };
  function el(id) { return document.getElementById(id); }
  function cell(row, value, tag) {
    var node = document.createElement(tag || "td");
    node.textContent = String(value); row.appendChild(node); return node;
  }
  function dates() {
    return new URLSearchParams({ start: el("start").value, end: el("end").value }).toString();
  }
  async function request(path) {
    var requestToken = token;
    var response = await fetch(path, { headers: { Authorization: "Bearer " + requestToken }, cache: "no-store", credentials: "omit" });
    if (token !== requestToken) throw new Error("会话已退出，请重新登录。");
    if (!response.ok) {
      if (response.status === 401) { logout(); throw new Error("令牌无效，请重新登录。"); }
      var error = await response.json().catch(function () { return {}; });
      throw new Error(error.error || "统计请求失败（" + response.status + "）。");
    }
    return response;
  }
  function renderGroup(field, rows) {
    var section = document.createElement("section"); section.className = "panel";
    var title = document.createElement("h2"); title.textContent = labels[field]; section.appendChild(title);
    var wrapper = document.createElement("div"); wrapper.className = "table-scroll";
    var table = document.createElement("table"), head = table.createTHead().insertRow();
    ["项目", "访问次数", "访客数"].forEach(function (value) { cell(head, value, "th"); });
    var body = table.createTBody();
    rows.forEach(function (item) {
      var row = body.insertRow();
      var label = item.label || "未设置";
      if (label === "Direct / unknown") label = "直接访问 / 来源未知";
      if (label === "Unknown") label = "未知";
      [label, item.pageviews, item.visitors].forEach(function (value) { cell(row, value); });
    });
    if (!rows.length) cell(body.insertRow(), "暂无数据").colSpan = 3;
    wrapper.appendChild(table); section.appendChild(wrapper); return section;
  }
  async function records() {
    var rows = await (await request("/api/records?" + activeQuery + "&offset=" + offset)).json();
    el("records").replaceChildren();
    rows.forEach(function (item) {
      var row = document.createElement("tr");
      [item.at.replace("T", " ").replace("+00:00", ""), item.visitor, item.path,
        item.source === "Direct / unknown" ? "直接 / 未知" : item.source,
        [item.campaign, item.medium].filter(Boolean).join(" / ") || "—",
        [item.country, item.region, item.city].filter(Boolean).join(" / "),
        [item.device, item.browser, item.os].join(" / "), item.language || "—"]
        .forEach(function (value) { cell(row, value); });
      el("records").appendChild(row);
    });
    if (!rows.length) cell(el("records").insertRow(), "该时间段暂无访问记录").colSpan = 8;
    el("previous").disabled = offset === 0; el("next").disabled = rows.length < 50;
    el("record-page").textContent = "第 " + (offset / 50 + 1) + " 页 · 每页最多 50 条";
  }
  async function load() {
    if (pending) return;
    pending = true; el("status").textContent = "正在加载……";
    try {
      var query = dates();
      var report = await (await request("/api/stats?" + query)).json();
      activeQuery = query; offset = 0;
      Object.keys(report.totals).forEach(function (key) { el(key).textContent = report.totals[key].toLocaleString(); });
      el("daily").replaceChildren();
      var max = Math.max.apply(null, report.daily.map(function (item) { return item.pageviews; }).concat([1]));
      report.daily.forEach(function (item) {
        var row = document.createElement("tr");
        [item.day, item.pageviews, item.visitors, item.sessions].forEach(function (value) { cell(row, value); });
        var progress = document.createElement("progress"); progress.max = max; progress.value = item.pageviews;
        progress.setAttribute("aria-label", item.day + " 访问次数 " + item.pageviews);
        var bar = document.createElement("td"); bar.appendChild(progress); row.appendChild(bar); el("daily").appendChild(row);
      });
      el("breakdowns").replaceChildren();
      Object.keys(labels).forEach(function (field) { el("breakdowns").appendChild(renderGroup(field, report.groups[field])); });
      el("geo-note").textContent = report.geoip_enabled ? "国家和城市来自服务器上的离线 GeoIP 数据库，为近似位置。" : "尚未配置离线 GeoIP 数据库，国家显示为未知；语言不用于推测地理位置。";
      await records();
      el("login").hidden = true; el("report").hidden = false; el("logout").hidden = false;
      el("status").textContent = "已加载 " + report.start + " 至 " + report.end + " 的统计。";
    } catch (error) { el("status").textContent = error.message; }
    finally { pending = false; }
  }
  function logout() {
    token = ""; el("token").value = ""; el("login").hidden = false;
    el("report").hidden = true; el("logout").hidden = true;
    ["daily", "records", "breakdowns"].forEach(function (id) { el(id).replaceChildren(); });
  }
  el("login-form").addEventListener("submit", function (event) { event.preventDefault(); token = el("token").value; el("token").value = ""; load(); });
  el("filters").addEventListener("submit", function (event) { event.preventDefault(); load(); });
  el("logout").addEventListener("click", logout);
  ["previous", "next"].forEach(function (id) {
    el(id).addEventListener("click", async function () {
      if (pending) return;
      pending = true; offset += id === "next" ? 50 : -50;
      try { await records(); } catch (error) { offset += id === "next" ? -50 : 50; el("status").textContent = error.message; }
      finally { pending = false; }
    });
  });
  el("export").addEventListener("click", async function () {
    try {
      var blob = await (await request("/api/export?" + activeQuery)).blob();
      var url = URL.createObjectURL(blob), link = document.createElement("a");
      link.href = url; link.download = "analytics.csv"; link.click();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    } catch (error) { el("status").textContent = error.message; }
  });
  var end = new Date(), start = new Date(); start.setUTCDate(start.getUTCDate() - 29);
  el("end").value = end.toISOString().slice(0, 10); el("start").value = start.toISOString().slice(0, 10);
}());
