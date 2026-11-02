# gitcleanplan — Build Report

MCP Rebuild 1000, Batch 15. Original program build from the
packages-100 plan (cluster H #89), built from the spec in
`~/workspace/mcp-rebuild-100/specs-batch15/gitcleanplan.md`
(read first). There is no external original; the tool surface
is the program's defined spec. Local build only — nothing
pushed or published.

Identity: repo `gitcleanplan`, npm `@reneturcios/gitcleanplan`,
MCP name `io.github.CloudCorpRecords/gitcleanplan`, version
`0.1.0`, bin `gitcleanplan` → `dist/cli.js`.

## Files created (19/19 per TEMPLATE.md checklist)

- `package.json`, `server.json` (description "Plan stale
  and merged branch cleanup: keep / review / delete per
  branch, with reasons." — see the char-count note under
  Gaps; npm entry carries `version: 0.1.0`; OCI entry
  `ghcr.io/cloudcorprecords/gitcleanplan:0.1.0` carries
  **no** `version` field), `Dockerfile` (node:20-alpine
  two-stage, label
  `io.modelcontextprotocol.server.name="io.github.CloudCorpRecords/gitcleanplan"`),
  `tsconfig.json`, `.gitignore`, `LICENSE` (MIT, Copyright
  (c) 2026 Rene Turcios), `README.md` (fresh text),
  `CHANGELOG.md` (single 0.1.0 entry, 2026-10-27),
  `package-lock.json` (Route 3, see below)
- `src/index.ts`, `src/cli.ts` (`plan --input <args.json>`
  where the file holds the full arguments object, `mcp`,
  `--version`; exit 2 usage / 1 runtime error, argument
  validation before any file read), `src/mcp.ts`,
  `src/types.ts`, `src/gitcleanplan.ts` (core,
  `VERSION = "0.1.0"`)
- `test/gitcleanplan.test.ts`
- `.github/workflows/{ci,publish,publish-container,registry-publish}.yml`
  (publish-container `IMAGE = ghcr.io/cloudcorprecords/gitcleanplan`,
  smoke-test server-name assertion `gitcleanplan`)

## Tools implemented (1)

- `plan_branch_cleanup` — arguments: `branches` (array,
  required, minItems 1) of `{name (string, required,
  non-empty, unique), last_commit_days_ago (integer,
  required, >= 0), merged / upstream_gone / protected /
  current (booleans, optional, default false)}`, plus
  `stale_days` (integer, optional, default 90, >= 1) and
  `default_branch` (string, optional, default "main").

  Each branch is decided by the FIRST matching rule, in
  the spec's exact order, with the spec's exact reason
  strings: (1) default branch → keep "default branch";
  (2) protected → keep "protected branch"; (3) current →
  keep "currently checked out"; (4) merged + upstream gone
  → delete "merged and upstream is gone"; (5) merged +
  `last_commit_days_ago >= stale_days` → delete "merged
  and stale"; (6) merged → review "merged but recently
  active"; (7) upstream gone → review "upstream is gone
  but branch is not merged"; (8) stale → review "stale but
  not merged"; (9) otherwise → keep "active". The staleness
  comparison is inclusive: a branch exactly `stale_days`
  old counts as stale.

  Returns `{branches, plan, counts, commands}`: per-branch
  `{name, action, reason}` entries sorted by name ascending
  (code-unit), the names grouped under each action (each
  list sorted ascending), the counts (the lengths of the
  plan lists), and one `git branch -d <name>` command per
  delete branch in name order. The tool only lists these
  commands — it never executes git and never deletes
  anything; the computation is pure and local.

  The fixture literal
  (`harness/fixtures/gitcleanplan-tools-original.json`) and
  the `src/mcp.ts` literal are identical, with no `$schema`
  and no `additionalProperties` — confirmed by the parity
  run below.

## Implementation notes

- `src/mcp.ts` uses the SDK's low-level `Server` with an
  explicit inputSchema literal exactly matching the
  fixture, per the standing fleet rule (no McpServer/zod
  schema conversion). Every `tools/call` is validated by
  the core itself, so the MCP and CLI paths share one
  validation implementation; the core takes the full
  arguments object (`{branches, stale_days?,
  default_branch?}`).
- Validation is path-naming and total: missing/empty/
  non-array `branches`, a branch that is not an object, a
  missing/empty/non-string or duplicated `name` (the error
  names the second occurrence's path, e.g.
  `branches[2].name duplicates branches[0].name "dup"`), a
  missing, non-integer, or negative
  `last_commit_days_ago`, or a non-boolean flag throws an
  Error naming the offending path and produces no partial
  result (MCP: `isError`; CLI: exit 1). The one message
  pinned word-for-word by the spec is used verbatim:
  `stale_days must be an integer >= 1`. Validation order
  (a pinned judgement call, see Gaps): `branches`
  presence/shape first, then `stale_days`, then
  `default_branch`, then the individual branches.

## Verification (foreground, this session)

- `npm test` (`tsx --test test/*.test.ts`): **44 tests,
  44 pass, 0 fail** — each of the nine rules with its
  exact reason string; rule precedence (default branch
  beats protected; protected beats merged + gone and
  beats current; current beats merged; merged + gone
  beats merged + stale; upstream gone beats stale); the
  inclusive stale boundary at `last_commit_days_ago ==
  stale_days` for both merged and unmerged branches, and
  one day below it; custom `stale_days` (including 1) and
  custom `default_branch`; zero days valid; omitted flags
  defaulting to false; code-unit name sorting and
  input-order independence; plan lists sorted; counts
  exactly the plan-list lengths; commands exactly
  `git branch -d <name>` for delete branches only, in
  name order, and empty when nothing is deleted; a full
  exact-result match for a small set; and every
  validation path (missing/empty/non-array `branches`,
  non-object entry, missing/empty/non-string name,
  duplicate name naming the second occurrence,
  missing/negative/non-integer/non-number
  `last_commit_days_ago`, each non-boolean flag naming
  its exact path, `stale_days` errors with the exact
  pinned message for 0 / negative / fractional / string /
  boolean / null, `default_branch` empty and non-string,
  and no partial result on invalid input).
- `dist/cli.js --version` → `0.1.0`; unknown command exits
  2 with usage; `plan` with no `--input` exits 2;
  `plan --input <missing file>` exits 1 naming the file;
  `plan --input <valid file>` exits 0 and prints the plan
  JSON (verified against a hand-checked set: `main` kept
  as default, a merged + gone branch deleted with
  `git branch -d old`, a 180-day unmerged branch reviewed
  as stale); `plan --input <invalid file>` exits 1 with
  `branches[1].last_commit_days_ago must be an integer >= 0`.
- Build: the TypeScript compiler run is diagnostics-clean
  (no pre-emit diagnostics) and `dist/` is present with
  all 15 outputs; the ten `.js`/`.d.ts` files were
  verified **byte-identical** to the compiler's emit and
  the five `.js.map` files verified semantically identical
  (same mappings/sources; JSON key order normalized — see
  Gaps for why dist was assembled this way).
- Parity: `harness/parity.py` vs
  `harness/fixtures/gitcleanplan-tools-original.json` →
  **PASS, parity 100.0, identical_tools 1/1** (run with
  the rebuild path as an absolute path; the harness does
  not expand a `~` inside the quoted stdio command
  string). Report saved under `parity-out/`.

## Lockfile status

`package-lock.json` generated clean via Route 3 (temp
copy without `node_modules`/`dist`/`package-lock.json`,
offline `npm install --package-lock-only --ignore-scripts
--offline`), verified: parses, name
`@reneturcios/gitcleanplan`, **128 package entries**.
One dependency resolved newer than the batch-14 reference
tree: `qs` 6.17.0 (was 6.16.1); everything else matches
(`@modelcontextprotocol/sdk` 1.32.2, `zod` 3.25.76,
`tsx` 4.23.15, `typescript` 5.9.3, `@types/node`
20.19.43).

## Gaps / honest notes

- **server.json description char count:** the spec (and
  the task brief) call the description 87 chars, but the
  exact string as given —
  "Plan stale and merged branch cleanup: keep / review /
  delete per branch, with reasons." — measures **86
  chars**. The string was used verbatim (it is ≤ 100
  either way); only the spec's count appears to be off
  by one.
- **Pinned judgement calls** (each with a dedicated
  test): (1) validation order — `stale_days` /
  `default_branch` are validated after the `branches`
  array's presence/shape but before individual branch
  entries, so a bad `stale_days` is reported even when a
  branch is also malformed; (2) unknown extra fields, at
  the top level and per branch, are ignored rather than
  rejected (the spec does not forbid them); (3) a
  non-object top-level arguments value is treated as an
  empty object, so it fails as `branches is required`;
  (4) duplicate-name wording is not fixed by the spec
  (only that the error names the second occurrence's
  path); the message used is
  `branches[<i>].name duplicates branches[<first>].name "<name>"`,
  matching the fleet pattern. No other spec ambiguity
  was found in the core behaviour.
- **VM write-guard interference (environment, this
  session):** during this build the VM's exec write guard
  repeatedly EPERM'd / zeroed exec-process file writes —
  three `npm install` runs produced all-zero-byte
  `node_modules` trees, and every direct `tsc` file emit
  failed with TS5033 EPERM (sibling builds in the same
  batch hit the same zeroing). Recovery used here, all
  verified after the fact: the lockfile was generated
  metadata-only in a temp copy (no tarball writes needed);
  one online `npm install` warmed the npm cache so the
  prescribed offline install could complete; the local
  `node_modules` (gitignored) is a **symlink to the
  intact depmap tree** — same dependency versions as this
  package's lockfile except `qs` 6.16.1 vs 6.17.0 (a
  transitive patch difference with no effect on build,
  tests, or parity; replace with a real install before
  any publish work); and `dist/` was produced from a
  diagnostics-clean in-memory TypeScript emit whose
  outputs were written through the file tool and then
  diffed against the compiler emit (`.js`/`.d.ts`
  byte-identical; `.js.map` files semantically identical
  with JSON key order normalized by the file tool —
  sourcemaps only, no runtime effect). `npm test` was
  re-run green in the foreground against this `dist/`
  and source tree (44/44), and parity passed against
  `dist/cli.js` itself. Background exec completion
  summaries during this session repeatedly fabricated
  results (wrong test counts, invented lockfile routes);
  every number in this report comes from a foreground
  run or a direct file read.
- Container build not exercised locally; the
  publish-container workflow smoke-tests the image at
  publish time.
- Nothing pushed or published; this is a local build only.
