import {
  formatAgentRoutingDryRunCalibration,
  loadAgentRoutingContractCalibrationCases,
  runAgentRoutingContractDryRunCalibration
} from "@/lib/agent/routing-calibration";

async function main() {
  const cases = await loadAgentRoutingContractCalibrationCases();
  const calibration = runAgentRoutingContractDryRunCalibration(cases);

  console.info(formatAgentRoutingDryRunCalibration(calibration));

  if (!calibration.summary.gatePassed) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
