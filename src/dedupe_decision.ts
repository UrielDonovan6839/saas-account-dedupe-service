export type Candidate = {
  id: string;
  score: number;
  metadata?: Record<string, unknown>;
};

export type DedupeDecision =
  | { status: "accepted"; reason: "no_semantic_match" }
  | { status: "review"; reason: "probable_duplicate"; matchedAccountId: string };

export function decideOnboarding(candidates: Candidate[]): DedupeDecision {
  const match = candidates.find((candidate) => candidate.score >= 0.88);
  return match
    ? { status: "review", reason: "probable_duplicate", matchedAccountId: match.id }
    : { status: "accepted", reason: "no_semantic_match" };
}
