# LLM App PoC MVP

要件メモから、仕様整理・受け入れ条件・Jiraチケット・実装方針・レビュー観点・リスクを構造化JSONで生成するLLMアプリ開発PoCです。

## 起動方法

```bash
npm install
npm run dev
```

ブラウザで `http://localhost:3000` を開きます。

## 環境変数

`.env.example` を参考に `.env.local` を作成してください。

```bash
# Active provider. Keep provider keys below together, then switch this value.
LLM_PROVIDER=mock

# OpenAI provider settings.
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.5

# Gemini provider settings.
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash

# Anthropic provider settings.
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-haiku-4-5-20251001

# Safe metadata logging only. Never logs API keys or full input text.
DEBUG_LLM_RESPONSE=0
```

`LLM_PROVIDER` は `mock`、`openai`、`gemini`、`anthropic` のいずれかを指定します。OpenAI、Gemini、AnthropicのAPIキー・モデル名は同じ `.env.local` に並べて記載できます。実行時は `LLM_PROVIDER` の値だけで使用するproviderを切り替えます。

- `LLM_PROVIDER=mock`: APIキーなしでZodスキーマを通るモック出力を返す。
- `LLM_PROVIDER=openai`: `OPENAI_API_KEY` と `OPENAI_MODEL` を使って OpenAI Responses API で生成する。
- `LLM_PROVIDER=gemini`: `GEMINI_API_KEY` と `GEMINI_MODEL` を使って Gemini API で生成する。
- `LLM_PROVIDER=anthropic`: `ANTHROPIC_API_KEY` と `ANTHROPIC_MODEL` を使って Claude Messages API で生成する。

`.env.local` は `.gitignore` の `.env*.local` によりGit管理対象外です。APIキーの値は `.env.example`、README、docs、生成履歴、コミットに含めないでください。

Anthropic providerでは、ポートフォリオ評価の再現性を優先して `ANTHROPIC_MODEL=claude-haiku-4-5-20251001` を使用します。Claude APIの利用枠・課金はClaudeサブスクリプションとは別に管理されるため、Anthropic Console側のAPIキー、利用枠、課金設定を確認してください。

## 実LLM出力の生成手順

mock-local出力と実LLM出力を比較する場合は、以下の手順で同じサンプル入力を使って生成します。

1. `.env.example` を参考に `.env.local` を作成する。
2. OpenAIを使う場合は、`.env.local` に `LLM_PROVIDER=openai`、`OPENAI_API_KEY`、必要に応じて `OPENAI_MODEL` を設定する。
3. Geminiを使う場合は、`.env.local` に `LLM_PROVIDER=gemini`、`GEMINI_API_KEY`、必要に応じて `GEMINI_MODEL=gemini-2.5-flash` を設定する。
4. Claudeを使う場合は、`.env.local` に `LLM_PROVIDER=anthropic`、`ANTHROPIC_API_KEY`、必要に応じて `ANTHROPIC_MODEL=claude-haiku-4-5-20251001` を設定する。
5. モックに戻す場合は `LLM_PROVIDER=mock` を設定する。
6. `npm run dev` でアプリを起動する。
7. 画面でREADMEのサンプル入力を送信する。
8. 生成結果が履歴に保存されたことを確認する。
9. `docs/llm_app_poc/evaluation_results.md` のBefore/After比較欄に、実LLM出力の履歴ID、provider、modelName、評価点、差分を記録する。

注意:

- `OPENAI_API_KEY` の値はファイルに書き残さない。
- `GEMINI_API_KEY` の値はファイルに書き残さない。
- `ANTHROPIC_API_KEY` の値はファイルに書き残さない。
- `.env.local` はコミットしない。
- `data/generations.json` はローカル履歴として扱い、コミットしない。
- 公開用のサンプル履歴が必要な場合は `data/sample-generations.json` に作成する。
- ポートフォリオに載せる前に、生成履歴に個人情報、顧客情報、業務上の機密が含まれていないことを確認する。

