import { afterEach, describe, expect, it, vi } from "vitest";
import { decideRevision } from "@/lib/agent/decision";
import { createPassThroughStubReviewer } from "@/lib/agent/executors";
import { createRagKnowledgeRetrievalTool } from "@/lib/agent/knowledge";
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
  agentDraftPromptVersion,
  agentPlannerPromptVersion,
  agentReviewerPromptVersion,
  agentRevisionPromptVersion,
  generateAgentDraft,
  generateAgentPlan,
  generateAgentReview,
  generateAgentRevision
} from "@/lib/agent/provider";
import {
  canTransitionAgentState,
  isTerminalAgentState,
  transitionAgentState
} from "@/lib/agent/state";
import type {
  AgentPlan,
  AgentReview,
  AgentReviewFinding,
  AgentRunRecord,
  GenerationOutput,
  KnowledgeRetrievalToolResult
} from "@/lib/agent/schema";
import type { RetrievedChunk } from "@/lib/rag/schema";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

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

type ProviderUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

function executorResult<T>(
  data: T,
  promptVersion: string,
  usage: ProviderUsage = {
    inputTokens: 1,
    outputTokens: 2,
    totalTokens: 3
  }
) {
  return {
    __agentExecutorResult: true as const,
    data,
    metadata: {
      provider: "openai",
      modelName: "gpt-5.4-mini",
      promptVersion,
      providerBacked: true,
      providerLatencyMs: 1,
      ...usage
    }
  };
}

function createProviderBackedDependencies(input: {
  reviews: AgentReview[];
  revision?: GenerationOutput;
  revisionSpy?: ReturnType<typeof vi.fn>;
  reviewerUsage?: ProviderUsage;
  revisionUsage?: ProviderUsage;
}) {
  let reviewIndex = 0;
  const revisionOutput = input.revision ?? sampleOutput({ summary: "修正版です。" });
  const revisionSpy = input.revisionSpy ?? vi.fn();

  return {
    planner: {
      plan: vi.fn(() => executorResult(samplePlan, agentPlannerPromptVersion))
    },
    knowledgeTool: {
      toolName: "knowledge.retrieve" as const,
      invoke: vi.fn(() => sampleKnowledge)
    },
    generator: {
      draft: vi.fn(() => executorResult(sampleOutput(), agentDraftPromptVersion)),
      revise: vi.fn((revisionInput) => {
        revisionSpy(revisionInput);
        return executorResult(
          revisionOutput,
          agentRevisionPromptVersion,
          input.revisionUsage
        );
      })
    },
    reviewer: {
      review: vi.fn(() => {
        const selectedReview =
          input.reviews[Math.min(reviewIndex, input.reviews.length - 1)];
        reviewIndex += 1;
        return executorResult(
          selectedReview,
          agentReviewerPromptVersion,
          input.reviewerUsage
        );
      })
    }
  } satisfies AgentWorkflowDependencies;
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
    expect(result.metadata.llmStepCount).toBe(0);
  });

  it("records wall-clock step timestamps separately from monotonic latency", async () => {
    const { dependencies } = createDependencies();
    let elapsedMs = 100;
    let wallClockMs = Date.parse("2026-07-07T12:00:00.000Z");

    vi.stubGlobal("performance", {
      now: vi.fn(() => {
        const currentElapsedMs = elapsedMs;
        elapsedMs += 25;
        return currentElapsedMs;
      })
    });
    vi.spyOn(Date, "now").mockImplementation(() => {
      const currentWallClockMs = wallClockMs;
      wallClockMs += 1000;
      return currentWallClockMs;
    });

    const result = await runAgentWorkflow({
      requirementMemo,
      dependencies
    });
    const firstStep = result.metadata.steps[0];

    expect(result.metadata.steps.map((step) => step.stepName)).toEqual([
      "planning",
      "knowledge_retrieval",
      "draft_generation",
      "review",
      "finalization"
    ]);
    expect(firstStep.startedAt).toBe("2026-07-07T12:00:00.000Z");
    expect(firstStep.completedAt).toBe("2026-07-07T12:00:01.000Z");
    expect(firstStep.latencyMs).toBe(25);
    expect(firstStep.startedAt).not.toMatch(/^1970-01-01/);
    expect(
      result.metadata.steps.every(
        (step) => Date.parse(step.completedAt) >= Date.parse(step.startedAt)
      )
    ).toBe(true);
    expect(result.metadata.steps.map((step) => step.sequence)).toEqual([1, 2, 3, 4, 5]);
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
    expect(result.metadata.llmStepCount).toBe(0);
    expect(result.metadata.toolInvocationCount).toBe(1);
    expect(knowledgeTool.invoke).toHaveBeenCalledTimes(1);
  });
});

