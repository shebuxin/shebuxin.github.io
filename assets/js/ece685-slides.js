(function () {
  'use strict';
  const root = document.querySelector('[data-slide-reader]');
  if (!root) return;
  const zh = root.dataset.lang === 'zh', total = Number(root.dataset.total);
  const select = root.querySelector('[data-slide-select]'), image = root.querySelector('[data-slide-image]');
  const previous = root.querySelector('[data-slide-prev]'), next = root.querySelector('[data-slide-next]');
  const status = root.querySelector('[data-slide-status]');
  let pages, current = 1;
  function versionedAsset(path) {
    return root.dataset.version ? path + (path.includes('?') ? '&' : '?') + 'v=' + encodeURIComponent(root.dataset.version) : path;
  }
  function requestedPage() {
    const value = new URL(window.location.href).searchParams.get('slide');
    const number = Number(value);
    return value && /^\d+$/.test(value) && Number.isSafeInteger(number) && number >= 1 && number <= total ? number : 1;
  }
  function show(number) {
    if (!pages) return;
    current = Math.max(1, Math.min(total, Number.isFinite(number) ? Math.round(number) : 1));
    const page = pages[current - 1];
    image.src = versionedAsset(page.src);
    image.alt = `${root.dataset.lecture} ` + (zh ? `原课件第 ${current} 页，共 ${total} 页` : `original slide ${current} of ${total}`);
    select.value = String(current);
    previous.disabled = current === 1;
    next.disabled = current === total;
    root.querySelector('[data-slide-caption]').textContent = `${root.dataset.lecture} · ${current} / ${total}`;
    root.querySelector('[data-slide-text]').textContent = page.text || (zh ? '本页以图形为主，请查看课件图或原 PDF。' : 'This slide is primarily graphical; inspect the slide or original PDF.');
    root.dataset.currentPage = String(current);
    root.dispatchEvent(new CustomEvent('ece685:slide-change', { bubbles: true, detail: {
      course_id: 'ECE685', lecture_id: root.dataset.lecture, slide_number: current,
      section_id: 'lecture-overview'
    } }));
  }
  previous.addEventListener('click', () => show(current - 1));
  next.addEventListener('click', () => show(current + 1));
  select.addEventListener('change', () => show(Number(select.value)));
  root.addEventListener('keydown', event => {
    if (event.target.matches('input,select,button,a,textarea') || event.target.isContentEditable) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault(); show(current + (event.key === 'ArrowRight' ? 1 : -1));
  });
  image.addEventListener('error', () => { status.textContent = zh ? '课件图片暂时无法加载，请打开原 PDF。' : 'The slide image could not load; open the original PDF.'; });
  fetch(versionedAsset(root.dataset.pages)).then(response => {
    if (!response.ok) throw new Error('Slide data unavailable');
    return response.json();
  }).then(data => {
    if (!Array.isArray(data) || data.length !== total || !data.every(p => typeof p.text === 'string' && typeof p.src === 'string' && p.src.startsWith('/assets/slides/ece685/') && !p.src.includes('..'))) throw new Error('Invalid slide data');
    pages = data; show(requestedPage()); root.querySelector('[data-slide-controls]').hidden = false;
  }).catch(() => { status.textContent = zh ? '翻页功能暂时无法加载，请打开原 PDF 阅读全部内容。' : 'Page controls could not load; open the original PDF to read all slides.'; });
  window.addEventListener('popstate', () => show(requestedPage()));
})();
