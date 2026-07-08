import path from "node:path";
import {
  blindEvaluationPhaseSchema,
  exportAgentBlindEvaluationPackage
} from "@/lib/agent/blind-evaluation-package";
import { loadRagCliEnv } from "@/lib/rag/cli";

async function main() {
  loadRagCliEnv();

  const [phaseArg = "phase_2_b", outputDirectoryArg] = process.argv.slice(2);
  const phase = blindEvaluationPhaseSchema.parse(phaseArg);
  const outputDirectory = outputDirectoryArg
    ? path.resolve(outputDirectoryArg)
    : undefined;
  const result = await exportAgentBlindEvaluationPackage({
    phase,
    outputDirectory
  });

  console.info("Context-isolated blind evaluation package exported.");
  console.info(`evaluationId=${result.evaluationId}`);
  console.info(`sampleCount=${result.sampleCount}`);
  console.info(`outputDirectory=${result.outputDirectory}`);
  console.info("Open that directory as a separate blind evaluator workspace.");
  console.info("Write scores to output/manual_scores.json.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
