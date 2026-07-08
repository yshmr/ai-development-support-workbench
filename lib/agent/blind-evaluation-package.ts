import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { generationOutputJsonSchema } from "@/lib/schema";
import {
  agentEvaluationBlindBundlePath,
  agentEvaluationManualScoresPath,
  agentRoutingEvaluationBlindBundlePath,
  agentRoutingEvaluationManualScoresPath,
  agentRoutingV2EvaluationBlindBundlePath,
  agentRoutingV2EvaluationManualScoresPath,
  assertBlindBundleHasNoModeLeak,
  blindEvaluationBundleSchema,
  blindRoutingEvaluationBundleSchema,
  manualScoresFileSchema,
  readJsonFile,
  routingManualScoresFileSchema,
  validateManualScores,
  validateRoutingManualScores,
  writeJsonFile,
  writeTextFile,
  type BlindEvaluationBundle,
  type BlindRoutingEvaluationBundle,
  type ManualScoresFile,
  type RoutingManualScoresFile
} from "./evaluation";

export const blindEvaluationPhaseSchema = z.enum([
  "phase_1_e",
  "phase_2_a",
  "phase_2_b"
]);

export type BlindEvaluationPhase = z.infer<typeof blindEvaluationPhaseSchema>;

type BlindBundle = BlindEvaluationBundle | BlindRoutingEvaluationBundle;
type ManualScores = ManualScoresFile | RoutingManualScoresFile;

type PhaseConfig = {
  phase: BlindEvaluationPhase;
  evaluationId: string;
  blindBundlePath: string;
  manualScoresPath: string;
  blindSchema: z.ZodType<BlindBundle>;
  scoreSchema: z.ZodType<ManualScores>;
  validateScores: (scores: ManualScores, blindBundle: BlindBundle) => ManualScores;
};

const blindPackageDirectory = path.join(
  process.cwd(),
  "data",
  "agent",
  "evaluation",
  "export"
);

export const manualScoreOutputJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["evaluationId", "scoringMethod", "scores"],
  properties: {
    evaluationId: { type: "string" },
    scoringMethod: {
      type: "string",
      enum: [
        "blind-manual",
        "context-isolated-blind-llm",
        "secondary-blind-llm-check"
      ]
    },
    scores: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["sampleId", "scores"],
        properties: {
          sampleId: { type: "string" },
          scores: {
            type: "object",
            additionalProperties: false,
            required: [
              "productSpecificRuleCoverage",
              "unsupportedAssumptionControl",
              "acceptanceCriteriaSpecificity",
              "jiraDecompositionAppropriateness",
              "jsonStructureStability",
              "crossFieldConsistency",
              "requirementToTaskTraceability"
            ],
            properties: {
              productSpecificRuleCoverage: { type: "integer", minimum: 1, maximum: 5 },
              unsupportedAssumptionControl: { type: "integer", minimum: 1, maximum: 5 },
              acceptanceCriteriaSpecificity: { type: "integer", minimum: 1, maximum: 5 },
              jiraDecompositionAppropriateness: {
                type: "integer",
                minimum: 1,
                maximum: 5
              },
              jsonStructureStability: { type: "integer", minimum: 1, maximum: 5 },
              crossFieldConsistency: { type: "integer", minimum: 1, maximum: 5 },
              requirementToTaskTraceability: {
                type: "integer",
                minimum: 1,
                maximum: 5
              }
            }
          },
          notes: {
            oneOf: [
              { type: "string" },
              { type: "array", items: { type: "string" } }
            ]
          }
        }
      }
    }
  }
} as const;

