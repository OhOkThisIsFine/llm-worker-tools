# Remediation Report

## Resolved — Changed Files

- **FINDING-001**: CFG-002: Action tags are mutable floating labels, not pinned commit SHAs
  - *Verification*: .github/workflows/publish.yml now uses full 40-character action commit SHAs for actions/checkout and actions/setup-node instead of floating action tags.
Verified official GitHub refs with git ls-remote: actions/checkout v6.0.3 peels to df4cb1c069e1874edd31b4311f1884172cec0e10; actions/setup-node v6.4.0 resolves to 48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e.
Ran workflow text checks confirming both action uses entries are pinned to 40-character hexadecimal SHAs.
- **FINDING-002**: CFG-001: actions/checkout@v6 and actions/setup-node@v6 do not exist
  - *Verification*: .github/workflows/publish.yml no longer references actions/checkout@v6 or actions/setup-node@v6, so it avoids runtime resolution through mutable major tags.
Current official GitHub refs show v6 releases exist; the workflow pins the corresponding immutable v6 release commit SHAs rather than downgrading to mutable v4 tags.
- **FINDING-003**: COR-001: Child args incorrectly pass command name for read/write/models
  - *Verification*: bin dispatch strips wrapper command token for worker commands and passes LLM_WORKER_TOOLS_COMMAND fallback
npm test
- **FINDING-004**: DA-004: Dependency cycle: 5 modules
  - *Verification*: Added scripts/command-metadata.mjs as leaf command metadata shared by bin and validation
validate-plugin no longer imports CLI entrypoint
npm test
- **FINDING-006**: REL-001: MCP runWorker child process has no timeout
  - *Verification*: MCP server now calls worker helpers in-process, removing the parent child-process hang path
npm test
- **FINDING-007**: TST-002: No unit tests for cache logic, parseWorkerJson, setsEqual, or retry loop
  - *Verification*: Added node:test coverage for setsEqual, parseWorkerJson, cache helpers, model rotation, timeout retry, and signal passing
npm test
- **FINDING-008**: CFG-001: npm publish step has no NODE_AUTH_TOKEN and workflow_dispatch lacks branch guard
  - *Verification*: jobs.publish.if now allows tag pushes while restricting workflow_dispatch to the repository default branch and refs/heads/main.
Both dry-run and live publish steps set NODE_AUTH_TOKEN to ${{ secrets.NPM_TOKEN }}.
Ran workflow text checks confirming NODE_AUTH_TOKEN is present and the manual dispatch gate includes github.event.repository.default_branch.
- **FINDING-009**: COR-002: Privacy and ToS URLs point to OpenAI policies, not this project
  - *Verification*: Removed OpenAI privacy and terms URLs from .codex-plugin/plugin.json
npm test
- **FINDING-010**: REL-001: Unhandled stdin write error in MCP runWorker can crash the server
  - *Verification*: MCP no longer writes to a child stdin stream for tool calls
npm test
- **FINDING-011**: COR-002: Wrong legal policy URLs reference OpenAI instead of the actual plugin author
  - *Verification*: Removed unrelated OpenAI legal policy URLs from plugin manifest
npm test
- **FINDING-012**: TST-002: Zero test coverage for llm-worker.mjs critical paths
  - *Verification*: Worker module is importable without CLI side effects and covered by node:test
npm test
- **FINDING-013**: COR-002: AbortSignal not passed to model-selection or cache-refresh calls
  - *Verification*: AbortSignal is threaded through model listing, model selection, cache refresh, resolveModel, nextModel, and worker calls
npm test
- **FINDING-017**: OBS-004: MCP server silently discards worker stderr on successful exits
  - *Verification*: MCP tool calls collect worker diagnostics via logger and return them as separate text content when present
npm test
- **FINDING-018**: DR-001: MCP server spawns a new subprocess for every tool call
  - *Verification*: Refactored llm-worker.mjs to export runWorker/showModels and updated MCP server to call them in-process
npm test
- **FINDING-019**: PERF-002: MCP stdin accumulation uses Buffer.concat on every chunk, O(n^2) copy cost
  - *Verification*: Replaced per-chunk full inputBuffer concatenation with queued chunks and targeted byte consumption
npm test
- **FINDING-022**: OPR-001: No dry-run or pack preview before npm publish
  - *Verification*: .github/workflows/publish.yml now runs npm publish --dry-run --access public after npm test and before the live publish step.
Ran workflow text checks confirming npm test, package preview, and live npm publish execute in the expected order.
- **FINDING-023**: TST-001: No tests for bin CLI dispatch logic
  - *Verification*: Added bin dispatch tests for help, unknown command, worker/setup arg forwarding, env fallback, and spawn errors
