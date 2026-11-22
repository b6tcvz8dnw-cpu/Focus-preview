# FOCUS リファクタリング計画

## 方針

- 現在の公開PWAを維持する。
- 作業は `refactor/foundation` ブランチで行い、検証前に `main` へ統合しない。
- `backup/pre-refactor-2026-11-21` は移行前の基準点として保持する。
- 新機能よりも、既存機能・既存データの保護を優先する。
- 無料で利用できる標準ツールとGitHubの公開リポジトリ機能を優先する。

## フェーズ

### Phase 0 — 安全な準備
- [x] 移行前バックアップブランチを作成
- [x] 作業用ブランチを作成
- [x] 画面・機能・保存キーの棚卸し
- [x] 依存関係と移行リスクを文書化
- [x] Node.js標準機能だけで動く初期品質チェックを追加
- [ ] 品質チェックを実行環境で実行し、結果を確認
- [ ] GitHub Actionsの実行結果を確認
- [ ] 主要な操作シナリオを実機で確認

### Phase 1 — 構造の分離
- [x] 日付・時刻・週次集計・星空レベルの純粋関数をモジュール化
- [x] ES module形式のエントリーポイントへ移行
- [x] アプリ本体を `src/main.js` へ外部化
- [x] 新しいモジュールをService Workerのキャッシュ対象へ追加
- [x] 日付・時刻・週次集計・星空レベルの純粋関数をモジュール化
- [ ] その他の純粋関数を順次抽出
- [x] localStorageアクセスを保存層に集約（`src/data/storage.js`）
- [x] 残り時間計算と休憩モード選択を `src/core/timer.js` に抽出
- [x] タイマー状態管理をUIから分離（`src/features/timer-controller.js`。DOM非依存の状態遷移・保存・復元・自動休憩）
- [x] 学習記録の累計・日別集計を `src/data/records.js` に分離
- [x] 学習記録・統計の状態管理と保存を `src/data/stats-store.js` に分離（移行・復旧保護・目標・履歴編集・バックアップ入出力）
- [x] 書斎・砂時計の主要ロジックを分離（`src/features/hourglass.js` と `src/features/study-room.js`。書斎のHTML/CSSと静的表示は引き続き段階整理）
- [x] CSSを責務別に分割（`src/styles/` の6ファイルと順序付き `main.css`）

### Phase 2 — データ保護
- [x] データスキーマにバージョンを追加（ローカル統計データ v1）
- [x] 旧データからのマイグレーションを実装（未バージョン形式 → v1）
- [x] 壊れたJSON・不正値の復旧処理（原文を端末内に退避し、未来のスキーマは上書きしない）
- [x] インポート前のバックアップと検証（端末内 `focus-preimport-backup` へ退避してから反映）
- [x] 既存JSONバックアップとの互換性テスト（従来の version 2 を受け入れ、version 3 で書き出し）
- [x] 端末内退避データの確認・復元UI（復元前スナップショット保護、破損原文と将来スキーマの現在データの書き出し、将来スキーマの復元拒否）
- [ ] 実データを使ったiPhoneでの移行確認（手順を `docs/iphone-smoke-test.md` に用意）

### Phase 3 — 品質保証
- [x] タイマー境界条件テスト（丸め・期限切れ・不正な時刻値）
- [x] 記録の重複・欠落テスト（重複ID排除・起動時終了の記録漏れ修正）
- [x] 保存・復元テスト（タイマー状態・バックアップ往復）
- [x] 画面操作のスモークテスト（DOM ID・画面遷移先の整合性）
- [x] GitHub Actionsで自動チェック（Node.js標準テスト）
- [ ] iPhone Safari/PWAでの実機操作確認（`docs/iphone-smoke-test.md` のチェックリスト）

