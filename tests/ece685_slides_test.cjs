const assert = require('node:assert/strict');
const { test } = require('node:test');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('assets/js/ece685-slides.js', 'utf8');

async function reader(url, data) {
  const elements = new Map();
  const events = [];
  function element() {
    const listeners = {};
    return { listeners, hidden: true, addEventListener(name, fn) { listeners[name] = fn; } };
  }
  const root = Object.assign(element(), { dataset: { lang: 'en', total: '3', lecture: 'L05', pages: '/pages.json' },
    querySelector(selector) { if (!elements.has(selector)) elements.set(selector, element()); return elements.get(selector); },
    dispatchEvent(event) { events.push(event); } });
  const window = { location: { href: url }, listeners: {}, addEventListener(name, fn) { this.listeners[name] = fn; } };
  vm.runInNewContext(source, { document: { querySelector: () => root }, window, URL,
    CustomEvent: class { constructor(type, options) { this.type = type; Object.assign(this, options); } },
    fetch: async () => ({ ok: true, json: async () => data || [1, 2, 3].map(n => ({ src: `/assets/slides/ece685/l05/page-${n}.webp`, text: `Page ${n}` })) }) });
  await new Promise(resolve => setImmediate(resolve));
  return { root, elements, events, window, get: selector => root.querySelector(`[data-slide-${selector}]`) };
}

test('citation opens the exact physical page and publishes its context', async () => {
  const r = await reader('https://example.com/lesson/?slide=2#lecture-overview');
  assert.equal(r.get('image').src, '/assets/slides/ece685/l05/page-2.webp');
  assert.equal(r.get('text').textContent, 'Page 2');
  assert.equal(r.root.dataset.currentPage, '2');
  assert.equal(r.events[0].type, 'ece685:slide-change');
  assert.equal(r.events[0].bubbles, true);
  assert.equal(r.events[0].detail.lecture_id, 'L05');
  assert.equal(r.events[0].detail.slide_number, 2);
  assert.equal(r.events[0].detail.section_id, 'lecture-overview');
  assert.equal(r.get('controls').hidden, false);
});

test('invalid deep links fall back to page one', async () => {
  for (const query of ['', '?slide=', '?slide=0', '?slide=-1', '?slide=4', '?slide=1.5', '?slide=NaN', '?slide=1e0']) {
    const r = await reader('https://example.com/lesson/' + query);
    assert.equal(r.root.dataset.currentPage, '1', query);
    assert.equal(r.get('prev').disabled, true);
  }
});

test('navigation and browser history keep exported context in sync', async () => {
  const r = await reader('https://example.com/lesson/?slide=2');
  r.get('next').listeners.click();
  assert.equal(r.root.dataset.currentPage, '3');
  assert.equal(r.get('next').disabled, true);
  r.get('prev').listeners.click();
  assert.equal(r.events.at(-1).detail.slide_number, 2);
  r.get('select').value = '1';
  r.get('select').listeners.change();
  assert.equal(r.root.dataset.currentPage, '1');
  r.window.location.href = 'https://example.com/lesson/?slide=3';
  r.window.listeners.popstate();
  assert.equal(r.root.dataset.currentPage, '3');
});

test('arrow keys leave editable fields alone', async () => {
  const r = await reader('https://example.com/lesson/');
  let prevented = 0;
  const event = { key: 'ArrowRight', target: { matches: () => true }, preventDefault: () => prevented++ };
  r.root.listeners.keydown(event);
  assert.equal(r.root.dataset.currentPage, '1');
  event.target = { matches: () => false, isContentEditable: true };
  r.root.listeners.keydown(event);
  assert.equal(r.root.dataset.currentPage, '1');
  event.target.isContentEditable = false;
  r.root.listeners.keydown(event);
  assert.equal(r.root.dataset.currentPage, '2');
  assert.equal(prevented, 1);
});

test('invalid page data never publishes a misleading context', async () => {
  const r = await reader('https://example.com/lesson/?slide=2', [{ src: '/secret', text: 'bad' }]);
  assert.equal(r.root.dataset.currentPage, undefined);
  assert.equal(r.events.length, 0);
  assert.equal(r.get('controls').hidden, true);
  assert.match(r.get('status').textContent, /could not load/);
});
