# Step5-A LLMアプリ開発PoC スターター資料

このフォルダには、Step5-Aの「LLMアプリ開発」を目指すための個人PoCスターター資料をまとめています。

## ファイル一覧

- llm_app_poc_spec_v0_1.md
  - PoCの目的、MVPスコープ、技術構成、見せ方を整理した仕様書

- llm_app_poc_evaluation_v0_1.md
  - 生成結果を評価するためのサンプル入力と採点基準

- codex_task_01_llm_app_mvp.md
  - Codexに渡す最初の実装タスク

## 進め方

1. まず `llm_app_poc_spec_v0_1.md` を確認する
2. 実装対象のリポジトリを決める
3. Codexに `codex_task_01_llm_app_mvp.md` を渡す
4. Codexの差分を確認する
5. 動作確認後、READMEと評価結果を整える

## ポートフォリオ上の狙い

このPoCは、単なるChatGPT利用ではなく、LLMを実務アプリケーションに組み込む開発力を示すためのものです。

特に以下を見せることを狙います。

- UI/API/LLM呼び出し/DB/評価まで一通り作れる
- 構造化出力を扱える
- 生成結果を評価・改善できる
- 開発現場の業務を理解したLLMアプリを設計できる