### Phase 4 — ビルド基盤
- [x] Vite導入（dev / build / preview scripts）
- [x] GitHub Pages用baseパス設定（相対パス `./`、プロジェクトページ対応）
- [x] PWA資産を `public/` に集約し、PNGアイコンをビルド時にコピー
- [x] ビルド時にハッシュ付きJS/CSSをService Workerのプリキャッシュへ注入
- [x] CIでテストと本番ビルドを実行する構成
- [x] CIで生成された成果物をダウンロードして実体確認（相対URL、manifest、PNG/SVG、ハッシュ付きJS、Service Workerプリキャッシュ）
- [x] main限定のGitHub Actionsデプロイworkflowを準備（PRではビルドのみ、main push/dispatch時のみdeploy）
- [x] GitHub PagesのSourceをGitHub Actionsに設定（ユーザー確認済み。PRマージ後の初回デプロイは未実施）
- [ ] 既存URLを維持した段階的切替（Actions設定後にPRをマージし、Pagesデプロイ成功とiPhone実機を確認）
- [x] Pages移行手順・切替順序・ロールバック上の注意を `docs/pages-migration.md` に記録

### 将来のiOSネイティブ化（別段階）
- [ ] Capacitor導入
- [ ] iOSネイティブ通知などの要件整理
- [ ] Mac/Xcodeで実機ビルド・検証
- [ ] App Store申請準備

### Phase 7 — PWA安定性と操作品質の仕上げ（進行中）

目的：機能をむやみに増やすのではなく、現在のFOCUSを安心して日常利用できる品質へ整える。

- [x] 設定保存失敗時の状態不整合を解消（通知・テーマ・マーク・タイマー設定・書斎表示）
- [x] 保存失敗時に旧状態を維持する回帰テストを追加
- [ ] Service Workerの更新・旧キャッシュ削除・オフライン復帰を実機で再確認
- [ ] 画面遷移・キーボード操作・読み上げ・タッチ領域を横断監査（進行中）
- [ ] 起動時間・描画負荷・アニメーション負荷を測定し、必要な箇所だけ最適化
- [ ] iPhone Safari / ホーム画面アプリで全主要画面を最終確認
- [ ] 本番移行前に差分・バックアップ・ロールバック手順を再点検

Phase 7でも、端末間同期・アカウント機能・強制的な利用制限・競争型の実績機能は追加しない。集中の邪魔をしないことと、既存データを守ることを優先する。

## 無料でできる範囲と制約

無料で進められる作業:
- GitHubでのブランチ・履歴管理
- Node.js標準のテストランナー
- 公開GitHubリポジトリでのソース管理
- GitHub Actionsによる公開リポジトリのCI
- Viteなどのオープンソースツールによるビルド
- 現行GitHub PagesでのPWA公開

後で必要になる可能性があるもの:
- iOSネイティブ開発にはMacとXcodeが必要
- App Store配布にはApple Developer Programへの登録が必要
- クラウド同期にはバックエンドの設計・運用が必要。無料枠を使えるサービスでも利用上限や条件がある

## 完了基準

- 既存の学習記録・設定が維持される
- タイマーの開始・停止・復元・自動休憩が維持される
- 書斎、天候表示、砂時計、文字なしモードが維持される
- オフライン時の基本動作が維持される
- 自動テストが通る
- 本番ブランチに統合する前に差分と実機動作を確認する


### Phase 1 — CSS分離の実施記録（2026-11-21）
- [x] インラインCSSを6つの責務別ファイルへ抽出
- [x] 元の定義順を維持するCSSエントリーポイントを作成
- [x] HTMLからインラインCSSを除去し、Vite管理の相対パスで読み込み
- [x] CSSの読み込み順・主要アニメーション・アクセシビリティ規則の回帰テストを追加
- [ ] iPhone Safari/PWAで全画面の見た目・アニメーションを再確認


### Phase 1 — タイマー状態管理の分離（2026-11-21）
- [x] タイマー状態・期限・インターバルの所有権を専用コントローラーへ移動
- [x] 開始・一時停止・リセット・モード切替・スキップ・時間設定をコントローラー経由に統一
- [x] 既存の実行状態保存キーとデータ形式を維持
- [x] 起動時の進行中・期限切れタイマー復元を専用コントローラーへ移動
- [x] 集中完了後の休憩自動開始と長休憩選択を維持
- [x] 時計・スケジューラ・保存層を注入可能にし、Node.jsで決定的に検証
- [ ] iPhone Safari/PWAで開始・一時停止・終了・自動休憩・再起動復元を確認


