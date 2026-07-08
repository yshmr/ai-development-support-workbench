import { createAgentContractChecklist } from "@/lib/agent/contract-checklist";
import { createAgentRoutingContractCandidateDecision } from "@/lib/agent/routing";
import { loadAgentRoutingContractCalibrationCases } from "@/lib/agent/routing-calibration";

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

    console.info(
      [
        testCase.caseId,
        decision.mode,
        String(decision.signals.lightweightChecklistRecommended ?? false),
        checklist.items.map((item) => item.category).join(",") || "none"
      ].join(" | ")
    );
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
