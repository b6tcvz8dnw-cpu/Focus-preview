# FOCUS — 現状アーキテクチャ調査

調査日: 2026-11-21  
対象ブランチ: `main`  
本番URL: https://b6tcvz8dnw-cpu.github.io/Focus/

## 現状

- HTMLエントリーポイント: `index.html`
- JavaScriptエントリーポイント: `src/main.js`（ES module）
- HTML/CSS: HTMLは `index.html`、CSSは引き続きインライン
- JavaScript: `src/main.js` と `src/core/`・`src/data/` のモジュールに分割開始
- `index.html`: 約91 KB / 約1,330行（JavaScript本体を外部化）
- インラインJavaScript: 約254行、約40個の関数
- CSS: 1つのインライン `<style>`
- Vite設定: `vite.config.js`（`base: './'`、`dist/`出力）
- ビルドスクリプト: `scripts/build.mjs`（ハッシュ付きバンドルをService Workerへ注入）
- PWAマニフェスト / Service Worker / SVGアイコン: `public/`
- PNGアイコン: ルートの元ファイルをViteプラグインで `dist/` へコピー
- データ保存: ブラウザの `localStorage`（`src/data/storage.js` の防御的アダプター経由）
- ビルド依存: Vite 6（開発時・ビルド時のみ）
- テスト: Node.js標準テストランナー
- モジュール: `src/core/date-time.js`（`formatClock`, `dateKey`, `buildWeekData`, `getStudySkyLevel`）
- タイマー計算: `src/core/timer.js`（絶対時刻からの残り時間、不正値の防御、休憩モードの選択）
- 保存層: `src/data/storage.js`（文字列・JSONの読み書き、利用不可・不正JSONへの防御処理）
- 学習記録集計: `src/data/records.js`（累計・日別履歴の再計算、重複ID排除）
- 復旧データ検査: `src/data/recovery.js`（端末内スナップショットの一覧化、形式検証、将来スキーマの復元拒否、現在の保護データの原文書き出し）
- 品質保証: `tests/app-integrity.test.mjs`（Node.js標準テスト40項目、HTML/DOM契約・移行・タイマー・記録・保存の検証）
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
| タイマー | `startTimer`, `stop`, `tick`, `complete`, `restoreTimerRuntime`。純粋計算は `src/core/timer.js` |
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
