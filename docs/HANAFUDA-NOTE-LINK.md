# Vector Note — 花札こいこい直接URL QA

Vectorは2026年8月末から、.xdc ファイルへのURLをNote等に貼るだけでMini Appとして開く機能に対応しています。

URL:
https://github.com/badjoke-lab/vctrtable/releases/download/hanafuda-qa-latest/hanafuda.xdc

このURLは .github/workflows/hanafuda-xdc-release.yml による初回公開成功後に利用可能です。

## 実際の検証手順

1. Vectorで自分用Noteを開く。
2. 上のURLをメッセージとして貼り、送信する。
3. Mini Appとして表示されたカードを開き、起動する。
4. 花札こいこいのローカルQAを開始し、場札選択・手札・山札・役・勝負/こいこいを確認する。
5. スマホでも同じNoteを開いて表示を確認する。ゲーム進行そのものは両端末で同期しません。

**ローカルQA限定:** 自動対戦相手は単なるスクリプトです。Vectorの2人PvPではありません。

公開ビルドが更新されても、既に送信されたMini Appメッセージのアプリは自動更新されない可能性があります。修正版を試す場合は新しいNoteメッセージへURLを再投稿してください。

このURLは開発QAとして一般にアクセス可能です。認証秘密・ウォレット鍵・ゲーム中の秘密札を含めず、WebXDCグループ更新による隠し札のブロードキャストもしません。
