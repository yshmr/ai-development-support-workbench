import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  agentRoutingModeSchema,
  createAgentRoutingCandidateDecision,
  createAgentRoutingContractCandidateDecision,
  createAgentRoutingDecision,
  type AgentRoutingDecision,
  type AgentRoutingMode
} from "./routing";

export const agentRoutingCalibrationCasesPath = path.join(
  process.cwd(),
  "data",
  "agent",
  "evaluation",
  "agent_routing_calibration_cases.json"
);
export const agentRoutingContractCalibrationCasesPath = path.join(
  process.cwd(),
  "data",
  "agent",
  "evaluation",
  "agent_routing_contract_calibration_cases.json"
);

export const agentRoutingCalibrationCaseSchema = z.object({
  caseId: z.string().regex(/^ROUTE-(?:CAL|CONTRACT)-\d{3}$/),
  title: z.string().min(1),
  requirementMemo: z.string().min(1),
  expectedRoute: agentRoutingModeSchema,
  expectedLightweightChecklist: z.boolean().optional(),
  rationale: z.string().min(1)
});

export const agentRoutingCalibrationCasesSchema = z
  .array(agentRoutingCalibrationCaseSchema)
  .min(8);

export type AgentRoutingCalibrationCase = z.infer<
  typeof agentRoutingCalibrationCaseSchema
>;

export type AgentRoutingCalibrationResult = {
  caseId: string;
  title: string;
  expectedRoute: AgentRoutingMode;
  actualRoute: AgentRoutingMode;
  passed: boolean;
  expectedLightweightChecklist?: boolean;
  actualLightweightChecklist?: boolean;
  baselineV1Route: AgentRoutingMode;
  candidateDecision: AgentRoutingDecision;
  baselineV1Decision: AgentRoutingDecision;
};

export type AgentRoutingDryRunCalibrationSummary = {
  policyVersion: string;
  totalCases: number;
  expectedModeCounts: Record<AgentRoutingMode, number>;
  actualModeCounts: Record<AgentRoutingMode, number>;
  baselineV1ModeCounts: Record<AgentRoutingMode, number>;
  passCount: number;
  passRate: number;
  singlePassRate: number;
  agentWorkflowRate: number;
  lowRiskAvoidanceRate: number;
  highRiskRouteRate: number;
  checklistExpectationPassRate?: number;
  checklistRecommendedRate?: number;
  gatePassed: boolean;
};

export type AgentRoutingDryRunCalibration = {
  summary: AgentRoutingDryRunCalibrationSummary;
  results: AgentRoutingCalibrationResult[];
};

function assertUniqueCaseIds(cases: AgentRoutingCalibrationCase[]) {
  const seen = new Set<string>();
  const duplicate = cases.find((testCase) => {
    if (seen.has(testCase.caseId)) {
      return true;
    }

    seen.add(testCase.caseId);
    return false;
  });

  if (duplicate) {
    throw new Error(
      `Agent routing calibration cases contain duplicate caseId: ${duplicate.caseId}`
    );
  }
}