Geminiレスポンスの調査が必要な場合は `DEBUG_LLM_RESPONSE=1` を設定すると、APIキーや入力本文を含まない範囲でprovider、modelName、候補数、finishReason、promptFeedback、safetyRatings、parts種別をサーバーコンソールに出力します。

Claudeレスポンスの調査が必要な場合も `DEBUG_LLM_RESPONSE=1` を利用できます。APIキーや入力本文を含まない範囲でprovider、modelName、HTTP status、stop_reason、content block種別、usage token数などの安全なメタデータだけを出力します。

OpenAI providerの疎通確認は以下で実行できます。`.env.local` の `OPENAI_API_KEY` を読み込みますが、APIキー値は表示しません。

```bash
npm run check:openai-provider
```

成功時は `OpenAI provider path reachable` と表示されます。

Gemini APIへの疎通だけ確認したい場合は以下を実行します。`.env.local` の `GEMINI_API_KEY` を読み込みますが、APIキー値は表示しません。

```bash
npm run check:gemini
```

成功時は `Gemini API reachable` と表示されます。

アプリのGemini providerと同じHTTPリクエスト構築・fetch処理をNext.js外から確認する場合は以下を実行します。

```bash
npm run check:gemini-provider
```

成功時は `Gemini provider path reachable` と表示されます。`check:gemini` が成功し、`check:gemini-provider` も成功する一方で画面からの生成だけ失敗する場合は、Next.js Route Handlerの実行コンテキスト差分を疑います。

## Gemini fetch failed の確認

Gemini providerで `fetch failed` が表示される場合、Geminiのレスポンス本文を取得する前に通信が失敗している可能性があります。`DEBUG_LLM_RESPONSE=1` を設定すると、APIキーや入力全文を含まない範囲で以下をサーバーコンソールに出力します。

- URL origin
- URL pathname
- HTTP method
- provider
- modelName
- `process.version`
- `NEXT_RUNTIME`
- fetch実装を識別するための安全な情報
- `HTTP_PROXY`、`HTTPS_PROXY`、`ALL_PROXY`、`NO_PROXY`、`NODE_OPTIONS`、`NODE_USE_ENV_PROXY` が設定されているかのboolean
- `error.name`、`error.message`、`error.cause` の一部

確認ポイント:

- ネットワーク接続が有効か。
- VPN、プロキシ、セキュリティソフトが `generativelanguage.googleapis.com` への通信を遮断していないか。
- `GEMINI_API_KEY` にAPI制限がある場合、この環境やGemini APIから利用できる設定になっているか。
- `GEMINI_MODEL` が利用可能なモデル名か。まずは `gemini-2.5-flash` で確認する。
- `npm run check:gemini` でGemini APIエンドポイントへ疎通できるか。
- `npm run check:gemini-provider` でアプリと同じproviderリクエスト構築でも疎通できるか。

Codexなどのネットワーク制限付き実行環境から `npm run dev` を起動した場合、Route Handler内の外部LLM API呼び出しが `EACCES` で失敗することがあります。このPoCでは、通常のローカルPowerShellからNext.js dev serverを起動し直すことで、`LLM_PROVIDER=gemini` / `GEMINI_MODEL=gemini-2.5-flash` の実生成が成功することを確認しました。

## 主な機能

- 要件メモ入力フォーム
- `POST /api/generate` による構造化生成
- Zodによるリクエスト・生成結果・履歴の型検証
- `LLM_PROVIDER=mock | openai | gemini | anthropic` による生成provider切り替え
- `data/generations.json` へのローカル履歴保存
- `GET /api/generations` と `GET /api/generations/:id` による履歴参照
- 生成結果と履歴詳細の画面表示
- 生成履歴でのprovider/modelName保存と画面表示
- RAG OFF / ON切り替えによるgrounded generation
- RAG ON時のretrieved source metadata保存と画面表示
- Agent workflow modeによるPlanning / Knowledge Retrieval / Draft / Review / Revisionのbounded workflow実行

## 履歴データの扱い

`data/generations.json` はローカル操作で生成される履歴ファイルです。APIキー利用時の実LLM出力や検証中の入力が含まれる可能性があるため、Git管理しない方針です。

