import { loadRagCliEnv } from "@/lib/rag/cli";
import {
  agentRoutingV2EvaluationBlindBundlePath,
  agentRoutingV2EvaluationManualScoreTemplatePath,
  agentRoutingV2EvaluationRawBundlePath,
  agentRoutingV2EvaluationSampleMappingPath,
  assertBlindBundleHasNoModeLeak,
  buildAgentRoutingCandidateDecisionForEvaluation,
  createBlindRoutingBundleAndMapping,
  executeAgentRoutingEvaluationRunPlan,
  loadAgentEvaluationCases,
  writeJsonFile,
  writeTextFile,
  createManualScoreTemplate
} from "@/lib/agent/evaluation";

async function main() {
  loadRagCliEnv();

  const cases = await loadAgentEvaluationCases();
  const startedAtMs = Date.now();
  console.info("Agent Phase 2-B routing v2 evaluation started.");
  console.info("This executes 24 real evaluation runs and can take several minutes.");

  const rawBundle = await executeAgentRoutingEvaluationRunPlan({
    cases,
    evaluationId: "agent-phase-2-b-routing-v2",
    createRoutingDecision: buildAgentRoutingCandidateDecisionForEvaluation,
    onRunStart: ({ plannedRun, totalRuns }) => {
      console.info(
        `[${plannedRun.executionOrder}/${totalRuns}] start mode=${plannedRun.mode} case=${plannedRun.caseId} runIndex=${plannedRun.runIndex}`
      );
    },
    onRunComplete: ({ plannedRun, totalRuns, rawRun }) => {
      const routedExecutionMode = rawRun.routedExecutionMode ?? "N/A";
      console.info(
        `[${plannedRun.executionOrder}/${totalRuns}] done mode=${plannedRun.mode} case=${plannedRun.caseId} status=${rawRun.status} routedExecutionMode=${routedExecutionMode} elapsedMs=${rawRun.evaluationElapsedMs}`
      );
    }
  });
  const { blindBundle, mappingFile } =
    createBlindRoutingBundleAndMapping(rawBundle);
  assertBlindBundleHasNoModeLeak(blindBundle);

  await writeJsonFile(agentRoutingV2EvaluationRawBundlePath, rawBundle);
  await writeJsonFile(agentRoutingV2EvaluationBlindBundlePath, blindBundle);
  await writeJsonFile(agentRoutingV2EvaluationSampleMappingPath, mappingFile);
  await writeTextFile(
    agentRoutingV2EvaluationManualScoreTemplatePath,
    createManualScoreTemplate(blindBundle)
  );

  const offRuns = rawBundle.runs.filter((run) => run.mode === "off").length;
  const onRuns = rawBundle.runs.filter((run) => run.mode === "on").length;
  const routedRuns = rawBundle.runs.filter((run) => run.mode === "routed").length;
  const failedRuns = rawBundle.runs.filter((run) => run.status === "failed").length;

  console.info("Agent Phase 2-B routing v2 evaluation run bundle created.");
  console.info(`totalElapsedMs=${Date.now() - startedAtMs}`);
  console.info(
    `totalRuns=${rawBundle.runs.length} offRuns=${offRuns} onRuns=${onRuns} routedRuns=${routedRuns}`
  );
  console.info(`failedRuns=${failedRuns}`);
  console.info(`rawBundle=${agentRoutingV2EvaluationRawBundlePath}`);
  console.info(`blindBundle=${agentRoutingV2EvaluationBlindBundlePath}`);
  console.info(`sampleMapping=${agentRoutingV2EvaluationSampleMappingPath}`);
  console.info(
    `manualScoreTemplate=${agentRoutingV2EvaluationManualScoreTemplatePath}`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
