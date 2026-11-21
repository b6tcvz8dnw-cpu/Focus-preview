# FOCUS iPhone / PWA smoke-test checklist

This checklist is for the first reviewed Pages deployment from the Vite build. It is not evidence that device testing has already happened.

## Before opening the migrated app

1. Open the currently published FOCUS app while online.
2. In Settings → Data management, export a JSON backup.
3. Keep that file in Files or another location outside the browser.
4. Do not delete the Home Screen app, clear Safari website data, or uninstall anything during the migration check.

## First launch after the reviewed deployment

1. Open the existing production URL: https://b6tcvz8dnw-cpu.github.io/Focus/
2. Check that the app opens without a blank screen or module-loading error.
3. Compare the total focus sessions, total focus minutes, today's minutes, weekly chart, and visible history with the values recorded before deployment.
4. Open Settings → Recovery data. Confirm that any available pre-migration snapshot is listed and that the current data remains present.
5. Export a normal JSON backup from Data management after the migration and keep it separately.

## Recovery UI rehearsal without changing the intended data

1. Use the backup made immediately before deployment.
2. Import that same backup file into the app. This should preserve the same records and create an import-before snapshot.
3. Open Settings → Recovery data and confirm the import-before snapshot appears as restorable.
4. Restore that snapshot only after checking the confirmation text.
5. Confirm totals, goals, history, and session notes still match the pre-test backup.
6. Export a fresh backup after the check.

If any values differ unexpectedly, stop testing and preserve both JSON files. Do not clear site data or repeatedly import/restore.

## Core interaction checks

- Timer: start, pause, resume, reset, and switch modes.
- Focus completion: verify the configured short/long break begins automatically.
- Study Room: open the scene, check the clock/weather area, textless mode, and hourglass.
- Landscape: rotate the iPhone and confirm the scene fits within the safe areas.
- Offline: after a successful online load, enable Airplane Mode and reopen FOCUS. Check the cached app shell and core timer UI.
- Home Screen: launch the installed PWA and confirm it still opens in standalone display.

## Known iOS limitations

- JavaScript timers, notifications, and audio may be suspended while Safari/PWA is backgrounded or closed. Do not treat background completion sound as guaranteed.
- This checklist does not validate native iOS behavior; that requires a later Capacitor/Xcode phase.
- If the app fails to load or records are missing, keep the pre-deployment backup and report the exact step. Do not clear Safari data.

## Release gate

Do not mark the migration complete until:
- CI tests and production build pass.
- The first GitHub Pages deployment succeeds.
- The existing URL serves the Vite build.
- The real iPhone checks above are completed.
- Existing local records are confirmed and a fresh post-migration backup is exported.
