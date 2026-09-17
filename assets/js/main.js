(() => {
  'use strict';

  const prayers = [
    { key: 'fajr', name: 'Fajr', caption: 'Dawn' },
    { key: 'sunrise', name: 'Sunrise', caption: 'Daybreak' },
    { key: 'dhuhr', name: 'Zuhr', caption: 'Midday' },
    { key: 'asr', name: 'Asr', caption: 'Afternoon' },
    { key: 'maghrib', name: 'Maghrib', caption: 'Sunset' },
    { key: 'isha', name: 'Isha', caption: 'Night' },
  ];
  const calculator = new PrayTimes(PRAYER_CONFIG.method);
  const dateFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: PRAYER_CONFIG.timeZone, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
  const partsFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: PRAYER_CONFIG.timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  const zoneFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: PRAYER_CONFIG.timeZone, timeZoneName: 'short',
  });
  const elements = Object.fromEntries([...document.querySelectorAll('[id]')].map(element => [element.id, element]));
  let schedule = [];
  let scheduleDate = '';
  let highlightedPrayer = '';
  let pageSignature = '';
  let checkingForUpdates = false;

  function localParts(date) {
    return Object.fromEntries(partsFormatter.formatToParts(date).map(({ type, value }) => [type, value]));
  }

  function offsetAt(date) {
    const p = localParts(date);
    return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - date.getTime()) / 3_600_000;
  }

  function formatTime(value) {
    const [hour, minute] = value.split(':').map(Number);
    return { time: `${hour % 12 || 12}:${String(minute).padStart(2, '0')}`, period: hour >= 12 ? 'PM' : 'AM' };
  }

  function timeMarkup(value) {
    const { time, period } = formatTime(value);
    return `${time}<small>${period}</small>`;
  }

  function addMinutes(value, minutes) {
    const [hour, minute] = value.split(':').map(Number);
    const total = (hour * 60 + minute + minutes) % 1440;
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  }

  function calculateDay(year, month, day) {
    const noon = new Date(Date.UTC(year, month - 1, day, 12));
    const date = [noon.getUTCFullYear(), noon.getUTCMonth() + 1, noon.getUTCDate()];
    const offset = offsetAt(noon);
    const times = calculator.getTimes(date, PRAYER_CONFIG.coordinates, offset, 0, '24h');
    const events = prayers.map(prayer => {
      const [hour, minute] = times[prayer.key].split(':').map(Number);
      return { ...prayer, time: times[prayer.key], at: Date.UTC(date[0], date[1] - 1, date[2], hour, minute) - offset * 3_600_000 };
    });
    return { times, events };
  }

  function refreshSchedule(parts) {
    const year = +parts.year;
    const month = +parts.month;
    const day = +parts.day;
    const today = calculateDay(year, month, day);
    schedule = [
      ...calculateDay(year, month, day - 1).events,
      ...today.events,
      ...calculateDay(year, month, day + 1).events,
    ];
    elements['prayer-rows'].innerHTML = prayers.map(({ key, name, caption }) => {
      if (key === 'sunrise') {
        return `<tr id="row-${key}" class="sunrise"><td><span class="prayer-label">${name}</span><span class="prayer-caption">${caption}</span></td><td class="sunrise-time" colspan="2">${timeMarkup(today.times[key])}</td></tr>`;
      }
      const iqamah = key === 'maghrib'
        ? addMinutes(today.times.maghrib, PRAYER_CONFIG.maghribOffset)
        : PRAYER_CONFIG.iqamah[key];
      return `<tr id="row-${key}"><td><span class="prayer-label">${name}</span><span class="prayer-caption">${caption}</span></td><td>${timeMarkup(today.times[key])}</td><td>${timeMarkup(iqamah)}</td></tr>`;
    }).join('');
    elements['maghrib-offset'].textContent = PRAYER_CONFIG.maghribOffset;
    highlightedPrayer = '';
  }

  function tick(now = new Date()) {
    const parts = localParts(now);
    const dateKey = `${parts.year}-${parts.month}-${parts.day}`;
    if (dateKey !== scheduleDate) {
      refreshSchedule(parts);
      scheduleDate = dateKey;
      elements.datestamp.textContent = dateFormatter.format(now);
      elements['timezone-name'].textContent = zoneFormatter.formatToParts(now).find(part => part.type === 'timeZoneName').value;
    }
    const clock = formatTime(`${parts.hour}:${parts.minute}`);
    elements.timestamp.textContent = clock.time;
    elements.period.textContent = clock.period;
    elements.seconds.textContent = parts.second;

    const nextIndex = schedule.findIndex(prayer => prayer.at > now.getTime());
    const next = schedule[nextIndex];
    if (!next) return;
    const remaining = Math.ceil((next.at - now.getTime()) / 1000);
    elements.countdown.textContent = [Math.floor(remaining / 3600), Math.floor(remaining % 3600 / 60), remaining % 60]
      .map(value => String(value).padStart(2, '0')).join(':');
    const previous = schedule[nextIndex - 1];
    const progress = previous ? (now.getTime() - previous.at) / (next.at - previous.at) : 0;
    elements['prayer-progress'].style.width = `${Math.max(0, Math.min(100, progress * 100))}%`;

    if (highlightedPrayer !== next.key) {
      elements['next-name'].textContent = next.name;
      const time = formatTime(next.time);
      elements['next-time'].textContent = `${time.time} ${time.period}`;
      elements['next-time-label'].textContent = next.key === 'sunrise' ? 'Sunrise at' : 'Adhan at';
      const isTomorrow = dateFormatter.format(new Date(next.at)) !== dateFormatter.format(now);
      elements['next-day'].textContent = isTomorrow ? 'Tomorrow' : 'Today';
      document.querySelectorAll('tbody tr').forEach(row => {
        const active = row.id === `row-${next.key}`;
        row.classList.toggle('active-prayer', active);
        if (active) row.setAttribute('aria-current', 'true');
        else row.removeAttribute('aria-current');
        const prayer = prayers.find(item => row.id === `row-${item.key}`);
        row.querySelector('.prayer-caption').textContent = active ? `Up next${isTomorrow ? ' · tomorrow' : ''}` : prayer.caption;
      });
      highlightedPrayer = next.key;
    }
  }

  async function checkForUpdates() {
    if (!location.protocol.startsWith('http') || checkingForUpdates) return;
    checkingForUpdates = true;
    try {
      const paths = [location.href, './assets/css/main.css', './assets/js/config.js', './assets/js/main.js', './assets/js/pray-times.js'];
      const sources = await Promise.all(paths.map(async path => {
        // Refresh the browser cache too, so the subsequent reload uses these files.
        const response = await fetch(new URL(path, location.href), {
          cache: 'reload', headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) throw new Error(`Update check failed: ${response.status}`);
        return response.text();
      }));
      const signature = JSON.stringify(sources);
      if (pageSignature && pageSignature !== signature) location.reload();
      pageSignature = signature;
    } catch {
      // Keep the display running when the network is unavailable.
    } finally {
      checkingForUpdates = false;
    }
  }

  tick();
  setInterval(tick, 1000);
  checkForUpdates();
  setInterval(checkForUpdates, PRAYER_CONFIG.updateInterval);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      tick();
      checkForUpdates();
    }
  });
  window.addEventListener('online', checkForUpdates);
  window.addEventListener('pageshow', checkForUpdates);
})();
