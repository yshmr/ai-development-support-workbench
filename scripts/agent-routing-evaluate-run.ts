import { loadRagCliEnv } from "@/lib/rag/cli";
import {
  agentRoutingEvaluationBlindBundlePath,
  agentRoutingEvaluationManualScoreTemplatePath,
  agentRoutingEvaluationRawBundlePath,
  agentRoutingEvaluationSampleMappingPath,
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
  const rawBundle = await executeAgentRoutingEvaluationRunPlan({ cases });
  const { blindBundle, mappingFile } =
    createBlindRoutingBundleAndMapping(rawBundle);
  assertBlindBundleHasNoModeLeak(blindBundle);

  await writeJsonFile(agentRoutingEvaluationRawBundlePath, rawBundle);
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
