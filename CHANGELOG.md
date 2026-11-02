# Changelog

## 0.1.0 (2026-10-27)

- Initial release: `plan_branch_cleanup` MCP tool and
  `plan` CLI command producing a stale and merged branch
  cleanup plan from supplied branch data.
- One keep / review / delete decision per branch from a
  fixed nine-rule order — default branch, protected branch,
  currently checked out, merged and upstream gone, merged
  and stale, merged but recently active, upstream gone but
  not merged, stale but not merged, active — each with its
  exact reason string, with an inclusive staleness boundary
  (a branch exactly `stale_days` old counts as stale).
- Branches sorted by name, names grouped and counted per
  action, and one `git branch -d <name>` command listed per
  delete branch. The tool lists commands only: it executes
  nothing and deletes nothing.
- Path-naming validation errors for malformed input, with
  the exact pinned message for a bad `stale_days`.