### Phase 3 — 学習記録・統計ストア分離（2026-11-21）
- [x] 記録・累計・日別履歴・目標の状態を専用ストアへ集約
- [x] 旧データの移行と破損データ保護をストアへ移動
- [x] 集中完了・履歴編集/削除・振り返り・目標保存をストア経由に統一
- [x] バックアップの書き出し・読み込み・復旧をストア経由に統一
- [x] 未来スキーマの保護とバックアップ失敗時の書き込み停止を維持
- [x] 決定的な自動テストを追加
- [ ] iPhone Safari/PWAで記録・編集・削除・バックアップ・復元を確認


### Phase 4 — 学習画面の描画分離（2026-11-21）
- [x] 実績表示を専用ビューへ分離
- [x] 週次サマリー・目標進捗の描画を専用ビューへ分離
- [x] カレンダーの描画を専用ビューへ分離
- [x] 履歴・振り返り一覧の描画を専用ビューへ分離（HTMLエスケープを維持）
- [x] 日・週・月の分析グラフ描画を専用ビューへ分離
- [x] ビューをDOM表示専用とし、保存・記録状態の変更はストア経由に限定
- [x] 表示内容・集計・エスケープ・統合境界の自動テストを追加
- [ ] iPhone Safari/PWAで概要・目標・カレンダー・履歴・分析を実機確認


### Phase 5 — 環境音機能の分離（2026-11-22）
- [x] 環境音レイヤー生成・停止処理を `src/features/ambient-sound.js` へ抽出
- [x] 雨・風・ノイズの個別切替と既存プリセットを維持
- [x] 音量変更とアクセシブルなボタン状態を専用コントローラーへ集約
- [x] Web Audio APIを差し替え可能にし、疑似AudioContextで決定的なテストを追加
- [x] 非対応環境の通知と音源停止処理を検証
- [ ] iPhone Safari/PWAで各音・プリセット・音量・停止を実機確認

次の候補は通知制御の分離。その後にテーマ・外観設定、バックアップ復旧UIの境界を整理する。各機能は一度にまとめず、既存動作を維持できる単位で進める。


### Phase 5 — 通知機能の分離（2026-11-22）
- [x] 通知許可の確認と要求を専用コントローラーへ抽出
- [x] 通知オン・オフ状態と既存保存キー `focus-notifications` を維持
- [x] タイマー完了通知をコントローラー経由に統一
- [x] バックアップ読み込み時の通知設定復元をコントローラー経由に統一
- [x] 許可・拒否・非対応環境・通知配信の自動テストを追加
- [ ] iPhone Safari/PWAで通知許可と完了通知を実機確認

次はテーマ・外観設定の分離へ進む。通知の実際の表示はiOSの通知許可、ホーム画面アプリの状態、OS側の制約に左右されるため、実機での確認を残す。


### Phase 5 — テーマ・外観設定の分離（2026-11-22）
- [x] 既存5テーマの配色適用を `src/features/appearance-controller.js` へ抽出
- [x] ドット・スター・リーフのマーク切替を同じコントローラーへ集約
- [x] 既存保存キー `focus-appearance` / `focus-mark` とバックアップ形式を維持
- [x] 起動時復元、設定ボタン状態、保存、異常値フォールバックの自動テストを追加
- [x] Service Workerキャッシュをv6へ更新
- [ ] iPhone Safari/PWAでテーマ切替・再起動後の復元・マーク切替を実機確認

次はバックアップ復旧UIの責務境界を監査する。既存の画面や配色は変更せず、機能の所有権だけを段階的に整理する。


