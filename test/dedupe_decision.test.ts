import assert from "node:assert/strict";
import test from "node:test";
import { decideOnboarding } from "../src/dedupe_decision.ts";

test("holds a semantically matching account for admin review", () => {
  assert.deepEqual(decideOnboarding([{ id: "acct_existing", score: 0.93 }]), {
    status: "review",
    reason: "probable_duplicate",
    matchedAccountId: "acct_existing",
  });
});

test("accepts an account below the review threshold", () => {
  assert.deepEqual(decideOnboarding([{ id: "acct_unrelated", score: 0.41 }]), {
    status: "accepted",
    reason: "no_semantic_match",
  });
});
