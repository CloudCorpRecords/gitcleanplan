/**
 * gitcleanplan types.
 *
 * gitcleanplan plans the cleanup of stale and merged git
 * branches. The caller supplies branch data — each branch's
 * name, whether it is merged, how many whole days have passed
 * since its last commit, and three optional flags (upstream
 * gone, protected, currently checked out) — plus optionally a
 * staleness threshold and a default branch name. From that
 * data alone, as pure local computation, gitcleanplan reports:
 *
 *   - for every branch, a keep / review / delete decision
 *     with the exact reason that produced it
 *   - the branch names grouped under each action
 *   - the count under each action
 *   - one safe-delete command per branch planned for
 *     deletion
 *
 * A plan is advice, not action: nothing here runs git,
 * touches a repository, or deletes anything. The commands
 * are listed so a human can read the plan first and decide
 * what, if anything, to run.
 */

/** One branch to plan for, as supplied by the caller. */
export interface GitCleanPlanBranch {
  /** Branch name; unique across the supplied set. */
  name: string;
  /**
   * True when the branch is merged into the default branch.
   * Defaults to false when omitted.
   */
  merged: boolean;
  /** Whole days since the branch's last commit; at least 0. */
  last_commit_days_ago: number;
  /**
   * True when the branch's upstream is gone.
   * Defaults to false when omitted.
   */
  upstream_gone: boolean;
  /**
   * True for protected branches. Defaults to false when
   * omitted.
   */
  protected: boolean;
  /**
   * True for the currently checked-out branch. Defaults to
   * false when omitted.
   */
  current: boolean;
}

/** The action planned for one branch. */
export type GitCleanPlanAction = "keep" | "review" | "delete";

/** One branch's decision: its name, its action, and why. */
export interface GitCleanPlanBranchEntry {
  /** Branch name. */
  name: string;
  /** The planned action for this branch. */
  action: GitCleanPlanAction;
  /** The exact reason string of the rule that decided it. */
  reason: string;
}

/** Branch names grouped by action. */
export interface GitCleanPlanGroups {
  /** Names planned for deletion, sorted ascending. */
  delete: string[];
  /** Names planned for review, sorted ascending. */
  review: string[];
  /** Names planned to keep, sorted ascending. */
  keep: string[];
}

/** How many branches fall under each action. */
export interface GitCleanPlanCounts {
  delete: number;
  review: number;
  keep: number;
}

/** The branch cleanup plan. */
export interface GitCleanPlanResult {
  /** Per-branch decisions, sorted by name ascending. */
  branches: GitCleanPlanBranchEntry[];
  /** Branch names under each action, each list sorted. */
  plan: GitCleanPlanGroups;
  /** The lengths of the plan lists. */
  counts: GitCleanPlanCounts;
  /**
   * One `git branch -d <name>` command per delete branch, in
   * name ascending order. Listed only — never executed.
   */
  commands: string[];
}
