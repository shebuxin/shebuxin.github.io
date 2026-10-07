(function () {
  "use strict";
  const root = document.querySelector("[data-ece-platform]");
  if (!root) return;
  const zh = root.dataset.lang === "zh";
  const knowledgeProgress = root.dataset.progressVersion === "knowledge";
  const storageKey = knowledgeProgress ? "ece685-reading-v1" : "ece685-reading-v2-transformers";
  const knownIds = new Set(Array.from(root.querySelectorAll("[data-reviewed-dot]"), node => node.dataset.reviewedDot));
  // Keep the old records intact and migrate each record only into its new key.
  try {
    if (!knowledgeProgress) {
      const remap = id => ({ L17: "L16b", L20: "L17", L21: "L18" }[id] || id);
      if (!localStorage.getItem(storageKey)) {
        const reading = JSON.parse(localStorage.getItem("ece685-reading-v1"));
        if (reading && Array.isArray(reading.reviewed)) {
          reading.reviewed = [...new Set(reading.reviewed.map(remap))];
          reading.lastLecture = remap(reading.lastLecture);
          localStorage.setItem(storageKey, JSON.stringify(reading));
        }
      }
      const practiceKey = "ece685-lecture-practice-v2-transformers";
      if (!localStorage.getItem(practiceKey)) {
        const practice = JSON.parse(localStorage.getItem("ece685-lecture-practice-v1"));
        if (Array.isArray(practice)) localStorage.setItem(practiceKey, JSON.stringify([...new Set(practice.map(remap))]));
      }
    }
  } catch (_) { /* Reading remains usable when browser storage is unavailable. */ }
  let state = { reviewed: [], lastLecture: null };
  let storageAvailable = true;
  function sanitize(value) {
    return {
      reviewed: Array.isArray(value?.reviewed) ? [...new Set(value.reviewed.filter(id => knownIds.has(id)))] : [],
      lastLecture: knownIds.has(value?.lastLecture) ? value.lastLecture : null
    };
  }
  try { state = sanitize(JSON.parse(localStorage.getItem(storageKey))); }
  catch (_) { storageAvailable = false; }
  function save() {
    try { localStorage.setItem(storageKey, JSON.stringify(state)); }
    catch (_) { storageAvailable = false; }
    const note = root.querySelector("[data-storage-note]");
    if (note) note.hidden = storageAvailable;
  }
  function renderProgress() {
    const reviewed = new Set(state.reviewed);
    root.querySelector("[data-progress]").value = reviewed.size;
    root.querySelector("[data-progress-label]").textContent = reviewed.size + " / " + knownIds.size;
    root.querySelectorAll("[data-reviewed-dot], [data-reviewed-badge]").forEach(node => {
      node.hidden = !reviewed.has(node.dataset.reviewedDot || node.dataset.reviewedBadge);
    });
    const button = root.querySelector("[data-review]");
    if (button) {
      const isReviewed = reviewed.has(root.dataset.lectureId);
      button.hidden = false;
      button.setAttribute("aria-pressed", String(isReviewed));
      button.textContent = isReviewed ? (zh ? "✓ 目录已读 · 点击取消" : "✓ Outline reviewed · undo") : (zh ? "标记目录已读" : "Mark outline reviewed");
    }
  }
  renderProgress();
  root.querySelector("[data-storage-note]").hidden = storageAvailable;
  if (knownIds.has(root.dataset.lectureId)) {
    state.lastLecture = root.dataset.lectureId;
    save();
    root.querySelector("[data-review]").addEventListener("click", () => {
      const id = root.dataset.lectureId;
      state.reviewed = state.reviewed.includes(id) ? state.reviewed.filter(item => item !== id) : [...state.reviewed, id];
      save();
      renderProgress();
    });
  }

  const catalog = root.querySelector("[data-catalog]");
  if (catalog) {
    const cards = Array.from(catalog.querySelectorAll("[data-lecture-card]"));
    const search = catalog.querySelector("[data-search]");
    const topic = catalog.querySelector("[data-topic]");
    const reading = catalog.querySelector("[data-reading]");
    const normalize = text => text.normalize("NFKC").toLocaleLowerCase().trim();
    const searchTexts = new Map(cards.map(card => [card, normalize(card.dataset.lectureCard + " " + card.querySelector("[data-search-text]").textContent)]));
    const resume = root.querySelector("[data-resume]");
    const lastCard = cards.find(card => card.dataset.lectureCard === state.lastLecture);
    if (lastCard) {
      resume.hidden = false;
      resume.href = lastCard.querySelector("[data-lecture-link]").href;
      resume.textContent = (zh ? "继续阅读 " : "Resume ") + state.lastLecture + " →";
    }
    function filter() {
      const terms = normalize(search.value).split(/\s+/).filter(Boolean);
      let count = 0;
      for (const card of cards) {
        const isReviewed = state.reviewed.includes(card.dataset.lectureCard);
        const matches = (!topic.value || topic.value === card.dataset.group) &&
          (!reading.value || (reading.value === "reviewed" ? isReviewed : !isReviewed)) &&
          terms.every(term => searchTexts.get(card).includes(term));
        card.hidden = !matches;
        if (matches) count++;
      }
      catalog.querySelectorAll("[data-topic-group]").forEach(group => {
        group.hidden = !Array.from(group.querySelectorAll("[data-lecture-card]")).some(card => !card.hidden);
      });
      catalog.querySelector("[data-result-count]").textContent = count + (zh ? " 讲" : " lectures");
      catalog.querySelector("[data-empty]").hidden = count !== 0;
    }
    catalog.querySelector("[data-filters]").hidden = false;
    search.addEventListener("input", filter);
    topic.addEventListener("change", filter);
    reading.addEventListener("change", filter);
    filter();
    window.addEventListener("storage", event => {
      if (event.key !== storageKey && event.key !== null) return;
      try { state = sanitize(JSON.parse(event.newValue)); }
      catch (_) { state = { reviewed: [], lastLecture: null }; }
      renderProgress();
      filter();
    });
  }

  const tabList = root.querySelector("[data-lecture-tabs]");
  if (tabList && root.dataset.continuous !== "true") {
    const tabs = Array.from(tabList.querySelectorAll("[data-tab]"));
    const panels = Array.from(root.querySelectorAll("[data-panel]"));
    tabList.setAttribute("role", "tablist");
    tabs.forEach(tab => {
      tab.id = "tab-" + tab.dataset.tab;
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-controls", "lecture-" + tab.dataset.tab);
    });
    panels.forEach(panel => {
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", "tab-" + panel.dataset.panel);
      panel.tabIndex = 0;
    });
    function activate(name, updateUrl) {
      const selected = tabs.find(tab => tab.dataset.tab === name) || tabs[0];
      tabs.forEach(tab => {
        const active = tab === selected;
        tab.setAttribute("aria-selected", String(active));
        tab.tabIndex = active ? 0 : -1;
      });
      panels.forEach(panel => { panel.hidden = panel.dataset.panel !== selected.dataset.tab; });
      if (updateUrl) history.replaceState(null, "", selected.getAttribute("href"));
    }
    function activateFromHash() {
      const target = document.getElementById(location.hash.slice(1));
      const panel = target?.closest("[data-panel]");
      activate(panel?.dataset.panel || "overview", false);
    }
    tabs.forEach((tab, index) => {
      tab.addEventListener("click", event => { event.preventDefault(); activate(tab.dataset.tab, true); });
      tab.addEventListener("keydown", event => {
        let next;
        if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
        else if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = tabs.length - 1;
        if (next === undefined) return;
        event.preventDefault();
        activate(tabs[next].dataset.tab, true);
        tabs[next].focus();
      });
    });
    root.querySelector("[data-open-overview]")?.addEventListener("click", event => {
      event.preventDefault();
      activate("overview", true);
      tabs[0].focus();
    });
    window.addEventListener("hashchange", activateFromHash);
    activateFromHash();
  }
  if (window.matchMedia("(max-width: 800px)").matches) root.querySelector(".ece-navigation").open = false;
})();
