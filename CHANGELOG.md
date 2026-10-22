# 変更履歴

このリポジトリの主な変更を新しい順に書く。日付は日本時間。

## 2026-10-22

### セキュリティ
- 脆弱性のある部品を更新した（#7）。Express は 4 のまま。
  - API（`server/`）: proxy-addr 2.0.8（critical）、path-to-regexp 0.1.13（high、ReDoS）、qs 6.16.1、body-parser 1.20.8、express 4.22.3。`npm audit` は 5 件（critical 1・high 1・moderate 3）から 0 件になった。
  - 画面: vite 7.3.7 など開発用の部品。`npm audit` は 6 件（high、開発用のみ）から 0 件になった。
