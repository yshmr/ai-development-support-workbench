import { describe, expect, it, vi } from "vitest";
import { decideRevision } from "@/lib/agent/decision";
import {
  createSequenceReviewer,
  createStaticGenerator,
  createStaticKnowledgeRetrievalTool,
  createStaticPlanner,
  maxRevisionCount,
  runAgentWorkflow,
  type AgentWorkflowDependencies
} from "@/lib/agent/orchestrator";
import {
  canTransitionAgentState,
  isTerminalAgentState,
  transitionAgentState
} from "@/lib/agent/state";
import type {
  AgentPlan,
  AgentReview,
  AgentReviewFinding,
  GenerationOutput,
  KnowledgeRetrievalToolResult
} from "@/lib/agent/schema";

const requirementMemo = `ユーザーがプロフィール画像を変更できるようにしたい。
画像は5MBまで、jpg/png対応。
変更後は即時反映したい。
失敗時にはエラーメッセージを表示したい。`;

const samplePlan: AgentPlan = {
  normalizedGoal: "プロフィール画像を変更できるようにする",
  explicitRequirements: [
    "5MBまでの画像を許可する",
    "JPG/PNGに対応する",
    "変更後に即時反映する",
    "失敗時にエラーメッセージを表示する"
  ],
  constraints: ["既存GenerationOutput schemaを維持する"],
  ambiguities: ["旧画像cleanup policyは要確認"],
  knowledgeNeeds: ["プロフィール画像仕様", "プロフィールAPI仕様"]
};

const sampleKnowledge: KnowledgeRetrievalToolResult = {
  groundedContext: "Synthetic grounded context for profile image update.",
  sources: [
    {
      sourceId: "S1",
      documentId: "profile-image-spec"
    }
  ],
  retrievalMetadata: {
    contextPolicy: "document-diversity-v1",
    selectedChunkCount: 1
  },
  embeddingUsage: {
    promptTokens: 10,
    totalTokens: 10
  }
};

function sampleOutput(overrides: Partial<GenerationOutput> = {}): GenerationOutput {
  return {
    summary: "プロフィール画像変更要件を整理します。",
    spec: ["5MB以下のJPG/PNG画像をアップロードできる。"],
    acceptanceCriteria: [
      "5MB以下のJPG/PNG画像をアップロードするとプロフィール画像が更新される。"
    ],
    jiraTasks: [
      {
        title: "プロフィール画像アップロードUIを実装する",
        description: "画像選択、アップロード、成功時の表示更新を実装する。",
        type: "frontend"
      }
    ],
    implementationPlan: ["API契約とvalidationを確認してからUIを実装する。"],
    reviewPoints: ["5MBとJPG/PNG制約がfrontend/backend/testに反映されているか。"],
    risks: ["旧画像cleanup方針を確認する。"],
    ...overrides
  };
}

function finding(
  severity: AgentReviewFinding["severity"],
  overrides: Partial<AgentReviewFinding> = {}
): AgentReviewFinding {
  return {
    findingId: `${severity}-finding`,
    category: "requirement_coverage",
    severity,
    targetFields: ["acceptanceCriteria", "jiraTasks"],
    message: `${severity} finding`,
    requiredChange: "重要要件をacceptance criteriaとJira taskへ反映する。",
    sourceIds: ["S1"],
    ...overrides
  };
}

function review(findings: AgentReviewFinding[] = []): AgentReview {
  return {
    summary: findings.length > 0 ? "修正が必要です。" : "大きな指摘はありません。",
    findings
  };
}

