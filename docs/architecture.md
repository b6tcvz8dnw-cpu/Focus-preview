# FOCUS — 現状アーキテクチャ調査

調査日: 2026-11-21  
対象ブランチ: `main`  
本番URL: https://b6tcvz8dnw-cpu.github.io/Focus/

## 現状

- HTMLエントリーポイント: `index.html`
- JavaScriptエントリーポイント: `src/main.js`（ES module）
- HTML/CSS: HTMLは `index.html`、CSSは `src/styles/` の責務別ファイル
- JavaScript: `src/main.js` と `src/core/`・`src/data/` のモジュールに分割開始
- `index.html`: 約91 KB / 約1,330行（JavaScript本体を外部化）
- インラインJavaScript: 約254行、約40個の関数
- CSS: `src/styles/main.css` から6つの責務別スタイルシートを順序付きで読み込む（インラインCSSなし）
- Vite設定: `vite.config.js`（`base: './'`、`dist/`出力）
- ビルドスクリプト: `scripts/build.mjs`（ハッシュ付きバンドルをService Workerへ注入）
- PWAマニフェスト / Service Worker / SVGアイコン: `public/`
- PNGアイコン: ルートの元ファイルをViteプラグインで `dist/` へコピー
- データ保存: ブラウザの `localStorage`（`src/data/storage.js` の防御的アダプター経由）
- ビルド依存: Vite 6（開発時・ビルド時のみ）
- テスト: Node.js標準テストランナー
- モジュール: `src/core/date-time.js`（`formatClock`, `dateKey`, `buildWeekData`, `getStudySkyLevel`）
- タイマー計算: `src/core/timer.js`（絶対時刻からの残り時間、不正値の防御、休憩モードの選択）
- タイマー状態管理: `src/features/timer-controller.js`（開始・一時停止・リセット・モード変更・自動休憩・期限切れ復元・実行状態保存。DOM非依存、UI/統計/通知はコールバック注入）
- 保存層: `src/data/storage.js`（文字列・JSONの読み書き、利用不可・不正JSONへの防御処理）
- 学習記録集計: `src/data/records.js`（累計・日別履歴の再計算、重複ID排除）
- 復旧データ検査: `src/data/recovery.js`（端末内スナップショットの一覧化、形式検証、将来スキーマの復元拒否、現在の保護データの原文書き出し）
- 保存トランザクション: `src/data/transactions.js`（復元前バックアップを確保してから統計データを置き換える。いずれかの書き込み失敗時は旧統計を維持）
- 品質保証: `tests/app-integrity.test.mjs`（Node.js標準テスト80項目、HTML/DOM契約・移行・タイマー・記録・保存・復旧トランザクションの検証）
- アプリ本体の保存API直接呼び出し: 0件

## 画面

- Timer: `timerPage`
- Overview: `overviewPage`
- Calendar: `calendarPage`
- Analytics: `analyticsPage`
- Study Room: `studyRoomPage`
- Settings: `settingsPage`

## JavaScriptの主要責務

| 領域 | 現在の関数例 |
|---|---|
| タイマー | 状態遷移・保存・復元は `src/features/timer-controller.js`。画面描画は `src/main.js` の `update` と `syncTimerState` |
| 学習統計 | `save`, `recalculateStats`, `getWeekData`。集計本体は `src/data/records.js` |
| カレンダー・履歴 | `renderCalendar`, `renderHistory`, `renderAllRecords` |
| 分析 | `renderAnalytics`, `updateChart` |
| 書斎 | `updateStudyRoom`, `updateStudySky`, `loadStudyRoomWeather` |
| 砂時計 | `startHourglass`, `tickHourglass`, `resetHourglass` |
| 外観・設定 | `setTheme`, `setMark`, `setStudyRoomMode` |
| 環境音 | `startAmbient`, `setAmbientLayer`, `stopAmbient` |
| バックアップ | `exportData` / `importData` のイベント処理 |

## 既存localStorageキー

- `focus-stats`
- `focus-notifications`
- `focus-timer-runtime`
- `focus-timer-settings`
- `focus-room-quiet-text`
- `focus-appearance`
- `focus-mark`
- `focus-preimport-backup`（インポート直前の自動退避）
- `focus-pre-migration-backup`（旧スキーマ移行前の退避）
- `focus-corrupt-stats-backup`（破損したJSONの原文退避）
- `focus-pre-recovery-raw-stats`（復元操作直前の統計データ退避）