function countModes(values: AgentRoutingMode[]): Record<AgentRoutingMode, number> {
  return {
    single_pass: values.filter((value) => value === "single_pass").length,
    agent_workflow: values.filter((value) => value === "agent_workflow").length
  };
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

export function validateAgentRoutingCalibrationCases(
  cases: AgentRoutingCalibrationCase[]
): AgentRoutingCalibrationCase[] {
  const parsedCases = agentRoutingCalibrationCasesSchema.parse(cases);
  assertUniqueCaseIds(parsedCases);
  return parsedCases;
}

export async function loadAgentRoutingCalibrationCases(
  filePath = agentRoutingCalibrationCasesPath
): Promise<AgentRoutingCalibrationCase[]> {
  const raw = await readFile(filePath, "utf8");
  return validateAgentRoutingCalibrationCases(JSON.parse(raw));
}

export async function loadAgentRoutingContractCalibrationCases(
  filePath = agentRoutingContractCalibrationCasesPath
): Promise<AgentRoutingCalibrationCase[]> {
  const raw = await readFile(filePath, "utf8");
  return validateAgentRoutingCalibrationCases(JSON.parse(raw));
}

function runAgentRoutingDryRunCalibrationWithDecision(
  cases: AgentRoutingCalibrationCase[],
  createCandidateDecision: (input: { requirementMemo: string }) => AgentRoutingDecision
): AgentRoutingDryRunCalibration {
  const validatedCases = validateAgentRoutingCalibrationCases(cases);
  const results = validatedCases.map((testCase) => {
    const baselineV1Decision = createAgentRoutingDecision({
      requirementMemo: testCase.requirementMemo
    });
    const candidateDecision = createCandidateDecision({
      requirementMemo: testCase.requirementMemo
    });
    const actualLightweightChecklist =
      candidateDecision.signals.lightweightChecklistRecommended;
    const routePassed = candidateDecision.mode === testCase.expectedRoute;
    const checklistPassed =
      testCase.expectedLightweightChecklist === undefined
        ? true
        : actualLightweightChecklist === testCase.expectedLightweightChecklist;

    return {
      caseId: testCase.caseId,
      title: testCase.title,
      expectedRoute: testCase.expectedRoute,
      actualRoute: candidateDecision.mode,
      passed: routePassed && checklistPassed,
      expectedLightweightChecklist: testCase.expectedLightweightChecklist,
      actualLightweightChecklist,
      baselineV1Route: baselineV1Decision.mode,
      candidateDecision,
      baselineV1Decision
    };
  });
  const expectedModeCounts = countModes(
    results.map((result) => result.expectedRoute)
  );
  const actualModeCounts = countModes(results.map((result) => result.actualRoute));
  const baselineV1ModeCounts = countModes(
    results.map((result) => result.baselineV1Route)
  );
  const passCount = results.filter((result) => result.passed).length;
  const checklistExpectationCases = results.filter(
    (result) => result.expectedLightweightChecklist !== undefined
  );
  const checklistExpectationPassRate =
    checklistExpectationCases.length > 0
      ? ratio(
          checklistExpectationCases.filter(
            (result) =>
              result.actualLightweightChecklist ===
              result.expectedLightweightChecklist
          ).length,
          checklistExpectationCases.length
        )
      : undefined;
  const lowRiskCases = results.filter(
    (result) => result.expectedRoute === "single_pass"
  );
  const highRiskCases = results.filter(
    (result) => result.expectedRoute === "agent_workflow"
  );
  const lowRiskAvoidanceRate = ratio(
    lowRiskCases.filter((result) => result.actualRoute === "single_pass").length,
    lowRiskCases.length
  );
  const highRiskRouteRate = ratio(
    highRiskCases.filter((result) => result.actualRoute === "agent_workflow")
      .length,
    highRiskCases.length
  );
  const totalCases = results.length;
  const singlePassRate = ratio(actualModeCounts.single_pass, totalCases);
  const agentWorkflowRate = ratio(actualModeCounts.agent_workflow, totalCases);
  const checklistRecommendedRate =
    checklistExpectationCases.length > 0
      ? ratio(
          results.filter((result) => result.actualLightweightChecklist === true)
            .length,
          totalCases
        )
      : undefined;
  const checklistGatePassed =
    checklistExpectationPassRate === undefined ||
    checklistExpectationPassRate === 1;

  return {
    summary: {
      policyVersion:
        results[0]?.candidateDecision.policyVersion ??
        "agent-routing-v2-candidate",
      totalCases,
      expectedModeCounts,
      actualModeCounts,
      baselineV1ModeCounts,
      passCount,
      passRate: ratio(passCount, totalCases),
      singlePassRate,
      agentWorkflowRate,
      lowRiskAvoidanceRate,
      highRiskRouteRate,
      checklistExpectationPassRate,
      checklistRecommendedRate,
      gatePassed:
        singlePassRate >= 0.25 &&
        agentWorkflowRate >= 0.25 &&
        lowRiskAvoidanceRate === 1 &&
        highRiskRouteRate === 1 &&
        checklistGatePassed
    },
    results
  };
}

export function runAgentRoutingDryRunCalibration(
  cases: AgentRoutingCalibrationCase[]
): AgentRoutingDryRunCalibration {
  return runAgentRoutingDryRunCalibrationWithDecision(
    cases,
    createAgentRoutingCandidateDecision
  );
}

export function runAgentRoutingContractDryRunCalibration(
  cases: AgentRoutingCalibrationCase[]
): AgentRoutingDryRunCalibration {
  return runAgentRoutingDryRunCalibrationWithDecision(
    cases,
    createAgentRoutingContractCandidateDecision
  );
}

export function formatAgentRoutingDryRunCalibration(
  calibration: AgentRoutingDryRunCalibration
): string {
  const rows = calibration.results.map((result) => {
    const score = result.candidateDecision.signals.candidateScore ?? 0;
    const checklist =
      result.actualLightweightChecklist === undefined
        ? "N/A"
        : String(result.actualLightweightChecklist);

    return [
      result.caseId,
      result.expectedRoute,
      result.actualRoute,
      result.baselineV1Route,
      String(score),
      checklist,
      result.passed ? "pass" : "fail"
    ].join(" | ");
  });

  return [
    "Agent routing dry-run calibration",
    "",
    `policyVersion: ${calibration.summary.policyVersion}`,
    `totalCases: ${calibration.summary.totalCases}`,
    `passRate: ${calibration.summary.passRate.toFixed(3)}`,
    `singlePassRate: ${calibration.summary.singlePassRate.toFixed(3)}`,
    `agentWorkflowRate: ${calibration.summary.agentWorkflowRate.toFixed(3)}`,
    `lowRiskAvoidanceRate: ${calibration.summary.lowRiskAvoidanceRate.toFixed(3)}`,
    `highRiskRouteRate: ${calibration.summary.highRiskRouteRate.toFixed(3)}`,
    calibration.summary.checklistExpectationPassRate === undefined
      ? undefined
      : `checklistExpectationPassRate: ${calibration.summary.checklistExpectationPassRate.toFixed(3)}`,
    calibration.summary.checklistRecommendedRate === undefined
      ? undefined
      : `checklistRecommendedRate: ${calibration.summary.checklistRecommendedRate.toFixed(3)}`,
    `gatePassed: ${calibration.summary.gatePassed}`,
    "",
    "caseId | expected | actual | baselineV1 | candidateScore | checklist | result",
    "---|---|---|---|---:|---|---",
    ...rows
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");
}
