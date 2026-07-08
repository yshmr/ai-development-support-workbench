import { loadRagCliEnv } from "@/lib/rag/cli";
import {
  agentRoutingContractEvaluationBlindBundlePath,
  agentRoutingContractEvaluationManualScoresPath,
  agentRoutingContractEvaluationRawBundlePath,
  agentRoutingContractEvaluationReportPath,
  agentRoutingContractEvaluationSampleMappingPath,
  agentRoutingContractEvaluationSummaryPath,
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
    agentRoutingContractEvaluationRawBundlePath,
    rawRoutingEvaluationBundleSchema
  );
  const blindBundle = await readJsonFile(
    agentRoutingContractEvaluationBlindBundlePath,
    blindRoutingEvaluationBundleSchema
  );
  const mappingFile = await readJsonFile(
    agentRoutingContractEvaluationSampleMappingPath,
    routingSampleMappingFileSchema
  );
  const manualScores = await readJsonFile(
    agentRoutingContractEvaluationManualScoresPath,
    routingManualScoresFileSchema
  );
  const summary = createRoutingEvaluationSummary({
    rawBundle,
    blindBundle,
    mappingFile,
    manualScores
  });
  const report = createRoutingEvaluationReportMarkdown(summary);

  await writeJsonFile(agentRoutingContractEvaluationSummaryPath, summary);
  await writeTextFile(agentRoutingContractEvaluationReportPath, report);

  console.info("Agent Phase 2-D contract checklist evaluation summary created.");
  console.info(`summary=${agentRoutingContractEvaluationSummaryPath}`);
  console.info(`report=${agentRoutingContractEvaluationReportPath}`);
  console.info(
    `offMean=${summary.quality.modeSummary.off.mean ?? "N/A"} onMean=${summary.quality.modeSummary.on.mean ?? "N/A"} routedMean=${summary.quality.modeSummary.routed.mean ?? "N/A"}`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