const scoringRubricMarkdown = [
  "# Blind Manual Scoring Rubric",
  "",
  "Score each axis as an integer from 1 to 5. Evaluate each sample pointwise. Do not infer hidden experimental groups, provider, latency, or implementation details.",
  "",
  "## Axes",
  "",
  "1. productSpecificRuleCoverage",
  "- 5: importantExpectedRules are almost fully reflected with concrete product-specific detail.",
  "- 3: some important rules are reflected, but important omissions remain.",
  "- 1: product-specific rules are mostly missing.",
  "",
  "2. unsupportedAssumptionControl",
  "- 5: unsupportedAssumptionsToAvoid are avoided and uncertain scope remains as questions or risks.",
  "- 3: some extra assumptions or overstatements remain.",
  "- 1: unsupported assumptions are clearly specified as requirements.",
  "",
  "3. acceptanceCriteriaSpecificity",
  "- 5: criteria are testable with concrete inputs, expected results, and failure conditions.",
  "- 3: direction is present but verification details are vague.",
  "- 1: criteria are difficult to use as acceptance tests.",
  "",
  "4. jiraDecompositionAppropriateness",
  "- 5: tasks are implementable and naturally decomposed across frontend/backend/test/documentation where relevant.",
  "- 3: tasks exist but responsibility boundaries or granularity are rough.",
  "- 1: task decomposition is missing or impractical.",
  "",
  "5. jsonStructureStability",
  "- 5: finalOutput follows the provided GenerationOutput schema with stable non-empty fields.",
  "- 3: structure is mostly present but some fields are weak, empty, or unstable.",
  "- 1: major schema or structural problems are visible.",
  "",
  "6. crossFieldConsistency",
  "- 5: summary/spec/acceptanceCriteria/jiraTasks/implementationPlan/reviewPoints/risks do not contradict each other.",
  "- 3: small inconsistencies or naming drift exist.",
  "- 1: important specification contradictions exist.",
  "",
  "7. requirementToTaskTraceability",
  "- 5: requirements and expectations trace clearly into implementation tasks, review points, and risks.",
  "- 3: broad traceability exists but important rules are weakly connected to tasks.",
  "- 1: requirement-to-task relationship is difficult to follow."
].join("\n");

function getPhaseConfig(phase: BlindEvaluationPhase): PhaseConfig {
  if (phase === "phase_1_e") {
    return {
      phase,
      evaluationId: "agent-phase-1-e",
      blindBundlePath: agentEvaluationBlindBundlePath,
      manualScoresPath: agentEvaluationManualScoresPath,
      blindSchema: blindEvaluationBundleSchema,
      scoreSchema: manualScoresFileSchema,
      validateScores: (scores, blindBundle) =>
        validateManualScores(
          scores as ManualScoresFile,
          blindBundle as BlindEvaluationBundle
        )
    };
  }

  if (phase === "phase_2_a") {
    return {
      phase,
      evaluationId: "agent-phase-2-a-routing",
      blindBundlePath: agentRoutingEvaluationBlindBundlePath,
      manualScoresPath: agentRoutingEvaluationManualScoresPath,
      blindSchema: blindRoutingEvaluationBundleSchema,
      scoreSchema: routingManualScoresFileSchema,
      validateScores: (scores, blindBundle) =>
        validateRoutingManualScores(
          scores as RoutingManualScoresFile,
          blindBundle as BlindRoutingEvaluationBundle
        )
    };
  }

  return {
    phase,
    evaluationId: "agent-phase-2-b-routing-v2",
    blindBundlePath: agentRoutingV2EvaluationBlindBundlePath,
    manualScoresPath: agentRoutingV2EvaluationManualScoresPath,
    blindSchema: blindRoutingEvaluationBundleSchema,
    scoreSchema: routingManualScoresFileSchema,
    validateScores: (scores, blindBundle) =>
      validateRoutingManualScores(
        scores as RoutingManualScoresFile,
        blindBundle as BlindRoutingEvaluationBundle
      )
  };
}

function defaultPackageDirectory(phase: BlindEvaluationPhase): string {
  return path.join(blindPackageDirectory, `${phase}_blind_package`);
}

