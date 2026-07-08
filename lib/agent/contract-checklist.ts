import { z } from "zod";
import {
  createAgentRoutingContractCandidateDecision,
  type AgentRoutingDecision
} from "./routing";

export const contractChecklistCategorySchema = z.enum([
  "query_parameter",
  "enum_values",
  "default_state",
  "persistence",
  "traceability"
]);

export const contractChecklistTargetFieldSchema = z.enum([
  "spec",
  "acceptanceCriteria",
  "jiraTasks",
  "implementationPlan",
  "reviewPoints",
  "risks"
]);

export const contractChecklistItemSchema = z.object({
  itemId: z.string().regex(/^CONTRACT-CHECK-\d{3}$/),
  category: contractChecklistCategorySchema,
  instruction: z.string().min(1),
  targetFields: z.array(contractChecklistTargetFieldSchema).min(1)
});

export const contractChecklistSchema = z.object({
  policyVersion: z.literal("contract-detail-checklist-v1"),
  recommended: z.boolean(),
  reason: z.string().min(1),
  items: z.array(contractChecklistItemSchema)
});

export type ContractChecklist = z.infer<typeof contractChecklistSchema>;
export type ContractChecklistItem = z.infer<typeof contractChecklistItemSchema>;

type CreateContractChecklistInput = {
  requirementMemo: string;
  routingDecision?: AgentRoutingDecision;
};

function hasAny(input: string, markers: string[]): boolean {
  return markers.some((marker) => input.includes(marker));
}

function hasQueryContract(input: string): boolean {
  return hasAny(input, [
    "query parameter",
    "クエリパラメータ",
    "クエリ",
    "URL query",
    "status",
    "sort",
    "tab"
  ]);
}

function hasEnumContract(input: string): boolean {
  return hasAny(input, [
    "open",
    "in_progress",
    "resolved",
    "archived",
    "created_at_desc",
    "関連度",
    "カンマ",
    "comma",
    "複数ステータス"
  ]);
}

function hasDefaultStateContract(input: string): boolean {
  return hasAny(input, [
    "初期",
    "デフォルト",
    "default",
    "0件",
    "空状態",
    "empty state",
    "並び順"
  ]);
}

function hasPersistenceContract(input: string): boolean {
  return hasAny(input, [
    "保持",
    "復元",
    "共有",
    "URL共有",
    "再読み込み",
    "reload",
    "ブックマーク"
  ]);
}

function createChecklistItem(
  sequence: number,
  item: Omit<ContractChecklistItem, "itemId">
): ContractChecklistItem {
  return contractChecklistItemSchema.parse({
    itemId: `CONTRACT-CHECK-${String(sequence).padStart(3, "0")}`,
    ...item
  });
}

export function createAgentContractChecklist({
  requirementMemo,
  routingDecision
}: CreateContractChecklistInput): ContractChecklist {
  const decision =
    routingDecision ??
    createAgentRoutingContractCandidateDecision({ requirementMemo });
  const recommended =
    decision.signals.lightweightChecklistRecommended === true;

  if (!recommended) {
    return contractChecklistSchema.parse({
      policyVersion: "contract-detail-checklist-v1",
      recommended: false,
      reason:
        decision.mode === "agent_workflow"
          ? "Agent workflow route does not use the lightweight contract checklist."
          : "Contract-detail signal is below the lightweight checklist threshold.",
      items: []
    });
  }

  const items: ContractChecklistItem[] = [];

  if (hasQueryContract(requirementMemo)) {
    items.push(
      createChecklistItem(items.length + 1, {
        category: "query_parameter",
        instruction:
          "Carry exact query parameter names, value format, and URL update/restore behavior into the spec and acceptance criteria.",
        targetFields: [
          "spec",
          "acceptanceCriteria",
          "jiraTasks",
          "reviewPoints"
        ]
      })
    );
  }

  if (hasEnumContract(requirementMemo)) {
    items.push(
      createChecklistItem(items.length + 1, {
        category: "enum_values",
        instruction:
          "Preserve explicit enum values, multi-select behavior, and value serialization rules across spec, tasks, and tests.",
        targetFields: [
          "spec",
          "acceptanceCriteria",
          "jiraTasks",
          "reviewPoints"
        ]
      })
    );
  }

  if (hasDefaultStateContract(requirementMemo)) {
    items.push(
      createChecklistItem(items.length + 1, {
        category: "default_state",
        instruction:
          "State default sort, default tab, empty state, or initial display behavior as testable acceptance criteria.",
        targetFields: ["acceptanceCriteria", "jiraTasks", "reviewPoints"]
      })
    );
  }

  if (hasPersistenceContract(requirementMemo)) {
    items.push(
      createChecklistItem(items.length + 1, {
        category: "persistence",
        instruction:
          "Specify reload, restoration, sharing, or persistence expectations without inventing unsupported synchronization guarantees.",
        targetFields: [
          "spec",
          "acceptanceCriteria",
          "implementationPlan",
          "risks"
        ]
      })
    );
  }

  items.push(
    createChecklistItem(items.length + 1, {
      category: "traceability",
      instruction:
        "Ensure each contract detail appears in at least one acceptance criterion and one Jira task or review point.",
      targetFields: [
        "acceptanceCriteria",
        "jiraTasks",
        "reviewPoints"
      ]
    })
  );

  return contractChecklistSchema.parse({
    policyVersion: "contract-detail-checklist-v1",
    recommended,
    reason:
      "Low-risk contract-detail route should remain single-pass but receive deterministic checklist attention.",
    items
  });
}
