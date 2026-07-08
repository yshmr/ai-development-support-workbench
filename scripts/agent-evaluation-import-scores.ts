import path from "node:path";
import {
  blindEvaluationPhaseSchema,
  importAgentBlindEvaluationScores
} from "@/lib/agent/blind-evaluation-package";
import { loadRagCliEnv } from "@/lib/rag/cli";

async function main() {
  loadRagCliEnv();

  const [phaseArg, scoreFilePathArg, outputPathArg] = process.argv.slice(2);

  if (!phaseArg || !scoreFilePathArg) {
    throw new Error(
      "Usage: npm run agent:evaluation:import-scores -- <phase_1_e|phase_2_a|phase_2_b> <scoreFilePath> [outputPath]"
    );
  }

  const phase = blindEvaluationPhaseSchema.parse(phaseArg);
  const result = await importAgentBlindEvaluationScores({
    phase,
    scoreFilePath: path.resolve(scoreFilePathArg),
    outputPath: outputPathArg ? path.resolve(outputPathArg) : undefined
  });

  console.info("Blind evaluation scores imported and validated.");
  console.info(`evaluationId=${result.evaluationId}`);
  console.info(`scoreCount=${result.scoreCount}`);
  console.info(`outputPath=${result.outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
