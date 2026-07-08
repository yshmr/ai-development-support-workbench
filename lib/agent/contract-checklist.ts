import { z } from "zod";
import { generationOutputSchema, type GenerationOutput } from "@/lib/schema";
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

export const contractChecklistAuditStatusSchema = z.enum([
  "covered",
  "needs_review",
  "not_applicable"
]);

export const contractChecklistAuditItemSchema = z.object({
  itemId: z.string().regex(/^CONTRACT-CHECK-\d{3}$/),
  category: contractChecklistCategorySchema,
  status: contractChecklistAuditStatusSchema,
  checkedFields: z.array(contractChecklistTargetFieldSchema),
  message: z.string().min(1)
});

export const contractChecklistAuditSchema = z.object({
  policyVersion: z.literal("contract-detail-checklist-audit-v1"),
  checklistPolicyVersion: z.literal("contract-detail-checklist-v1"),
  recommended: z.boolean(),
  coveredCount: z.number().int().nonnegative(),
  needsReviewCount: z.number().int().nonnegative(),
  items: z.array(contractChecklistAuditItemSchema)
});

export type ContractChecklist = z.infer<typeof contractChecklistSchema>;
export type ContractChecklistItem = z.infer<typeof contractChecklistItemSchema>;
export type ContractChecklistAudit = z.infer<typeof contractChecklistAuditSchema>;

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

function outputFieldText(
  output: GenerationOutput,
  field: z.infer<typeof contractChecklistTargetFieldSchema>
): string {
  if (field === "jiraTasks") {
    return output.jiraTasks
      .flatMap((task) => [task.title, task.description, task.type])
      .join("\n");
  }

  return output[field].join("\n");
}

function matchesAnyPattern(input: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(input));
}

function categoryPatterns(
  category: z.infer<typeof contractChecklistCategorySchema>
): RegExp[] {
  if (category === "query_parameter") {
    return [
      /query/i,
      /parameter/i,
      /URL/i,
      /クエリ/,
      /パラメータ/,
      /status/i,
      /sort/i,
      /tab/i
    ];
  }

  if (category === "enum_values") {
    return [
      /enum/i,
      /value/i,
      /値/,
      /複数/,
      /multi/i,
      /open/i,
      /in_progress/i,
      /resolved/i,
      /archived/i,
      /created_at_desc/i,
      /関連度/
    ];
  }

  if (category === "default_state") {
    return [
      /初期/,
      /デフォルト/,
      /default/i,
      /0件/,
      /空状態/,
      /empty/i,
      /並び順/,
      /関連度/
    ];
  }

  if (category === "persistence") {
    return [
      /保持/,
      /復元/,
      /共有/,
      /URL/,
      /reload/i,
      /再読み込み/,
      /ブックマーク/
    ];
  }

  return [/acceptance/i, /test/i, /受け入れ/, /Jira/i, /タスク/, /レビュー/, /確認/];
}

export function auditAgentContractChecklistCoverage(input: {
  checklist: ContractChecklist;
  output: GenerationOutput;
}): ContractChecklistAudit {
  const checklist = contractChecklistSchema.parse(input.checklist);
  const output = generationOutputSchema.parse(input.output);

  if (!checklist.recommended) {
    return contractChecklistAuditSchema.parse({
      policyVersion: "contract-detail-checklist-audit-v1",
      checklistPolicyVersion: checklist.policyVersion,
      recommended: false,
      coveredCount: 0,
      needsReviewCount: 0,
      items: []
    });
  }

  const items = checklist.items.map((item) => {
    const checkedText = item.targetFields
      .map((field) => outputFieldText(output, field))
      .join("\n");
    const covered = matchesAnyPattern(checkedText, categoryPatterns(item.category));

    return contractChecklistAuditItemSchema.parse({
      itemId: item.itemId,
      category: item.category,
      status: covered ? "covered" : "needs_review",
      checkedFields: item.targetFields,
      message: covered
        ? "Checklist category appears in at least one target field."
        : "Checklist category was not detected in the target fields; review manually."
    });
  });
  const coveredCount = items.filter((item) => item.status === "covered").length;
  const needsReviewCount = items.filter(
    (item) => item.status === "needs_review"
  ).length;

  return contractChecklistAuditSchema.parse({
    policyVersion: "contract-detail-checklist-audit-v1",
    checklistPolicyVersion: checklist.policyVersion,
    recommended: checklist.recommended,
    coveredCount,
    needsReviewCount,
    items
  });
}