これらは移行時に削除・改名しない。新しい保存層を導入する場合も、旧キーからの読み込みと移行テストを用意する。

## 主なリスク

1. タイマー、統計、履歴、表示が同じスクリプト内で相互参照している。
2. 保存層はアダプターへ集約済み。スキーマ移行・バックアップ検証は `src/data/schema.js` に集約する。
3. 画面要素IDを使ったDOM操作が広範囲にある。Phase 3の静的スモークテストで直接参照IDとページ遷移先を照合する。
4. Service Workerのキャッシュ更新とGitHub Pagesの公開を同時に変更すると、古い資産が残る可能性がある。
5. 書斎の描画・天候取得・砂時計は既存挙動を保ったまま切り離す必要がある。

## 推奨分割順

1. ~~純粋関数（日付・時間フォーマットなど）~~ 完了
   - `src/core/date-time.js` に抽出し、境界値テストを追加
2. 保存層とデータ形式
3. タイマー状態管理
4. 学習記録・統計
5. 書斎・砂時計
6. 画面表示とイベント登録
7. CSSの責務別分割

最初からすべてを分割しない。各段階でテストと実機確認を行う。

## Phase 3で確認した不具合と対策

- 起動時のタイマー復元で期限切れ集中タイマーを完了させる場合、詳細記録作成処理の登録が遅く、累計だけ更新されて履歴が欠落する順序問題を修正。記録処理を復元より前に登録し、画面描画だけ初期化完了後に行う。
- 不正な期限・現在時刻から `NaN` / `Infinity` が残り時間へ伝播しないよう防御。
- 同じセッションIDが複数存在する場合、移行・集計で重複加算しない。
- 自動テストに復旧データの形式判定・将来スキーマ保護・設定画面の接続確認を追加。実機iPhoneの操作確認は未実施。
- 設定画面に復旧用スナップショットの一覧・原文書き出し・対応データの学習記録復元UIを追加。復元前に現在の統計データを別キーへ保護し、保護に失敗した場合は復元を中止する。破損原文は自動復元せず、書き出しのみ可能。将来スキーマの現在データも復元不可のまま一覧に表示し、原文を書き出せる。

## Phase 4 — ビルド基盤

- Viteのbaseを相対パス `./` に固定し、GitHub Pagesの `/Focus/` 配下でもアセットURLが成立するようにする。
- `public/` のマニフェスト・Service Worker・SVGアイコンをそのまま配信し、PNGアイコンはビルド時に元ファイルからコピー。
- `scripts/build.mjs` が `dist/assets/` の生成物を列挙し、Service Workerのプリキャッシュ配列へ注入。
- CIは `npm test` に加えて `npm run build` を実行する。
- GitHub Actionsのビルド成果物をダウンロードして検査済み。相対URL、マニフェスト、PNG/SVG、ハッシュ付きJS、Service Workerのプリキャッシュを確認。
- `.github/workflows/deploy-pages.yml` を追加。PRはテストとビルドのみ、`main` へのpushまたは `main` 上での手動実行だけがPagesへデプロイする。
- GitHub PagesのSource設定はプロジェクト所有者がGitHub Actionsへ切り替えたと確認済み。設定自体は接続ツールから独立検証できていない。
- PRはDraftのまま。PRビルドは成功しているが、公開デプロイとiPhone実機確認は未実施。


## Preview data-protection hardening — 2026-11-21

- Backup import now writes the pre-import snapshot before attempting to replace `focus-stats`.
- The application updates in-memory study records only after the new stats payload has been saved successfully.
- If pre-import snapshot creation fails, import stops without changing stats.
- If the new stats write fails, the old stats remain intact and the pre-import snapshot remains available for recovery.
- `src/data/transactions.js` contains the storage transaction helper; three tests cover success, backup-write failure, and stats-write failure.
- These changes are limited to `Focus-preview`; production repository `Focus` was not modified.


## UI / PWA path audit — 2026-11-21

- Found root-relative manifest and icon references in the document head, which are incorrect for a GitHub Pages project site mounted below `/Focus-preview/`.
- Changed the manifest, favicon, and Apple touch icon references to `./` relative paths.
- Added a regression test to prevent these root-relative asset references from returning.
- Recheck Home Screen installation after this deployment because the prior manual installation check predates this path correction.


