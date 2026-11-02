# gitcleanplan

Branch lists grow quietly. A feature lands, its branch stays;
an experiment is abandoned, its branch stays too; the upstream
disappears and the local copy lingers. Deleting branches on a
hunch is how work gets lost, so gitcleanplan takes the middle
road: you hand it the branch data, and it hands back a plan —
**lists first, deletes nothing**.

For every branch you supply, the plan gives one of three
decisions, each with the reason that produced it:

- **keep** — the default branch, a protected branch, the
  branch currently checked out, or a branch that is simply
  still active.
- **review** — merged but recently active, upstream gone but
  not merged, or stale but not merged: promising cleanup
  candidates that deserve a human look before anything else.
- **delete** — merged *and* either its upstream is gone or
  it has been stale for at least `stale_days`. Only merged
  branches can ever land here.

Decisions follow a fixed rule order, so the reason is never
ambiguous: the default branch wins over protection,
protection wins over a merged-and-gone branch, being checked
out wins over being merged, and "merged and upstream is
gone" wins over "merged and stale". Staleness is inclusive —
a branch whose last commit was exactly `stale_days` ago
counts as stale.

Alongside the per-branch decisions, the result groups the
branch names under each action, counts them, and lists one
safe-delete command (`git branch -d <name>`) per branch
planned for deletion, in name order. Those commands are
**listed, never run**: gitcleanplan does not invoke git,
open a repository, or delete anything. You read the plan,
and you decide what to execute yourself.

Malformed input — a missing or empty branch list, a missing,
empty, or duplicated branch name, a missing, negative, or
non-integer `last_commit_days_ago`, a wrongly typed flag, a
bad `stale_days` or `default_branch` — is a validation error
naming the offending path (for example
`branches[1].last_commit_days_ago must be an integer >= 0`),
and no partial plan is produced. The computation is pure and
local: no network, no configuration, no files read beyond
the input you pass in.

## CLI

```bash
npx @reneturcios/gitcleanplan plan --input args.json
npx @reneturcios/gitcleanplan --version
```

`args.json` contains the full arguments object:

```json
{
  "stale_days": 90,
  "branches": [
    { "name": "main", "last_commit_days_ago": 0, "current": true },
    { "name": "shipped-feature", "merged": true, "upstream_gone": true, "last_commit_days_ago": 45 },
    { "name": "old-spike", "last_commit_days_ago": 180 }
  ]
}
```

`merged`, `upstream_gone`, `protected`, and `current`
default to `false` per branch; `stale_days` defaults to
`90`; `default_branch` defaults to `"main"`. The plan is
printed as JSON:

```json
{
  "branches": [
    { "name": "main", "action": "keep", "reason": "default branch" },
    { "name": "old-spike", "action": "review", "reason": "stale but not merged" },
    { "name": "shipped-feature", "action": "delete", "reason": "merged and upstream is gone" }
  ],
  "plan": {
    "delete": ["shipped-feature"],
    "review": ["old-spike"],
    "keep": ["main"]
  },
  "counts": { "delete": 1, "review": 1, "keep": 1 },
  "commands": ["git branch -d shipped-feature"]
}
```

Exit codes: `0` on success, `1` on a runtime error (including
an unreadable or invalid input file, or invalid input), `2`
on a usage error.

## MCP server

```bash
npx -y @reneturcios/gitcleanplan mcp
```

MCP client config:

```json
{
  "mcpServers": {
    "gitcleanplan": {
      "command": "npx",
      "args": ["-y", "@reneturcios/gitcleanplan", "mcp"]
    }
  }
}
```

### Tools

- `plan_branch_cleanup` — Plan stale and merged branch
  cleanup.
  - `branches` (array, required, at least one) — branches as
    `{name, last_commit_days_ago, merged?, upstream_gone?,
    protected?, current?}` objects; `name` is unique across
    the set and `last_commit_days_ago` is a whole-day count
    of at least 0
  - `stale_days` (integer, optional, default 90, at least 1)
    — a branch is stale at this many days since its last
    commit
  - `default_branch` (string, optional, default `"main"`) —
    the default branch name; it is never planned for
    deletion

  Returns `{branches, plan, counts, commands}`.

## Docker

```bash
docker run -i ghcr.io/cloudcorprecords/gitcleanplan
docker run --rm -v "$PWD:/w" ghcr.io/cloudcorprecords/gitcleanplan plan --input /w/args.json
```

## Development

```bash
npm install
npm run build   # tsc -> dist/
npm test        # tsx --test test/*.test.ts (pure local, no network)
npm run dev     # run the CLI from source
```

## License

MIT — Copyright (c) 2026 Rene Turcios