function createDependencies(input: {
  plan?: unknown;
  knowledge?: unknown;
  draft?: unknown;
  revision?: unknown;
  reviews?: unknown[];
} = {}) {
  const planner = {
    plan: vi.fn(createStaticPlanner(input.plan ?? samplePlan).plan)
  };
  const knowledgeTool = {
    toolName: "knowledge.retrieve" as const,
    invoke: vi.fn(
      createStaticKnowledgeRetrievalTool(input.knowledge ?? sampleKnowledge).invoke
    )
  };
  const staticGenerator = createStaticGenerator({
    draft: input.draft ?? sampleOutput(),
    revision: input.revision ?? sampleOutput({ summary: "修正版です。" })
  });
  const generator = {
    draft: vi.fn(staticGenerator.draft),
    revise: vi.fn(staticGenerator.revise)
  };
  const reviewer = {
    review: vi.fn(createSequenceReviewer(input.reviews ?? [review()]).review)
  };

  return {
    dependencies: {
      planner,
      knowledgeTool,
      generator,
      reviewer
    } satisfies AgentWorkflowDependencies,
    planner,
    knowledgeTool,
    generator,
    reviewer
  };
}

describe("Agent state transitions", () => {
  it("allows only explicit transitions", () => {
    expect(canTransitionAgentState("initialized", "planning")).toBe(true);
    expect(canTransitionAgentState("planning", "retrieving")).toBe(true);
    expect(canTransitionAgentState("deciding", "revising")).toBe(true);
    expect(canTransitionAgentState("finalizing", "completed")).toBe(true);
  });

  it("rejects invalid transitions", () => {
    expect(() => transitionAgentState("initialized", "reviewing")).toThrow(
      "initialized -> reviewing"
    );
    expect(() => transitionAgentState("reviewing", "drafting")).toThrow(
      "reviewing -> drafting"
    );
    expect(() => transitionAgentState("completed", "planning")).toThrow(
      "completed -> planning"
    );
  });

  it("treats completed, completed_with_findings, and failed as terminal", () => {
    expect(isTerminalAgentState("completed")).toBe(true);
    expect(isTerminalAgentState("completed_with_findings")).toBe(true);
    expect(isTerminalAgentState("failed")).toBe(true);
    expect(() => transitionAgentState("failed", "planning")).toThrow(
      "failed -> planning"
    );
  });
});

describe("deterministic revision decision", () => {
  it("passes when there are no findings", () => {
    expect(decideRevision(review())).toBe("pass");
  });

  it("passes when findings are minor only", () => {
    expect(decideRevision(review([finding("minor")]))).toBe("pass");
  });

  it("revises when a major finding exists", () => {
    expect(decideRevision(review([finding("major")]))).toBe("revise");
  });

  it("revises when a blocker finding exists", () => {
    expect(decideRevision(review([finding("blocker")]))).toBe("revise");
  });

  it("revises when minor and major findings are mixed", () => {
    expect(decideRevision(review([finding("minor"), finding("major")]))).toBe(
      "revise"
    );
  });
});

