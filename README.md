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
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.5
```

`OPENAI_API_KEY` が未設定の場合は、Zodスキーマを通るモック出力で動作します。キーを設定した場合は OpenAI Responses API にJSON Schema付きの構造化出力を依頼します。

`.env.local` は `.gitignore` の `.env*.local` によりGit管理対象外です。APIキーの値は `.env.example`、README、docs、生成履歴、コミットに含めないでください。

## 実LLM出力の生成手順

mock-local出力と実LLM出力を比較する場合は、以下の手順で同じサンプル入力を使って生成します。

1. `.env.example` を参考に `.env.local` を作成する。
2. `.env.local` に `OPENAI_API_KEY` と必要に応じて `OPENAI_MODEL` を設定する。
3. `npm run dev` でアプリを起動する。
4. 画面でREADMEのサンプル入力を送信する。
5. 生成結果が履歴に保存されたことを確認する。
6. `docs/llm_app_poc/evaluation_results.md` のBefore/After比較欄に、実LLM出力の履歴ID、modelName、評価点、差分を記録する。

注意:

- `OPENAI_API_KEY` の値はファイルに書き残さない。
- `.env.local` はコミットしない。
- `data/generations.json` はローカル履歴として扱い、コミットしない。
- 公開用のサンプル履歴が必要な場合は `data/sample-generations.json` に作成する。
- ポートフォリオに載せる前に、生成履歴に個人情報、顧客情報、業務上の機密が含まれていないことを確認する。

## 主な機能

- 要件メモ入力フォーム
- `POST /api/generate` による構造化生成
- Zodによるリクエスト・生成結果・履歴の型検証
- APIキー未設定時のモック生成
- `data/generations.json` へのローカル履歴保存
- `GET /api/generations` と `GET /api/generations/:id` による履歴参照
- 生成結果と履歴詳細の画面表示

## 履歴データの扱い

`data/generations.json` はローカル操作で生成される履歴ファイルです。APIキー利用時の実LLM出力や検証中の入力が含まれる可能性があるため、Git管理しない方針です。

公開・共有・ポートフォリオ掲載に使うサンプル履歴が必要な場合は、機密情報を含まない内容だけを `data/sample-generations.json` に手動で作成します。

方針:

- `data/generations.json`: ローカル履歴。`.gitignore` 対象。コミットしない。
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
- [LLMアプリ開発PoC ポートフォリオ要約](docs/llm_app_poc/portfolio_summary.md)
- [追加サンプル入力案](docs/llm_app_poc/sample_inputs.md)

## 今後の拡張予定

- SQLite + Prisma への履歴保存差し替え
- 生成結果の評価スコア保存
- few-shot例とプロンプトバージョン管理
- 仕様Markdownやコード解説ドキュメントを参照するRAG連携
- Jira/GitHub Issue連携