### Phase 5 — バックアップ復旧UIの責務分離（2026-11-22）
- [x] 復旧候補の一覧描画・空状態表示を `src/features/recovery-controller.js` へ抽出
- [x] 破損原文・保護中データの書き出し処理を専用コントローラーへ移動
- [x] 復元確認と復元直前データの保護を専用コントローラーへ集約
- [x] スキーマ検証は `src/data/recovery.js`、記録置換は `src/data/stats-store.js` に維持
- [x] 保護失敗時に復元を中止するテスト、成功時の復元・書き出し・イベント解除テストを追加
- [x] Service Workerキャッシュをv7へ更新
- [ ] iPhone Safari/PWAで復旧一覧・書き出し・復元を実機確認

次はバックアップのインポート処理と設定復元の境界を点検する。復旧UIとインポートは別経路として保ち、既存データを保護する順序を最優先にする。


### Phase 5 — バックアップインポート制御の分離（2026-11-22）
- [x] ファイル読み込み・JSON解析・スキーマ検証の受け渡しを `src/features/backup-import-controller.js` へ集約
- [x] インポート前に学習記録と設定を含む完全なバックアップを保存
- [x] タイマー・外観・通知・書斎表示設定の保存と反映を一つの調整経路へ集約
- [x] 設定保存または統計保存に失敗した場合、読み込み前の設定へロールバック
- [x] ロールバック時に元々存在しなかった保存キーも削除できるよう保存アダプターを拡張
- [x] 破損JSON・非対応バックアップ・確認キャンセル・退避失敗・設定失敗・統計失敗のテストを追加
- [x] Service Workerキャッシュをv8へ更新
- [ ] iPhone Safari/PWAでバックアップ書き出し・読み込み・設定復元を実機確認

次は今回のインポート処理をプレビュー端末で確認し、バックアップ形式の互換性と設定反映を手動検証する。確認後に、未抽出の小さなUIイベント責務と起動順序の最終監査へ進む。


### Phase 6 — 構造監査・データ更新の原子性（2026-11-22）
- [x] 学習記録の更新で、保存成功前にメモリ状態を公開してしまう問題を修正
- [x] 保存候補を先に永続化し、成功後だけ状態通知する順序へ変更
- [x] 保存失敗時に追加・編集・削除・日次消去・目標変更の状態を維持するテストを追加
- [x] 画面側で保存失敗を通知し、失敗時に成功表示を出さないよう修正
- [x] 日次記録消去の保存失敗時にタイマーまでリセットされないよう修正
- [x] iPhone Safari/PWAで保存容量不足などの失敗表示を含む実機確認（自動テストで失敗経路を検証。端末容量不足そのものの再現は未実施）
- [x] 依存関係・初期化順序・イベント解除・通信失敗時の最終監査
- [x] 機能分離後に残っていた未使用import・未使用状態変数をエントリーポイントから削除
- [x] 通知・テーマ・マークの保存失敗時に、見かけ上だけ設定が切り替わらないよう修正
- [x] タイマー設定・書斎の文字なし設定も、保存成功後にだけ画面と状態へ反映するよう修正
- [x] 各保存失敗経路の回帰テストを追加


### Phase 6 — 通信・ライフサイクル監査（2026-11-22）
- [x] Service Workerが外部APIの応答までキャッシュしてしまう問題を修正
- [x] 外部オリジンへのGET通信をアプリのキャッシュ処理から除外
- [x] キャッシュをv9へ更新し、旧プレビューキャッシュを更新時に削除
- [x] 天気取得に10秒のタイムアウトとAbortControllerを追加
- [x] 書斎破棄時に通信を中断し、イベントリスナーを解除
- [x] バックアップ復元前スナップショット作成失敗を捕捉
- [x] 設定ロールバックの成否を確認し、失敗時は明示的に通知
- [x] 通信・復元失敗の回帰テストを追加
- [ ] iPhone Safari/PWAで天気更新、オフライン起動、バックアップ復元の実機確認
- [ ] 全画面の操作と復元動作の最終実機確認

### Phase 7 — 操作性・アクセシビリティの初回改善（2026-11-22）

