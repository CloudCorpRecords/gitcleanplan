import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { planBranchCleanup } from "../src/gitcleanplan.js";

/**
 * All tests are pure local computation over inline branch
 * data: no filesystem, no network, and nothing is executed.
 * Each of the nine decision rules is pinned with its exact
 * reason string, the precedence between rules is pinned
 * where rules overlap, the staleness boundary is pinned as
 * inclusive, and every validation path is pinned with its
 * path-naming (or, for stale_days, its exact) message.
 */

type BranchInput = Record<string, unknown>;

const branch = (over: BranchInput): BranchInput => ({
  name: "feature",
  last_commit_days_ago: 5,
  ...over,
});

const one = (b: BranchInput, extra: BranchInput = {}) =>
  planBranchCleanup({ branches: [b], ...extra });

describe("planBranchCleanup — the nine rules, exact reasons", () => {
  it("rule 1: the default branch is kept as 'default branch'", () => {
    const out = one(branch({ name: "main" }));
    assert.deepEqual(out.branches, [
      { name: "main", action: "keep", reason: "default branch" },
    ]);
  });

  it("rule 2: a protected branch is kept as 'protected branch'", () => {
    const out = one(branch({ protected: true }));
    assert.deepEqual(out.branches, [
      { name: "feature", action: "keep", reason: "protected branch" },
    ]);
  });

  it("rule 3: the current branch is kept as 'currently checked out'", () => {
    const out = one(branch({ current: true }));
    assert.deepEqual(out.branches, [
      { name: "feature", action: "keep", reason: "currently checked out" },
    ]);
  });

  it("rule 4: merged with upstream gone is deleted as 'merged and upstream is gone'", () => {
    const out = one(branch({ merged: true, upstream_gone: true }));
    assert.deepEqual(out.branches, [
      { name: "feature", action: "delete", reason: "merged and upstream is gone" },
    ]);
  });

  it("rule 5: merged and stale is deleted as 'merged and stale'", () => {
    const out = one(branch({ merged: true, last_commit_days_ago: 120 }));
    assert.deepEqual(out.branches, [
      { name: "feature", action: "delete", reason: "merged and stale" },
    ]);
  });

  it("rule 6: merged but recent is reviewed as 'merged but recently active'", () => {
    const out = one(branch({ merged: true }));
    assert.deepEqual(out.branches, [
      { name: "feature", action: "review", reason: "merged but recently active" },
    ]);
  });

  it("rule 7: upstream gone but unmerged is reviewed as 'upstream is gone but branch is not merged'", () => {
    const out = one(branch({ upstream_gone: true }));
    assert.deepEqual(out.branches, [
      {
        name: "feature",
        action: "review",
        reason: "upstream is gone but branch is not merged",
      },
    ]);
  });

  it("rule 8: stale but unmerged is reviewed as 'stale but not merged'", () => {
    const out = one(branch({ last_commit_days_ago: 200 }));
    assert.deepEqual(out.branches, [
      { name: "feature", action: "review", reason: "stale but not merged" },
    ]);
  });

  it("rule 9: a recent, unmerged, present branch is kept as 'active'", () => {
    const out = one(branch({}));
    assert.deepEqual(out.branches, [
      { name: "feature", action: "keep", reason: "active" },
    ]);
  });
});

describe("planBranchCleanup — rule precedence", () => {
  it("default branch beats protected (and merged, gone, stale, current)", () => {
    const out = one(
      branch({
        name: "main",
        protected: true,
        current: true,
        merged: true,
        upstream_gone: true,
        last_commit_days_ago: 999,
      }),
    );
    assert.deepEqual(out.branches[0], {
      name: "main",
      action: "keep",
      reason: "default branch",
    });
  });

  it("protected beats merged + upstream gone", () => {
    const out = one(
      branch({ protected: true, merged: true, upstream_gone: true, last_commit_days_ago: 999 }),
    );
    assert.deepEqual(out.branches[0], {
      name: "feature",
      action: "keep",
      reason: "protected branch",
    });
  });

  it("protected beats current", () => {
    const out = one(branch({ protected: true, current: true }));
    assert.equal(out.branches[0].reason, "protected branch");
  });

  it("current beats merged (and merged + gone + stale)", () => {
    const out = one(
      branch({ current: true, merged: true, upstream_gone: true, last_commit_days_ago: 999 }),
    );
    assert.deepEqual(out.branches[0], {
      name: "feature",
      action: "keep",
      reason: "currently checked out",
    });
  });

  it("merged + upstream gone beats merged + stale", () => {
    const out = one(
      branch({ merged: true, upstream_gone: true, last_commit_days_ago: 999 }),
    );
    assert.deepEqual(out.branches[0], {
      name: "feature",
      action: "delete",
      reason: "merged and upstream is gone",
    });
  });

  it("upstream gone beats stale for an unmerged branch", () => {
    const out = one(branch({ upstream_gone: true, last_commit_days_ago: 999 }));
    assert.deepEqual(out.branches[0], {
      name: "feature",
      action: "review",
      reason: "upstream is gone but branch is not merged",
    });
  });
});

