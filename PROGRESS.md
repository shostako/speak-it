# プロジェクト進捗状況

## 現在の状態
- **最終更新**: 2025-12-13 16:46
- **アクティブタスク**: なし

## 技術スタック（確定）
- **フロントエンド**: Vanilla JS + Vite
- **音声合成**: Google Cloud TTS API (LINEAR16形式)
- **再生**: Web Audio API (AudioContext)
- **スタイル**: CSS（フレームワークなし）

## 完了済み
- [x] プロジェクト作成・初期セットアップ
- [x] Web Speech API でMVP実装
- [x] Google Cloud TTS API 統合
- [x] 音声フォーマット問題の解決（MP3→LINEAR16）
- [x] AudioContext APIでの再生実装
- [x] 開始時クリックノイズの解消（50msデータレベルフェードイン）
- [x] **長文対応（バッファ連結方式）**
- [x] **一時停止/再開機能（AudioContext.suspend/resume）**
- [x] **リアルタイム音量調整（GainNode経由）**

## 技術的知見（重要）
### MP3 vs LINEAR16
- **MP3**: ブラウザのデコーダーで途中から再生が途切れる問題が発生
- **LINEAR16**: 生PCMデータ、手動でFloat32に変換してAudioBufferを作成、安定動作

### 再生方式
- `<audio>`要素やAudio()オブジェクトではなく、**AudioContext API**を使用
- base64 → ArrayBuffer → Int16Array → Float32Array → AudioBuffer の変換が必要

### クリックノイズ対策
- GainNodeで`linearRampToValueAtTime`を使い、20msフェードインを適用

### 長文対応（バッファ連結方式）
- **API制限**: 5000バイト/リクエスト（日本語UTF-8で約1600文字）
- **分割基準**: 4500バイト（安全マージン）を超えたらチャンク分割
- **分割優先順位**: 段落 → 文末（。！？） → 読点（、）
- **処理フロー**:
  1. 長文を複数チャンクに分割
  2. 全チャンク並列でAPI呼び出し（高速化）
  3. Float32Arrayとして連結
  4. 単一AudioBufferとして再生
- **利点**: チャンク境界でのノイズなし（連結後に再生するため）

## 未完了・改善予定
- [ ] 音声ダウンロード機能
- [ ] APIキーの環境変数化/バックエンド化
- [ ] 速度変更は次の再生から反映（再生中の変更は音程が変わるため無効化）

## ファイル構造
```
speak-it/
├── src/
│   ├── main.js          # メインロジック（Google Cloud TTS + AudioContext）
│   └── style.css        # スタイル
├── index.html           # エントリーポイント
├── package.json
├── CLAUDE.md
└── PROGRESS.md
```

## 次セッションへの引き継ぎ
- **次のアクション**: 残りの改善（一時停止、ダウンロード、APIキー保護）
- **注意**: MP3形式は使わない、LINEAR16 + AudioContextが安定
- **長文**: 4500バイト超で自動チャンク分割、バッファ連結方式でノイズなし再生
