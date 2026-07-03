import type { GenerationOutput } from "./schema";

const toTopic = (inputText: string) => {
  const firstLine = inputText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  return firstLine?.replace(/[。.!！?？]$/, "") ?? "要件メモ";
};

export function createMockGeneration(inputText: string): GenerationOutput {
  const topic = toTopic(inputText);

  return {
    summary: `${topic}に関する要件を、実装可能な仕様・受け入れ条件・作業チケットに整理します。`,
    spec: [
      "入力された要件メモの制約、成功条件、失敗時の挙動を明示する。",
      "ユーザー操作後の画面反映タイミングとエラー表示方針を仕様として扱う。",
      "フロントエンド、バックエンド、テストで分担できる粒度に分解する。"
    ],
    acceptanceCriteria: [
      "正常な入力では対象機能が期待どおり完了し、ユーザーが結果を確認できる。",
      "制約に反する入力では処理を進めず、原因が分かるエラーメッセージを表示する。",
      "主要な境界値と失敗ケースがテストで確認されている。"
    ],
    jiraTasks: [
      {
        title: "入力・結果表示UIを実装する",
        description:
          "要件に必要な入力フォーム、送信時のローディング、成功・失敗メッセージ、結果表示を実装する。",
        type: "frontend"
      },
      {
        title: "生成APIとバリデーションを実装する",
        description:
          "入力値を検証し、構造化された生成結果を返すAPIと保存処理を実装する。",
        type: "backend"
      },
      {
        title: "正常系・異常系テストを追加する",
        description:
          "空入力、制約違反、正常生成、履歴保存の主要ケースをテストする。",
        type: "test"
      }
    ],
    implementationPlan: [
      "入力スキーマと出力スキーマを先に定義し、APIとUIで共有する。",
      "生成処理はLLM呼び出しとモック生成を同じ戻り値の形に揃える。",
      "履歴保存はMVPではローカルJSONに限定し、後続でDBへ差し替えやすくする。"
    ],
    reviewPoints: [
      "入力バリデーションとエラー表示がユーザーに分かりやすいか。",
      "生成結果がスキーマに合致し、空配列や型ずれを許していないか。",
      "チケット粒度が実装担当者に渡せる具体性になっているか。"
    ],
    risks: [
      "要件メモが曖昧な場合、生成結果に確認事項を残す必要がある。",
      "LLM利用時はモデル差分により表現が揺れるため、スキーマ検証と再試行方針が必要になる。",
      "ローカルJSON保存は同時書き込みや本番運用には向かない。"
    ]
  };
}