- [x] 砂時計にキーボードからのリセット操作（Rキー）を追加し、操作方法を読み上げ可能な説明として関連付け
- [x] ページ切替タブに現在ページ（aria-current）を反映し、設定画面表示中は解除
- [x] 分析の日・週・月切替を aria-pressed と視覚状態で同期
- [x] 集中・休憩モード切替の初期選択状態を明示
- [x] キーボード操作・ナビゲーション状態の回帰テストを追加
- [x] 週間グラフの7日分の値を読み上げラベルへ反映
- [x] 月間カレンダーの日付・集中時間・今日の日付を読み上げ可能に改善
- [x] 日・週の目標進捗バーに進捗率と分数の説明を追加

自動検証：111/111テスト成功、Viteビルド成功。プレビューのPagesデプロイはこのコミットで実施。

### Phase 7 — Service Workerキャッシュの堅牢化（2026-11-22）

- [x] HTTPエラー応答（404/500など）をアプリキャッシュへ保存しないよう変更
- [x] キャッシュ保存をFetchイベントの生存期間へ関連付け、保存完了前にWorkerが終了する可能性を低減
- [x] キャッシュ保存自体が失敗しても、正常なネットワーク応答はそのまま返す
- [x] キャッシュ名前空間をv10へ更新し、旧プレビューキャッシュを次回activate時に整理
- [x] HTTPエラー非保存・保存失敗時の応答維持・waitUntil利用の回帰テストを追加

自動検証とプレビュー反映後、Safariで更新後の再読み込みとオフライン起動を短く再確認する。実機での確認は自動テストとは分けて記録する。

### Phase 7 — iOS Safari復帰ライフサイクル（2026-11-22）

- [x] 通常のタブ復帰はvisibilitychangeでタイマー期限を再計算
- [x] BFCache（戻る／進むによるページ復元）ではpageshow.persistedを検知して同じ復帰処理を実行
- [x] タイマーと砂時計は絶対期限から残り時間を再計算するため、復帰時の重複呼び出しでも二重完了しない
- [x] BFCache復元時の回帰テストを追加
- [ ] iPhone Safariで別ページへ移動後に戻る操作を確認


### Phase 7 — バックグラウンド時の描画負荷抑制（2026-11-22）

- [x] `visibilitychange` でページの可視状態をbodyへ反映
- [x] アプリがバックグラウンドにある間はCSSアニメーションを一時停止
- [x] 復帰時には従来のタイマー・砂時計・天気更新処理を継続
- [x] 回帰テストを追加し、Service Workerキャッシュをv11へ更新


### Phase 7 — 非表示ページのアニメーション停止（2026-11-22）

- [x] `#studyRoomPage[hidden]` の間、書斎シーン内のCSSアニメーションを一時停止
- [x] ページを再表示するとCSSアニメーションが自然に再開する構成を維持（DOMやアニメーション状態の破棄なし）
- [x] バックグラウンド時の全体停止と併用し、書斎を見ていない間の描画負荷を抑制
- [x] 回帰テストを追加し、Service Workerキャッシュをv12へ更新


### Phase 7 — 非表示中の定期処理を休止（2026-11-22）

- [x] メインタイマーは絶対期限を保持したまま、ページ非表示中の1秒間隔処理を停止
- [x] 砂時計も期限時刻から残り時間を復元し、非表示中の1秒間隔処理を停止
- [x] 復帰時は残り時間を再計算してからスケジューラーを再開
- [x] 書斎の日付・時刻更新は書斎ページが表示されている場合だけ実行
- [x] 回帰テストを追加し、Service Workerキャッシュをv13へ更新

## Phase 7 — final page-exit teardown (in progress)
- Added explicit destroy() cleanup to the hourglass controller: stops its interval, clears a pending long-press timeout, and removes click/keyboard/pointer/context-menu listeners.
- Added final-page-exit cleanup for timer, hourglass, Study Room weather lifecycle, ambient audio, notifications, appearance, recovery, and backup import controllers.
- pagehide first persists the timer runtime. When event.persisted is true, cleanup is intentionally skipped so Safari Back/Forward Cache restoration remains functional. The listener remains registered so a later non-persisted exit can still clean up.
- Preview only. Awaiting CI and Pages deployment, followed by a focused iPhone Safari test for back/forward restoration and normal app close/reopen.

