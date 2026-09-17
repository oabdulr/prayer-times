const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function displayAt(iso) {
  const ids = [...fs.readFileSync('index.html', 'utf8').matchAll(/id="([^"]+)"/g)].map(match => match[1]);
  const elements = Object.fromEntries(ids.map(id => [id, { id, textContent: '', innerHTML: '', style: {} }]));
  const intervals = [];
  const context = vm.createContext({
    Intl, Date: class extends Date { constructor(...args) { super(...(args.length ? args : [iso])); } },
    document: {
      querySelectorAll: selector => selector === '[id]' ? Object.values(elements) : [],
      addEventListener() {},
    },
    window: { addEventListener() {} },
    location: { protocol: 'file:' },
    setInterval: callback => intervals.push(callback),
  });
  for (const file of ['config.js', 'pray-times.js', 'main.js']) {
    vm.runInContext(fs.readFileSync(`assets/js/${file}`, 'utf8'), context);
  }
  return { elements, tick: intervals[0] };
}

function expected(date, offset) {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync('assets/js/pray-times.js', 'utf8'), context);
  return vm.runInContext(`new PrayTimes('Makkah').getTimes(${JSON.stringify(date)}, [35.227, -80.843], ${offset}, 0, '24h')`, context);
}

function formatted(value) {
  const [h, m] = value.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

test('daytime next prayer uses today, regardless of host timezone', () => {
  const { elements } = displayAt('2026-09-08T16:00:00Z');
  assert.equal(elements.timestamp.textContent, '12:00');
  assert.equal(elements['next-name'].textContent, 'Zuhr');
  assert.equal(elements['next-day'].textContent, 'Today');
  assert.equal(elements['next-time'].textContent, formatted(expected([2026, 9, 8], -4).dhuhr));
  assert.equal((elements['prayer-rows'].innerHTML.match(/<tr /g) || []).length, 6);
});

test('after Isha, next prayer is tomorrow Fajr, never midnight', () => {
  const { elements } = displayAt('2026-09-09T03:00:00Z');
  assert.equal(elements['next-name'].textContent, 'Fajr');
  assert.equal(elements['next-day'].textContent, 'Tomorrow');
  assert.equal(elements['next-time'].textContent, formatted(expected([2026, 9, 9], -4).fajr));
});

test('midnight refreshes date, schedule, and next-day label', () => {
  const { elements, tick } = displayAt('2026-09-09T03:59:59Z');
  const oldRows = elements['prayer-rows'].innerHTML;
  tick(new Date('2026-09-09T04:00:00Z'));
  assert.match(elements.datestamp.textContent, /September 9/);
  assert.equal(elements['next-day'].textContent, 'Today');
  assert.notEqual(elements['prayer-rows'].innerHTML, oldRows);
});

test('clock and schedule follow Eastern daylight-saving transitions', () => {
  for (const [iso, date, offset, zone] of [
    ['2026-03-08T16:00:00Z', [2026, 3, 8], -4, 'EDT'],
    ['2026-11-01T17:00:00Z', [2026, 11, 1], -5, 'EST'],
  ]) {
    const { elements } = displayAt(iso);
    assert.equal(elements.timestamp.textContent, '12:00');
    assert.equal(elements['timezone-name'].textContent, zone);
    assert.equal(elements['next-time'].textContent, formatted(expected(date, offset).dhuhr));
  }
});

test('adhan boundary advances countdown to the following prayer', () => {
  const times = expected([2026, 9, 8], -4);
  const [hour, minute] = times.dhuhr.split(':').map(Number);
  const boundary = new Date(Date.UTC(2026, 8, 8, hour + 4, minute));
  const { elements, tick } = displayAt(new Date(boundary.getTime() - 1000).toISOString());
  assert.equal(elements['next-name'].textContent, 'Zuhr');
  assert.equal(elements.countdown.textContent, '00:00:01');
  tick(boundary);
  assert.equal(elements['next-name'].textContent, 'Asr');
  assert.notEqual(elements.countdown.textContent, '00:00:00');
});

test('Maghrib iqamah is a calculated clock time', () => {
  const { elements } = displayAt('2026-09-08T16:00:00Z');
  const [hour, minute] = expected([2026, 9, 8], -4).maghrib.split(':').map(Number);
  const total = hour * 60 + minute + 5;
  const iqamah = formatted(`${Math.floor(total / 60)}:${total % 60}`).replace(' ', '<small>') + '</small>';
  assert.ok(elements['prayer-rows'].innerHTML.includes(`<td>${iqamah}</td>`));
});