function createScoringPrompt(evaluationId: string): string {
  return [
    `# Context-Isolated Blind Evaluation: ${evaluationId}`,
    "",
    "You are a context-isolated blind evaluator. Use only files in this package.",
    "",
    "Allowed inputs:",
    "- `input/blind_bundle.json`",
    "- `input/generation_output_schema.json`",
    "- `input/scoring_rubric.md`",
    "- `input/output_schema.json`",
    "",
    "Do not use repository source code, raw bundles, sample mapping, routing mode, Agent metadata, review history, provider, latency, token usage, previous evaluation results, or builder conversation context.",
    "",
    "Score each sample pointwise. Do not infer hidden experimental groups.",
    "",
    "Return only machine-readable JSON matching `input/output_schema.json`.",
    "",
    "Use:",
    "",
    "```json",
    JSON.stringify(
      {
        evaluationId,
        scoringMethod: "context-isolated-blind-llm",
        scores: []
      },
      null,
      2
    ),
    "```"
  ].join("\n");
}

export async function exportAgentBlindEvaluationPackage(input: {
  phase: BlindEvaluationPhase;
  outputDirectory?: string;
  blindBundle?: BlindBundle;
}): Promise<{ outputDirectory: string; evaluationId: string; sampleCount: number }> {
  const phase = blindEvaluationPhaseSchema.parse(input.phase);
  const config = getPhaseConfig(phase);
  const outputDirectory = input.outputDirectory ?? defaultPackageDirectory(phase);
  const blindBundle =
    input.blindBundle ?? (await readJsonFile(config.blindBundlePath, config.blindSchema));

  if (blindBundle.evaluationId !== config.evaluationId) {
    throw new Error(
      `Blind bundle evaluationId mismatch: expected ${config.evaluationId}, got ${blindBundle.evaluationId}`
    );
  }

  assertBlindBundleHasNoModeLeak(blindBundle);
  await mkdir(path.join(outputDirectory, "input"), { recursive: true });
  await mkdir(path.join(outputDirectory, "output"), { recursive: true });

  await writeJsonFile(path.join(outputDirectory, "input", "blind_bundle.json"), {
    ...blindBundle,
    generationOutputSchema: blindBundle.generationOutputSchema ?? generationOutputJsonSchema
  });
  await writeJsonFile(
    path.join(outputDirectory, "input", "generation_output_schema.json"),
    generationOutputJsonSchema
  );
  await writeJsonFile(
    path.join(outputDirectory, "input", "output_schema.json"),
    manualScoreOutputJsonSchema
  );
  await writeTextFile(
    path.join(outputDirectory, "input", "scoring_rubric.md"),
    scoringRubricMarkdown
  );
  await writeTextFile(
    path.join(outputDirectory, "scoring_prompt.md"),
    createScoringPrompt(config.evaluationId)
  );
  await writeTextFile(
    path.join(outputDirectory, "README.md"),
    [
      `# Blind Evaluation Package: ${config.evaluationId}`,
      "",
      "Open this directory as a separate context-isolated evaluator workspace.",
      "Use only files under this package. Write the final score JSON to `output/manual_scores.json`.",
      "",
      "Do not inspect the source repository, raw bundle, sample mapping, implementation metadata, provider, latency, token usage, or previous evaluation results."
    ].join("\n")
  );

  return {
    outputDirectory,
    evaluationId: config.evaluationId,
    sampleCount: blindBundle.samples.length
  };
}

export async function importAgentBlindEvaluationScores(input: {
  phase: BlindEvaluationPhase;
  scoreFilePath: string;
  outputPath?: string;
  blindBundle?: BlindBundle;
}): Promise<{ outputPath: string; evaluationId: string; scoreCount: number }> {
  const phase = blindEvaluationPhaseSchema.parse(input.phase);
  const config = getPhaseConfig(phase);
  const blindBundle =
    input.blindBundle ?? (await readJsonFile(config.blindBundlePath, config.blindSchema));
  const rawScores = JSON.parse(await readFile(input.scoreFilePath, "utf8"));
  const parsedScores = config.scoreSchema.parse(rawScores);
  const validatedScores = config.validateScores(parsedScores, blindBundle);
  const outputPath = input.outputPath ?? config.manualScoresPath;

  await writeJsonFile(outputPath, validatedScores);

  return {
    outputPath,
    evaluationId: validatedScores.evaluationId,
    scoreCount: validatedScores.scores.length
  };
}
