import { z } from "zod";

export const agentRoutingPolicyVersion = "agent-routing-v1";
export const agentRoutingCandidatePolicyVersion = "agent-routing-v2-candidate";
export const agentRoutingContractCandidatePolicyVersion =
  "agent-routing-v3-contract-candidate";

export const agentRoutingPolicyVersionSchema = z.enum([
  agentRoutingPolicyVersion,
  agentRoutingCandidatePolicyVersion,
  agentRoutingContractCandidatePolicyVersion
]);

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
  retrievalUniqueDocumentCount: z.number().int().nonnegative().optional(),
  lifecycleKeywordCount: z.number().int().nonnegative().optional(),
  unresolvedScopeMarkerCount: z.number().int().nonnegative().optional(),
  notificationExceptionMarkerCount: z.number().int().nonnegative().optional(),
  validationSecurityMarkerCount: z.number().int().nonnegative().optional(),
  queryParameterMarkerCount: z.number().int().nonnegative().optional(),
  enumValueMarkerCount: z.number().int().nonnegative().optional(),
  defaultStateMarkerCount: z.number().int().nonnegative().optional(),
  persistenceMarkerCount: z.number().int().nonnegative().optional(),
  contractDetailScore: z.number().int().nonnegative().optional(),
  lightweightChecklistRecommended: z.boolean().optional(),
  candidateScore: z.number().int().nonnegative().optional()
});

