/**
 * gitcleanplan core: stale and merged branch cleanup plan.
 *
 *   planBranchCleanup(args) -> plan
 *
 * Each branch is decided by the FIRST rule that matches it,
 * in this exact order (action, reason):
 *
 *   1. name == default_branch        -> keep,   "default branch"
 *   2. protected                     -> keep,   "protected branch"
 *   3. current                       -> keep,   "currently checked out"
 *   4. merged && upstream_gone       -> delete, "merged and upstream is gone"
 *   5. merged && days >= stale_days  -> delete, "merged and stale"
 *   6. merged                        -> review, "merged but recently active"
 *   7. upstream_gone                 -> review, "upstream is gone but branch is not merged"
 *   8. days >= stale_days            -> review, "stale but not merged"
 *   9. otherwise                     -> keep,   "active"
 *
 * The staleness comparison is inclusive: a branch whose
 * last_commit_days_ago equals stale_days is stale.
 *
 * The result carries the per-branch decisions sorted by name
 * ascending (code-unit), the names grouped under each action
 * (each list sorted ascending), the counts (the lengths of
 * those lists), and one `git branch -d <name>` command per
 * delete branch in name order. Only merged branches can
 * reach a delete rule, so the safe-delete form `-d` always
 * suffices. The commands are listed only: this module never
 * executes git and never deletes anything.
 *
 * Defaults: merged / upstream_gone / protected / current
 * default to false per branch, stale_days defaults to 90,
 * and default_branch defaults to "main".
 *
 * Validation is strict and path-naming: any malformed input
 * throws an Error naming the offending path (for example
 * "branches[1].last_commit_days_ago must be an integer >= 0")
 * and no partial result is produced. The one message pinned
 * word-for-word by the spec is the stale_days one:
 * "stale_days must be an integer >= 1".
 */
import type {
  GitCleanPlanBranch,
  GitCleanPlanBranchEntry,
  GitCleanPlanResult,
} from "./types.js";

export const VERSION = "0.1.0";

const DEFAULT_STALE_DAYS = 90;
const DEFAULT_BRANCH = "main";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function optionalBoolean(
  raw: Record<string, unknown>,
  key: "merged" | "upstream_gone" | "protected" | "current",
  path: string,
): boolean {
  const value = raw[key];
  if (value === undefined) return false;
  if (typeof value !== "boolean") {
    throw new Error(`${path}.${key} must be a boolean`);
  }
  return value;
}

/**
 * Validate the raw arguments object and return the normalised
 * branch list plus the effective stale_days and
 * default_branch.
 */
function validateArgs(args: unknown): {
  branches: GitCleanPlanBranch[];
  staleDays: number;
  defaultBranch: string;
} {
  const raw: Record<string, unknown> = isRecord(args) ? args : {};

  if (raw.branches === undefined) throw new Error("branches is required");
  if (!Array.isArray(raw.branches) || raw.branches.length === 0) {
    throw new Error("branches must be a non-empty array");
  }

  let staleDays = DEFAULT_STALE_DAYS;
  if (raw.stale_days !== undefined) {
    if (
      typeof raw.stale_days !== "number" ||
      !Number.isInteger(raw.stale_days) ||
      raw.stale_days < 1
    ) {
      throw new Error("stale_days must be an integer >= 1");
    }
    staleDays = raw.stale_days;
  }

  let defaultBranch = DEFAULT_BRANCH;
  if (raw.default_branch !== undefined) {
    if (typeof raw.default_branch !== "string" || raw.default_branch.length === 0) {
      throw new Error("default_branch must be a non-empty string");
    }
    defaultBranch = raw.default_branch;
  }

  const branches: GitCleanPlanBranch[] = [];
  const indexByName = new Map<string, number>();
  raw.branches.forEach((entry, i) => {
    const path = `branches[${i}]`;
    if (!isRecord(entry)) throw new Error(`${path} must be an object`);
    if (entry.name === undefined) throw new Error(`${path}.name is required`);
    if (typeof entry.name !== "string" || entry.name.length === 0) {
      throw new Error(`${path}.name must be a non-empty string`);
    }
    const firstIndex = indexByName.get(entry.name);
    if (firstIndex !== undefined) {
      throw new Error(
        `${path}.name duplicates branches[${firstIndex}].name "${entry.name}"`,
      );
    }
    indexByName.set(entry.name, i);

    if (entry.last_commit_days_ago === undefined) {
      throw new Error(`${path}.last_commit_days_ago is required`);
    }
    if (
      typeof entry.last_commit_days_ago !== "number" ||
      !Number.isInteger(entry.last_commit_days_ago) ||
      entry.last_commit_days_ago < 0
    ) {
      throw new Error(`${path}.last_commit_days_ago must be an integer >= 0`);
    }

    branches.push({
      name: entry.name,
      merged: optionalBoolean(entry, "merged", path),
      last_commit_days_ago: entry.last_commit_days_ago,
      upstream_gone: optionalBoolean(entry, "upstream_gone", path),
      protected: optionalBoolean(entry, "protected", path),
      current: optionalBoolean(entry, "current", path),
    });
  });

  return { branches, staleDays, defaultBranch };
}

/** Decide one branch by the first matching rule, in order. */
function decide(
  branch: GitCleanPlanBranch,
  staleDays: number,
  defaultBranch: string,
): GitCleanPlanBranchEntry {
  const { name } = branch;
  if (name === defaultBranch) {
    return { name, action: "keep", reason: "default branch" };
  }
  if (branch.protected) {
    return { name, action: "keep", reason: "protected branch" };
  }
  if (branch.current) {
    return { name, action: "keep", reason: "currently checked out" };
  }
  if (branch.merged && branch.upstream_gone) {
    return { name, action: "delete", reason: "merged and upstream is gone" };
  }
  if (branch.merged && branch.last_commit_days_ago >= staleDays) {
    return { name, action: "delete", reason: "merged and stale" };
  }
  if (branch.merged) {
    return { name, action: "review", reason: "merged but recently active" };
  }
  if (branch.upstream_gone) {
    return {
      name,
      action: "review",
      reason: "upstream is gone but branch is not merged",
    };
  }
  if (branch.last_commit_days_ago >= staleDays) {
    return { name, action: "review", reason: "stale but not merged" };
  }
  return { name, action: "keep", reason: "active" };
}

/** Plan the cleanup of the supplied branches. */
export function planBranchCleanup(args: unknown): GitCleanPlanResult {
  const { branches, staleDays, defaultBranch } = validateArgs(args);

  const decided = branches
    .map((branch) => decide(branch, staleDays, defaultBranch))
    .sort((a, b) => byCodeUnit(a.name, b.name));

  const plan: GitCleanPlanResult["plan"] = { delete: [], review: [], keep: [] };
  for (const entry of decided) plan[entry.action].push(entry.name);

  const counts: GitCleanPlanResult["counts"] = {
    delete: plan.delete.length,
    review: plan.review.length,
    keep: plan.keep.length,
  };

  const commands = plan.delete.map((name) => `git branch -d ${name}`);

  return { branches: decided, plan, counts, commands };
}

/** Render a payload as the JSON text block MCP clients show. */
export function formatPayload(payload: unknown): string {
  return typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
}
