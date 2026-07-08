import { describe, expect, it } from "vitest";
import { createAgentContractChecklist } from "@/lib/agent/contract-checklist";
import {
  analyzeAgentRoutingSignals,
  agentRoutingContractCandidatePolicyVersion,
  agentRoutingDecisionSchema,
  agentRoutingCandidatePolicyVersion,
  agentRoutingPolicyVersion,
  createAgentRoutingCandidateDecision,
  createAgentRoutingContractCandidateDecision,
  createAgentRoutingDecision
} from "@/lib/agent/routing";
import {
  loadAgentRoutingContractCalibrationCases,
  loadAgentRoutingCalibrationCases,
  runAgentRoutingContractDryRunCalibration,
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

describe("Agent Phase 2-C contract-detail routing calibration", () => {
  it("keeps low-risk detail-dense requirements on single-pass with checklist signal", () => {
    const decision = createAgentRoutingContractCandidateDecision({
      requirementMemo:
        "検索結果をopen、in_progress、resolved、archivedで絞り込みたい。複数ステータスを選べて、URL query parameterのstatusへcomma separated valueとして保持したい。初期並び順は関連度順で、0件のときは空状態を表示したい。"
    });

    expect(decision.policyVersion).toBe(
      agentRoutingContractCandidatePolicyVersion
    );
    expect(decision.mode).toBe("single_pass");
    expect(decision.signals.candidateScore).toBeLessThan(4);
    expect(decision.signals.contractDetailScore).toBeGreaterThanOrEqual(3);
    expect(decision.signals.lightweightChecklistRecommended).toBe(true);
    expect(decision.reasons).toContain(
      "single-pass route should use contract-detail checklist before finalization"
    );
    expect(JSON.stringify(decision)).not.toContain("open、in_progress");
  });

  it("does not recommend checklist for copy-only single-pass requirements", () => {
    const decision = createAgentRoutingContractCandidateDecision({
      requirementMemo: "設定画面の保存ボタンの文言を「保存する」に変更したい。"
    });

    expect(decision.mode).toBe("single_pass");
    expect(decision.signals.contractDetailScore).toBe(0);
    expect(decision.signals.lightweightChecklistRecommended).toBe(false);
  });

  it("keeps lifecycle and validation cases on Agent workflow without checklist-only handling", () => {
    const lifecycleDecision = createAgentRoutingContractCandidateDecision({
      requirementMemo:
        "プロフィール画像を差し替えるとき、保存に成功してから参照先を切り替えたい。失敗時は旧画像を維持し、不完全な一時ファイルを残さないようにしたい。旧画像の削除方針も確認事項として整理したい。"
    });
    const validationDecision = createAgentRoutingContractCandidateDecision({
      requirementMemo:
        "プロフィール画像アップロードで、不正な画像を保存しないようにしたい。5MB超過、JPG/PNG以外、画像として読み込めないファイルをそれぞれ分かるエラーにしたい。内部例外やstorage情報は画面に出したくない。"
    });

    expect(lifecycleDecision.mode).toBe("agent_workflow");
    expect(lifecycleDecision.signals.lightweightChecklistRecommended).toBe(false);
    expect(validationDecision.mode).toBe("agent_workflow");
    expect(validationDecision.signals.lightweightChecklistRecommended).toBe(false);
  });

  it("passes the contract-detail routing-only calibration gate", async () => {
    const cases = await loadAgentRoutingContractCalibrationCases();
    const calibration = runAgentRoutingContractDryRunCalibration(cases);

    expect(calibration.summary.policyVersion).toBe(
      agentRoutingContractCandidatePolicyVersion
    );
    expect(calibration.summary.totalCases).toBe(8);
    expect(calibration.summary.passRate).toBe(1);
    expect(calibration.summary.lowRiskAvoidanceRate).toBe(1);
    expect(calibration.summary.highRiskRouteRate).toBe(1);
    expect(calibration.summary.checklistExpectationPassRate).toBe(1);
    expect(calibration.summary.checklistRecommendedRate).toBe(0.375);
    expect(calibration.summary.gatePassed).toBe(true);
  });
});

describe("Agent Phase 2-C contract-detail checklist foundation", () => {
  it("creates deterministic checklist items for low-risk query contract cases", () => {
    const requirementMemo =
      "検索結果をopen、in_progress、resolved、archivedで絞り込みたい。複数ステータスを選べて、URL query parameterのstatusへcomma separated valueとして保持したい。初期並び順は関連度順で、0件のときは空状態を表示したい。";
    const decision = createAgentRoutingContractCandidateDecision({
      requirementMemo
    });
    const checklist = createAgentContractChecklist({
      requirementMemo,
      routingDecision: decision
    });

    expect(checklist.recommended).toBe(true);
    expect(checklist.policyVersion).toBe("contract-detail-checklist-v1");
    expect(checklist.items.map((item) => item.itemId)).toEqual([
      "CONTRACT-CHECK-001",
      "CONTRACT-CHECK-002",
      "CONTRACT-CHECK-003",
      "CONTRACT-CHECK-004",
      "CONTRACT-CHECK-005"
    ]);
    expect(checklist.items.map((item) => item.category)).toEqual([
      "query_parameter",
      "enum_values",
      "default_state",
      "persistence",
      "traceability"
    ]);
    expect(JSON.stringify(checklist)).not.toContain("open、in_progress");
  });

  it("does not create checklist items for copy-only low-risk cases", () => {
    const requirementMemo = "設定画面の保存ボタンの文言を「保存する」に変更したい。";
    const checklist = createAgentContractChecklist({ requirementMemo });

    expect(checklist).toEqual({
      policyVersion: "contract-detail-checklist-v1",
      recommended: false,
      reason: "Contract-detail signal is below the lightweight checklist threshold.",
      items: []
    });
  });

  it("does not use lightweight checklist for Agent workflow cases", () => {
    const requirementMemo =
      "プロフィール画像を差し替えるとき、保存に成功してから参照先を切り替えたい。失敗時は旧画像を維持し、不完全な一時ファイルを残さないようにしたい。旧画像の削除方針も確認事項として整理したい。";
    const decision = createAgentRoutingContractCandidateDecision({
      requirementMemo
    });
    const checklist = createAgentContractChecklist({
      requirementMemo,
      routingDecision: decision
    });

    expect(decision.mode).toBe("agent_workflow");
    expect(checklist.recommended).toBe(false);
    expect(checklist.items).toEqual([]);
    expect(checklist.reason).toBe(
      "Agent workflow route does not use the lightweight contract checklist."
    );
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
