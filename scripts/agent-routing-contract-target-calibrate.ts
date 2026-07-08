import {
  formatAgentRoutingContractTargetCalibration,
  loadAgentRoutingContractTargetCases,
  runAgentRoutingContractTargetCalibration
} from "@/lib/agent/routing-calibration";

async function main() {
  const cases = await loadAgentRoutingContractTargetCases();
  const calibration = runAgentRoutingContractTargetCalibration(cases);

  console.info(formatAgentRoutingContractTargetCalibration(calibration));

  if (!calibration.summary.gatePassed) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
