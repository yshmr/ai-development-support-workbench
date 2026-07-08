import {
  formatContractChecklistSyntheticEvaluation,
  loadContractChecklistEvaluationCases,
  loadContractChecklistSyntheticOutputPairs,
  runContractChecklistSyntheticEvaluation
} from "@/lib/agent/contract-checklist-evaluation";

async function main() {
  const [cases, outputs] = await Promise.all([
    loadContractChecklistEvaluationCases(),
    loadContractChecklistSyntheticOutputPairs()
  ]);
  const evaluation = runContractChecklistSyntheticEvaluation({ cases, outputs });

  console.info(formatContractChecklistSyntheticEvaluation(evaluation));

  if (!evaluation.summary.gatePassed) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
