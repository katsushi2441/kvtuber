# Kurage AI VTuber (kvtuber)

`kvtuber` は、ブラウザ上のVTuber viewerを固定して、番組台本・スケジュール・TTS・YouTube Live/RTMP配信に接続するためのプロダクト本体です。

このディレクトリがGit管理するプロダクトルートです。参考用にcloneしたOSSや本番データは同じフォルダ内に置いてもよいですが、Gitには入れません。

## 構成

```text
kvtuber/
  src/              viewer、admin、hooks、services
  scripts/          TTS、YouTube Live/RTMP補助スクリプト
  public/           再配布できるプレースホルダー素材のみ
  storage.sample/   番組・スケジュール・YouTube Live設定のサンプル
  storage/          本番番組や配信設定、Git除外
  Open-LLM-VTuber/  参考用clone、Git除外
  aituber-onair/    参考用clone、Git除外
```


## デザインルール: White Studio

kvtuberのviewer、配信用viewer、admin、スクリーンショット、デモ動画では、黒背景・ダークモード背景を使わない。Kurageは白系・薄い水色系・明るい紙面系のWhite Studioデザインを基本にする。`background: #000`、暗紺の全面背景、黒い半透明字幕箱、サイバーパンク風の暗いグラデーションは禁止。

## 主な機能

- React/ViteベースのVTuber viewer
- PNG/SVGアバター差し替えと簡易口パク
- 管理画面から番組・スケジュール・割り込み発話を制御
- `storage/*.json` によるローカル番組管理
- `/viewer` の普通viewer
- `/viewer?broadcast=1` のOBS/YouTube配信用固定viewer
- edge-ttsベースのTTS shim
- YouTube Live/RTMP起動ヘルパー

## セットアップ

```bash
npm install
cp -r storage.sample storage
cp .env.sample .env
npm run dev -- --host 0.0.0.0 --port 18308
```

開くURL:

```text
管理画面: http://localhost:18308/admin
設定つきstudio: http://localhost:18308/studio
普通viewer: http://localhost:18308/viewer
配信用viewer: http://localhost:18308/viewer?broadcast=1
```

viewerの役割:

```text
/viewer は普通viewerです。通常の視聴、自律発話確認、OBSを前提にしない動作確認に使います。
/viewer?broadcast=1 は配信用固定viewerです。OBS、Playwright/browser録画、RTMP、YouTube Liveに使います。
/studio は設定と手動チャット操作を行う運用者向け画面です。
```

## 参考OSSの扱い

`Open-LLM-VTuber/` と `aituber-onair/` は、ローカルの参考・実験用として置けます。ただしプロダクトのGit履歴には入れません。

`kvtuber` は npm dependency として `@aituber-onair/core` を使います。ローカルの `aituber-onair/` フォルダは参考・検証用です。

## データ境界

Gitに入れるもの:

- アプリケーションコード
- 管理画面、viewer、配信制御ロジック
- サンプル設定
- 汎用的なドキュメント

Gitに入れないもの:

- `storage/` の本番番組データ
- `Open-LLM-VTuber/`
- `aituber-onair/`
- YouTube/RTMPの配信キー
- `.env` と秘密情報
- 生成した音声・動画・スクリーンショット
- 独自アバター画像や私用素材
