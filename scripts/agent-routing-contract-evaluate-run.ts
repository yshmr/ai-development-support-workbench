import { loadRagCliEnv } from "@/lib/rag/cli";
import {
  agentRoutingContractEvaluationBlindBundlePath,
  agentRoutingContractEvaluationManualScoreTemplatePath,
  agentRoutingContractEvaluationRawBundlePath,
  agentRoutingContractEvaluationSampleMappingPath,
  assertBlindBundleHasNoModeLeak,
  assertRoutingEvaluationBundleIsScorable,
  buildAgentRoutingContractDecisionForEvaluation,
  createBlindRoutingBundleAndMapping,
  createManualScoreTemplate,
  executeAgentRoutingEvaluationRunPlan,
  loadAgentEvaluationCases,
  writeJsonFile,
  writeTextFile
} from "@/lib/agent/evaluation";

async function main() {
  loadRagCliEnv();

  const cases = await loadAgentEvaluationCases();
  const startedAtMs = Date.now();
  console.info("Agent Phase 2-D contract checklist evaluation started.");
  console.info("This executes 24 real evaluation runs and can take several minutes.");
  console.info(
    "Routed single-pass runs use agent-routing-v3-contract-candidate and contractChecklistText only when the router recommends it."
  );

  const rawBundle = await executeAgentRoutingEvaluationRunPlan({
    cases,
    evaluationId: "agent-phase-2-d-contract-checklist",
    createRoutingDecision: buildAgentRoutingContractDecisionForEvaluation,
    onRunStart: ({ plannedRun, totalRuns }) => {
      console.info(
        `[${plannedRun.executionOrder}/${totalRuns}] start mode=${plannedRun.mode} case=${plannedRun.caseId} runIndex=${plannedRun.runIndex}`
      );
    },
    onRunComplete: ({ plannedRun, totalRuns, rawRun }) => {
      const routedExecutionMode = rawRun.routedExecutionMode ?? "N/A";
      const checklist =
        rawRun.routing?.signals.lightweightChecklistRecommended === true
          ? "true"
          : "false";
      console.info(
        `[${plannedRun.executionOrder}/${totalRuns}] done mode=${plannedRun.mode} case=${plannedRun.caseId} status=${rawRun.status} routedExecutionMode=${routedExecutionMode} checklist=${checklist} elapsedMs=${rawRun.evaluationElapsedMs}`
      );
    }
  });

  await writeJsonFile(agentRoutingContractEvaluationRawBundlePath, rawBundle);
  assertRoutingEvaluationBundleIsScorable(rawBundle);

  const { blindBundle, mappingFile } =
    createBlindRoutingBundleAndMapping(rawBundle);
  assertBlindBundleHasNoModeLeak(blindBundle);

  await writeJsonFile(agentRoutingContractEvaluationBlindBundlePath, blindBundle);
  await writeJsonFile(
    agentRoutingContractEvaluationSampleMappingPath,
    mappingFile
  );
  await writeTextFile(
    agentRoutingContractEvaluationManualScoreTemplatePath,
    createManualScoreTemplate(blindBundle)
  );

  const offRuns = rawBundle.runs.filter((run) => run.mode === "off").length;
  const onRuns = rawBundle.runs.filter((run) => run.mode === "on").length;
  const routedRuns = rawBundle.runs.filter((run) => run.mode === "routed").length;
  const failedRuns = rawBundle.runs.filter((run) => run.status === "failed").length;
  const checklistRuns = rawBundle.runs.filter(
    (run) => run.routing?.signals.lightweightChecklistRecommended === true
  ).length;

  console.info("Agent Phase 2-D contract checklist evaluation run bundle created.");
  console.info(`totalElapsedMs=${Date.now() - startedAtMs}`);
  console.info(
    `totalRuns=${rawBundle.runs.length} offRuns=${offRuns} onRuns=${onRuns} routedRuns=${routedRuns}`
  );
  console.info(`checklistRecommendedRoutedRuns=${checklistRuns}`);
  console.info(`failedRuns=${failedRuns}`);
  console.info(`rawBundle=${agentRoutingContractEvaluationRawBundlePath}`);
  console.info(`blindBundle=${agentRoutingContractEvaluationBlindBundlePath}`);
  console.info(`sampleMapping=${agentRoutingContractEvaluationSampleMappingPath}`);
  console.info(
    `manualScoreTemplate=${agentRoutingContractEvaluationManualScoreTemplatePath}`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
