import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { generationOutputSchema } from "@/lib/schema";
import {
  auditAgentContractChecklistCoverage,
  createAgentContractChecklist,
  type ContractChecklistAudit
} from "./contract-checklist";
import { createAgentRoutingContractCandidateDecision } from "./routing";
import {
  agentRoutingCalibrationCaseSchema,
  agentRoutingContractCalibrationCasesPath,
  validateAgentRoutingCalibrationCases,
  type AgentRoutingCalibrationCase
} from "./routing-calibration";

export const agentContractChecklistSyntheticOutputsPath = path.join(
  process.cwd(),
  "data",
  "agent",
  "evaluation",
  "agent_contract_checklist_synthetic_outputs.json"
);

export const contractChecklistSyntheticOutputPairSchema = z.object({
  caseId: z.string().regex(/^ROUTE-CONTRACT-\d{3}$/),
  baselineOutput: generationOutputSchema,
  checklistOutput: generationOutputSchema
});

export const contractChecklistSyntheticOutputPairsSchema = z
  .array(contractChecklistSyntheticOutputPairSchema)
  .min(1);
const contractChecklistEvaluationCasesSchema = z
  .array(agentRoutingCalibrationCaseSchema)
  .min(1);

export type ContractChecklistSyntheticOutputPair = z.infer<
  typeof contractChecklistSyntheticOutputPairSchema
>;

export type ContractChecklistEvaluationCaseResult = {
  caseId: string;
  title: string;
  baselineAudit: ContractChecklistAudit;
  checklistAudit: ContractChecklistAudit;
  coveredDelta: number;
  needsReviewDelta: number;
};

export type ContractChecklistEvaluationSummary = {
  policyVersion: "contract-detail-checklist-evaluation-v1";
  totalCases: number;
  baselineCoveredCount: number;
  checklistCoveredCount: number;
  coveredDelta: number;
  baselineNeedsReviewCount: number;
  checklistNeedsReviewCount: number;
  needsReviewDelta: number;
  improvedCaseCount: number;
  regressedCaseCount: number;
  gatePassed: boolean;
};

export type ContractChecklistEvaluation = {
  summary: ContractChecklistEvaluationSummary;
  results: ContractChecklistEvaluationCaseResult[];
};

function assertUniqueOutputCaseIds(
  outputs: ContractChecklistSyntheticOutputPair[]
) {
  const seen = new Set<string>();
  const duplicate = outputs.find((output) => {
    if (seen.has(output.caseId)) {
      return true;
    }

    seen.add(output.caseId);
    return false;
  });

  if (duplicate) {
    throw new Error(
      `Contract checklist synthetic outputs contain duplicate caseId: ${duplicate.caseId}`
    );
  }
}

function assertUniqueEvaluationCaseIds(cases: AgentRoutingCalibrationCase[]) {
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
      `Contract checklist evaluation cases contain duplicate caseId: ${duplicate.caseId}`
    );
  }
}

export function validateContractChecklistSyntheticOutputPairs(
  outputs: ContractChecklistSyntheticOutputPair[]
): ContractChecklistSyntheticOutputPair[] {
  const parsedOutputs = contractChecklistSyntheticOutputPairsSchema.parse(outputs);
  assertUniqueOutputCaseIds(parsedOutputs);
  return parsedOutputs;
}

export function validateContractChecklistEvaluationCases(
  cases: AgentRoutingCalibrationCase[]
): AgentRoutingCalibrationCase[] {
  const parsedCases = contractChecklistEvaluationCasesSchema
    .parse(cases)
    .filter((testCase) => testCase.expectedLightweightChecklist === true);
  assertUniqueEvaluationCaseIds(parsedCases);
  return parsedCases;
}

export async function loadContractChecklistSyntheticOutputPairs(
  filePath = agentContractChecklistSyntheticOutputsPath
): Promise<ContractChecklistSyntheticOutputPair[]> {
  const raw = await readFile(filePath, "utf8");
  return validateContractChecklistSyntheticOutputPairs(JSON.parse(raw));
}

export async function loadContractChecklistEvaluationCases(
  filePath = agentRoutingContractCalibrationCasesPath
): Promise<AgentRoutingCalibrationCase[]> {
  const raw = await readFile(filePath, "utf8");
  return validateAgentRoutingCalibrationCases(JSON.parse(raw)).filter(
    (testCase) => testCase.expectedLightweightChecklist === true
  );
}

