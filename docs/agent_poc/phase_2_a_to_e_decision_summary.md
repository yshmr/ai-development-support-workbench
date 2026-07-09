# AI Agent PoC Phase 2-A to 2-E Decision Summary

## Purpose

This document summarizes the decision record from AI Agent PoC Phase 2-A through
Phase 2-E. It is intentionally short and does not start Phase 2-F.

The Phase 2 question was:

```text
Can bounded Agent workflow be applied selectively, improving quality or cost
only where it is useful, instead of becoming the default path?
```

## Decision Summary

| Phase | Main hypothesis | Result | Decision |
|---|---|---|---|
| 2-A | Deterministic routing can choose Agent only when needed | Negative result. Routed mode invoked Agent workflow for all routed runs and underperformed Always OFF / Always ON. | Do not default routed mode. Keep as failure evidence. |
| 2-B | A refined router can avoid Agent on low-risk cases | Partial improvement. Routed v2 avoided Agent in 4/8 routed runs and reduced cost vs Always ON, but did not beat Always OFF quality. | Keep as cost-aware candidate, not default. |
| 2-C | Low-risk detail-dense failures may need checklist support, not full Agent workflow | Local-only spike passed. Contract-detail detector and deterministic checklist bridge were added without changing defaults. | Proceed to provider-backed validation. |
| 2-D | Routed v3 + checklist bridge improves routed generation in the original matrix | Mixed result. Routed v3 matched Always OFF quality and beat Always ON cost/quality, but checklist was exercised in only one routed single-pass run. | Keep bridge as candidate; gather targeted cases. |
| 2-E | Checklist single-pass improves low-risk contract-detail target cases | Partial improvement with cost trade-off. Checklist mean was 4.857 vs baseline 4.839, but paired result was 2 wins / 4 losses / 2 ties and token ratio was 1.165. | Do not default checklist. Preserve as optional candidate and calibration target. |

## Key Findings

- Always-on Agent workflow is not justified for this workload.
- Selective orchestration is still a valid direction, but routing must prove it can avoid unnecessary Agent runs.
- Phase 2-A failed because the first router was too conservative and collapsed into always using Agent workflow.
- Phase 2-B improved routing cost behavior but still did not beat grounded single-pass quality.
- The main failure domain shifted from high-risk ambiguity to low-risk contract details such as URL query parameters, enum values, defaults, and persistence rules.
- Phase 2-C introduced deterministic contract checklist support as a lighter intervention than full Agent workflow.
- Phase 2-D validated that the checklist bridge can run in the real provider-backed pipeline, but the original matrix did not contain enough checklist-triggered routed cases.
- Phase 2-E targeted that failure domain directly and showed small mean quality gains in consistency and traceability, but not enough pairwise evidence to default the checklist path.

## Current Policy

Default behavior should remain:

```text
grounded single-pass generation
```

Candidate behavior to keep available:

```text
deterministic routing + optional contract-detail checklist support
```

Do not default:

- Always ON Agent workflow
- Routed v1
- Routed v2
- Routed v3 + checklist bridge
- Checklist single-pass for all low-risk detail-dense cases

## Why Phase 2-F Should Not Start Yet

Before implementing another routing or Agent phase, the current evidence suggests
the next step should be a design decision, not more code:

- define whether the goal is quality lift, cost reduction, or failure-domain coverage
- decide whether checklist prompting should be improved, narrowed, or abandoned
- decide whether future work should evaluate a stricter checklist prompt, a better detector, or a different intervention such as schema-aware post-review
- preserve the negative and partial results as engineering evidence rather than forcing a default policy

## Practical Recommendation

Treat Phase 2-A to 2-E as a completed routing/checklist investigation segment.

Recommended next action:

```text
Pause Phase 2 implementation and write a short Phase 2 retrospective / next-hypothesis note.
```

This keeps the PoC honest: the current evidence supports optional candidate
paths and further calibration, but not a new default behavior.
