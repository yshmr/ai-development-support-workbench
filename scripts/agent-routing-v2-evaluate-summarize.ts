import { loadRagCliEnv } from "@/lib/rag/cli";
import {
  agentRoutingV2EvaluationBlindBundlePath,
  agentRoutingV2EvaluationManualScoresPath,
  agentRoutingV2EvaluationRawBundlePath,
  agentRoutingV2EvaluationReportPath,
  agentRoutingV2EvaluationSampleMappingPath,
  agentRoutingV2EvaluationSummaryPath,
  blindRoutingEvaluationBundleSchema,
  createRoutingEvaluationReportMarkdown,
  createRoutingEvaluationSummary,
  rawRoutingEvaluationBundleSchema,
  readJsonFile,
  routingManualScoresFileSchema,
  routingSampleMappingFileSchema,
  writeJsonFile,
  writeTextFile
} from "@/lib/agent/evaluation";

async function main() {
  loadRagCliEnv();

  const rawBundle = await readJsonFile(
    agentRoutingV2EvaluationRawBundlePath,
    rawRoutingEvaluationBundleSchema
  );
  const blindBundle = await readJsonFile(
    agentRoutingV2EvaluationBlindBundlePath,
    blindRoutingEvaluationBundleSchema
  );
  const mappingFile = await readJsonFile(
    agentRoutingV2EvaluationSampleMappingPath,
    routingSampleMappingFileSchema
  );
  const manualScores = await readJsonFile(
    agentRoutingV2EvaluationManualScoresPath,
    routingManualScoresFileSchema
  );
  const summary = createRoutingEvaluationSummary({
    rawBundle,
    blindBundle,
    mappingFile,
    manualScores
  });
  const report = createRoutingEvaluationReportMarkdown(summary);

  await writeJsonFile(agentRoutingV2EvaluationSummaryPath, summary);
  await writeTextFile(agentRoutingV2EvaluationReportPath, report);

  console.info("Agent Phase 2-B routing v2 evaluation summary created.");
  console.info(`summary=${agentRoutingV2EvaluationSummaryPath}`);
  console.info(`report=${agentRoutingV2EvaluationReportPath}`);
  console.info(
    `offMean=${summary.quality.modeSummary.off.mean ?? "N/A"} onMean=${summary.quality.modeSummary.on.mean ?? "N/A"} routedMean=${summary.quality.modeSummary.routed.mean ?? "N/A"}`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
