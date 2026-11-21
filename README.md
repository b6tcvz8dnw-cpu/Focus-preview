# FOCUS — 開発プレビュー

このリポジトリは、FOCUSの開発版を本番環境から分離して検証するためのものです。

- プレビューURL: https://b6tcvz8dnw-cpu.github.io/Focus-preview/
- 本番URL: https://b6tcvz8dnw-cpu.github.io/Focus/
- 開発版の学習記録は `focus-preview:` 名前空間に保存し、本番版のlocalStorageキーと分離します。
- Service Workerのキャッシュも `focus-preview-` の名前空間で管理します。
- このリポジトリへの公開は、本番リポジトリの公開状態を変更しません。

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

GitHub Actionsはpush時にテストとビルドを実行し、Pages公開ワークフローはmainブランチでビルド成功後にこのプレビューサイトだけを公開します。

iPhone Safari/PWAでの実機動作、オフライン起動、バックグラウンド復帰は公開後に別途確認します。
