import { z } from "zod";

export const agentRoutingPolicyVersion = "agent-routing-v1";

export const agentRoutingModeSchema = z.enum([
  "single_pass",
  "agent_workflow"
]);

export const agentRoutingSignalsSchema = z.object({
  ambiguityMarkerCount: z.number().int().nonnegative(),
  clauseCount: z.number().int().nonnegative(),
  riskKeywordCount: z.number().int().nonnegative(),
  scopeKeywordCount: z.number().int().nonnegative(),
  expectedSourceBreadth: z.number().int().nonnegative().optional(),
  retrievalUniqueDocumentCount: z.number().int().nonnegative().optional()
});

export const agentRoutingDecisionSchema = z.object({
  mode: agentRoutingModeSchema,
  policyVersion: z.literal(agentRoutingPolicyVersion),
  reasons: z.array(z.string().min(1)),
  signals: agentRoutingSignalsSchema
});

export type AgentRoutingMode = z.infer<typeof agentRoutingModeSchema>;
export type AgentRoutingSignals = z.infer<typeof agentRoutingSignalsSchema>;
export type AgentRoutingDecision = z.infer<typeof agentRoutingDecisionSchema>;

export type CreateAgentRoutingDecisionInput = {
  requirementMemo: string;
  expectedSourceBreadth?: number;
  retrievalUniqueDocumentCount?: number;
};

const ambiguityMarkers = [
  "どこまで",
  "整理したい",
  "曖昧",
  "検討",
  "確認",
  "方針",
  "未定",
  "決めたい",
  "考慮したい",
  "相談",
  "もっと"
];

const riskKeywords = [
  "失敗",
  "エラー",
  "安全",
  "セキュリティ",
  "中途半端",
  "整合",
  "例外",
  "重要",
  "止めない",
  "壊れた",
  "拒否",
  "rollback",
  "ロールバック",
  "cleanup",
  "クリーンアップ",
  "一時ファイル"
];

const scopeKeywords = [
  "複数",
  "URL共有",
  "ライフサイクル",
  "旧",
  "古い",
  "置き換え",
  "通知",
  "ポリシー",
  "例外",
  "状態"
];

function countKeywordHits(input: string, keywords: string[]): number {
  return keywords.reduce(
    (count, keyword) => count + (input.includes(keyword) ? 1 : 0),
    0
  );
}

function countRequirementClauses(input: string): number {
  return input
    .split(/[\n。.!?！？]+/)
    .map((clause) => clause.trim())
    .filter(Boolean).length;
}

function normalizeOptionalCount(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) {
    return undefined;
  }

  return Math.max(0, Math.floor(value));
}

export function analyzeAgentRoutingSignals({
  requirementMemo,
  expectedSourceBreadth,
  retrievalUniqueDocumentCount
}: CreateAgentRoutingDecisionInput): AgentRoutingSignals {
  return agentRoutingSignalsSchema.parse({
    ambiguityMarkerCount: countKeywordHits(requirementMemo, ambiguityMarkers),
    clauseCount: countRequirementClauses(requirementMemo),
    riskKeywordCount: countKeywordHits(requirementMemo, riskKeywords),
    scopeKeywordCount: countKeywordHits(requirementMemo, scopeKeywords),
    expectedSourceBreadth: normalizeOptionalCount(expectedSourceBreadth),
    retrievalUniqueDocumentCount: normalizeOptionalCount(
      retrievalUniqueDocumentCount
    )
  });
}

export function createAgentRoutingDecision(
  input: CreateAgentRoutingDecisionInput
): AgentRoutingDecision {
  const signals = analyzeAgentRoutingSignals(input);
  const reasons: string[] = [];

  if (signals.ambiguityMarkerCount > 0) {
    reasons.push("requirement contains ambiguity or scope-planning markers");
  }

  if (signals.riskKeywordCount >= 2) {
    reasons.push("requirement contains multiple risk or failure markers");
  }

  if (signals.scopeKeywordCount >= 2) {
    reasons.push("requirement spans multiple scope or policy concerns");
  }

  if ((signals.expectedSourceBreadth ?? 0) >= 5) {
    reasons.push("evaluation case expects broad multi-document coverage");
  }

  if ((signals.retrievalUniqueDocumentCount ?? 0) >= 5) {
    reasons.push("retrieval context spans many unique documents");
  }

  if (
    signals.clauseCount >= 4 &&
    (signals.riskKeywordCount > 0 || signals.scopeKeywordCount > 0)
  ) {
    reasons.push("multi-clause requirement includes risk or scope signals");
  }

  const mode: AgentRoutingMode =
    reasons.length > 0 ? "agent_workflow" : "single_pass";

  return agentRoutingDecisionSchema.parse({
    mode,
    policyVersion: agentRoutingPolicyVersion,
    reasons:
      reasons.length > 0
        ? reasons
        : ["requirement appears low-risk enough for single-pass generation"],
    signals
  });
}
