import { loadRagCliEnv } from "@/lib/rag/cli";
import {
  agentContractChecklistEvaluationBlindBundlePath,
  agentContractChecklistEvaluationManualScoreTemplatePath,
  agentContractChecklistEvaluationRawBundlePath,
  agentContractChecklistEvaluationSampleMappingPath,
  assertBlindBundleHasNoModeLeak,
  assertContractChecklistEvaluationBundleIsScorable,
  createBlindContractChecklistBundleAndMapping,
  createManualScoreTemplate,
  executeAgentContractChecklistEvaluationRunPlan,
  loadAgentContractTargetCases,
  writeJsonFile,
  writeTextFile
} from "@/lib/agent/evaluation";

async function main() {
  loadRagCliEnv();

  const cases = await loadAgentContractTargetCases();
  const startedAtMs = Date.now();
  console.info("Agent Phase 2-E contract-detail target evaluation started.");
  console.info("This executes 16 real baseline/checklist evaluation runs and can take several minutes.");
  console.info(
    "Both modes use document-diversity-v1 RAG context; checklist mode additionally passes deterministic contractChecklistText."
  );

  const rawBundle = await executeAgentContractChecklistEvaluationRunPlan({
    cases,
    onRunStart: ({ plannedRun, totalRuns }) => {
      console.info(
        `[${plannedRun.executionOrder}/${totalRuns}] start mode=${plannedRun.mode} case=${plannedRun.caseId}`
      );
    },
    onRunComplete: ({ plannedRun, totalRuns, rawRun }) => {
      console.info(
        `[${plannedRun.executionOrder}/${totalRuns}] done mode=${plannedRun.mode} case=${plannedRun.caseId} status=${rawRun.status} checklistRecommended=${rawRun.checklistRecommended} elapsedMs=${rawRun.evaluationElapsedMs}`
      );
    }
  });

  await writeJsonFile(agentContractChecklistEvaluationRawBundlePath, rawBundle);
  assertContractChecklistEvaluationBundleIsScorable(rawBundle);

  const { blindBundle, mappingFile } =
    createBlindContractChecklistBundleAndMapping(rawBundle);
  assertBlindBundleHasNoModeLeak(blindBundle);

  await writeJsonFile(agentContractChecklistEvaluationBlindBundlePath, blindBundle);
  await writeJsonFile(
    agentContractChecklistEvaluationSampleMappingPath,
    mappingFile
  );
  await writeTextFile(
    agentContractChecklistEvaluationManualScoreTemplatePath,
    createManualScoreTemplate(blindBundle)
  );

  const baselineRuns = rawBundle.runs.filter(
    (run) => run.mode === "baseline"
  ).length;
  const checklistRuns = rawBundle.runs.filter(
    (run) => run.mode === "checklist"
  ).length;
  const failedRuns = rawBundle.runs.filter((run) => run.status === "failed").length;

  console.info("Agent Phase 2-E contract-detail target evaluation bundle created.");
  console.info(`totalElapsedMs=${Date.now() - startedAtMs}`);
  console.info(
    `totalRuns=${rawBundle.runs.length} baselineRuns=${baselineRuns} checklistRuns=${checklistRuns}`
  );
  console.info(`failedRuns=${failedRuns}`);
  console.info(`rawBundle=${agentContractChecklistEvaluationRawBundlePath}`);
  console.info(`blindBundle=${agentContractChecklistEvaluationBlindBundlePath}`);
  console.info(
    `sampleMapping=${agentContractChecklistEvaluationSampleMappingPath}`
  );
  console.info(
    `manualScoreTemplate=${agentContractChecklistEvaluationManualScoreTemplatePath}`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
