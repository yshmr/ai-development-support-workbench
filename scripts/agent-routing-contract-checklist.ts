import {
  auditAgentContractChecklistCoverage,
  createAgentContractChecklist
} from "@/lib/agent/contract-checklist";
import { createAgentRoutingContractCandidateDecision } from "@/lib/agent/routing";
import { loadAgentRoutingContractCalibrationCases } from "@/lib/agent/routing-calibration";
import type { GenerationOutput } from "@/lib/schema";

function sampleCoveredOutput(): GenerationOutput {
  return {
    summary: "検索結果のステータスフィルター要件",
    spec: [
      "URL query parameterのstatusにopen,in_progress,resolved,archivedをcomma separated valueで保持する。",
      "未指定時の初期並び順は関連度順とし、URL再読み込み後も条件を復元する。"
    ],
    acceptanceCriteria: [
      "複数ステータス選択時、status queryがcomma separated valueで更新される。",
      "検索結果が0件の場合は空状態を表示する。",
      "sort未指定時は関連度順で表示する。"
    ],
    jiraTasks: [
      {
        title: "status query filterを実装する",
        description:
          "open,in_progress,resolved,archivedの複数選択とURL query復元を実装する。",
        type: "frontend"
      },
      {
        title: "filter acceptance testsを追加する",
        description:
          "comma separated status、関連度順default、0件empty stateを検証する。",
        type: "test"
      }
    ],
    implementationPlan: [
      "URL queryのparse/serialize helperを既存検索画面に追加する。",
      "reload後もstatus filterを復元する。"
    ],
    reviewPoints: [
      "status enum valuesとquery serializationがspecと一致しているか確認する。",
      "empty stateとdefault sortのテストがあるか確認する。"
    ],
    risks: [
      "未定義status値の扱いは既存API仕様と合わせる必要がある。"
    ]
  };
}

async function main() {
  const cases = await loadAgentRoutingContractCalibrationCases();

  for (const testCase of cases) {
    const decision = createAgentRoutingContractCandidateDecision({
      requirementMemo: testCase.requirementMemo
    });
    const checklist = createAgentContractChecklist({
      requirementMemo: testCase.requirementMemo,
      routingDecision: decision
    });
    const audit =
      checklist.recommended && testCase.caseId === "ROUTE-CONTRACT-001"
        ? auditAgentContractChecklistCoverage({
            checklist,
            output: sampleCoveredOutput()
          })
        : undefined;

    console.info(
      [
        testCase.caseId,
        decision.mode,
        String(decision.signals.lightweightChecklistRecommended ?? false),
        checklist.items.map((item) => item.category).join(",") || "none",
        audit
          ? `audit=${audit.coveredCount}/${audit.items.length}`
          : "audit=N/A"
      ].join(" | ")
    );
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
