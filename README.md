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

## 主な機能

- 要件メモ入力フォーム
- `POST /api/generate` による構造化生成
- Zodによるリクエスト・生成結果・履歴の型検証
- APIキー未設定時のモック生成
- `data/generations.json` へのローカル履歴保存
- `GET /api/generations` と `GET /api/generations/:id` による履歴参照
- 生成結果と履歴詳細の画面表示

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