export function runContractChecklistSyntheticEvaluation(input: {
  cases: AgentRoutingCalibrationCase[];
  outputs: ContractChecklistSyntheticOutputPair[];
}): ContractChecklistEvaluation {
  const cases = validateContractChecklistEvaluationCases(input.cases);
  const outputs = validateContractChecklistSyntheticOutputPairs(input.outputs);
  const outputByCaseId = new Map(outputs.map((output) => [output.caseId, output]));

  const results = cases.map((testCase) => {
    const outputPair = outputByCaseId.get(testCase.caseId);

    if (!outputPair) {
      throw new Error(
        `Missing contract checklist synthetic outputs for caseId: ${testCase.caseId}`
      );
    }

    const routingDecision = createAgentRoutingContractCandidateDecision({
      requirementMemo: testCase.requirementMemo
    });
    const checklist = createAgentContractChecklist({
      requirementMemo: testCase.requirementMemo,
      routingDecision
    });

    if (!checklist.recommended) {
      throw new Error(
        `Contract checklist was not recommended for expected caseId: ${testCase.caseId}`
      );
    }

    const baselineAudit = auditAgentContractChecklistCoverage({
      checklist,
      output: outputPair.baselineOutput
    });
    const checklistAudit = auditAgentContractChecklistCoverage({
      checklist,
      output: outputPair.checklistOutput
    });

    return {
      caseId: testCase.caseId,
      title: testCase.title,
      baselineAudit,
      checklistAudit,
      coveredDelta: checklistAudit.coveredCount - baselineAudit.coveredCount,
      needsReviewDelta:
        checklistAudit.needsReviewCount - baselineAudit.needsReviewCount
    };
  });
  const baselineCoveredCount = results.reduce(
    (sum, result) => sum + result.baselineAudit.coveredCount,
    0
  );
  const checklistCoveredCount = results.reduce(
    (sum, result) => sum + result.checklistAudit.coveredCount,
    0
  );
  const baselineNeedsReviewCount = results.reduce(
    (sum, result) => sum + result.baselineAudit.needsReviewCount,
    0
  );
  const checklistNeedsReviewCount = results.reduce(
    (sum, result) => sum + result.checklistAudit.needsReviewCount,
    0
  );
  const improvedCaseCount = results.filter(
    (result) => result.coveredDelta > 0 && result.needsReviewDelta < 0
  ).length;
  const regressedCaseCount = results.filter(
    (result) => result.coveredDelta < 0 || result.needsReviewDelta > 0
  ).length;

  return {
    summary: {
      policyVersion: "contract-detail-checklist-evaluation-v1",
      totalCases: results.length,
      baselineCoveredCount,
      checklistCoveredCount,
      coveredDelta: checklistCoveredCount - baselineCoveredCount,
      baselineNeedsReviewCount,
      checklistNeedsReviewCount,
      needsReviewDelta: checklistNeedsReviewCount - baselineNeedsReviewCount,
      improvedCaseCount,
      regressedCaseCount,
      gatePassed:
        results.length > 0 &&
        checklistCoveredCount > baselineCoveredCount &&
        checklistNeedsReviewCount < baselineNeedsReviewCount &&
        regressedCaseCount === 0
    },
    results
  };
}

export function formatContractChecklistSyntheticEvaluation(
  evaluation: ContractChecklistEvaluation
): string {
  const rows = evaluation.results.map((result) =>
    [
      result.caseId,
      result.baselineAudit.coveredCount,
      result.checklistAudit.coveredCount,
      result.coveredDelta,
      result.baselineAudit.needsReviewCount,
      result.checklistAudit.needsReviewCount,
      result.needsReviewDelta
    ].join(" | ")
  );

  return [
    "Agent Phase 2-C contract checklist synthetic evaluation",
    "",
    `policyVersion: ${evaluation.summary.policyVersion}`,
    `totalCases: ${evaluation.summary.totalCases}`,
    `baselineCoveredCount: ${evaluation.summary.baselineCoveredCount}`,
    `checklistCoveredCount: ${evaluation.summary.checklistCoveredCount}`,
    `coveredDelta: ${evaluation.summary.coveredDelta}`,
    `baselineNeedsReviewCount: ${evaluation.summary.baselineNeedsReviewCount}`,
    `checklistNeedsReviewCount: ${evaluation.summary.checklistNeedsReviewCount}`,
    `needsReviewDelta: ${evaluation.summary.needsReviewDelta}`,
    `improvedCaseCount: ${evaluation.summary.improvedCaseCount}`,
    `regressedCaseCount: ${evaluation.summary.regressedCaseCount}`,
    `gatePassed: ${evaluation.summary.gatePassed}`,
    "",
    "caseId | baselineCovered | checklistCovered | coveredDelta | baselineNeedsReview | checklistNeedsReview | needsReviewDelta",
    "---|---:|---:|---:|---:|---:|---:",
    ...rows
  ].join("\n");
}
