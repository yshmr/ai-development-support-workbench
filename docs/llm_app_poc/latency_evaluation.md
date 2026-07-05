# LLMアプリ開発PoC レイテンシ評価

## 1. 評価目的

RAG PoCへ進む前に、同一入力・同一promptVersion・同一GenerationOutput schemaを使って、provider/model別の生成レイテンシを比較できる状態にする。

この評価では高速化、streaming実装、prompt短縮、max output変更は行わない。品質評価とレイテンシ評価を組み合わせ、今回のPoCタスクにおけるmodel選定材料にする。

## 2. 計測項目

| 項目 | 定義 | 保存先 |
|---|---|---|
| `providerLatencyMs` | provider API呼び出し開始直前から、providerレスポンス受信・生成結果取得完了までの時間。mock-localではモック生成処理時間を参考値として測る。 | APIレスポンス、`data/generations.json` |
| `serverProcessingMs` | `POST /api/generate` の処理開始から、APIレスポンスを構築する直前までのサーバー側処理時間。provider呼び出し、JSON parse、Zod validation、履歴保存を含む。HTTPレスポンスのネットワーク転送完了時間ではない。 | APIレスポンス、`data/generations.json` |
| `clientElapsedMs` | ブラウザ側で生成ボタン押下直前から、生成結果が取得されUI更新可能になるまでの時間。ユーザーの体感待ち時間に最も近い参考値。 | UI表示のみ |

時間は内部的にはmsで保持し、画面表示では秒に変換する。

## 3. token usage

追加API呼び出しなしでproviderレスポンスから取得できる場合のみ、以下をmetadataとして保存する。

- `inputTokens`
- `outputTokens`
- `totalTokens`

providerがusageを返さない場合は未設定のまま扱う。独自推定値は保存しない。

## 4. 計測条件

- 入力は既存の品質比較と同じ内容を使用する。
- promptVersionは `llm-app-poc-v1` を使用する。
- provider/modelは実行前に固定し、計測中に変更しない。
- 各実LLM providerを最低3回実行する。
- 単発値ではなく中央値を主な比較値にする。
- API側負荷、ネットワーク状態、ローカル実行環境により揺らぐため、結果は絶対性能値ではなく、このPoC条件での参考値として扱う。
- mock-localは参考値として扱い、外部LLM providerとのモデル性能比較には使用しない。

## 5. 評価入力

```text
ユーザーがプロフィール画像を変更できるようにしたい。
画像は5MBまで、jpg/png対応。
変更後は即時反映したい。
失敗時にはエラーメッセージを表示したい。
```

## 6. 履歴照合

`data/generations.json` に保存された最新の各provider 3件について、provider、modelName、promptVersion、createdAt、providerLatencyMs、serverProcessingMs、token usageを確認した。APIキーや入力全文は確認対象に含めていない。

| Provider | Model | History ID | createdAt | providerLatency | serverProcessing | inputTokens | outputTokens | totalTokens |
|---|---|---|---|---:|---:|---:|---:|---:|
| Gemini | `gemini-2.5-flash` | `ffbfe6eb-b1a8-4374-8ae9-515c6a18c43e` | `2026-07-05T01:53:43.755Z` | 14.6 s | 14.6 s | 135 | 1192 | 2946 |
| Gemini | `gemini-2.5-flash` | `4da80e39-b8e6-4daa-9d40-bc1d7ecbe9fd` | `2026-07-05T01:54:29.788Z` | 12.2 s | 12.2 s | 135 | 1279 | 2758 |
| Gemini | `gemini-2.5-flash` | `6c6dc482-7571-45ff-b46b-0c54e16c789a` | `2026-07-05T01:54:59.170Z` | 10.8 s | 10.8 s | 135 | 1347 | 2131 |
| OpenAI | `gpt-5.4-mini` | `263f71d1-cc0b-4923-a3ae-1a279e1674f5` | `2026-07-05T01:56:10.575Z` | 6.9 s | 6.9 s | 343 | 958 | 1301 |
| OpenAI | `gpt-5.4-mini` | `d3fd506c-f09b-4892-be23-bce3ca9ebb77` | `2026-07-05T01:56:41.384Z` | 7.0 s | 7.0 s | 343 | 1181 | 1524 |
| OpenAI | `gpt-5.4-mini` | `413ab9f2-5853-4782-81ea-240a08ba3432` | `2026-07-05T01:56:58.629Z` | 6.1 s | 6.2 s | 343 | 1100 | 1443 |
| Anthropic | `claude-haiku-4-5-20251001` | `03e71d84-3bca-407d-8d6c-cf0d5d569102` | `2026-07-05T01:58:33.934Z` | 9.7 s | 9.7 s | 746 | 1080 | 1826 |
| Anthropic | `claude-haiku-4-5-20251001` | `6c2759db-2491-421f-88cc-28229943d2b6` | `2026-07-05T01:59:03.684Z` | 11.2 s | 11.3 s | 746 | 1223 | 1969 |
| Anthropic | `claude-haiku-4-5-20251001` | `9e48ed65-b814-485c-8f6c-e891a0cc34d4` | `2026-07-05T01:59:29.507Z` | 12.1 s | 12.1 s | 746 | 1371 | 2117 |

上記の履歴値は、画面で記録した実測値と秒1桁表示で一致した。`clientElapsedMs` はUI表示のみの値であり、履歴には保存していない。

## 7. provider別レイテンシ結果

