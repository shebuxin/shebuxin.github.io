const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('assets/js/owned-analytics.js', 'utf8');
let serial = 1;
function browser(storage = new Map(), options = {}) {
  const events = [], listeners = {};
  const clock = { now: options.now || 100000000 };
  const navigator = { language: 'zh-CN', ...options.navigator };
  const document = {
    referrer: options.referrer || 'https://www.google.com/search?q=private',
    visibilityState: options.hidden ? 'hidden' : 'visible',
    currentScript: { getAttribute: key => key === 'data-endpoint' ? 'https://stats.example/collect' : null },
    addEventListener: (key, fn) => { listeners[key] = fn; }
  };
  const window = {
    navigator, location: { hostname: options.hostname || 'shebuxin.github.io', pathname: options.path || '/', search: options.search || '' },
    crypto: { randomUUID: () => '00000000-0000-4000-8000-' + String(serial++).padStart(12, '0') },
    localStorage: {
      getItem: key => { if (options.blockStorage) throw Error('blocked'); return storage.get(key) || null; },
      setItem: (key, value) => { if (options.blockStorage) throw Error('blocked'); storage.set(key, value); },
      removeItem: key => storage.delete(key)
    },
    fetch: (url, config) => { events.push(JSON.parse(config.body)); return Promise.resolve(); },
    addEventListener: (key, fn) => { listeners[key] = fn; }
  };
  vm.runInNewContext(source, { window, document, URL, URLSearchParams, Date: { now: () => clock.now } });
  return { events, document, listeners, clock };
}
test('browser identity persists and attribution is preserved within a session', () => {
  const storage = new Map();
  const first = browser(storage, { search: '?utm_source=mail&utm_medium=email&utm_campaign=launch&secret=private' }).events[0];
  const second = browser(storage, { path: '/research/', referrer: 'https://shebuxin.github.io/' }).events[0];
  assert.equal(first.visitor_id, second.visitor_id);
  assert.equal(first.session_id, second.session_id);
  assert.notEqual(first.event_id, second.event_id);
  assert.equal(second.utm_source, 'mail');
  assert.equal(first.path, '/');
  assert.equal(first.referrer, 'https://www.google.com');
  assert.ok(!JSON.stringify(first).includes('private'));
});
test('session restarts after inactivity while visitor stays the same', () => {
  const storage = new Map();
  const first = browser(storage).events[0];
  const second = browser(storage, { now: 100000000 + 31 * 60000 }).events[0];
  assert.equal(first.visitor_id, second.visitor_id);
  assert.notEqual(first.session_id, second.session_id);
});
test('privacy preferences, local previews and automated browsers skip collection', () => {
  assert.equal(browser(new Map(), { navigator: { doNotTrack: '1' } }).events.length, 0);
  assert.equal(browser(new Map(), { navigator: { globalPrivacyControl: true } }).events.length, 0);
  assert.equal(browser(new Map(), { navigator: { webdriver: true } }).events.length, 0);
  assert.equal(browser(new Map(), { hostname: 'localhost' }).events.length, 0);
  const storage = new Map();
  assert.equal(browser(storage, { search: '?analytics=off' }).events.length, 0);
  assert.equal(browser(storage).events.length, 0);
  assert.equal(browser(storage, { search: '?analytics=on' }).events.length, 1);
});
test('unavailable storage does not prevent collection or break the page', () => {
  assert.equal(browser(new Map(), { blockStorage: true }).events.length, 1);
});
test('hidden pages wait until visible and bfcache navigation counts a new view', () => {
  const page = browser(new Map(), { hidden: true });
  assert.equal(page.events.length, 0);
  page.document.visibilityState = 'visible'; page.listeners.visibilitychange();
  page.listeners.visibilitychange();
  assert.equal(page.events.length, 1);
  page.listeners.pageshow({ persisted: true });
  assert.equal(page.events.length, 2);
});
