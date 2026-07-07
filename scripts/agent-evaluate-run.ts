import { loadRagCliEnv } from "@/lib/rag/cli";
import {
  agentEvaluationBlindBundlePath,
  agentEvaluationManualScoreTemplatePath,
  agentEvaluationRawBundlePath,
  agentEvaluationRevisionPairsPath,
  agentEvaluationSampleMappingPath,
  assertBlindBundleHasNoModeLeak,
  createBlindBundleAndMapping,
  createManualScoreTemplate,
  createRevisionPairs,
  executeAgentEvaluationRunPlan,
  loadAgentEvaluationCases,
  writeJsonFile,
  writeTextFile
} from "@/lib/agent/evaluation";

async function main() {
  loadRagCliEnv();

  const cases = await loadAgentEvaluationCases();
  const rawBundle = await executeAgentEvaluationRunPlan({ cases });
  const { blindBundle, mappingFile } = createBlindBundleAndMapping(rawBundle);
  assertBlindBundleHasNoModeLeak(blindBundle);
  const revisionPairs = createRevisionPairs(rawBundle);

  await writeJsonFile(agentEvaluationRawBundlePath, rawBundle);
  await writeJsonFile(agentEvaluationBlindBundlePath, blindBundle);
  await writeJsonFile(agentEvaluationSampleMappingPath, mappingFile);
  await writeJsonFile(agentEvaluationRevisionPairsPath, revisionPairs);
  await writeTextFile(
    agentEvaluationManualScoreTemplatePath,
    createManualScoreTemplate(blindBundle)
  );

  const offRuns = rawBundle.runs.filter((run) => run.mode === "off").length;
  const onRuns = rawBundle.runs.filter((run) => run.mode === "on").length;
  const failedRuns = rawBundle.runs.filter((run) => run.status === "failed").length;

  console.info("Agent Phase 1-E evaluation run bundle created.");
  console.info(`totalRuns=${rawBundle.runs.length} offRuns=${offRuns} onRuns=${onRuns}`);
  console.info(`failedRuns=${failedRuns}`);
  console.info(`rawBundle=${agentEvaluationRawBundlePath}`);
  console.info(`blindBundle=${agentEvaluationBlindBundlePath}`);
  console.info(`sampleMapping=${agentEvaluationSampleMappingPath}`);
  console.info(`manualScoreTemplate=${agentEvaluationManualScoreTemplatePath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