## UI / navigation audit — 2026-11-21

- Found that the Calendar and Analytics tab destinations contained placeholder copy while their actual panels remained nested in Overview.
- Moved the monthly calendar panel into Calendar and the day/week/month analytics panel into Analytics.
- Calendar redraws when its tab opens; analytics redraws on entry and when its range changes.
- Added a regression test confirming each panel is mounted in its matching page and not in Overview.
- Latest preview quality workflow: 47/47 tests passed; production build succeeded. Preview Pages deployment succeeded for commit `3ef042a04ec631a1d3c11638e89515808d271902`.


## Settings UX audit — 2026-11-21

- Added a clear Settings heading, short explanatory copy, and an explicit return-to-Timer action.
- Applying changed timer durations now asks for confirmation when the current session is running or has elapsed from its starting state; cancelling leaves the current timer untouched.
- Added two regression tests for the Settings return path and timer reset warning.
- Latest preview quality checks: 49 tests passed, 0 failed; Vite production build succeeded.
- Preview Pages deployment succeeded for commit `c6358e67e5b9ebd71ccc063b034a77ed43127d21`.
- Manual iPhone validation of this latest settings change remains outstanding.


## Accessibility and performance audit — 2026-11-21

- Added visible keyboard focus outlines and minimum 44px touch targets for controls; tab navigation has a 48px minimum height.
- Timer display now exposes the timer role, the decorative SVG ring is hidden from assistive technology, and the current timer state is announced politely.
- Mode selection synchronizes its pressed state for assistive technology.
- Expanded reduced-motion support to disable CSS animations and transitions across the app when the OS preference requests reduced motion.
- Focus timer and Study Room hourglass intervals now update once per second, matching the displayed MM:SS precision; both continue to derive remaining time from absolute deadlines.
- Latest quality workflow: 52/52 tests passed; production build succeeded. Preview Pages deployment succeeded for commit `f518903118a35cc746d3a09552f2016accdf7d69`.
- Manual iPhone validation of the new reduced-motion, keyboard focus, and touch-target changes remains outstanding.


## Study Room interaction and animation audit — 2026-11-21

- Found a state-refresh bug in `updateStudyRoom()`: assigning `view.className` replaced the entire Study Room class list every minute, removing the structural `little-planet-view` class and other UI state. The refresh now updates only the date-dependent `season-*` and `time-*` classes.
- Raised the hourglass shelf above decorative scene layers and explicitly enabled touch interaction with `pointer-events:auto` and `touch-action:manipulation`.
- Bumped the preview Service Worker cache to `focus-preview-pwa-v3` so the repaired HTML, CSS, and JS are fetched as a fresh cache generation.
- Added regression coverage for structural class preservation, touch interaction layering, celestial animation definitions, and the reduced-motion fallback.
- Automated verification and a fresh iPhone retest are required before continuing the next development phase. Production remains unchanged.


## Hourglass module extraction — 2026-11-21

- Extracted the hourglass countdown state, rendering, tap/pause, long-press reset, and one-second tick into `src/features/hourglass.js`.
- The main entry point now mounts the controller and only calls its public `tick()` method when the document becomes visible again.
- The module exposes a small state snapshot for future focused tests; the main Pomodoro timer and Study Room presentation remain unchanged.
- Regression tests verify the controller wiring and confirm that hourglass implementation details no longer live in `src/main.js`.
- This is the first incremental step of the Study Room/hourglass separation. Weather and scene presentation remain in the main entry point for a later extraction.


## Study Room feature extraction — 2026-11-21

- Moved season/time-of-day presentation, date and clock labels, sky refresh integration, Nagoya weather fetching/caching, weather-to-scene classes, and sun-position adjustment into `src/features/study-room.js`.
- The main entry point now mounts the Study Room controller and calls its public update/load/visibility methods from page navigation and document visibility handling.
- The existing Study Room markup, CSS, quiet-text setting, fullscreen control, and hourglass module remain separate and unchanged.
- Added regression coverage for module boundaries and the timer/page/visibility integration.


## Textless Study Room hourglass readout — 2026-11-21