公開・共有・ポートフォリオ掲載に使うサンプル履歴が必要な場合は、機密情報を含まない内容だけを `data/sample-generations.json` に手動で作成します。

方針:

- `data/generations.json`: ローカル履歴。`.gitignore` 対象。コミットしない。
- `data/agent-runs.json`: Agent workflowのローカル実行履歴。`.gitignore` 対象。コミットしない。
- `data/sample-generations.json`: 公開可能なサンプル履歴。機密情報を含めない。
- 実LLMの生成履歴をdocsへ転記する場合は、個人情報、顧客情報、APIキー、業務上の機密が含まれていないことを確認する。

## サンプル入力

```text
ユーザーがプロフィール画像を変更できるようにしたい。
画像は5MBまで、jpg/png対応。
変更後は即時反映したい。
失敗時にはエラーメッセージを表示したい。
```

## サンプル出力

```json
{
  "summary": "ユーザーがプロフィール画像を変更できるようにする要件を整理します。",
  "spec": ["画像は5MBまで、jpg/png形式を受け付ける"],
  "acceptanceCriteria": ["変更成功後、画面上のプロフィール画像が即時に更新される"],
  "jiraTasks": [
    {
      "title": "プロフィール画像変更UIを実装する",
      "description": "画像選択、プレビュー、アップロード中表示、エラー表示を実装する",
      "type": "frontend"
    }
  ],
  "implementationPlan": ["入力スキーマとアップロードAPIの制約を先に定義する"],
  "reviewPoints": ["ファイルサイズと拡張子の検証がUI/API両方で行われているか"],
  "risks": ["画像保存先、既存画像の削除方針、キャッシュ更新方針を確認する"]
}
```

## テスト

```bash
npm run typecheck
npm test
npm run test:e2e
```

確認できること:

- 空入力時にエラーになる
- APIキー未設定でもモック出力で動作する
- 生成結果が期待する型に合っている
- 画面から入力して結果表示まで確認できる

## 評価資料

- [LLMアプリ開発PoC 評価設計](docs/llm_app_poc/llm_app_poc_evaluation_v0_1.md)
- [LLMアプリ開発PoC 評価結果](docs/llm_app_poc/evaluation_results.md)
- [LLMアプリ開発PoC レイテンシ評価](docs/llm_app_poc/latency_evaluation.md)
- [LLMアプリ開発PoC ポートフォリオ要約](docs/llm_app_poc/portfolio_summary.md)
- [追加サンプル入力案](docs/llm_app_poc/sample_inputs.md)

## RAG PoC Phase 1

RAG PoC Phase 1-Aでは、既存 `/api/generate` へRAG contextを注入せず、retrieval単体をQdrantで観測・評価できる状態にしています。

Phase 1-Cでは、Phase 1-A / 1-Bで選定した `heading-aware-v1` / Top 5 を既存 `/api/generate` に接続し、画面からRAG OFF / ONを切り替えられるようにしています。RAG OFFではretriever、OpenAI Embeddings、Qdrantを呼びません。RAG ONではretrieval成功後にのみgeneration providerへ進み、retrieval失敗または有効chunk 0件の場合はfail-closedで生成を止めます。

参照資料:

- [RAG PoC Qdrant仕様](docs/rag_poc/rag_poc_spec_v0_2_qdrant.md)
- [RAG PoC 評価設計](docs/rag_poc/rag_poc_evaluation_v0_1.md)
- [RAG PoC Retrieval評価結果](docs/rag_poc/retrieval_evaluation_results.md)
- [RAG PoC Grounded Generation設計](docs/rag_poc/grounded_generation_design.md)
- [RAG PoC Grounded Generation評価結果](docs/rag_poc/grounded_generation_evaluation_results.md)
- [RAG PoC Context Diversity評価](docs/rag_poc/context_diversity_evaluation.md)
- [RAG PoC ポートフォリオ要約](docs/rag_poc/portfolio_summary.md)
- [RAG Retrieval Foundation task](docs/rag_poc/codex_task_01_rag_retrieval_foundation_qdrant.md)

## AI Agent PoC Phase 1