describe("Agent Phase 1-D review, revision, and persistence semantics", () => {
  it("counts provider-backed Planner, Draft, and Reviewer on first review pass", async () => {
    const dependencies = createProviderBackedDependencies({
      reviews: [review()]
    });

    const result = await runAgentWorkflow({ requirementMemo, dependencies });

    expect(result.metadata.status).toBe("completed");
    expect(result.metadata.revisionCount).toBe(0);
    expect(result.metadata.reviewCount).toBe(1);
    expect(result.metadata.llmStepCount).toBe(3);
    expect(result.metadata.steps.map((step) => step.stepName)).toEqual([
      "planning",
      "knowledge_retrieval",
      "draft_generation",
      "review",
      "finalization"
    ]);
    expect(result.metadata.steps[3]).toMatchObject({
      providerBacked: true,
      promptVersion: agentReviewerPromptVersion,
      reviewDecision: "pass"
    });
    expect(result.reviewHistory).toHaveLength(1);
    expect(result.reviewHistory[0]).toMatchObject({
      reviewNumber: 1,
      stage: "draft",
      decision: "pass"
    });
  });

  it("runs a targeted revision once for major findings and reuses knowledge", async () => {
    const revisionSpy = vi.fn();
    const dependencies = createProviderBackedDependencies({
      reviews: [review([finding("major")]), review()],
      revisionSpy
    });

    const result = await runAgentWorkflow({ requirementMemo, dependencies });

    expect(result.metadata.status).toBe("completed");
    expect(result.metadata.revisionCount).toBe(1);
    expect(result.metadata.reviewCount).toBe(2);
    expect(result.metadata.llmStepCount).toBe(5);
    expect(result.metadata.toolInvocationCount).toBe(1);
    expect(dependencies.knowledgeTool.invoke).toHaveBeenCalledTimes(1);
    expect(dependencies.generator.revise).toHaveBeenCalledTimes(1);
    expect(result.metadata.steps.map((step) => step.stepName)).toEqual([
      "planning",
      "knowledge_retrieval",
      "draft_generation",
      "review",
      "revision",
      "review",
      "finalization"
    ]);
    expect(result.metadata.steps[4]).toMatchObject({
      providerBacked: true,
      promptVersion: agentRevisionPromptVersion
    });
    expect(result.reviewHistory.map((entry) => entry.stage)).toEqual([
      "draft",
      "revision"
    ]);
    expect(revisionSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        knowledge: sampleKnowledge,
        findings: [expect.objectContaining({ severity: "major" })]
      })
    );
  });

  it("filters revision input to blocker and major findings only", async () => {
    const revisionSpy = vi.fn();
    const dependencies = createProviderBackedDependencies({
      reviews: [
        review([
          finding("minor", { findingId: "minor-1" }),
          finding("major", { findingId: "major-1" }),
          finding("blocker", { findingId: "blocker-1" })
        ]),
        review()
      ],
      revisionSpy
    });

    await runAgentWorkflow({ requirementMemo, dependencies });

    expect(revisionSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        findings: [
          expect.objectContaining({ findingId: "major-1" }),
          expect.objectContaining({ findingId: "blocker-1" })
        ]
      })
    );
    expect(
      revisionSpy.mock.calls[0][0].findings.some(
        (item: AgentReviewFinding) => item.severity === "minor"
      )
    ).toBe(false);
  });

  it("returns completed_with_findings when the second real review still requires revision", async () => {
    const dependencies = createProviderBackedDependencies({
      reviews: [review([finding("blocker")]), review([finding("major")])]
    });

    const result = await runAgentWorkflow({ requirementMemo, dependencies });

    expect(result.metadata.status).toBe("completed_with_findings");
    expect(result.metadata.finalState).toBe("completed_with_findings");
    expect(result.metadata.terminationReason).toBe("revision_limit_reached");
    expect(result.metadata.revisionCount).toBe(1);
    expect(result.metadata.reviewCount).toBe(2);
    expect(result.metadata.llmStepCount).toBe(5);
    expect(result.reviewHistory[1].review.findings).toEqual([
      expect.objectContaining({ severity: "major" })
    ]);
    expect(dependencies.generator.revise).toHaveBeenCalledTimes(1);
  });

  it("counts provider-backed Reviewer and Revision even when usage is unavailable", async () => {
    const dependencies = createProviderBackedDependencies({
      reviews: [review([finding("major")]), review()],
      reviewerUsage: {},
      revisionUsage: {}
    });

    const result = await runAgentWorkflow({ requirementMemo, dependencies });

    expect(result.metadata.llmStepCount).toBe(5);
    expect(result.metadata.steps[3].providerBacked).toBe(true);
    expect(result.metadata.steps[4].providerBacked).toBe(true);
    expect(result.metadata.steps[3].inputTokens).toBeUndefined();
    expect(result.metadata.steps[4].inputTokens).toBeUndefined();
  });

  it("validates Reviewer sourceIds against selected source IDs", async () => {
    const validDependencies = createProviderBackedDependencies({
      reviews: [
        review([
          finding("minor", {
            sourceIds: ["S1"]
          }),
          finding("minor", {
            findingId: "cross-field",
            category: "cross_field_consistency",
            sourceIds: []
          })
        ])
      ]
    });

    const validResult = await runAgentWorkflow({
      requirementMemo,
      dependencies: validDependencies
    });

    expect(validResult.metadata.status).toBe("completed");

    const invalidDependencies = createProviderBackedDependencies({
      reviews: [review([finding("major", { sourceIds: ["S99"] })])]
    });

    const invalidResult = await runAgentWorkflow({
      requirementMemo,
      dependencies: invalidDependencies
    });

    expect(invalidResult.metadata.status).toBe("failed");
    expect(invalidResult.error?.stepName).toBe("review");
    expect(invalidResult.error?.message).toContain("unknown sourceId");
    expect(invalidDependencies.generator.revise).not.toHaveBeenCalled();
  });

  it("persists completed and completed_with_findings Agent runs without unsafe payloads", async () => {
    const records: AgentRunRecord[] = [];
    const runStore = {
      saveRun: vi.fn(async (record: AgentRunRecord) => {
        records.push(record);
        return record;
      })
    };

    const completed = await runAgentWorkflow({
      requirementMemo,
      dependencies: createProviderBackedDependencies({ reviews: [review()] }),
      runStore
    });
    const completedWithFindings = await runAgentWorkflow({
      requirementMemo,
      dependencies: createProviderBackedDependencies({
        reviews: [review([finding("major")]), review([finding("major")])]
      }),
      runStore
    });

    expect(completed.metadata.status).toBe("completed");
    expect(completedWithFindings.metadata.status).toBe("completed_with_findings");
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      inputText: requirementMemo,
      metadata: expect.objectContaining({ status: "completed" }),
      finalOutput: sampleOutput()
    });
    expect(records[1]).toMatchObject({
      metadata: expect.objectContaining({ status: "completed_with_findings" }),
      reviewHistory: expect.arrayContaining([
        expect.objectContaining({ decision: "revise" })
      ])
    });
    const serialized = JSON.stringify(records);
    expect(serialized).not.toContain(sampleKnowledge.groundedContext);
    expect(serialized).not.toContain("content");
    expect(serialized).not.toContain("chainOfThought");
    expect(serialized).not.toContain("test-openai-key");
  });

  it("persists failure records and fails before successful terminal transition on persistence failure", async () => {
    const failureRecords: AgentRunRecord[] = [];
    const failureResult = await runAgentWorkflow({
      requirementMemo,
      dependencies: createDependencies({
        draft: {
          summary: "invalid"
        }
      }).dependencies,
      runStore: {
        saveRun: vi.fn(async (record: AgentRunRecord) => {
          failureRecords.push(record);
          return record;
        })
      }
    });

    expect(failureResult.metadata.status).toBe("failed");
    expect(failureRecords).toHaveLength(1);
    expect(failureRecords[0].error?.stepName).toBe("draft_generation");

    const persistenceFailureResult = await runAgentWorkflow({
      requirementMemo,
      dependencies: createProviderBackedDependencies({ reviews: [review()] }),
      runStore: {
        saveRun: vi.fn(async () => {
          throw new Error("agent persistence unavailable");
        })
      }
    });

    expect(persistenceFailureResult.metadata.status).toBe("failed");
    expect(persistenceFailureResult.metadata.finalState).toBe("failed");
    expect(persistenceFailureResult.metadata.terminationReason).toBe(
      "technical_failure"
    );
    expect(persistenceFailureResult.error?.message).toContain(
      "agent persistence unavailable"
    );
  });
});