## Phase 7 — Content Security Policy (in progress)
- Added a document-level Content Security Policy: scripts are restricted to same-origin resources, network connections are limited to same-origin plus the Open-Meteo weather endpoint, workers/manifests are same-origin, and embedded objects are blocked.
- Inline JavaScript is not permitted. Inline styles remain permitted because the current visual system uses style attributes and runtime CSS variables.
- Added integrity tests for required policy directives and to reject inline script blocks and inline event-handler attributes.
- Preview only; awaiting CI/build and deployment. Verify theme switching, timer controls, Study Room weather, and PWA install/launch after the policy is live.

## Phase 7 — CSP verification
- The Preview deployment containing CSP completed successfully on commit `c54417d4d74ae40067df0f74d261b81c6bb14e6b`.
- Quality workflow passed; the suite contains 122 tests and the production PWA build succeeded.
- Static source audit found no inline JavaScript blocks or inline event-handler attributes. Existing inline style attributes and runtime CSS variables explain the temporary `style-src 'unsafe-inline'` allowance.
- Study presentation templates use fixed markup and normalized numeric values; user-authored reflection text and record IDs are HTML-escaped before insertion. Recovery UI uses DOM construction and `textContent`.
- Cross-origin application data request found: Open-Meteo weather endpoint only. Service Worker bypasses cross-origin requests.
- Production repository `main` remains at `bb702cb7abad5256e08cecfe5a328884b1c036130`; no production changes.
- Remaining manual validation: on iPhone, confirm timer, theme controls, weather, PWA launch/offline launch, and browser console has no CSP violations. Static/CI checks do not replace this device check.

## Phase 8 — Pre-production audit (started)
Purpose: establish that the Preview build is safe to promote before any production integration. No production merge or deployment is authorized by this phase.

Audit workstreams:
1. Reproducible build and dependency integrity: dependency lockfile, pinned installation, CI consistency, build artifact inspection.
2. Data compatibility and recovery: legacy install migration, v2/v3 backup compatibility, failed writes, corrupt/future schemas, import size and validation boundaries.
3. PWA and lifecycle: service-worker cache contents/update behavior, offline first launch vs previously cached launch, timer recovery and Safari lifecycle.
4. Security and privacy: CSP behavior, DOM injection review, external network inventory, storage isolation between Preview and production.
5. Accessibility and device behavior: keyboard/touch semantics, reduced motion, textless room, small-screen/notch/landscape layout, VoiceOver spot checks.
6. Release safety: source diff review, rollback plan, release checklist, post-deploy smoke tests.

Initial findings:
- The repository currently has no `package-lock.json`; CI uses `npm install`. Although Vite itself is pinned in `package.json`, transitive dependency resolution is not fully locked. This is a reproducibility gap to resolve before promotion.
- A local attempt to generate the lockfile could not reach the package registry in this environment. Do not hand-author a lockfile; generate and verify it in a network-enabled, trusted build environment.
- Backup import now enforces a 10 MiB UTF-8 payload ceiling both before reading a selected file and before parsing direct text input. Oversized inputs are rejected before settings, records, or recovery snapshots are changed; the file picker is reset on rejection.
- Added regression tests for oversized direct text and oversized selected files. GitHub Actions passed all 122 tests and the production PWA build; the matching Preview Pages deployment completed successfully on commit `495472c292cc54cc93a782704a8a11cda8add96b`.
- Compatibility review confirms the automated suite covers legacy unversioned stats migration, version-2 backup import, current version-3 round-trip, invalid settings/version rejection, and protection of future schema data. Manual iPhone validation remains separate.
- Import and rendering code has existing schema normalization and escaping protections. Backup import now rejects files and direct text payloads above 10 MiB before parsing or mutating settings/records; the limit is deliberately generous for a personal study-history export and can be revisited if real backups approach it.
- Phase 8 is in progress; the Preview deployment remains separate from production.