AI Agent PoCでは、既存LLM App / RAG PoCの上にbounded Agent workflowを追加しています。Phase 1-Dでは `agentMode=on` により、Planning、Knowledge Retrieval、Draft、Review、必要時のRevisionを実行し、最終 `GenerationOutput` とAgent workflow metadataを分離して返します。

参照資料:

- [AI Agent PoC 仕様](docs/agent_poc/agent_poc_spec_v0_1.md)
- [AI Agent PoC 評価設計](docs/agent_poc/agent_poc_evaluation_v0_1.md)
- [AI Agent PoC Phase 1-B Runtime Foundation](docs/agent_poc/phase_1_b_runtime_foundation.md)
- [AI Agent PoC Phase 1-C Planning / Knowledge / Draft Integration](docs/agent_poc/phase_1_c_planning_knowledge_draft_integration.md)
- [AI Agent PoC Phase 1-D Review / Revision / Trace / UI Integration](docs/agent_poc/phase_1_d_review_revision_trace_ui_integration.md)
- [AI Agent PoC Phase 1-E Single-pass / Agent Workflow Evaluation](docs/agent_poc/phase_1_e_agent_workflow_evaluation.md)

ローカルQdrant:

```bash
docker compose up -d qdrant
docker compose ps
```

`.env.local` には以下を設定します。`OPENAI_API_KEY` は既存のOpenAI設定と共用し、値はコミットしません。

```env
RAG_EMBEDDING_PROVIDER=openai
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=
RAG_CHUNK_STRATEGY=heading-aware-v1
RAG_TOP_K=5
```

ingestion:

```bash
npm run rag:ingest:fixed
npm run rag:ingest:heading
```

retrieval evaluation:

```bash
npm run rag:evaluate:fixed
npm run rag:evaluate:heading
```

Phase 1-A / 1-Bの実測では、`heading-aware-v1` がHit@5 1.000、MRR 1.000、Source Recall@5 1.000となり、`fixed-size-v1`のMRR 0.854から改善した。Phase 1-Cのgrounded generationでは `heading-aware-v1` を使用する方針です。

RAG ONでgrounded generationを確認する場合は、通常のローカルPowerShellでQdrantとdev serverを起動し、画面のRAG切り替えをONにします。Codexなどのネットワーク制限付き実行環境では、OpenAI Embeddings APIやQdrant実体への接続を成功したものとして扱わないでください。

Phase 1-Eでは、RAG ON時にcontext policyを切り替えられます。`raw-top-k-v1` はsemantic Top 5をそのまま使うbaseline、`document-cap-v1` はsemantic Top 10候補から同一document最大2 chunksで最大5件を選ぶpilot policy、`document-diversity-v1` はsemantic Top 10候補から各documentの最初のchunkを優先した後に最大2 chunks/documentで最大5件を構成するrefined candidateです。formal evaluationでは、`document-diversity-v1`によりuniqueDocumentCount@5が3から5へ改善し、品質は概ね維持されました。

Phase 1-A Retrieval foundation、Phase 1-B Chunk strategy evaluation、Phase 1-C Grounded generation integration、Phase 1-D RAG OFF / ON evaluation、Phase 1-E Context diversity improvementまで完了したため、RAG PoC Phase 1は完了状態として扱います。MMR、reranking、hybrid retrieval、query decomposition、multi-query retrievalは今後の候補であり、Phase 1では未実装です。

debug API:

```bash
curl -X POST http://localhost:3000/api/rag/search \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"プロフィール画像のアップロード制約と即時反映方法\",\"strategy\":\"heading-aware-v1\",\"topK\":5}"
```

Qdrant dashboardは `http://localhost:6333/dashboard` で確認できます。local Qdrant storage、`.env.local`、APIキー、`data/generations.json` はGit管理対象にしません。

## 今後の拡張予定

- SQLite + Prisma への履歴保存差し替え
- 生成結果の評価スコア保存
- few-shot例とプロンプトバージョン管理
- 仕様Markdownやコード解説ドキュメントを参照するRAG連携
- Jira/GitHub Issue連携