describe("Agent workflow orchestrator", () => {
  it("completes the happy path when first review passes", async () => {
    const { dependencies, knowledgeTool, generator } = createDependencies();

    const result = await runAgentWorkflow({
      requirementMemo,
      dependencies
    });

    expect(result.metadata.status).toBe("completed");
    expect(result.metadata.finalState).toBe("completed");
    expect(result.metadata.terminationReason).toBe("review_passed");
    expect(result.metadata.revisionCount).toBe(0);
    expect(result.metadata.reviewCount).toBe(1);
    expect(result.metadata.toolInvocationCount).toBe(1);
    expect(knowledgeTool.invoke).toHaveBeenCalledTimes(1);
    expect(generator.revise).not.toHaveBeenCalled();
    expect(result.output).toEqual(sampleOutput());
  });

  it("runs one revision when the first review has a major finding", async () => {
    const { dependencies, knowledgeTool, generator } = createDependencies({
      reviews: [review([finding("major")]), review()]
    });

    const result = await runAgentWorkflow({
      requirementMemo,
      dependencies
    });

    expect(result.metadata.status).toBe("completed");
    expect(result.metadata.finalState).toBe("completed");
    expect(result.metadata.terminationReason).toBe("review_passed");
    expect(result.metadata.revisionCount).toBe(1);
    expect(result.metadata.reviewCount).toBe(2);
    expect(result.metadata.toolInvocationCount).toBe(1);
    expect(knowledgeTool.invoke).toHaveBeenCalledTimes(1);
    expect(generator.revise).toHaveBeenCalledTimes(1);
    expect(generator.revise).toHaveBeenCalledWith(
      expect.objectContaining({
        findings: [expect.objectContaining({ severity: "major" })]
      })
    );
  });

  it("returns completed_with_findings when the revision limit is reached", async () => {
    const revisedOutput = sampleOutput({ summary: "修正後も指摘が残ります。" });
    const { dependencies, generator } = createDependencies({
      revision: revisedOutput,
      reviews: [review([finding("major")]), review([finding("major")])]
    });

    const result = await runAgentWorkflow({
      requirementMemo,
      dependencies
    });

    expect(result.metadata.status).toBe("completed_with_findings");
    expect(result.metadata.finalState).toBe("completed_with_findings");
    expect(result.metadata.terminationReason).toBe("revision_limit_reached");
    expect(result.metadata.revisionCount).toBe(1);
    expect(result.metadata.reviewCount).toBe(2);
    expect(generator.revise).toHaveBeenCalledTimes(1);
    expect(result.output).toEqual(revisedOutput);
  });

  it("triggers revision for blocker findings", async () => {
    const { dependencies, generator } = createDependencies({
      reviews: [review([finding("blocker")]), review()]
    });

    const result = await runAgentWorkflow({
      requirementMemo,
      dependencies
    });

    expect(result.metadata.status).toBe("completed");
    expect(result.metadata.revisionCount).toBe(1);
    expect(generator.revise).toHaveBeenCalledTimes(1);
  });

  it("does not revise for minor-only findings", async () => {
    const { dependencies, generator } = createDependencies({
      reviews: [review([finding("minor")])]
    });

    const result = await runAgentWorkflow({
      requirementMemo,
      dependencies
    });

    expect(result.metadata.status).toBe("completed");
    expect(result.metadata.terminationReason).toBe("review_passed");
    expect(result.metadata.revisionCount).toBe(0);
    expect(result.metadata.reviewCount).toBe(1);
    expect(generator.revise).not.toHaveBeenCalled();
  });

  it("fails closed on planner schema failure before generation", async () => {
    const { dependencies, generator } = createDependencies({
      plan: {
        normalizedGoal: "missing arrays"
      }
    });

    const result = await runAgentWorkflow({
      requirementMemo,
      dependencies
    });

    expect(result.metadata.status).toBe("failed");
    expect(result.metadata.finalState).toBe("failed");
    expect(result.metadata.terminationReason).toBe("technical_failure");
    expect(result.error?.stepName).toBe("planning");
    expect(generator.draft).not.toHaveBeenCalled();
  });

  it("fails closed on retrieval tool failure before draft generation", async () => {
    const { dependencies, generator, knowledgeTool } = createDependencies();
    knowledgeTool.invoke.mockImplementationOnce(() => {
      throw new Error("stub retrieval failed");
    });

    const result = await runAgentWorkflow({
      requirementMemo,
      dependencies
    });

    expect(result.metadata.status).toBe("failed");
    expect(result.metadata.finalState).toBe("failed");
    expect(result.error?.stepName).toBe("knowledge_retrieval");
    expect(generator.draft).not.toHaveBeenCalled();
  });

  it("fails closed when retrieval returns zero usable knowledge", async () => {
    const { dependencies, generator } = createDependencies({
      knowledge: {
        groundedContext: "   ",
        sources: [],
        retrievalMetadata: {}
      }
    });

    const result = await runAgentWorkflow({
      requirementMemo,
      dependencies
    });

    expect(result.metadata.status).toBe("failed");
    expect(result.metadata.finalState).toBe("failed");
    expect(result.error?.message).toContain("zero usable knowledge");
    expect(generator.draft).not.toHaveBeenCalled();
  });

  it("fails closed on draft GenerationOutput validation failure before review", async () => {
    const { dependencies, reviewer } = createDependencies({
      draft: {
        summary: "missing arrays"
      }
    });

    const result = await runAgentWorkflow({
      requirementMemo,
      dependencies
    });

    expect(result.metadata.status).toBe("failed");
    expect(result.metadata.finalState).toBe("failed");
    expect(result.error?.stepName).toBe("draft_generation");
    expect(reviewer.review).not.toHaveBeenCalled();
  });

  it("fails closed on AgentReview validation failure before revision", async () => {
    const { dependencies, generator } = createDependencies({
      reviews: [
        {
          summary: "missing findings"
        }
      ]
    });

    const result = await runAgentWorkflow({
      requirementMemo,
      dependencies
    });

    expect(result.metadata.status).toBe("failed");
    expect(result.metadata.finalState).toBe("failed");
    expect(result.error?.stepName).toBe("review");
    expect(generator.revise).not.toHaveBeenCalled();
  });

  it("fails closed on revision GenerationOutput validation failure before second review", async () => {
    const { dependencies, reviewer } = createDependencies({
      revision: {
        summary: "invalid revision"
      },
      reviews: [review([finding("major")]), review()]
    });

    const result = await runAgentWorkflow({
      requirementMemo,
      dependencies
    });

    expect(result.metadata.status).toBe("failed");
    expect(result.metadata.finalState).toBe("failed");
    expect(result.error?.stepName).toBe("revision");
    expect(result.metadata.reviewCount).toBe(1);
    expect(reviewer.review).toHaveBeenCalledTimes(1);
  });

  it("never exceeds maxRevisionCount and never reviews more than twice", async () => {
    const { dependencies, generator } = createDependencies({
      reviews: [
        review([finding("major")]),
        review([finding("major")]),
        review([finding("major")])
      ]
    });

    const result = await runAgentWorkflow({
      requirementMemo,
      dependencies
    });

    expect(maxRevisionCount).toBe(1);
    expect(result.metadata.revisionCount).toBeLessThanOrEqual(1);
    expect(result.metadata.reviewCount).toBeLessThanOrEqual(2);
    expect(generator.revise).toHaveBeenCalledTimes(1);
  });

  it("records happy path step trace in order", async () => {
    const { dependencies } = createDependencies();

    const result = await runAgentWorkflow({
      requirementMemo,
      dependencies
    });

    expect(result.metadata.steps.map((step) => step.stepName)).toEqual([
      "planning",
      "knowledge_retrieval",
      "draft_generation",
      "review",
      "finalization"
    ]);
    expect(result.metadata.steps.map((step) => step.sequence)).toEqual([1, 2, 3, 4, 5]);
    expect(result.metadata.steps.every((step) => step.status === "completed")).toBe(
      true
    );
    expect(result.metadata.steps[3].reviewDecision).toBe("pass");
    expect(result.metadata.llmStepCount).toBe(3);
  });

  it("records revision path step trace in order and does not retrieve twice", async () => {
    const { dependencies, knowledgeTool } = createDependencies({
      reviews: [review([finding("major")]), review()]
    });

    const result = await runAgentWorkflow({
      requirementMemo,
      dependencies
    });

    expect(result.metadata.steps.map((step) => step.stepName)).toEqual([
      "planning",
      "knowledge_retrieval",
      "draft_generation",
      "review",
      "revision",
      "review",
      "finalization"
    ]);
    expect(result.metadata.steps[3].reviewDecision).toBe("revise");
    expect(result.metadata.steps[5].reviewDecision).toBe("pass");
    expect(result.metadata.llmStepCount).toBe(5);
    expect(result.metadata.toolInvocationCount).toBe(1);
    expect(knowledgeTool.invoke).toHaveBeenCalledTimes(1);
  });
});
