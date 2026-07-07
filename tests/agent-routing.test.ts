import { describe, expect, it } from "vitest";
import {
  analyzeAgentRoutingSignals,
  agentRoutingDecisionSchema,
  agentRoutingPolicyVersion,
  createAgentRoutingDecision
} from "@/lib/agent/routing";
import {
  assertNoEvaluationRubricLeak,
  buildAgentRoutingDecisionForEvaluation,
  buildAgentRoutedRequest,
  loadAgentEvaluationCases
} from "@/lib/agent/evaluation";

describe("Agent Phase 2-A deterministic routing policy", () => {
  it("routes low-risk concrete requirements to single-pass generation", () => {
    const decision = createAgentRoutingDecision({
      requirementMemo: "検索結果をステータスで絞り込めるようにしたい。"
    });

    expect(decision).toEqual(
      agentRoutingDecisionSchema.parse({
        mode: "single_pass",
        policyVersion: agentRoutingPolicyVersion,
        reasons: ["requirement appears low-risk enough for single-pass generation"],
        signals: {
          ambiguityMarkerCount: 0,
          clauseCount: 1,
          riskKeywordCount: 0,
          scopeKeywordCount: 0
        }
      })
    );
  });

  it("routes ambiguous scope and safety requirements to Agent workflow", () => {
    const decision = createAgentRoutingDecision({
      requirementMemo:
        "プロフィール周りの画像更新をもっと安全で使いやすくしたい。どこまで対応するべきか整理したい。"
    });

    expect(decision.mode).toBe("agent_workflow");
    expect(decision.reasons).toContain(
      "requirement contains ambiguity or scope-planning markers"
    );
    expect(decision.signals.ambiguityMarkerCount).toBeGreaterThan(0);
    expect(decision.signals.riskKeywordCount).toBeGreaterThan(0);
  });

  it("routes lifecycle and failure-heavy requirements to Agent workflow", () => {
    const decision = createAgentRoutingDecision({
      requirementMemo:
        "プロフィール画像を置き換えるとき、保存失敗や参照先更新失敗で中途半端な状態にしたくない。古い画像や一時ファイルの扱いも整理したい。"
    });

    expect(decision.mode).toBe("agent_workflow");
    expect(decision.reasons).toContain(
      "requirement contains multiple risk or failure markers"
    );
    expect(decision.signals.riskKeywordCount).toBeGreaterThanOrEqual(2);
  });

  it("can include optional evaluation-safe source breadth signals", () => {
    const decision = createAgentRoutingDecision({
      requirementMemo: "プロフィール画像を変更できるようにしたい。",
      expectedSourceBreadth: 5,
      retrievalUniqueDocumentCount: 5
    });

    expect(decision.mode).toBe("agent_workflow");
    expect(decision.signals).toMatchObject({
      expectedSourceBreadth: 5,
      retrievalUniqueDocumentCount: 5
    });
    expect(decision.reasons).toContain(
      "evaluation case expects broad multi-document coverage"
    );
    expect(decision.reasons).toContain(
      "retrieval context spans many unique documents"
    );
  });

  it("keeps routing signals deterministic and free of raw input text", () => {
    const requirementMemo = "安全に整理したい。失敗時も中途半端にしたくない。";
    const first = analyzeAgentRoutingSignals({ requirementMemo });
    const second = analyzeAgentRoutingSignals({ requirementMemo });

    expect(second).toEqual(first);
    expect(JSON.stringify(first)).not.toContain(requirementMemo);
  });
});

describe("Agent Phase 2-A evaluation request helpers", () => {
  it("builds routed requests without leaking evaluation rubric fields", async () => {
    const [testCase] = await loadAgentEvaluationCases();
    const request = buildAgentRoutedRequest(testCase);

    expect(request).toEqual({
      inputText: testCase.requirementMemo,
      agentMode: "auto"
    });
    expect(() => assertNoEvaluationRubricLeak(request)).not.toThrow();
  });

  it("creates routing decisions from requirement memo only for evaluation", async () => {
    const cases = await loadAgentEvaluationCases();
    const ambiguousCase = cases.find((testCase) => testCase.caseId === "AGENT-006");

    expect(ambiguousCase).toBeDefined();
    const decision = buildAgentRoutingDecisionForEvaluation(ambiguousCase!);

    expect(decision.mode).toBe("agent_workflow");
    expect(JSON.stringify(decision)).not.toContain("importantExpectedRules");
    expect(JSON.stringify(decision)).not.toContain("expectedRelevantDocumentIds");
  });
});