npm test
- **FINDING-024**: TST-003: No tests for MCP protocol parsing and tool dispatch in llm-worker-mcp.mjs
  - *Verification*: Added MCP parser and dispatch tests for initialize, tools/list, validation, fragmented frames, concatenated frames, and invalid JSON recovery
npm test
- **FINDING-025**: DR-004: No timeout retry in the worker - transient backend pressure is fatal
  - *Verification*: Added verb-specific timeout config and one timeout retry with backoff before final timeout failure
npm test
- **FINDING-026**: MNT-001: opencode.json duplicates the full permission block under root and agent.auditor
  - *Verification*: opencode.json does not exist in this checkout; the duplicated OpenCode permission block described by the audit is absent, so no source change is appropriate.
- **FINDING-028**: COR-001: Stub/placeholder URLs do not resolve to the actual project
  - *Verification*: Updated homepage, repository, and interface.websiteURL to https://github.com/OhOkThisIsFine/llm-worker-tools
npm test
- **FINDING-029**: COR-005: validate-plugin.mjs resolves root from process.cwd() instead of script directory
  - *Verification*: validate-plugin now derives root from fileURLToPath(import.meta.url) instead of process.cwd()
npm test
- **FINDING-030**: CFG-003: workflow_dispatch trigger allows publish from any branch without a gate
  - *Verification*: jobs.publish.if now permits push events only when github.ref starts with refs/tags/v and permits workflow_dispatch only from refs/heads/main.
Ran workflow text checks confirming the tag gate and main-branch workflow_dispatch gate are present.
- **FINDING-031**: REL-003: is404() string match can falsely trigger model rotation on unrelated errors
  - *Verification*: is404 now checks structured status fields only and ignores arbitrary message text
npm test
- **FINDING-032**: REL-002: MCP server process does not exit when stdin closes
  - *Verification*: MCP server now handles stdin end/close with an idempotent shutdown path
npm test
- **FINDING-034**: COR-007: openai.yaml contains only interface display metadata with no agent name field
  - *Verification*: Added top-level name: "llm-worker" to skills/llm-worker/agents/openai.yaml
npm test
- **FINDING-035**: REL-004: bin child exit code defaults to 1 on signal termination, erasing signal context
  - *Verification*: bin exit handler now preserves numeric child exits and propagates child termination signals
npm test
- **FINDING-036**: OBS-001: Child process error handler omits command context
  - *Verification*: bin spawn error output now includes command and resolved script context
npm test
- **FINDING-039**: DR-010: Install script always overwrites AGENTS.md, discarding user customizations
  - *Verification*: installSharedInstructions now preserves customized AGENTS.md and appends a managed block instead of overwriting
npm test
- **FINDING-040**: OPR-002: install-ides.mjs prints no per-integration summary at completion
  - *Verification*: install-ides now records per-integration outcomes and prints a final summary
npm test
- **FINDING-041**: OPR-003: llm-worker-mcp.mjs emits no startup message to confirm server is ready
  - *Verification*: MCP server emits a startup readiness message to stderr before accepting stdio messages
npm test
- **FINDING-043**: DR-006: MCP server version is hardcoded instead of read from package.json
  - *Verification*: MCP initialize response reads serverInfo.version from package.json
npm test
- **FINDING-044**: MNT-002: package.json version not read by MCP server, causing hardcoded version drift
  - *Verification*: package.json remains the canonical MCP server version source
npm test
- **FINDING-045**: OBS-003: selectBestModel warning omits the raw LLM response that caused the mismatch
  - *Verification*: selectBestModel warning now includes normalized selection, fallback model, and JSON-stringified raw response content
npm test
- **FINDING-046**: PERF-001: setsEqual builds a new Set on every comparison call
  - *Verification*: setsEqual now performs allocation-free index comparison over sorted arrays
npm test
- **FINDING-047**: DR-009: Stateless per-call design not surfaced as a documented constraint
  - *Verification*: Documented stateless single-call limitation in shared policy, generated host files, and skills/llm-worker/SKILL.md
npm test
- **FINDING-048**: MNT-002: Third-party (OpenAI) policy URLs require external maintenance
  - *Verification*: Removed interface.privacyPolicyURL and interface.termsOfServiceURL from .codex-plugin/plugin.json because no project-owned legal pages exist and keeping unrelated OpenAI policy URLs was the maintenance risk.
- **FINDING-049**: OBS-002: Timeout error does not report verb or model in use
  - *Verification*: runWorker timeout failure messages include timeout duration, verb, and active model
npm test
- **FINDING-050**: MNT-001: Unfinished placeholder URLs spread across multiple fields
  - *Verification*: Replaced all bare https://github.com/ manifest placeholders with the canonical project URL
