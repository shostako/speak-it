# speak-it

テキストを貼り付けて、音声で読み上げる Web アプリ。読み上げには Google の Text-to-Speech を使う。

## 構成

| 部分 | 中身 | 置き場所（Render） |
|---|---|---|
| 画面（リポのルート） | Vite と素の JavaScript（`src/main.js`）、静的サイト | speak-it |
| `server/` | Express 4。Text-to-Speech を呼ぶ API | speak-it-api |

配信の設定は `render.yaml` にある。

## 環境変数

- API: `GOOGLE_TTS_API_KEY`、`FRONTEND_URL`（CORS 用）
- 画面: `VITE_API_URL`（API の URL）

## 手元で動かす

```bash
# API（初回は .env.example を写して、GOOGLE_TTS_API_KEY を書く）
cd server && cp .env.example .env && npm install && npm run dev
# 画面（別の端末）
npm install && npm run dev
```

## 変更履歴

[CHANGELOG.md](CHANGELOG.md) を見る。
