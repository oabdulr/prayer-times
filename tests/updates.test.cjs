const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

async function createDisplay() {
  const ids = [...fs.readFileSync('index.html', 'utf8').matchAll(/id="([^"]+)"/g)].map(match => match[1]);
  const elements = ids.map(id => ({ id, textContent: '', innerHTML: '', style: {} }));
  const intervals = [];
  const events = {};
  const requests = [];
  const sources = new Map();
  let reloads = 0;
  let failure = false;
  let release;
  const document = {
    hidden: false,
    querySelectorAll: selector => selector === '[id]' ? elements : [],
    addEventListener: (name, callback) => { events[name] = callback; },
  };
  const context = vm.createContext({
    Intl, Date, URL, AbortSignal, document,
    window: { addEventListener: (name, callback) => { events[name] = callback; } },
    location: {
      protocol: 'https:', href: 'https://example.com/prayer-times/',
      reload: () => { reloads += 1; },
    },
    setInterval: (callback, delay) => { intervals.push({ callback, delay }); },
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (release) await release;
      if (failure === 'offline') throw new Error('Offline');
      return { ok: !failure, status: failure ? 503 : 200, text: async () => sources.get(url.pathname) || 'original' };
    },
  });
  for (const file of ['config.js', 'pray-times.js', 'main.js']) {
    vm.runInContext(fs.readFileSync(`assets/js/${file}`, 'utf8'), context);
  }
  await new Promise(resolve => setImmediate(resolve));
  return {
    document, events, requests, sources,
    poll: intervals.find(item => item.delay === 600_000).callback,
    reloads: () => reloads,
    fail: value => { failure = value; },
    hold: promise => { release = promise; },
  };
}

test('unchanged files do not reload; polling refreshes canonical browser cache', async () => {
  const display = await createDisplay();
  await display.poll();
  assert.equal(display.reloads(), 0);
  assert.equal(display.requests.length, 10);
  for (const { url, options } of display.requests) {
    assert.equal(url.origin, 'https://example.com');
    assert.ok(url.pathname.startsWith('/prayer-times/'));
    assert.equal(options.cache, 'reload');
    assert.equal(options.headers['Cache-Control'], 'no-cache');
    assert.ok(options.signal instanceof AbortSignal);
  }
});

test('changes to HTML, CSS, config, display logic, or calculator reload the page', async () => {
  for (const path of ['', 'assets/css/main.css', 'assets/js/config.js', 'assets/js/main.js', 'assets/js/pray-times.js']) {
    const display = await createDisplay();
    display.sources.set(`/prayer-times/${path}`, 'updated');
    await display.poll();
    assert.equal(display.reloads(), 1, path);
  }
});

test('offline and HTTP failures preserve the baseline and recover on reconnect', async () => {
  for (const failure of ['offline', 'http']) {
    const display = await createDisplay();
    display.sources.set('/prayer-times/assets/js/config.js', 'updated');
    display.fail(failure);
    await display.poll();
    assert.equal(display.reloads(), 0);
    display.fail(false);
    await display.events.online();
    assert.equal(display.reloads(), 1);
  }
});

test('returning to a visible tab or restoring a page checks for updates', async () => {
  const display = await createDisplay();
  display.document.hidden = true;
  display.events.visibilitychange();
  assert.equal(display.requests.length, 5);
  display.document.hidden = false;
  display.events.visibilitychange();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(display.requests.length, 10);
  await display.events.pageshow();
  assert.equal(display.requests.length, 15);
});

test('overlapping checks share the active check instead of starting more requests', async () => {
  const display = await createDisplay();
  let release;
  display.hold(new Promise(resolve => { release = resolve; }));
  const pending = display.poll();
  await display.poll();
  await display.events.online();
  assert.equal(display.requests.length, 10);
  release();
  await pending;
  await display.poll();
  assert.equal(display.requests.length, 15);
});