- The quiet-text mode continues to hide surrounding labels and information, but no longer hides the hourglass countdown digits.
- Added a regression test ensuring the countdown remains visible while the hourglass label stays hidden.


## CSS responsibility split — 2026-11-21

- Extracted the former 71 KB inline stylesheet into six files under `src/styles/`: foundation, Study Room, app components, device layout, Study Room visuals, and accessibility.
- Added `src/styles/main.css` as a single ordered entry point. The import order exactly follows the former inline stylesheet order to preserve the cascade and overrides.
- The HTML now links the stylesheet through a Vite-relative path; no inline CSS remains. No selector, declaration, animation, or visual value was intentionally changed.
- Updated regression tests to inspect the extracted stylesheets and added coverage for stylesheet ordering and absence of inline styles.
- Automated validation and iPhone visual retest are required before any production integration.


## Timer state controller extraction — 2026-11-21

- Extracted the timer lifecycle into `src/features/timer-controller.js`. The controller owns mode, remaining seconds, total duration, running/finished state, absolute deadline, interval lifecycle, runtime persistence, restoration, and focus-to-break transitions.
- The controller has no DOM dependency. It receives the storage adapter, clock, interval scheduler, cycle/session getters, and UI/statistics side effects through injected dependencies and callbacks.
- `src/main.js` now acts as the UI adapter: it mirrors controller snapshots for rendering, sends user actions to the controller, and supplies focus-completion / break-completion callbacks for records, totals, notifications, and sounds.
- The existing `focus-timer-runtime` and `focus-timer-settings` keys and runtime payload shape are preserved. Deadline-based timing and automatic break start remain unchanged.
- Added deterministic tests for start/pause, deadline persistence, focus completion, automatic long-break selection, break completion, active/expired restoration, mode/skip/reset/duration changes, and page-suspension persistence.
- iPhone Safari/PWA manual validation is still required before any production integration.


## Study statistics store extraction — 2026-11-21

- Added `src/data/stats-store.js` as the single owner of in-memory learning records, lifetime totals, daily history, legacy aggregates, goals, and persistence. The store is independent of the DOM and publishes immutable snapshots to the UI adapter.
- Moved startup parsing, corrupt-data snapshot protection, legacy-schema migration, future-schema write blocking, and normalized persistence into the store. Existing storage keys and schema/backup versions are unchanged.
- Routed focus-session completion, history edits/deletes, reflection notes, goal updates, daily-record clearing, backup export, backup import, and recovery replacement through the store.
- Kept the existing pure aggregation functions in `src/data/records.js`; the main entry point no longer calculates or mutates aggregate record state directly.
- Added deterministic tests for legacy migration, aggregate consistency across reload, immutable snapshots, note/duration edits, deletion, clearing a day while preserving lifetime totals, future-schema protection, migration-backup failure, and transactional replacement.
- Manual iPhone validation remains required, especially focus completion, record editing, daily clearing, backup import/export, and recovery UI.


## Study presentation extraction — 2026-11-21

- Added `src/views/study-views.js` for the DOM presentation of achievements, weekly summaries, goal progress, calendar, history, and analytics.
- The view module receives records, aggregate history, goals, date cursor, and analytics range as inputs. It does not access storage or mutate learning data.
- `src/main.js` retains application state and user interaction handlers, and delegates HTML rendering to the view module. Study Room sky progression remains coordinated by the app and is refreshed with the weekly view.
- Reflection text and record IDs are escaped before being inserted into history markup.
- Added tests for weekly totals, goals, calendar output, safe history rendering, analytics periods, and main/view integration.
- Manual iPhone validation is still required for all affected pages and interactions.


## Ambient sound controller

- `src/features/ambient-sound.js` owns generated ambient audio layers, preset composition, volume updates, accessible button state, and stopping active sources.
- The controller receives the document root, AudioContext constructor provider, volume provider, and unsupported-audio callback as dependencies. It does not read application storage or timer state.
- `src/main.js` wires the existing sound buttons and slider to the controller; sound types, presets, synthesis parameters, and settings UI remain unchanged.
- Deterministic tests use a fake Web Audio graph to verify layer toggling, preset replacement, volume distribution, unsupported-browser handling, and cleanup.
- iOS may suspend Web Audio when the PWA is backgrounded; this extraction does not add or promise background audio playback.