describe("Agent Phase 1-C real integration adapters", () => {
  function openAiResponse(data: unknown, usage = {
    input_tokens: 11,
    output_tokens: 22,
    total_tokens: 33
  }) {
    return new Response(
      JSON.stringify({
        output_text: JSON.stringify(data),
        usage
      }),
      { status: 200 }
    );
  }

  function retrievedChunk(overrides: Partial<RetrievedChunk> = {}): RetrievedChunk {
    return {
      rank: 1,
      score: 0.91,
      chunkId: "profile-image-spec:heading-aware-v1:0001",
      documentId: "profile-image-spec",
      sourcePath: "data/rag/knowledge/profile-image-spec.md",
      documentTitle: "プロフィール画像仕様",
      headingPath: ["プロフィール画像仕様", "受け入れ条件"],
      content: "5MB以下のJPGまたはPNGをアップロードできる。",
      ...overrides
    };
  }

  function setupOpenAiEnv() {
    vi.stubEnv("LLM_PROVIDER", "openai");
    vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
    vi.stubEnv("OPENAI_MODEL", "gpt-5.4-mini");
  }

  it("validates real Planner structured output without retrievalQuery or reasoning fields", async () => {
    setupOpenAiEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        openAiResponse({
          ...samplePlan,
          retrievalQuery: "do not keep",
          reasoning: "do not keep"
        })
      )
    );

    const result = await generateAgentPlan(requirementMemo);

    expect(result.data).toEqual(samplePlan);
    expect(result.data).not.toHaveProperty("retrievalQuery");
    expect(result.data).not.toHaveProperty("reasoning");
    expect(result.metadata).toMatchObject({
      provider: "openai",
      modelName: "gpt-5.4-mini",
      promptVersion: agentPlannerPromptVersion,
      inputTokens: 11,
      outputTokens: 22,
      totalTokens: 33
    });
  });

  it("fails closed when Planner returns invalid structured output", async () => {
    setupOpenAiEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        openAiResponse({
          normalizedGoal: "missing required arrays"
        })
      )
    );
    const knowledgeTool = createStaticKnowledgeRetrievalTool(sampleKnowledge);
    const generator = createStaticGenerator({ draft: sampleOutput() });
    const knowledgeSpy = vi.spyOn(knowledgeTool, "invoke");
    const draftSpy = vi.spyOn(generator, "draft");

    const result = await runAgentWorkflow({
      requirementMemo,
      dependencies: {
        planner: {
          plan: async ({ requirementMemo: input }) => {
            const plan = await generateAgentPlan(input);
            return {
              __agentExecutorResult: true,
              data: plan.data,
              metadata: plan.metadata
            };
          }
        },
        knowledgeTool,
        generator,
        reviewer: createPassThroughStubReviewer()
      }
    });

    expect(result.metadata.status).toBe("failed");
    expect(result.metadata.finalState).toBe("failed");
    expect(result.error?.stepName).toBe("planning");
    expect(knowledgeSpy).not.toHaveBeenCalled();
    expect(draftSpy).not.toHaveBeenCalled();
  });

  it("uses the original requirement memo as the Knowledge Retrieval Tool query", async () => {
    setupOpenAiEnv();
    vi.stubGlobal("fetch", vi.fn(async () => openAiResponse(samplePlan)));
    const knowledgeTool = createStaticKnowledgeRetrievalTool(sampleKnowledge);
    const knowledgeSpy = vi.spyOn(knowledgeTool, "invoke");

    await runAgentWorkflow({
      requirementMemo,
      dependencies: {
        planner: {
          plan: async ({ requirementMemo: input }) => {
            const plan = await generateAgentPlan(input);
            return {
              __agentExecutorResult: true,
              data: plan.data,
              metadata: plan.metadata
            };
          }
        },
        knowledgeTool,
        generator: createStaticGenerator({ draft: sampleOutput() }),
        reviewer: createPassThroughStubReviewer()
      }
    });

    expect(knowledgeSpy).toHaveBeenCalledWith({ query: requirementMemo });
    expect(knowledgeSpy).not.toHaveBeenCalledWith({
      query: samplePlan.normalizedGoal
    });
    expect(knowledgeSpy).not.toHaveBeenCalledWith({
      query: samplePlan.knowledgeNeeds.join("\n")
    });
  });

  it("uses existing RAG retrieval with heading-aware and document-diversity configuration", async () => {
    const retrieveSpy = vi.fn(async () => ({
      query: requirementMemo,
      strategy: "heading-aware-v1" as const,
      topK: 10,
      embeddingModel: "text-embedding-3-small",
      embeddingUsage: {
        promptTokens: 7,
        totalTokens: 7
      },
      results: [
        retrievedChunk({ rank: 1, documentId: "profile-image-spec" }),
        retrievedChunk({
          rank: 4,
          chunkId: "error-message-guideline:heading-aware-v1:0001",
          documentId: "error-message-guideline",
          documentTitle: "エラーメッセージガイドライン",
          content: "5MBを超える場合は画像サイズエラーを表示する。"
        }),
        retrievedChunk({
          rank: 8,
          chunkId: "frontend-cache-guideline:heading-aware-v1:0001",
          documentId: "frontend-cache-guideline",
          documentTitle: "フロントエンドキャッシュガイドライン",
          content: "latest image URLをユーザー状態へ反映する。"
        })
      ]
    }));
    const tool = createRagKnowledgeRetrievalTool({
      retrieveRagChunks: retrieveSpy
    });

    const result = await tool.invoke({ query: requirementMemo });
    const knowledgeResult = result.data as KnowledgeRetrievalToolResult & {
      sources: Array<{
        retrievalRank?: number;
        contextRank?: number;
      }>;
    };

    expect(retrieveSpy).toHaveBeenCalledWith({
      query: requirementMemo,
      strategy: "heading-aware-v1",
      topK: 10
    });
    expect(knowledgeResult.retrievalMetadata).toMatchObject({
      mode: "on",
      strategy: "heading-aware-v1",
      contextPolicy: "document-diversity-v1",
      candidateTopK: 10,
      requestedFinalTopK: 5,
      maxChunksPerDocument: 2,
      selectedChunkCount: 3,
      uniqueDocumentCount: 3,
      maximumChunksFromSameDocument: 1
    });
    expect(knowledgeResult.sources.map((source) => source.retrievalRank)).toEqual([
      1, 4, 8
    ]);
    expect(knowledgeResult.sources.map((source) => source.contextRank)).toEqual([
      1, 2, 3
    ]);
    expect(knowledgeResult.embeddingUsage).toEqual({
      promptTokens: 7,
      totalTokens: 7
    });
  });

  it("fails closed on retrieval failure and zero selected context before draft generation", async () => {
    const failingTool = createRagKnowledgeRetrievalTool({
      retrieveRagChunks: vi.fn(async () => {
        throw new Error("Qdrant unavailable");
      })
    });
    const generator = createStaticGenerator({ draft: sampleOutput() });
    const draftSpy = vi.spyOn(generator, "draft");

    const failureResult = await runAgentWorkflow({
      requirementMemo,
      dependencies: {
        planner: createStaticPlanner(samplePlan),
        knowledgeTool: failingTool,
        generator,
        reviewer: createPassThroughStubReviewer()
      }
    });

    expect(failureResult.metadata.status).toBe("failed");
    expect(failureResult.error?.stepName).toBe("knowledge_retrieval");
    expect(draftSpy).not.toHaveBeenCalled();

    const emptyTool = createRagKnowledgeRetrievalTool({
      retrieveRagChunks: vi.fn(async () => ({
        query: requirementMemo,
        strategy: "heading-aware-v1" as const,
        topK: 10,
        embeddingModel: "text-embedding-3-small",
        results: []
      }))
    });

    const emptyResult = await runAgentWorkflow({
      requirementMemo,
      dependencies: {
        planner: createStaticPlanner(samplePlan),
        knowledgeTool: emptyTool,
        generator,
        reviewer: createPassThroughStubReviewer()
      }
    });

    expect(emptyResult.metadata.status).toBe("failed");
    expect(emptyResult.error?.stepName).toBe("knowledge_retrieval");
    expect(draftSpy).not.toHaveBeenCalled();
  });

  it("passes AgentPlan and grounded knowledge to the Draft Generator provider request", async () => {
    setupOpenAiEnv();
    const fetchMock = vi.fn(async () => openAiResponse(sampleOutput()));
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateAgentDraft({
      requirementMemo,
      plan: samplePlan,
      groundedContext: sampleKnowledge.groundedContext
    });

    const requestBody = JSON.parse(
      String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body)
    );
    const userContent = requestBody.input[1].content as string;
    const systemContent = requestBody.input[0].content as string;

    expect(result.data).toEqual(sampleOutput());
    expect(systemContent).toContain(
      "AgentPlanはworkflow planning artifact"
    );
    expect(systemContent).toContain(
      "未解決のambiguityはspecやacceptanceCriteriaのmandatory ruleとして断定せず"
    );
    expect(systemContent).toContain(
      "knowledgeNeedsをmandatory product ruleへ昇格させないでください"
    );
    expect(userContent).toContain("Original requirement memo");
    expect(userContent).toContain(requirementMemo);
    expect(userContent).toContain("AgentPlan JSON");
    expect(userContent).toContain(samplePlan.normalizedGoal);
    expect(userContent).toContain(sampleKnowledge.groundedContext);
    expect(userContent).not.toContain("test-openai-key");
    expect(result.metadata.promptVersion).toBe(agentDraftPromptVersion);
  });

  it("validates real Reviewer structured output and preserves reviewer prompt metadata", async () => {
    setupOpenAiEnv();
    const fetchMock = vi.fn(async () =>
      openAiResponse(review([finding("minor", { sourceIds: [] })]), {
        input_tokens: 31,
        output_tokens: 17,
        total_tokens: 48
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateAgentReview({
      requirementMemo,
      plan: samplePlan,
      groundedContext: sampleKnowledge.groundedContext,
      sources: sampleKnowledge.sources,
      output: sampleOutput()
    });
    const requestBody = JSON.parse(
      String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body)
    );
    const systemContent = requestBody.input[0].content as string;
    const userContent = requestBody.input[1].content as string;

    expect(result.data.findings[0].severity).toBe("minor");
    expect(result.metadata).toMatchObject({
      provider: "openai",
      modelName: "gpt-5.4-mini",
      promptVersion: agentReviewerPromptVersion,
      providerBacked: true,
      inputTokens: 31,
      outputTokens: 17,
      totalTokens: 48
    });
    expect(systemContent).toContain("workflow decisionは返さないでください");
    expect(systemContent).toContain("minorはrevision必須ではない局所的改善");
    expect(userContent).toContain("Selected source IDs");
    expect(userContent).toContain("S1");
    expect(userContent).not.toContain("test-openai-key");
  });

  it("validates real revision structured output and sends only required findings", async () => {
    setupOpenAiEnv();
    const revised = sampleOutput({ summary: "review findingに基づく修正版です。" });
    const fetchMock = vi.fn(async () => openAiResponse(revised));
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateAgentRevision({
      requirementMemo,
      plan: samplePlan,
      groundedContext: sampleKnowledge.groundedContext,
      currentOutput: sampleOutput(),
      findings: [finding("major")]
    });
    const requestBody = JSON.parse(
      String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body)
    );
    const systemContent = requestBody.input[0].content as string;
    const userContent = requestBody.input[1].content as string;

    expect(result.data).toEqual(revised);
    expect(result.metadata.promptVersion).toBe(agentRevisionPromptVersion);
    expect(systemContent).toContain("targetedに修正してください");
    expect(systemContent).toContain("review findingにない新しいmandatory product ruleを追加しないでください");
    expect(userContent).toContain("Required blocker / major review findings JSON");
    expect(userContent).toContain("major-finding");
    expect(userContent).not.toContain("test-openai-key");
  });

  it("fails closed when Draft Generator output is invalid", async () => {
    setupOpenAiEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        openAiResponse({
          summary: "missing required GenerationOutput fields"
        })
      )
    );

    const result = await runAgentWorkflow({
      requirementMemo,
      dependencies: {
        planner: createStaticPlanner(samplePlan),
        knowledgeTool: createStaticKnowledgeRetrievalTool(sampleKnowledge),
        generator: {
          draft: async ({ requirementMemo: input, plan, knowledge }) => {
            const draft = await generateAgentDraft({
              requirementMemo: input,
              plan,
              groundedContext: knowledge.groundedContext
            });
            return {
              __agentExecutorResult: true,
              data: draft.data,
              metadata: draft.metadata
            };
          },
          revise: ({ currentOutput }) => currentOutput
        },
        reviewer: createPassThroughStubReviewer()
      }
    });

    expect(result.metadata.status).toBe("failed");
    expect(result.error?.stepName).toBe("draft_generation");
  });

  it("uses the same provider and model for Planner and Draft while separating prompt versions", async () => {
    setupOpenAiEnv();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(openAiResponse(samplePlan, {
        input_tokens: 101,
        output_tokens: 51,
        total_tokens: 152
      }))
      .mockResolvedValueOnce(openAiResponse(sampleOutput(), {
        input_tokens: 202,
        output_tokens: 102,
        total_tokens: 304
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await runAgentWorkflow({
      requirementMemo,
      dependencies: {
        planner: {
          plan: async ({ requirementMemo: input }) => {
            const plan = await generateAgentPlan(input);
            return {
              __agentExecutorResult: true,
              data: plan.data,
              metadata: plan.metadata
            };
          }
        },
        knowledgeTool: createStaticKnowledgeRetrievalTool(sampleKnowledge),
        generator: {
          draft: async ({ requirementMemo: input, plan, knowledge }) => {
            const draft = await generateAgentDraft({
              requirementMemo: input,
              plan,
              groundedContext: knowledge.groundedContext
            });
            return {
              __agentExecutorResult: true,
              data: draft.data,
              metadata: draft.metadata
            };
          },
          revise: ({ currentOutput }) => currentOutput
        },
        reviewer: createPassThroughStubReviewer()
      }
    });

    const plannerStep = result.metadata.steps.find(
      (step) => step.stepName === "planning"
    );
    const draftStep = result.metadata.steps.find(
      (step) => step.stepName === "draft_generation"
    );

    expect(plannerStep).toMatchObject({
      provider: "openai",
      modelName: "gpt-5.4-mini",
      promptVersion: agentPlannerPromptVersion,
      providerBacked: true,
      inputTokens: 101,
      outputTokens: 51,
      totalTokens: 152
    });
    expect(draftStep).toMatchObject({
      provider: "openai",
      modelName: "gpt-5.4-mini",
      promptVersion: agentDraftPromptVersion,
      providerBacked: true,
      inputTokens: 202,
      outputTokens: 102,
      totalTokens: 304
    });
    expect(plannerStep?.promptVersion).not.toBe("llm-app-poc-rag-v1");
    expect(draftStep?.promptVersion).not.toBe("llm-app-poc-rag-v1");
    expect(result.metadata.llmStepCount).toBe(2);
  });

  it("counts provider-backed steps even when token usage is unavailable", async () => {
    setupOpenAiEnv();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            output_text: JSON.stringify(samplePlan)
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            output_text: JSON.stringify(sampleOutput())
          }),
          { status: 200 }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await runAgentWorkflow({
      requirementMemo,
      dependencies: {
        planner: {
          plan: async ({ requirementMemo: input }) => {
            const plan = await generateAgentPlan(input);
            return {
              __agentExecutorResult: true,
              data: plan.data,
              metadata: plan.metadata
            };
          }
        },
        knowledgeTool: createStaticKnowledgeRetrievalTool(sampleKnowledge),
        generator: {
          draft: async ({ requirementMemo: input, plan, knowledge }) => {
            const draft = await generateAgentDraft({
              requirementMemo: input,
              plan,
              groundedContext: knowledge.groundedContext
            });
            return {
              __agentExecutorResult: true,
              data: draft.data,
              metadata: draft.metadata
            };
          },
          revise: ({ currentOutput }) => currentOutput
        },
        reviewer: createPassThroughStubReviewer()
      }
    });
    const plannerStep = result.metadata.steps.find(
      (step) => step.stepName === "planning"
    );
    const draftStep = result.metadata.steps.find(
      (step) => step.stepName === "draft_generation"
    );

    expect(result.metadata.llmStepCount).toBe(2);
    expect(plannerStep?.providerBacked).toBe(true);
    expect(draftStep?.providerBacked).toBe(true);
    expect(plannerStep?.inputTokens).toBeUndefined();
    expect(draftStep?.inputTokens).toBeUndefined();
  });

  it("normal Phase 1-C workflow uses stub Reviewer and completes without revision", async () => {
    setupOpenAiEnv();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(openAiResponse(samplePlan))
      .mockResolvedValueOnce(openAiResponse(sampleOutput()));
    vi.stubGlobal("fetch", fetchMock);
    const reviewer = createPassThroughStubReviewer();
    const reviewSpy = vi.spyOn(reviewer, "review");

    const result = await runAgentWorkflow({
      requirementMemo,
      dependencies: {
        planner: {
          plan: async ({ requirementMemo: input }) => {
            const plan = await generateAgentPlan(input);
            return {
              __agentExecutorResult: true,
              data: plan.data,
              metadata: plan.metadata
            };
          }
        },
        knowledgeTool: createStaticKnowledgeRetrievalTool(sampleKnowledge),
        generator: {
          draft: async ({ requirementMemo: input, plan, knowledge }) => {
            const draft = await generateAgentDraft({
              requirementMemo: input,
              plan,
              groundedContext: knowledge.groundedContext
            });
            return {
              __agentExecutorResult: true,
              data: draft.data,
              metadata: draft.metadata
            };
          },
          revise: ({ currentOutput }) => currentOutput
        },
        reviewer
      }
    });

    expect(result.metadata.steps.map((step) => step.stepName)).toEqual([
      "planning",
      "knowledge_retrieval",
      "draft_generation",
      "review",
      "finalization"
    ]);
    expect(result.metadata.status).toBe("completed");
    expect(result.metadata.terminationReason).toBe("review_passed");
    expect(result.metadata.revisionCount).toBe(0);
    expect(result.metadata.reviewCount).toBe(1);
    expect(result.metadata.llmStepCount).toBe(2);
    expect(reviewSpy).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