export const agentRoutingDecisionSchema = z.object({
  mode: agentRoutingModeSchema,
  policyVersion: agentRoutingPolicyVersionSchema,
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

const lifecycleKeywords = [
  "ライフサイクル",
  "保存に成功してから",
  "参照先",
  "旧画像",
  "旧",
  "古い",
  "切り替え",
  "切替",
  "置き換え",
  "rollback",
  "ロールバック",
  "cleanup",
  "クリーンアップ",
  "一時ファイル",
  "不完全"
];

const unresolvedScopeMarkers = [
  "どこまで",
  "決まっていない",
  "未定",
  "確認事項",
  "整理したい",
  "方針",
  "相談",
  "検討"
];

const notificationExceptionMarkers = [
  "通知",
  "止めない",
  "例外",
  "ただし",
  "セキュリティ通知",
  "必須通知",
  "重要変更"
];

const validationSecurityMarkers = [
  "不正",
  "内部例外",
  "storage情報",
  "認証header",
  "MIME",
  "画像実体検証",
  "読み込めない",
  "保存しない",
  "セキュリティ"
];

const queryParameterMarkers = [
  "query parameter",
  "クエリパラメータ",
  "クエリ",
  "URL query",
  "URL",
  "status",
  "sort",
  "page",
  "filter"
];

const enumValueMarkers = [
  "open",
  "in_progress",
  "resolved",
  "archived",
  "created_at_desc",
  "relevance",
  "関連度",
  "カンマ",
  "comma",
  "複数ステータス"
];

const defaultStateMarkers = [
  "初期",
  "デフォルト",
  "default",
  "0件",
  "空状態",
  "empty state",
  "並び順",
  "復元"
];

const persistenceMarkers = [
  "保持",
  "復元",
  "共有",
  "URL共有",
  "反映",
  "bookmark",
  "ブックマーク"
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

function addCandidateReason(input: {
  scoreParts: number[];
  reasons: string[];
  score: number;
  reason: string;
}) {
  input.scoreParts.push(input.score);
  input.reasons.push(input.reason);
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

export function createAgentRoutingCandidateDecision(
  input: CreateAgentRoutingDecisionInput
): AgentRoutingDecision {
  const baseSignals = analyzeAgentRoutingSignals(input);
  const lifecycleKeywordCount = countKeywordHits(
    input.requirementMemo,
    lifecycleKeywords
  );
  const unresolvedScopeMarkerCount = countKeywordHits(
    input.requirementMemo,
    unresolvedScopeMarkers
  );
  const notificationExceptionMarkerCount = countKeywordHits(
    input.requirementMemo,
    notificationExceptionMarkers
  );
  const validationSecurityMarkerCount = countKeywordHits(
    input.requirementMemo,
    validationSecurityMarkers
  );
  const scoreParts: number[] = [];
  const reasons: string[] = [];

  if (baseSignals.ambiguityMarkerCount > 0) {
    addCandidateReason({
      scoreParts,
      reasons,
      score: 2,
      reason: "ambiguity or planning marker contributes strong routing evidence"
    });
  }

  if (baseSignals.riskKeywordCount >= 2) {
    addCandidateReason({
      scoreParts,
      reasons,
      score: 1,
      reason: "multiple risk or failure markers contribute weak routing evidence"
    });
  }

  if (baseSignals.scopeKeywordCount >= 2) {
    addCandidateReason({
      scoreParts,
      reasons,
      score: 1,
      reason: "multiple scope markers contribute weak routing evidence"
    });
  }

  if (baseSignals.clauseCount >= 4) {
    addCandidateReason({
      scoreParts,
      reasons,
      score: 1,
      reason: "multi-clause requirement contributes weak routing evidence"
    });
  }

  if ((baseSignals.expectedSourceBreadth ?? 0) >= 5) {
    addCandidateReason({
      scoreParts,
      reasons,
      score: 1,
      reason: "evaluation case expects broad source coverage"
    });
  }

  if ((baseSignals.retrievalUniqueDocumentCount ?? 0) >= 5) {
    addCandidateReason({
      scoreParts,
      reasons,
      score: 1,
      reason: "retrieval context spans many unique documents"
    });
  }

  if (lifecycleKeywordCount > 0) {
    addCandidateReason({
      scoreParts,
      reasons,
      score: 2,
      reason: "lifecycle, rollback, or cleanup domain contributes strong evidence"
    });
  }

  if (unresolvedScopeMarkerCount > 0) {
    addCandidateReason({
      scoreParts,
      reasons,
      score: 2,
      reason: "explicit unresolved scope contributes strong evidence"
    });
  }

  if (notificationExceptionMarkerCount >= 3) {
    addCandidateReason({
      scoreParts,
      reasons,
      score: 2,
      reason: "notification exception policy contributes strong evidence"
    });
  }

  if (validationSecurityMarkerCount >= 2) {
    addCandidateReason({
      scoreParts,
      reasons,
      score: 3,
      reason: "validation or security detail contributes strong evidence"
    });
  }

  const candidateScore = scoreParts.reduce((sum, score) => sum + score, 0);
  const mode: AgentRoutingMode =
    candidateScore >= 4 ? "agent_workflow" : "single_pass";
  const signals = agentRoutingSignalsSchema.parse({
    ...baseSignals,
    lifecycleKeywordCount,
    unresolvedScopeMarkerCount,
    notificationExceptionMarkerCount,
    validationSecurityMarkerCount,
    candidateScore
  });

  return agentRoutingDecisionSchema.parse({
    mode,
    policyVersion: agentRoutingCandidatePolicyVersion,
    reasons:
      reasons.length > 0
        ? [
            ...reasons,
            mode === "agent_workflow"
              ? "candidate score reached Agent workflow threshold"
              : "candidate score stayed below Agent workflow threshold"
          ]
        : ["candidate score stayed below Agent workflow threshold"],
    signals
  });
}

export function createAgentRoutingContractCandidateDecision(
  input: CreateAgentRoutingDecisionInput
): AgentRoutingDecision {
  const candidateDecision = createAgentRoutingCandidateDecision(input);
  const queryParameterMarkerCount = countKeywordHits(
    input.requirementMemo,
    queryParameterMarkers
  );
  const enumValueMarkerCount = countKeywordHits(
    input.requirementMemo,
    enumValueMarkers
  );
  const defaultStateMarkerCount = countKeywordHits(
    input.requirementMemo,
    defaultStateMarkers
  );
  const persistenceMarkerCount = countKeywordHits(
    input.requirementMemo,
    persistenceMarkers
  );
  const contractDetailScore =
    queryParameterMarkerCount +
    enumValueMarkerCount +
    defaultStateMarkerCount +
    persistenceMarkerCount;
  const lightweightChecklistRecommended =
    candidateDecision.mode === "single_pass" && contractDetailScore >= 3;
  const reasons = [...candidateDecision.reasons];

  if (contractDetailScore > 0) {
    reasons.push("contract-detail markers detected for lightweight checklist");
  }

  if (lightweightChecklistRecommended) {
    reasons.push(
      "single-pass route should use contract-detail checklist before finalization"
    );
  }

  const signals = agentRoutingSignalsSchema.parse({
    ...candidateDecision.signals,
    queryParameterMarkerCount,
    enumValueMarkerCount,
    defaultStateMarkerCount,
    persistenceMarkerCount,
    contractDetailScore,
    lightweightChecklistRecommended
  });

  return agentRoutingDecisionSchema.parse({
    ...candidateDecision,
    policyVersion: agentRoutingContractCandidatePolicyVersion,
    reasons,
    signals
  });
}