describe("planBranchCleanup — staleness boundary and options", () => {
  it("last_commit_days_ago == stale_days counts as stale for a merged branch", () => {
    const out = one(branch({ merged: true, last_commit_days_ago: 90 }));
    assert.deepEqual(out.branches[0], {
      name: "feature",
      action: "delete",
      reason: "merged and stale",
    });
  });

  it("last_commit_days_ago == stale_days counts as stale for an unmerged branch", () => {
    const out = one(branch({ last_commit_days_ago: 90 }));
    assert.deepEqual(out.branches[0], {
      name: "feature",
      action: "review",
      reason: "stale but not merged",
    });
  });

  it("one day below the default stale_days is not stale", () => {
    const out = one(branch({ merged: true, last_commit_days_ago: 89 }));
    assert.equal(out.branches[0].reason, "merged but recently active");
  });

  it("a custom stale_days moves the boundary (and equality still counts)", () => {
    const stale = one(branch({ merged: true, last_commit_days_ago: 30 }), { stale_days: 30 });
    assert.equal(stale.branches[0].reason, "merged and stale");
    const fresh = one(branch({ merged: true, last_commit_days_ago: 29 }), { stale_days: 30 });
    assert.equal(fresh.branches[0].reason, "merged but recently active");
    // The same 30-day branch is recent under the default 90.
    const byDefault = one(branch({ merged: true, last_commit_days_ago: 30 }));
    assert.equal(byDefault.branches[0].reason, "merged but recently active");
  });

  it("stale_days of 1 is valid and makes a 1-day-old merged branch stale", () => {
    const out = one(branch({ merged: true, last_commit_days_ago: 1 }), { stale_days: 1 });
    assert.equal(out.branches[0].reason, "merged and stale");
  });

  it("a custom default_branch is the branch that rule 1 protects", () => {
    const out = planBranchCleanup({
      default_branch: "trunk",
      branches: [
        branch({ name: "trunk", merged: true, upstream_gone: true, last_commit_days_ago: 999 }),
        branch({ name: "main", merged: true, upstream_gone: true, last_commit_days_ago: 999 }),
      ],
    });
    assert.deepEqual(out.branches, [
      { name: "main", action: "delete", reason: "merged and upstream is gone" },
      { name: "trunk", action: "keep", reason: "default branch" },
    ]);
  });

  it("zero days since the last commit is valid", () => {
    const out = one(branch({ last_commit_days_ago: 0 }));
    assert.equal(out.branches[0].reason, "active");
  });

  it("omitted flags default to false", () => {
    const out = one({ name: "bare", last_commit_days_ago: 500 });
    assert.deepEqual(out.branches[0], {
      name: "bare",
      action: "review",
      reason: "stale but not merged",
    });
  });
});

describe("planBranchCleanup — result shape, sorting, counts, commands", () => {
  const mixed = () =>
    planBranchCleanup({
      branches: [
        branch({ name: "zebra-old", merged: true, last_commit_days_ago: 300 }),
        branch({ name: "apple-gone", merged: true, upstream_gone: true }),
        branch({ name: "main" }),
        branch({ name: "mid-review", merged: true }),
        branch({ name: "Zebra-caps", last_commit_days_ago: 400 }),
        branch({ name: "active-one" }),
      ],
    });

  it("branches are sorted by name ascending in code-unit order, regardless of input order", () => {
    const out = mixed();
    assert.deepEqual(
      out.branches.map((b) => b.name),
      ["Zebra-caps", "active-one", "apple-gone", "main", "mid-review", "zebra-old"],
    );
  });

  it("plan lists group the names under each action, each sorted ascending", () => {
    const out = mixed();
    assert.deepEqual(out.plan, {
      delete: ["apple-gone", "zebra-old"],
      review: ["Zebra-caps", "mid-review"],
      keep: ["active-one", "main"],
    });
  });

  it("counts are exactly the lengths of the plan lists", () => {
    const out = mixed();
    assert.deepEqual(out.counts, { delete: 2, review: 2, keep: 2 });
    assert.equal(out.counts.delete, out.plan.delete.length);
    assert.equal(out.counts.review, out.plan.review.length);
    assert.equal(out.counts.keep, out.plan.keep.length);
    assert.equal(
      out.counts.delete + out.counts.review + out.counts.keep,
      out.branches.length,
    );
  });

  it("commands are exactly 'git branch -d <name>' for delete branches only, in name order", () => {
    const out = mixed();
    assert.deepEqual(out.commands, [
      "git branch -d apple-gone",
      "git branch -d zebra-old",
    ]);
  });

  it("a plan with no delete branches has an empty commands list", () => {
    const out = one(branch({}));
    assert.deepEqual(out.commands, []);
    assert.deepEqual(out.counts, { delete: 0, review: 0, keep: 1 });
  });

  it("the full result object matches exactly for a small set", () => {
    const out = planBranchCleanup({
      branches: [
        { name: "old", merged: true, upstream_gone: true, last_commit_days_ago: 10 },
        { name: "main", last_commit_days_ago: 10 },
      ],
    });
    assert.deepEqual(out, {
      branches: [
        { name: "main", action: "keep", reason: "default branch" },
        { name: "old", action: "delete", reason: "merged and upstream is gone" },
      ],
      plan: { delete: ["old"], review: [], keep: ["main"] },
      counts: { delete: 1, review: 0, keep: 1 },
      commands: ["git branch -d old"],
    });
  });

  it("unknown extra fields are ignored (pinned judgement call)", () => {
    const out = planBranchCleanup({
      branches: [{ name: "x", last_commit_days_ago: 1, colour: "blue" }],
      comment: "not part of the spec",
    });
    assert.equal(out.branches[0].reason, "active");
  });
});

