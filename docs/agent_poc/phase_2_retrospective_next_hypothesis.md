# AI Agent PoC Phase 2 Retrospective and Next Hypothesis

## Purpose

This note closes the Phase 2-A to 2-E routing/checklist investigation segment
and defines what should be decided before any Phase 2-F implementation starts.

It does not introduce a new implementation task.

## What Phase 2 Established

Phase 2 tested whether bounded Agent workflow should become selectively applied
rather than always enabled.

The evidence supports three conclusions:

1. Always-on Agent workflow is not justified for the tested workload.
2. Deterministic routing is useful only if it can avoid unnecessary Agent runs
   without degrading quality.
3. Low-risk contract-detail failures are better treated as a targeted failure
   domain than as a reason to route broadly into full Agent workflow.

## What Worked

- The evaluation harness can compare multiple execution policies while keeping
  blind scoring separate from raw execution metadata.
- Context-isolated blind evaluation removed ChatGPT as a required scoring
  dependency while preserving builder/judge separation.
- Phase 2-B demonstrated that routing can reduce Agent invocation compared with
  Phase 2-A.
- Phase 2-C and 2-D showed that deterministic checklist guidance can be wired
  into the provider-backed pipeline without changing `/api/generate` defaults.
- Phase 2-E produced a focused target dataset for low-risk detail-dense contract
  requirements and measured checklist impact directly.

## What Did Not Work

- Phase 2-A routing was too conservative and collapsed into always using Agent
  workflow.
- Phase 2-B reduced cost versus Always ON but did not beat grounded single-pass
  quality.
- Phase 2-D validated the checklist bridge technically, but the original matrix
  had too few checklist-triggered routed single-pass cases.
- Phase 2-E checklist prompting produced only a small mean quality lift and lost
  more pairwise comparisons than it won.
- Checklist prompting increased token usage by about 16.5% on the Phase 2-E
  target dataset.

## Current Default Decision

Keep the default path as:

```text
grounded single-pass generation
```

Keep as candidate paths:

```text
deterministic routing
deterministic contract-detail checklist support
context-isolated blind evaluation workflow
```

Do not make any of these default from the current evidence:

- Always ON Agent workflow
- routed mode
- checklist single-pass
- full Agent workflow for low-risk detail-dense cases

## Next Hypothesis Options

### Option A: Improve Checklist Precision

Hypothesis:

```text
A stricter and narrower checklist prompt can preserve the consistency /
traceability gains from Phase 2-E while reducing acceptance criteria regression
and token overhead.
```

Best when the goal is to continue the contract-detail line of inquiry.

Required validation:

- same Phase 2-E target dataset
- baseline vs revised checklist
- same blind scoring workflow
- explicit token/latency comparison
- no default behavior change

Risk:

- prompt tuning may overfit eight synthetic target cases.

### Option B: Add Schema-Aware Post-Review

Hypothesis:

```text
A deterministic or lightweight post-review pass can catch contract-detail drift
without injecting a longer checklist into the generation prompt.
```

Best when the goal is to reduce prompt token overhead.

Required validation:

- review findings must not be treated as quality ground truth
- independent blind scoring remains required
- post-review must not mutate output silently without trace

Risk:

- may recreate parts of Agent workflow cost and complexity.

### Option C: Improve Routing Detector Only

Hypothesis:

```text
Better detection of low-risk contract-detail cases can decide when optional
support is useful, even if the support mechanism remains unchanged.
```

Best when the goal is routing accuracy rather than output quality improvement.

Required validation:

- larger calibration dataset
- false positive / false negative analysis
- no provider calls until routing-only gate passes

Risk:

- routing accuracy does not guarantee final output quality.

### Option D: Stop Phase 2 Implementation

Hypothesis:

```text
The current evidence is sufficient for the portfolio: it shows positive,
negative, and partial results with disciplined evaluation.
```

Best when the goal is packaging, explanation, and portfolio readiness.

Required validation:

- make sure docs clearly explain why no default policy changed
- make sure results are not overstated as model/provider general claims
- preserve local-only artifacts outside Git

Risk:

- leaves the checklist candidate unresolved.

## Recommended Next Step

Recommended next action:

```text
Choose between Option A and Option D before writing more code.
```

Option A is the best technical continuation if the project should keep exploring
contract-detail quality improvement.

Option D is the best portfolio continuation if the current goal is to present
the PoC as an evidence-driven engineering study.

In either case, Phase 2-F should not start until the next hypothesis is selected
explicitly.
