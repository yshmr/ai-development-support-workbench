import type { AgentReview, RevisionDecision } from "./schema";

export function decideRevision(review: AgentReview): RevisionDecision {
  const requiresRevision = review.findings.some(
    (finding) =>
      finding.severity === "blocker" || finding.severity === "major"
  );

  return requiresRevision ? "revise" : "pass";
}

export function getRevisionRequiredFindings(review: AgentReview) {
  return review.findings.filter(
    (finding) =>
      finding.severity === "blocker" || finding.severity === "major"
  );
}
