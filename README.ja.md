# Kurage AI VTuber (kvtuber)

`kvtuber` は、ブラウザ上のVTuber viewerを固定して、番組台本・スケジュール・TTS・YouTube Live/RTMP配信に接続するための軽量な配信システムです。

このリポジトリには、システムのロジックとサンプル設定だけを置きます。本番の番組台本、配信キー、生成音声、録画データ、独自アバター画像はコミットしません。

## 主な機能

- React/ViteベースのVTuber viewer
- PNG/SVGアバター差し替えと簡易口パク
- 管理画面から番組・スケジュール・割り込み発話を制御
- `storage/*.json` によるローカル番組管理
- `/viewer?broadcast=1` の配信用固定viewer
- edge-ttsベースのTTS shim
- YouTube Live/RTMP起動ヘルパー

## セットアップ

```bash
npm install
cp -r storage.sample storage
cp .env.sample .env
npm run dev -- --host 0.0.0.0 --port 18308
```

配信用viewer:

```text
http://localhost:18308/viewer?broadcast=1
```

## データ境界

Gitに入れるもの:

- アプリケーションコード
- 管理画面、viewer、配信制御ロジック
- サンプル設定
- 汎用的なドキュメント

Gitに入れないもの:

- `storage/` の本番番組データ
- YouTube/RTMPの配信キー
- `.env` と秘密情報
- 生成した音声・動画・スクリーンショット
- 独自アバター画像や私用素材
