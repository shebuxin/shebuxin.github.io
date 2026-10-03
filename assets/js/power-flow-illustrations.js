(function () {
  "use strict";
  const branches = [
    { key: "ij", a: 0, b: 1, symbol: "yᵢⱼ", current: "Iᵢⱼ" },
    { key: "jk", a: 1, b: 2, symbol: "yⱼₖ", current: "Iⱼₖ" },
    { key: "ik", a: 0, b: 2, symbol: "yᵢₖ", current: "Iᵢₖ" },
  ];
  const buses = ["i", "j", "k"], voltages = ["Vᵢ", "Vⱼ", "Vₖ"];

  function admittanceTerms(connected) {
    const cells = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => []));
    branches.forEach(({ key, a, b }) => {
      if (!connected[key]) return;
      cells[a][a].push({ key, sign: 1 });
      cells[b][b].push({ key, sign: 1 });
      cells[a][b].push({ key, sign: -1 });
      cells[b][a].push({ key, sign: -1 });
    });
    return cells;
  }
  if (typeof module !== "undefined" && module.exports) module.exports = { admittanceTerms };
  if (typeof document === "undefined") return;

  document.querySelectorAll("[data-admittance-diagram]").forEach(root => {
    const zh = root.dataset.lang === "zh";
    let selected = "ij";
    function update() {
      const connected = {};
      root.querySelectorAll("[data-connected]").forEach(input => { connected[input.dataset.connected] = input.checked; });
      const matrix = admittanceTerms(connected);
      const branch = branches.find(edge => edge.key === selected);
      root.querySelectorAll("[data-trace]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.trace === selected)));
      branches.forEach(edge => {
        const line = root.querySelector('[data-branch-line="' + edge.key + '"]');
        line.classList.toggle("is-open", !connected[edge.key]);
        line.classList.toggle("is-selected", edge.key === selected);
        root.querySelector('[data-branch-label="' + edge.key + '"]').textContent = edge.symbol + (connected[edge.key] ? "" : zh ? " · 断开" : " · open");
      });
      root.querySelectorAll("[data-y-cell]").forEach(cell => {
        const [row, column] = cell.dataset.yCell.split(",").map(Number);
        const value = cell.querySelector("[data-y-value]");
        value.replaceChildren(document.createTextNode("= "));
        const terms = matrix[row][column];
        if (!terms.length) {
          const zero = document.createElement("span"); zero.className = "pf-zero"; zero.textContent = "0"; value.appendChild(zero);
        }
        terms.forEach((term, index) => {
          const span = document.createElement("span");
          span.textContent = (term.sign < 0 ? "− " : index ? "+ " : "") + branches.find(edge => edge.key === term.key).symbol;
          if (term.key === selected) span.className = "pf-term--selected";
          if (index) value.appendChild(document.createTextNode(" "));
          value.appendChild(span);
        });
      });
      root.querySelectorAll("[data-stamp-bus]").forEach(cell => { cell.textContent = buses[branch[cell.dataset.stampBus]]; });
      root.querySelectorAll("[data-stamp-cell]").forEach(cell => {
        cell.querySelector("[data-stamp-index]").textContent = buses[branch[cell.dataset.stampRow]] + buses[branch[cell.dataset.stampColumn]];
        cell.querySelector("[data-stamp-value]").textContent = "= " + (connected[selected] ? (cell.dataset.stampCell === "positive" ? "+ " : "− ") + branch.symbol : "0");
      });
      root.querySelector("[data-branch-equation]").textContent = connected[selected]
        ? branch.current + " = " + branch.symbol + " (" + voltages[branch.a] + " − " + voltages[branch.b] + ")"
        : branch.current + " = 0";
      const name = buses[branch.a] + "–" + buses[branch.b];
      root.querySelector("[data-stamp-note]").textContent = connected[selected]
        ? zh ? "线路 " + name + " 接通：它的四项贡献已在下方矩阵中用橙色标出。" : "Branch " + name + " is connected: its four contributions are highlighted in orange below."
        : zh ? "线路 " + name + " 断开：这条线路的四项贡献全部移除，其余线路仍保留。" : "Branch " + name + " is open: remove all four of its contributions and keep the other branches.";
    }
    root.querySelectorAll("[data-trace]").forEach(button => button.addEventListener("click", () => { selected = button.dataset.trace; update(); }));
    root.querySelectorAll("[data-connected]").forEach(input => input.addEventListener("change", update));
    update();
  });
}());
