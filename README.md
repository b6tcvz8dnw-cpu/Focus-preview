# FOCUS — 学習集中タイマー

iPhoneのSafariでこのサイトを開き、「共有」→「ホーム画面に追加」でインストールできます。

GitHub Pagesで配信する静的PWAです。タイマー、休憩切替、学習セッション記録、設定、オフラインキャッシュに対応しています。

## 開発

Node.js 20以降が必要です。

```sh
npm install
npm run dev
```

## 検証・ビルド

```sh
npm test
npm run build
npm run preview
```

本番成果物は `dist/` に生成されます。Viteのbaseは相対パス `./` なので、GitHub PagesのプロジェクトURL `/Focus/` 配下で利用できます。

Service Workerはビルド時に生成されたハッシュ付きJS/CSSをプリキャッシュ対象へ追加します。公開前にはGitHub Actionsのビルド結果とiPhoneでの実機動作を確認してください。
