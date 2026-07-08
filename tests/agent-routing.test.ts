import { describe, expect, it } from "vitest";
import {
  auditAgentContractChecklistCoverage,
  createAgentContractChecklist,
  formatAgentContractChecklistForPrompt
} from "@/lib/agent/contract-checklist";
import {
  loadContractChecklistEvaluationCases,
  loadContractChecklistSyntheticOutputPairs,
  runContractChecklistSyntheticEvaluation
} from "@/lib/agent/contract-checklist-evaluation";
import type { GenerationOutput } from "@/lib/schema";
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
  loadAgentRoutingContractTargetCases,
  loadAgentRoutingCalibrationCases,
  runAgentRoutingContractTargetCalibration,
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

  it("passes the Phase 2-E target checklist dataset gate", async () => {
    const cases = await loadAgentRoutingContractTargetCases();
    const calibration = runAgentRoutingContractTargetCalibration(cases);

    expect(calibration.summary.policyVersion).toBe(
      agentRoutingContractCandidatePolicyVersion
    );
    expect(calibration.summary.totalCases).toBe(8);
    expect(calibration.summary.expectedChecklistCount).toBe(8);
    expect(calibration.summary.actualChecklistRecommendedCount).toBe(8);
    expect(calibration.summary.routePassCount).toBe(8);
    expect(calibration.summary.checklistPassCount).toBe(8);
    expect(calibration.summary.passRate).toBe(1);
    expect(calibration.summary.checklistRecommendedRate).toBe(1);
    expect(calibration.summary.gatePassed).toBe(true);
    expect(
      calibration.results.every(
        (result) => result.candidateDecision.signals.candidateScore! < 4
      )
    ).toBe(true);
  });
});

describe("Agent Phase 2-C contract-detail checklist foundation", () => {
  function coveredContractOutput(): GenerationOutput {
    return {
      summary: "検索結果のステータスフィルター",
      spec: [
        "URL query parameterのstatusにopen,in_progress,resolved,archivedをcomma separated valueで保持する。",
        "未指定時は関連度順で、URL再読み込み後も条件を復元する。"
      ],
      acceptanceCriteria: [
        "複数ステータス選択時にstatus queryが更新される。",
        "0件の場合は空状態を表示する。",
        "sort未指定時は関連度順で表示する。"
      ],
      jiraTasks: [
        {
          title: "status query filterを実装する",
          description:
            "open,in_progress,resolved,archivedの複数選択、comma separated value、URL復元を扱う。",
          type: "frontend"
        },
        {
          title: "filter contract testsを追加する",
          description:
            "default sort、empty state、query serializationを検証する。",
          type: "test"
        }
      ],
      implementationPlan: [
        "URL queryのparse/serialize helperを追加する。",
        "reload後にstatus filterを復元する。"
      ],
      reviewPoints: [
        "enum values、query parameter、empty state、default sortが仕様と一致するか確認する。"
      ],
      risks: ["未定義status値は既存API仕様と合わせる必要がある。"]
    };
  }

  function weakContractOutput(): GenerationOutput {
    return {
      summary: "検索結果フィルター",
      spec: ["検索結果を絞り込めるようにする。"],
      acceptanceCriteria: ["条件を選ぶと結果が更新される。"],
      jiraTasks: [
        {
          title: "filterを実装する",
          description: "検索条件で結果を更新する。",
          type: "frontend"
        }
      ],
      implementationPlan: ["検索画面の状態を更新する。"],
      reviewPoints: ["結果が更新されることを確認する。"],
      risks: ["仕様の追加確認が必要。"]
    };
  }

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

  it("audits checklist coverage without storing the raw requirement memo", () => {
    const requirementMemo =
      "検索結果をopen、in_progress、resolved、archivedで絞り込みたい。複数ステータスを選べて、URL query parameterのstatusへcomma separated valueとして保持したい。初期並び順は関連度順で、0件のときは空状態を表示したい。";
    const checklist = createAgentContractChecklist({ requirementMemo });
    const audit = auditAgentContractChecklistCoverage({
      checklist,
      output: coveredContractOutput()
    });

    expect(audit.recommended).toBe(true);
    expect(audit.coveredCount).toBe(5);
    expect(audit.needsReviewCount).toBe(0);
    expect(audit.items.every((item) => item.status === "covered")).toBe(true);
    expect(JSON.stringify(audit)).not.toContain("open、in_progress");
  });

  it("formats checklist prompt guidance without the raw requirement memo", () => {
    const requirementMemo =
      "検索結果をopen、in_progress、resolved、archivedで絞り込みたい。複数ステータスを選べて、URL query parameterのstatusへcomma separated valueとして保持したい。初期並び順は関連度順で、0件のときは空状態を表示したい。";
    const checklist = createAgentContractChecklist({ requirementMemo });
    const promptText = formatAgentContractChecklistForPrompt(checklist);

    expect(promptText).toContain("contract-detail-checklist-v1");
    expect(promptText).toContain("CONTRACT-CHECK-001");
    expect(promptText).toContain("query_parameter");
    expect(promptText).not.toContain(requirementMemo);
    expect(promptText).not.toContain("open、in_progress");
  });

  it("marks weak outputs for manual review instead of auto-scoring quality", () => {
    const requirementMemo =
      "検索結果をopen、in_progress、resolved、archivedで絞り込みたい。複数ステータスを選べて、URL query parameterのstatusへcomma separated valueとして保持したい。初期並び順は関連度順で、0件のときは空状態を表示したい。";
    const checklist = createAgentContractChecklist({ requirementMemo });
    const audit = auditAgentContractChecklistCoverage({
      checklist,
      output: weakContractOutput()
    });

    expect(audit.coveredCount).toBeLessThan(audit.items.length);
    expect(audit.needsReviewCount).toBeGreaterThan(0);
    expect(
      audit.items.some((item) => item.status === "needs_review")
    ).toBe(true);
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
    expect(
      auditAgentContractChecklistCoverage({
        checklist,
        output: coveredContractOutput()
      })
    ).toEqual({
      policyVersion: "contract-detail-checklist-audit-v1",
      checklistPolicyVersion: "contract-detail-checklist-v1",
      recommended: false,
      coveredCount: 0,
      needsReviewCount: 0,
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

  it("evaluates synthetic baseline versus checklist outputs locally", async () => {
    const cases = await loadContractChecklistEvaluationCases();
    const outputs = await loadContractChecklistSyntheticOutputPairs();
    const evaluation = runContractChecklistSyntheticEvaluation({
      cases,
      outputs
    });

    expect(evaluation.summary.totalCases).toBe(3);
    expect(evaluation.summary.checklistCoveredCount).toBeGreaterThan(
      evaluation.summary.baselineCoveredCount
    );
    expect(evaluation.summary.checklistNeedsReviewCount).toBeLessThan(
      evaluation.summary.baselineNeedsReviewCount
    );
    expect(evaluation.summary.improvedCaseCount).toBe(3);
    expect(evaluation.summary.regressedCaseCount).toBe(0);
    expect(evaluation.summary.gatePassed).toBe(true);
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