| Provider | Model | Run 1 provider latency | Run 2 provider latency | Run 3 provider latency | Median provider latency | Median server processing | Median client elapsed | Median output tokens |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| Gemini | `gemini-2.5-flash` | 14.6 s | 12.2 s | 10.8 s | 12.2 s | 12.2 s | 12.2 s | 1279 |
| OpenAI | `gpt-5.4-mini` | 6.9 s | 7.0 s | 6.1 s | 6.9 s | 6.9 s | 7.0 s | 1100 |
| Anthropic | `claude-haiku-4-5-20251001` | 9.7 s | 11.2 s | 12.1 s | 11.2 s | 11.3 s | 11.3 s | 1223 |

詳細:

| Provider | Run | provider latency | server processing | client elapsed | inputTokens | outputTokens | totalTokens |
|---|---:|---:|---:|---:|---:|---:|---:|
| Gemini | 1 | 14.6 s | 14.6 s | 15.0 s | 135 | 1192 | 2946 |
| Gemini | 2 | 12.2 s | 12.2 s | 12.2 s | 135 | 1279 | 2758 |
| Gemini | 3 | 10.8 s | 10.8 s | 10.8 s | 135 | 1347 | 2131 |
| OpenAI | 1 | 6.9 s | 6.9 s | 7.2 s | 343 | 958 | 1301 |
| OpenAI | 2 | 7.0 s | 7.0 s | 7.0 s | 343 | 1181 | 1524 |
| OpenAI | 3 | 6.1 s | 6.2 s | 6.2 s | 343 | 1100 | 1443 |
| Anthropic | 1 | 9.7 s | 9.7 s | 9.9 s | 746 | 1080 | 1826 |
| Anthropic | 2 | 11.2 s | 11.3 s | 11.3 s | 746 | 1223 | 1969 |
| Anthropic | 3 | 12.1 s | 12.1 s | 12.1 s | 746 | 1371 | 2117 |

## 8. 実測結果の分析

- `providerLatencyMs` と `serverProcessingMs` はほぼ同値だった。
- サーバー側のJSON parse、Zod validation、履歴保存などの追加処理は、今回の待ち時間の主要ボトルネックではない。
- `clientElapsedMs` と `serverProcessingMs` の差も小さく、画面上の待ち時間は主にLLM provider応答待ち時間による。
- Geminiでは最大15.0秒のclient elapsedを観測した。
- OpenAIはmedian client elapsedが7.0秒で、今回の3 provider中最短だった。
- Claudeはmedian client elapsedが11.3秒だった。
- Geminiはmedian client elapsedが12.2秒だった。

この結果は、今回の特定入力、`llm-app-poc-v1`、現在のGenerationOutput schema、各provider 3回の実行、現在のネットワーク/API側状況に限定された観測である。provider企業全体やモデル一般の優劣を示すものではない。

## 9. 品質・レイテンシ比較

| Provider / Model | Quality score | Median provider latency | Median client elapsed | Observed characteristic |
|---|---:|---:|---:|---|
| Gemini 2.5 Flash | 4.4 / 5 | 12.2 s | 12.2 s | 運用・リスク観点 |
| OpenAI gpt-5.4-mini | 4.6 / 5 | 6.9 s | 7.0 s | Jira分解・実装タスク化 |
| Claude Haiku 4.5 | 4.9 / 5 | 11.2 s | 11.3 s | 実装準備資料の網羅性 |

今回の特定タスクでは、Claude Haiku 4.5が最も高い品質評価だった。一方で、OpenAI gpt-5.4-miniは品質4.6 / 5を維持しながら、median client elapsed 7.0秒で最短だったため、品質と応答時間のバランスが良かった。

## 10. token usageの注意点

token usageは、各providerが返したusage metadataをそのまま記録している。追加API呼び出しや独自推定は行っていない。

Geminiの`totalTokens`は、表示されている`inputTokens + outputTokens`と一致しないrunがある。そのため、provider間で`totalTokens`を同一定義と仮定した単純比較は行わない。token比較では、主に`inputTokens`と`outputTokens`を個別に確認する。

この差異について、今回のデータだけから内部要因を断定しない。

## 11. 最適化候補

| 優先度 | 候補 | 理由 |
|---|---|---|
| 1 | UIの待機状態改善、経過時間表示、待機案内の追加 | 体感待ち時間はprovider応答待ちが支配的なため、まずユーザーの不安を減らす。 |
| 2 | provider/model選定方針の整理 | 今回のタスクではOpenAIが品質/latencyバランス良好だったため、用途ごとの選定に反映する。 |
| 3 | streamingの技術検討 | 待ち時間改善の候補だが、Structured JSON、JSON parse、Zod validationとの整合性が必要なため即実装はしない。 |
| 4 | output token削減、prompt/schema見直し | レイテンシ改善の可能性はあるが、生成品質への影響を評価してから行う。 |
| 低 | server-side micro optimization | 今回はprovider latencyが支配的で、サーバー側追加処理は主要ボトルネックではない。 |

この段階では最適化実装は行わない。

## 12. 実測手順

1. 通常のローカルPowerShellからNext.js dev serverを起動する。
2. `.env.local` の `LLM_PROVIDER` とmodel設定を対象providerに切り替える。
3. 画面で評価入力を送信する。
4. 生成結果のProvider latency、Server processing、Client elapsedを記録する。
5. 同じprovider/modelで最低3回繰り返す。
6. provider/modelごとに中央値を算出し、結果表へ記録する。

APIキー、`.env.local`、`data/generations.json` は公開資料やコミットに含めない。
