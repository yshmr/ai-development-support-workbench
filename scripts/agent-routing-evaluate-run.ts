import { loadRagCliEnv } from "@/lib/rag/cli";
import {
  agentRoutingEvaluationBlindBundlePath,
  agentRoutingEvaluationManualScoreTemplatePath,
  agentRoutingEvaluationRawBundlePath,
  agentRoutingEvaluationSampleMappingPath,
  assertRoutingEvaluationBundleIsScorable,
  assertBlindBundleHasNoModeLeak,
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
  console.info("Agent Phase 2-A routing evaluation started.");
  console.info("This executes 24 real evaluation runs and can take several minutes.");

  const rawBundle = await executeAgentRoutingEvaluationRunPlan({
    cases,
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

  await writeJsonFile(agentRoutingEvaluationRawBundlePath, rawBundle);
  assertRoutingEvaluationBundleIsScorable(rawBundle);

  const { blindBundle, mappingFile } =
    createBlindRoutingBundleAndMapping(rawBundle);
  assertBlindBundleHasNoModeLeak(blindBundle);

  await writeJsonFile(agentRoutingEvaluationBlindBundlePath, blindBundle);
  await writeJsonFile(agentRoutingEvaluationSampleMappingPath, mappingFile);
  await writeTextFile(
    agentRoutingEvaluationManualScoreTemplatePath,
    createManualScoreTemplate(blindBundle)
  );

  const offRuns = rawBundle.runs.filter((run) => run.mode === "off").length;
  const onRuns = rawBundle.runs.filter((run) => run.mode === "on").length;
  const routedRuns = rawBundle.runs.filter((run) => run.mode === "routed").length;
  const failedRuns = rawBundle.runs.filter((run) => run.status === "failed").length;

  console.info("Agent Phase 2-A routing evaluation run bundle created.");
  console.info(`totalElapsedMs=${Date.now() - startedAtMs}`);
  console.info(
    `totalRuns=${rawBundle.runs.length} offRuns=${offRuns} onRuns=${onRuns} routedRuns=${routedRuns}`
  );
  console.info(`failedRuns=${failedRuns}`);
  console.info(`rawBundle=${agentRoutingEvaluationRawBundlePath}`);
  console.info(`blindBundle=${agentRoutingEvaluationBlindBundlePath}`);
  console.info(`sampleMapping=${agentRoutingEvaluationSampleMappingPath}`);
  console.info(
    `manualScoreTemplate=${agentRoutingEvaluationManualScoreTemplatePath}`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
