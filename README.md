# Concord UMCC Prayer Display

A static prayer display with a live Eastern-time clock, daily adhan times, configurable iqamah times, a next-prayer countdown, and the Friday khutbah schedule. The responsive layout supports mosque displays and phones without a build step or framework.

## Run locally

```sh
python -m http.server 8000 --bind 127.0.0.1
```

Open http://localhost:8000. Google Fonts is optional; system fonts are used when unavailable. Prayer calculations run locally without network access.

## Configuration

Edit `assets/js/config.js`. Iqamah values use 24-hour `HH:mm` format. `maghribOffset` specifies minutes after adhan and is displayed as a calculated clock time. Friday khutbah times are in `index.html`.

The existing coordinates `[35.227, -80.843]` and Makkah calculation method are preserved. The display uses `America/New_York` for the clock, calendar, and daylight-saving adjustment, independent of the viewing device's time zone.

## Structure

- `index.html`: semantic display layout and Friday schedule.
- `assets/css/main.css`: responsive styles and design tokens.
- `assets/js/config.js`: location, calculation method, and iqamah settings.
- `assets/js/main.js`: daily schedule, clock, countdown, and update polling.
- `assets/js/pray-times.js`: existing PrayTimes calculator, retaining its attribution.
- `tests/display.test.cjs`: regression checks for date rollover, prayer boundaries, time zones, and Maghrib offset.

The schedule recalculates when the Eastern calendar date changes. Every 10 minutes, HTTP displays check HTML, CSS, and JavaScript for changes and reload when an update is detected. Checks refresh the browser cache so the reload can use the updated files. Returning to a visible tab, restoring a page, or reconnecting to the network also triggers a check. Network failures leave the current display running and are retried on the next check. Sleeping devices and suspended tabs can check only when the browser resumes them.

## Tests

With Node.js installed:

```sh
node --test tests/*.test.cjs
```

## Attribution

Prayer calculations incorporate PrayTimes.js 2.3, copyright 2007–2011 PrayTimes.org. The original calculator is kept separate from application code.

## Upload

Upload `index.html` and the complete `assets/` folder to the same directory on any static web host. Keep the folder structure intact. No Node.js, Python, database, or build command is required on the server. Tests and documentation do not need to be uploaded.

Use a host that serves files directly and does not inject changing content into HTML, because the display checks its files for updates. Upload all changed files together, then refresh the display once after deployment. Subsequent updates are detected within 10 minutes while the display is online.

### GitHub Pages deployment failures

This repository uses GitHub's generated Pages build and deployment workflow. If the build succeeds but deployment reports `Failed to get ID Token` with `Request timeout`, retry the failed job from the Actions run using **Re-run jobs → Re-run failed jobs**. The accompanying `id-token: write` message alone does not prove permissions are missing. If retries continue failing, inspect the deploy job's token permissions and GitHub service status. A custom Pages workflow requires both `pages: write` and `id-token: write`; see the [deploy-pages documentation](https://github.com/actions/deploy-pages#security-considerations).

## TV display and maintenance

Landscape screens at least 900 CSS pixels wide use the horizontal prayer layout with larger text. Smaller screens retain the stacked layout. Use the TV browser in full-screen mode; viewing distance and browser zoom may need adjustment on the actual TV.

- Update congregation times in `assets/js/config.js` using 24-hour notation.
- Update Friday khutbah times in `index.html`.
- Keep the PrayTimes attribution when distributing the files.
- After changing calculation or display logic, run the regression tests above.
- Verify the deployed page and approved mosque schedule after uploading.

Daily adhan times recalculate automatically. Congregation and Friday schedules are maintained manually; the app does not receive schedule changes from a remote mosque service.
