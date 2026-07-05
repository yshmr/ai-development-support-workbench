# LLMアプリ開発PoC ポートフォリオ要約

## 概要

要件メモを入力すると、仕様整理、受け入れ条件、Jiraチケット、実装方針、レビュー観点、リスク・確認事項を構造化JSONとして生成する開発支援アプリを実装した。

単なるチャットUIではなく、UI、API、構造化出力、スキーマ検証、履歴保存、評価資料まで含めたLLMアプリ開発PoCとして構成している。

## 実装したこと

- Next.js + React + TypeScript による入力・結果表示UI
- `POST /api/generate` による生成API
- `GET /api/generations`、`GET /api/generations/:id` による履歴参照API
- Zodによる入力、生成結果、履歴データのバリデーション
- APIキー未設定時のモック生成
- OpenAI Responses API、Gemini GenerateContent、Claude Messages APIの構造化出力
- `data/generations.json` へのローカル履歴保存
- Vitestによるスキーマ/API周辺のテスト
- Playwrightによる入力から結果表示までのE2Eテスト
- 保存履歴を利用した評価資料作成
- `LLM_PROVIDER=mock | openai | gemini | anthropic` によるprovider切り替え
- Gemini structured outputのレスポンス処理と安全なデバッグログ
- Anthropic Structured Outputsのレスポンス処理と共通Zodスキーマによる最終検証
- Gemini APIの実行環境差異を切り分ける診断スクリプト

## 評価から分かったこと

MVPでは、生成結果を安定したJSON構造で保存し、後から評価対象として扱えることを確認できた。これはLLMアプリに必要な「生成する」「構造化する」「保存する」「評価する」という基本サイクルの土台になる。

一方で、現在の評価対象は `mock-local` の出力であり、入力固有の制約を細かく反映する力は限定的だった。今後は実LLM出力、few-shot例、プロンプト改善、JSON Schemaの運用を組み合わせ、実務で使える粒度に近づける。

同じ「プロフィール画像変更」要件を、同一スキーマ・同一評価基準で `mock-local`、Gemini実LLM出力、OpenAI実LLM出力、Claude実LLM出力として比較した。mock-localは **3.4 / 5**、Geminiは **4.4 / 5**、OpenAIは **4.6 / 5**、Claudeは **4.9 / 5** となり、`5MB`、`JPG/PNG`、`即時反映`、`失敗時エラーメッセージ` といった入力固有条件の反映が大きく改善した。

Geminiはセキュリティ、保存先、スケーラビリティなどリスク観点の幅が広く、OpenAIは受け入れ条件、Jiraチケット分解、即時反映の実装順序が実務タスクに落とし込みやすかった。Claudeはチケット分解、実装順序、レビュー観点、運用・セキュリティリスクの広さが特に強く、最も高い評価になった。一方で入力外条件を追加する傾向も見えたため、人間レビューで要件採否を確認する前提が必要になる。

providerごとに構造化出力の指定方法やレスポンス形状が異なるため、provider abstractionで差分を吸収し、最終的には共通のZodスキーマで検証する構成にした。APIキー、ローカル履歴、公開サンプルを分離し、`data/generations.json` はローカル専用、`data/sample-generations.json` は公開可能なサンプル専用として扱っている。

## アピールできるポイント

- LLM出力を自由文のまま扱わず、TypeScript型とZodスキーマでアプリケーションに組み込んでいる。
- APIキー未設定でも動作するモック経路を用意し、UIとテストを安定して確認できるようにしている。
- 履歴保存により、生成結果を後から評価・改善の材料として扱える。
- 評価観点をドキュメント化し、プロンプト改善やモデル比較へ進めやすい構成にしている。
- PoCの段階からテスト、README、評価資料まで含めて整備している。
- provider差分を吸収し、mock/OpenAI/Gemini/Claudeの出力を同じ型とUIで扱える。
- Gemini structured outputで、JSON Schemaサブセット、`candidates[].content.parts[].text` の抽出、レスポンス診断を実装している。
- Anthropic Structured Outputsで、Claude Messages APIの `output_config.format` と `content[].text` 抽出に対応している。
- OpenAI/Gemini/Claudeの実LLM出力を同じ入力・同じ評価軸で比較し、provider/modelごとの出力傾向を評価資料に落とし込んでいる。
- Codex等のネットワーク制限付き実行環境と通常PowerShell実行の差異を、診断スクリプトと安全なログで切り分けた。

## 今後の拡張案

- 実LLM出力を複数サンプルで評価し、モック出力との差分を比較する。
- 入力文から具体値を抽出し、仕様・受け入れ条件へ反映するプロンプトに改善する。
- 履歴保存をSQLite + Prismaへ移行する。
- 評価スコアと改善メモを履歴に紐づけて保存する。
- 仕様書やコード解説ドキュメントを参照するRAG連携を追加する。
- JiraまたはGitHub Issueへの連携を追加する。
