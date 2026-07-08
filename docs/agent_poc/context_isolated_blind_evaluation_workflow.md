# Context-Isolated Blind Evaluation Workflow

This document defines the reusable blind evaluation workflow for AI Agent PoC
formal evaluations after Phase 2-B.

The goal is to remove ChatGPT as a required scoring dependency while preserving:

- builder / judge responsibility separation
- conversation context isolation
- filesystem and input isolation
- fixed rubric
- blind pointwise sample evaluation
- machine-readable score import

This is not described as an external independent evaluator. When the evaluator
uses Codex or the same model family, use terms such as:

- context-isolated blind evaluator
- isolated blind Codex evaluator session
- secondary blind check, when used only for calibration

## Roles

### Builder Session

The normal repository session owns:

- phase design
- routing design
- implementation
- experiment execution
- raw bundle generation
- sample mapping generation
- blind bundle generation
- blind evaluation package export

The builder session does not score samples.

### Context-Isolated Blind Evaluator Session

The evaluator should run in a fresh session without this repository history or
builder conversation context. A separate workspace is preferred over only using
another thread, because it also limits filesystem visibility.

Recommended workspace shape:

```text
ai_evaluation_blind_workspace/
├─ input/
│  ├─ blind_bundle.json
│  ├─ generation_output_schema.json
│  ├─ output_schema.json
│  └─ scoring_rubric.md
├─ scoring_prompt.md
└─ output/
```

The evaluator may read only:

- `input/blind_bundle.json`
- `input/generation_output_schema.json`
- `input/output_schema.json`
- `input/scoring_rubric.md`
- `scoring_prompt.md`

The evaluator must not read:

- raw bundle
- sample mapping
- routing mode
- routed execution mode
- Agent metadata
- routing decision
- review history
- implementation source code
- routing design history
- evaluation result history
- provider
- latency
- token usage

The evaluator scores each sample pointwise and must not infer Agent OFF / ON /
Routed mode.

### Aggregator Session

The builder or another non-blind aggregation session owns:

- score JSON import
- sample mapping join
- mode-level aggregation
- delta calculation
- report update

The blind evaluator does not receive the sample mapping.

## Scoring Method Names

Historical files may keep `blind-manual`.

For isolated LLM-based scoring, use:

```json
"scoringMethod": "context-isolated-blind-llm"
```

For optional calibration or spot checks, use:

```json
"scoringMethod": "secondary-blind-llm-check"
```

## Export / Import Commands

Export a package from an existing blind bundle:

```bash
npm run agent:evaluation:export-blind-package -- phase_2_b
```

Optional custom output directory:

```bash
npm run agent:evaluation:export-blind-package -- phase_2_b C:\path\to\ai_evaluation_blind_workspace
```

Import the evaluator output:

```bash
npm run agent:evaluation:import-scores -- phase_2_b C:\path\to\ai_evaluation_blind_workspace\output\manual_scores.json
```

Then run the existing phase-specific summarizer:

```bash
npm run agent:routing:v2:evaluate:summarize
```

The commands use positional arguments to avoid npm config-style forwarding
warnings.

## Supported Phases

The package workflow supports:

- `phase_1_e`
- `phase_2_a`
- `phase_2_b`

The exported package is written under:

```text
data/agent/evaluation/export/
```

This directory is gitignored because it is a workspace transfer artifact.

## Isolation Risks

Separate workspace isolation is preferred because a normal repository session can
inherit context from:

- project files
- global or project AGENTS.md
- installed skills
- MCP servers
- hooks
- local memory or prior conversation context

For strict blind evaluation, the evaluator should be started with only the
exported package available.

## Safety

The export / import workflow performs local file reads, JSON writes, and schema
validation only. It does not call:

- OpenAI API
- Embeddings API
- Qdrant
- any LLM provider

Score values are accepted only through schema validation and sample-id coverage
checks. Aggregation remains a separate step.
