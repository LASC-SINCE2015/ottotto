# ottotto（おっとっとタワー）

四角くてもちもちした生き物を、崩さないように高く積み上げていく、ブラウザで遊ぶ物理バランスゲームです。

- 純粋な HTML5 / CSS / JavaScript（外部ライブラリなし。物理演算も自前）
- ベストスコアはブラウザの `localStorage` に保存（サーバー不要）
- みんなのランキングは Google スプレッドシートに記録（Google Apps Script。準備は [gas/README.md](gas/README.md)）
- GitHub Pages で公開（スマホ・PC 両対応）

## 遊び方

- 公開版: https://lasc-since2015.github.io/ottotto/ （公開の設定後）
- 手元で: `game/index.html` をブラウザで開くだけで動きます。
- 操作: タップ（クリック）した位置にキャラクターを落とします。指でなぞって位置を決め、はなすと落ちます。PC は ← → キーと Space でも遊べます。

## フォルダ構成

| フォルダ | 内容 |
|---|---|
| [spec/](spec/README.md) | 仕様書（何を作るか） |
| [design/](design/README.md) | 設計書（どう作るか） |
| [game/](game/) | ゲーム本体。このフォルダが GitHub Pages で公開される |
| [assets_src/](assets_src/README.md) | 素材の元ファイル（キャラクターの原画） |
| [gas/](gas/README.md) | みんなのランキングの受け口（Google Apps Script）と準備の手順 |
| [testing/](testing/README.md) | 確認内容（テスト計画）と確認結果 |
| [.github/workflows/](.github/workflows/pages.yml) | GitHub Pages への公開（GitHub Actions） |

## 公開のしかた

`master` にプッシュ（マージ）すると、GitHub Actions が `game/` を GitHub Pages に公開します。

初回だけ、リポジトリの **Settings → Pages → Build and deployment → Source** を「**GitHub Actions**」にしてください。公開先は `https://<ユーザー名>.github.io/<リポジトリ名>/` です。

## ブランチ

- `master` … 公開用（プッシュすると公開される）
- `develop` … 開発中のまとめ先
- `feature_XXX` … 機能ごとの作業ブランチ（`develop` から切る）
