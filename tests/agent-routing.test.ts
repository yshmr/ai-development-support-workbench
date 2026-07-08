import { describe, expect, it } from "vitest";
import {
  analyzeAgentRoutingSignals,
  agentRoutingDecisionSchema,
  agentRoutingCandidatePolicyVersion,
  agentRoutingPolicyVersion,
  createAgentRoutingCandidateDecision,
  createAgentRoutingDecision
} from "@/lib/agent/routing";
import {
  loadAgentRoutingCalibrationCases,
  runAgentRoutingDryRunCalibration
} from "@/lib/agent/routing-calibration";
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

describe("Agent Phase 2-B routing dry-run calibration", () => {
  it("keeps the candidate policy separate from the Phase 2-A policy", () => {
    const input = {
      requirementMemo:
        "プロフィール画像を差し替えるとき、保存に成功してから参照先を切り替えたい。失敗時は旧画像を維持し、確認事項も整理したい。"
    };
    const baselineDecision = createAgentRoutingDecision(input);
    const candidateDecision = createAgentRoutingCandidateDecision(input);

    expect(baselineDecision.policyVersion).toBe(agentRoutingPolicyVersion);
    expect(candidateDecision.policyVersion).toBe(
      agentRoutingCandidatePolicyVersion
    );
    expect(candidateDecision.signals.candidateScore).toBeGreaterThanOrEqual(4);
    expect(candidateDecision.mode).toBe("agent_workflow");
  });

  it("routes low-risk calibration-style requests to single-pass", () => {
    const decision = createAgentRoutingCandidateDecision({
      requirementMemo: "設定画面の保存ボタンの文言を「保存する」に変更したい。"
    });

    expect(decision.mode).toBe("single_pass");
    expect(decision.signals.candidateScore).toBe(0);
    expect(JSON.stringify(decision)).not.toContain("保存ボタン");
  });

  it("routes notification exception policy to Agent workflow", () => {
    const decision = createAgentRoutingCandidateDecision({
      requirementMemo:
        "ユーザーがメール通知を無効化できるようにしたい。ただしセキュリティ通知やパスワード変更通知は止めないようにしたい。停止対象と必須通知の例外が矛盾しないように整理したい。"
    });

    expect(decision.mode).toBe("agent_workflow");
    expect(decision.signals.notificationExceptionMarkerCount).toBeGreaterThanOrEqual(
      3
    );
    expect(decision.reasons).toContain(
      "candidate score reached Agent workflow threshold"
    );
  });

  it("passes the public-safe dry-run calibration gate", async () => {
    const cases = await loadAgentRoutingCalibrationCases();
    const calibration = runAgentRoutingDryRunCalibration(cases);

    expect(calibration.summary.totalCases).toBe(8);
    expect(calibration.summary.actualModeCounts.single_pass).toBeGreaterThanOrEqual(
      2
    );
    expect(
      calibration.summary.actualModeCounts.agent_workflow
    ).toBeGreaterThanOrEqual(2);
    expect(calibration.summary.lowRiskAvoidanceRate).toBe(1);
    expect(calibration.summary.highRiskRouteRate).toBe(1);
    expect(calibration.summary.gatePassed).toBe(true);
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
