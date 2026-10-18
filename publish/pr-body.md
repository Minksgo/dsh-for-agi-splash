## What

Adds **dsh-for-agi-splash** — a 9.9-second cold-start title sequence for DeepSeek Harness, followed by the app it belongs to.

- **Five acts, real data.** Plugins load (each mounted bundle lights up), the runtime connects (wireframe sphere assembles), tools register (the bridge lists `bash`, `read`, `edit`, `write`, `glob`, `grep`, `skill`, `subagent`, `web_fetch`, `agent_teams`), context assembles (concentric cognition net + alignment arc), the agent comes online (AGI wordmark).
- **First frame is the splash.** The host half injects one style and one synchronous script through `webserver/index-inject`, painting the cover while `<head>` is still parsing — before the shell's "Loading plugins…" card exists. The client half mounts the same shadow root on the next task, so there is no seam and no flash of the boot card.
- **Chinese voice-over + synthesized soundtrack.** Narration is five short Chinese lines; every tick, ping, riser and chord is synthesized sample-by-sample at install-time and embedded in the client bundle, so the package has zero runtime dependencies and no audio files to ship.
- **Skippable and configurable.** Click anywhere, press Esc, or open `?agi=0`. A `开屏动画` page in Settings (its own `settings.section`, no monkey-patching of General) toggles the splash, sets volume, edits the skip hint, and replays it on the spot. All state lives in renderer `localStorage` under `dsh-for-agi-splash:*`.
- **Degrades safely.** No UI shell → the page still gets covered and the splash still plays; client bundle fails to load → a timeout retires the cover, never a black window. Off means the injected script bows out before painting anything.
- MIT, no native code, no network calls at runtime.

Preview without installing: `/dsh-for-agi-splash/preview` once installed, or open `publish/preview.png`.

## Checklist

- [x] `package.json` declares `dsh.bundle.patch` → `./cordis.patch.yml`
- [x] Repository carries the `dsh-plugin` topic
- [x] Repository is at least one day old
- [x] npm: https://www.npmjs.com/package/dsh-for-agi-splash
- [x] License: MIT

## Entry

`data/plugins/<owner>__dsh-for-agi-splash.yml` added in this PR.