describe("planBranchCleanup — validation", () => {
  const throws = (args: unknown, message: string) =>
    assert.throws(() => planBranchCleanup(args), { message });

  it("branches missing is an error naming branches", () => {
    throws({}, "branches is required");
    throws(null, "branches is required");
    throws([], "branches is required");
  });

  it("branches empty or not an array is an error", () => {
    throws({ branches: [] }, "branches must be a non-empty array");
    throws({ branches: "main" }, "branches must be a non-empty array");
    throws({ branches: 7 }, "branches must be a non-empty array");
  });

  it("a branch entry that is not an object names its path", () => {
    throws({ branches: ["main"] }, "branches[0] must be an object");
    throws({ branches: [branch({}), null] }, "branches[1] must be an object");
  });

  it("name missing names its path", () => {
    throws(
      { branches: [{ last_commit_days_ago: 3 }] },
      "branches[0].name is required",
    );
  });

  it("name empty or non-string names its path", () => {
    throws({ branches: [branch({ name: "" })] }, "branches[0].name must be a non-empty string");
    throws({ branches: [branch({ name: 42 })] }, "branches[0].name must be a non-empty string");
  });

  it("a duplicate name names the second occurrence's path", () => {
    throws(
      {
        branches: [
          branch({ name: "dup" }),
          branch({ name: "other" }),
          branch({ name: "dup" }),
        ],
      },
      'branches[2].name duplicates branches[0].name "dup"',
    );
  });

  it("last_commit_days_ago missing names its path", () => {
    throws(
      { branches: [{ name: "x" }] },
      "branches[0].last_commit_days_ago is required",
    );
  });

  it("last_commit_days_ago negative names its path", () => {
    throws(
      { branches: [branch({ last_commit_days_ago: -1 })] },
      "branches[0].last_commit_days_ago must be an integer >= 0",
    );
  });

  it("last_commit_days_ago non-integer or non-number names its path", () => {
    throws(
      { branches: [branch({ last_commit_days_ago: 1.5 })] },
      "branches[0].last_commit_days_ago must be an integer >= 0",
    );
    throws(
      { branches: [branch({ name: "ok" }), branch({ name: "bad", last_commit_days_ago: "3" })] },
      "branches[1].last_commit_days_ago must be an integer >= 0",
    );
  });

  it("non-boolean flags name their exact paths", () => {
    throws(
      { branches: [branch({ merged: "yes" })] },
      "branches[0].merged must be a boolean",
    );
    throws(
      { branches: [branch({ upstream_gone: 1 })] },
      "branches[0].upstream_gone must be a boolean",
    );
    throws(
      { branches: [branch({ protected: null })] },
      "branches[0].protected must be a boolean",
    );
    throws(
      { branches: [branch({ name: "a" }), branch({ name: "b", current: "no" })] },
      "branches[1].current must be a boolean",
    );
  });

  it("stale_days errors use the exact pinned message", () => {
    for (const bad of [0, -3, 1.5, "90", true, null]) {
      throws(
        { branches: [branch({})], stale_days: bad },
        "stale_days must be an integer >= 1",
      );
    }
  });

  it("default_branch empty or non-string names the path", () => {
    throws(
      { branches: [branch({})], default_branch: "" },
      "default_branch must be a non-empty string",
    );
    throws(
      { branches: [branch({})], default_branch: 9 },
      "default_branch must be a non-empty string",
    );
  });

  it("stale_days is validated before individual branches (pinned judgement call)", () => {
    throws(
      { branches: [{ name: "x" }], stale_days: 0 },
      "stale_days must be an integer >= 1",
    );
  });

  it("no partial result is produced on invalid input", () => {
    assert.throws(() =>
      planBranchCleanup({
        branches: [branch({ name: "fine" }), branch({ name: "fine" })],
      }),
    );
  });
});