npm test
- **FINDING-054**: COR-006: install-ides.mjs CLAUDE.md append loses leading blank line from includeLine
  - *Verification*: Claude instruction append now builds a section without relying on a leading blank line and inserts an explicit separator only when needed
npm test
- **FINDING-055**: DR-007: llm-worker-codex.ps1 adds no unique value over the CLI
  - *Verification*: Removed scripts/llm-worker-codex.ps1 and validation references; skill docs use npx --yes llm-worker-tools commands
npm test
npm pack --dry-run --json
- **FINDING-057**: COR-004: opencode.json bash permission uses bare 'audit-code' instead of full invocation path
  - *Verification*: opencode.json does not exist in this checkout; the stale audit-code permission prefixes described by the audit are absent, so no source change is appropriate.
- **FINDING-058**: COR-003: readInput falls through without specific error when stdin is non-TTY but empty
  - *Verification*: readInput now returns trimmed non-TTY stdin unconditionally, preserving empty stdin errors and preventing env fallback
npm test
- **FINDING-059**: COR-001: Unset env var resolves to empty string, not absent variable
  - *Verification*: Removed the VS Code MCP env placeholder from .vscode/mcp.json and sync-host-files template
npm test

## Verified Already Correct (no changes made)

- **FINDING-005**: DA-006: Dependency cycle: 5 modules
  - *Verification*: No source change required per prompt; current env-utils import direction remains acyclic
npm test
- **FINDING-014**: DA-009: Dependency cycle: 2 modules
  - *Verification*: No source change required per prompt; sync-host-files and validate-plugin are not in an ESM import cycle
npm test
- **FINDING-015**: DA-003: Dependency cycle: 4 modules
  - *Verification*: No source change required per prompt; env-utils remains a leaf utility and MCP imports worker one-way
npm test
- **FINDING-016**: DA-005: Dependency cycle: 4 modules
  - *Verification*: No source refactor required per prompt; CLI dispatch remains process-spawn based and validation does not import the CLI
npm test
- **FINDING-033**: COR-001: No guard for missing or null prompt_path in next-step JSON output
  - *Verification*: .gemini/commands/audit-code.toml is absent; no source change appropriate per prompt
- **FINDING-037**: MNT-002: Development override prefix duplicated in two code blocks
  - *Verification*: .gemini/commands/audit-code.toml is absent; no source change appropriate per prompt
- **FINDING-042**: MNT-001: Magic constant --host-max-active-subagents 4 repeated three times
  - *Verification*: .gemini/commands/audit-code.toml is absent; no source change appropriate per prompt
- **FINDING-051**: DA-010: 2 orphan unit(s) with no graph connections
  - *Verification*: No source change needed per prompt; plugin manifest and VS Code config are host-discovered entrypoints
- **FINDING-052**: OBS-001: ensure --quiet suppresses setup failure output
  - *Verification*: .gemini/commands/audit-code.toml is absent; no source change appropriate per prompt
- **FINDING-056**: COR-002: No error-handling instruction for non-zero exit from audit-code commands
  - *Verification*: .gemini/commands/audit-code.toml is absent; no source change appropriate per prompt

## Deemed Inappropriate

- **FINDING-020**: User explicitly skipped this item during implementation preview: having an LLM rank models is acceptable, and replacing it with deterministic heuristics has too many edge cases.

## Ignored

- **FINDING-021**: The requested per-host installer module decomposition is a broad architecture refactor; I only made the approved local installer fixes that were safe in this dirty worktree.
- **FINDING-027**: The requested broad risk-concentration decomposition overlaps the larger installer decomposition and could not be safely completed as a bounded B-002 edit.
- **FINDING-038**: The MCP SDK migration requires adding a new dependency and a full protocol refactor; I preserved and tested the existing stdio parser instead.
- **FINDING-053**: I added prepack/prepublishOnly host-file sync and verified npm pack includes generated outputs, but excluding/removing generated files from source-control diffs would require .gitignore or index changes outside the allowed B-002 edit list and would risk trampling existing dirty generated-file edits.

## Closing Action

Action: none
Status: skipped

## Remediation Outcomes

Of 59 finding(s): 44 resolved, 10 verified already correct, 1 deemed inappropriate, 4 ignored, 0 blocked.

By lens:
- architecture: resolved 7, verified_no_change 5, inappropriate 1, ignored 4
- config_deployment: resolved 4
- correctness: resolved 11, verified_no_change 2
- maintainability: resolved 4, verified_no_change 2
- observability: resolved 4, verified_no_change 1
- operability: resolved 3
- performance: resolved 2
- reliability: resolved 5
- tests: resolved 4
