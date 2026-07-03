# LLMアプリ開発PoC 仕様書 v0.1

## 1. PoCの目的

Step5-Aの「LLMアプリ開発」を目指すための個人PoCとして、要件メモや仕様メモを入力に、以下を生成する開発支援アプリを作る。

- 仕様整理
- 受け入れ条件
- Jiraチケット風のタスク分解
- 実装方針
- レビュー観点
- リスク・確認事項

このPoCでは、単なるChatGPTラッパーではなく、UI、API、LLM呼び出し、構造化出力、履歴保存、評価、README化まで含めて、LLMアプリ開発の基本構成を実装する。

## 2. このPoCで証明したいこと

- LLMを使った実用アプリケーションを設計・実装できる
- 入力テキストを、実務で使える構造化された成果物に変換できる
- JSON Schemaや型定義を使って、LLM出力を安定化できる
- 生成結果を評価・改善する観点を持っている
- UI/API/DB/LLM/評価を含めた一連の開発ができる
- 既存の開発経験を、LLMアプリ開発に接続できる

## 3. MVPスコープ

### 3.1 入力

ユーザーは以下のような要件メモを入力できる。

- 新機能の概要
- バグ報告
- 仕様変更依頼
- 既存機能の改善要望
- ユーザーからの問い合わせ内容

### 3.2 出力

LLMは以下の形式で結果を返す。

- summary: 要件の要約
- spec: 仕様整理
- acceptanceCriteria: 受け入れ条件
- jiraTasks: Jiraチケット風のタスク一覧
- implementationPlan: 実装方針
- reviewPoints: レビュー観点
- risks: リスク・確認事項

### 3.3 画面

MVPでは以下の画面を作る。

- 入力フォーム画面
- 生成結果表示画面
- 生成履歴一覧
- 履歴詳細画面

### 3.4 API

MVPでは以下のAPIを作る。

- POST /api/generate
  - 入力テキストを受け取り、LLMで構造化出力を生成する
- GET /api/generations
  - 生成履歴一覧を返す
- GET /api/generations/:id
  - 生成履歴の詳細を返す

### 3.5 DB

最初はSQLiteまたはローカルJSON保存でよい。
余裕があればPrisma + SQLiteにする。

保存する情報:

- id
- inputText
- outputJson
- promptVersion
- modelName
- createdAt

## 4. 非目標

MVPでは以下はやらない。

- 本格的な認証
- チーム共有機能
- 外部Jira API連携
- GitHub Issue自動作成
- RAG連携
- AIエージェントによる自動修正
- 本番運用レベルの権限管理

これらは後続フェーズで追加する。

## 5. 技術構成案

- Frontend: Next.js / React / TypeScript
- API: Next.js API Route または Route Handler
- LLM: OpenAI APIなど
- Schema Validation: Zod
- Storage: SQLite + Prisma、またはローカルJSON
- Testing: Vitest / Playwrightのどちらか簡易導入
- Documentation: README + docs配下の設計メモ

## 6. 評価観点

このPoCでは、生成結果を以下の観点で評価する。

- 要件の抜け漏れが少ないか
- 受け入れ条件が具体的か
- Jiraチケットが実装可能な粒度になっているか
- 実装方針が現実的か
- レビュー観点が実務的か
- リスク・確認事項が妥当か
- 出力形式が安定しているか

## 7. 後続拡張

### Phase 2: RAG連携

仕様Markdownやコード解説ドキュメントを参照して、根拠付きで仕様整理・チケット生成できるようにする。

### Phase 3: AIエージェント化

Issue本文を入力に、関連ファイル探索、影響範囲分析、修正方針生成、テスト観点生成まで行う調査型エージェントに拡張する。

## 8. ポートフォリオ上の見せ方

このPoCは、Step5-AのLLMアプリ開発に向けた個人PoCとして位置づける。

職務経歴書や面談では、以下のように説明できる。

> 個人PoCとして、要件メモや仕様変更依頼を入力に、仕様整理、受け入れ条件、Jiraチケット、実装方針、レビュー観点を構造化出力するLLMアプリケーションを実装しました。UI、API、LLM呼び出し、構造化出力、履歴保存、評価観点の設計まで含めて、LLMを実務アプリケーションに組み込む流れを検証しています。
