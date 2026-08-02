const landscape = document.querySelector("[data-research-landscape]");

if (landscape) {
  const controls = landscape.querySelector("[data-research-filters]");
  const filterButtons = Array.from(landscape.querySelectorAll("[data-research-filter]"));
  const themeCards = Array.from(landscape.querySelectorAll("[data-theme-card]"));
  const themeLinks = Array.from(landscape.querySelectorAll("[data-theme-link]"));
  const filterStatus = landscape.querySelector("[data-research-filter-status]");
  const language = landscape.dataset.language === "zh" ? "zh" : "en";
  let activeFilter = "all";

  const announceFilter = (count) => {
    if (!filterStatus) return;
    filterStatus.textContent = language === "zh"
      ? `当前显示 ${count} 个研究主题。`
      : `${count} research themes shown.`;
  };

  const selectTheme = (themeId) => {
    themeCards.forEach((card) => {
      card.classList.toggle("is-selected", card.dataset.themeId === themeId);
    });
    themeLinks.forEach((link) => {
      const selected = link.dataset.themeId === themeId;
      link.classList.toggle("is-selected", selected);
      if (selected) {
        link.setAttribute("aria-current", "location");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  };

  const setFilter = (filter) => {
    activeFilter = filter;
    let visibleCount = 0;

    filterButtons.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.researchFilter === filter));
    });

    themeCards.forEach((card) => {
      const visible = filter === "all" || card.dataset.vision === filter;
      card.hidden = !visible;
      if (visible) visibleCount += 1;
    });

    const selectedCard = themeCards.find((card) => card.classList.contains("is-selected"));
    if (selectedCard && selectedCard.hidden) {
      const selectedHash = `#theme-${selectedCard.dataset.themeId}`;
      selectTheme(null);
      if (window.location.hash === selectedHash) {
        window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      }
    }

    announceFilter(visibleCount);
  };

  filterButtons.forEach((button) => {
    button.addEventListener("click", () => setFilter(button.dataset.researchFilter));
  });

  themeLinks.forEach((link) => {
    link.addEventListener("click", () => {
      const themeId = link.dataset.themeId;
      const vision = link.dataset.vision;
      if (activeFilter !== "all" && activeFilter !== vision) setFilter(vision);
      selectTheme(themeId);
    });
  });

  const syncHashSelection = () => {
    if (!window.location.hash.startsWith("#theme-")) {
      selectTheme(null);
      return;
    }
    const themeId = window.location.hash.slice("#theme-".length);
    const card = themeCards.find((item) => item.dataset.themeId === themeId);
    if (!card) {
      selectTheme(null);
      return;
    }
    if (activeFilter !== "all" && activeFilter !== card.dataset.vision) setFilter(card.dataset.vision);
    selectTheme(themeId);
  };

  const detailStates = new Map();
  window.addEventListener("beforeprint", () => {
    landscape.querySelectorAll("details").forEach((details) => {
      detailStates.set(details, details.open);
      details.open = true;
    });
  });
  window.addEventListener("afterprint", () => {
    detailStates.forEach((wasOpen, details) => {
      details.open = wasOpen;
    });
    detailStates.clear();
  });

  controls.hidden = false;
  landscape.classList.add("is-enhanced");
  setFilter("all");
  syncHashSelection();
  window.addEventListener("hashchange", syncHashSelection);
}
