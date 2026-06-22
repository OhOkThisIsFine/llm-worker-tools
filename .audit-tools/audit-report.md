<!-- audit-tools/audit-report/v1 -->
# Audit Report

## Summary

- Findings: 58
- Work blocks: 5
- Severity breakdown: high: 7, medium: 24, low: 24, info: 3
- Lens breakdown: architecture: 26, config_deployment: 1, correctness: 3, maintainability: 21, reliability: 2, tests: 5
- Grounding (S7): grounded: 29
- Fully audited files: 6
- Excluded non-auditable files: 15

## Work Blocks

### block-1

- Max severity: high
- Units: -codex-plugin, -remediation-artifacts, -vscode, bin, file:README.md, file:shared/ambient-agent-policy.md, file:skills/llm-worker, module-llm-worker-mjs, root-config, scripts, skills-llm-worker, tests-deterministic-fallback-test-mjs, tests-env-utils-test-mjs, tests-llm-worker-test-mjs, tests-mcp-test-mjs, tests-model-fallback-test-mjs
- Owned files: .codex-plugin/plugin.json, .remediation-artifacts/run.log.jsonl, .vscode/mcp.json, README.md, bin/llm-worker-tools.mjs, llm-worker.mjs, opencode.json, package.json, remediation-report.json, scripts/command-metadata.mjs, scripts/env-utils.mjs, scripts/install-ides.mjs, scripts/llm-worker-mcp.mjs, scripts/sync-host-files.mjs, scripts/validate-plugin.mjs, shared/ambient-agent-policy.md, skills/llm-worker, skills/llm-worker/agents/openai.yaml, test/deterministic-fallback.test.mjs, test/env-utils.test.mjs, test/llm-worker.test.mjs, test/mcp.test.mjs, test/model-fallback.test.mjs
- Findings: ARC-1a6dcc69, ARC-1a6dcc69-2, ARC-3227f893, ARC-3227f893-2, ARC-3227f893-3, ARC-a41851b5, ARC-aa12e390, ARC-1a6dcc69-3, ARC-3227f893-4, ARC-3227f893-5, ARC-3227f893-6, ARC-3227f893-7, ARC-3227f893-8, ARC-4f12cf70, ARC-4f12cf70-2, ARC-5ce6946d, ARC-aa12e390-2, ARC-eaffc6ab, ARC-f833f9fb, MNT-1a6dcc69, MNT-3227f893, MNT-4f12cf70, MNT-54b220fe, MNT-5ce6946d, MNT-6681fb0c, MNT-6d8cf619, MNT-aa12e390, REL-3762b68c, ARC-3227f893-9, ARC-381320ce, ARC-4f12cf70-3, ARC-a41851b5-2, COR-3ae76802, COR-5c06c147, COR-c5ab8ad0, MNT-3227f893-2, MNT-381320ce, MNT-624dcc45, MNT-6681fb0c-2, MNT-695ef56d, MNT-7e2baffd, MNT-85422ee8, MNT-e59361cd, MNT-f21883ee, REL-c5ab8ad0, TST-039ba4e1, TST-199e7cda, TST-441aad81, MNT-b9d605bb, MNT-b9d605bb-2, TST-695ef56d
- Depends on: none
- Rationale: Findings share owned units transitively and should remain one non-overlapping remediation block.

### block-2

- Max severity: medium
- Units: -github-workflows, file:.github/workflows
- Owned files: .github/workflows, .github/workflows/publish.yml
- Findings: ARC-63c8b5a8, CFG-a2c197c9
- Depends on: block-1
- Rationale: Findings share owned units transitively and should remain one non-overlapping remediation block.

### block-3

- Max severity: medium
- Units: -gemini-commands, file:.gemini/commands
- Owned files: .gemini/commands, .gemini/commands/audit-code.toml
- Findings: ARC-34b93d00
- Depends on: none
- Rationale: Findings share owned units transitively and should remain one non-overlapping remediation block.

### block-4

- Max severity: medium
- Units: -remediation-artifacts-steps, file:.remediation-artifacts/steps
- Owned files: .remediation-artifacts/steps, .remediation-artifacts/steps/current-step.json
- Findings: ARC-94320dff
- Depends on: none
- Rationale: Findings share owned units transitively and should remain one non-overlapping remediation block.

### block-5

- Max severity: low
- Units: tests-bin-test-mjs, tests-config-test-mjs
- Owned files: test/bin.test.mjs, test/config.test.mjs
- Findings: MNT-20d326d9, MNT-6e34dce5, TST-20d326d9
- Depends on: block-1
- Rationale: Findings share owned units transitively and should remain one non-overlapping remediation block.

## Findings

### ARC-3227f893 — "Backend-neutral" is the stated identity but the design is hard-bound to the OpenAI SDK and chat/completions shape

The README and policy docs sell this tool as "backend-neutral" / "OpenAI-compatible backend", but every backend interaction is expressed directly in terms of the `openai` npm SDK and its exact wire contract: `new OpenAI({...})`, `client.models.list()`, and `client.chat.completions.create({ model, temperature, max_tokens, messages })` in llm-worker.mjs.

- Severity: high
- Confidence: high
- Lens: architecture
- Grounding: grounded
- Systemic: yes
- Files: `llm-worker.mjs`, `README.md`, `shared/ambient-agent-policy.md`
- Details: The README and policy docs sell this tool as "backend-neutral" / "OpenAI-compatible backend", but every backend interaction is expressed directly in terms of the `openai` npm SDK and its exact wire contract: `new OpenAI({...})`, `client.models.list()`, and `client.chat.completions.create({ model, temperature, max_tokens, messages })` in llm-worker.mjs. The load-bearing assumption is that any backend a user points at speaks the OpenAI chat-completions dialect AND exposes a `/models` listing endpoint. That assumption is doing a lot of unguarded work: the entire model-selection / fallback machinery (fetchModelList, selectBestModel, nextModel) only functions if `models.list()` returns a meaningful enumerable list, which many OpenAI-compatible servers (llama.cpp single-model, vLLM with one served model, Anthropic-via-proxy, Ollama's native API) do not provide in the same shape. If the goal really is neutrality, the single most valuable change is to introduce a thin Backend interface (listModels / complete) with the OpenAI implementation behind it, so the neutrality claim is structural rather than aspirational. If neutrality is NOT actually a goal, the docs should stop claiming it. Right now the marketing and the code disagree about what the product is.

### ARC-1a6dcc69 — Dependency cycle: 5 modules

Circular dependency among scripts/install-ides.mjs → scripts/llm-worker-mcp.mjs → package.json → scripts/sync-host-files.mjs → scripts/validate-plugin.mjs → scripts/install-ides.mjs.

- Severity: high
- Confidence: high
- Lens: architecture
- Grounding: not assessed
- Systemic: yes
- Files: `scripts/install-ides.mjs`, `scripts/llm-worker-mcp.mjs`, `package.json`, `scripts/sync-host-files.mjs` +1 more
- Details: Circular dependency among scripts/install-ides.mjs → scripts/llm-worker-mcp.mjs → package.json → scripts/sync-host-files.mjs → scripts/validate-plugin.mjs → scripts/install-ides.mjs. Cycles increase coupling, complicate testing, and can cause initialization-order bugs.

### ARC-aa12e390 — Dependency cycle: 6 modules

Circular dependency among bin/llm-worker-tools.mjs → scripts/command-metadata.mjs → scripts/env-utils.mjs → scripts/install-ides.mjs → scripts/llm-worker-mcp.mjs → package.json → scripts/sync-host-files.mjs → scripts/validate-plugin.mjs → bin/llm-worker-tools.mjs.

- Severity: high
- Confidence: high
- Lens: architecture
- Grounding: not assessed
- Systemic: yes
- Files: `bin/llm-worker-tools.mjs`, `package.json`, `scripts/command-metadata.mjs`, `scripts/env-utils.mjs` +4 more
- Details: Circular dependency among bin/llm-worker-tools.mjs → scripts/command-metadata.mjs → scripts/env-utils.mjs → scripts/install-ides.mjs → scripts/llm-worker-mcp.mjs → package.json → scripts/sync-host-files.mjs → scripts/validate-plugin.mjs → bin/llm-worker-tools.mjs. Cycles increase coupling, complicate testing, and can cause initialization-order bugs.

### ARC-a41851b5 — Dependency cycle: 7 modules

Circular dependency among scripts/command-metadata.mjs → scripts/env-utils.mjs → scripts/install-ides.mjs → scripts/llm-worker-mcp.mjs → package.json → scripts/sync-host-files.mjs → scripts/validate-plugin.mjs → scripts/command-metadata.mjs.

- Severity: high
- Confidence: high
- Lens: architecture
- Grounding: not assessed
- Systemic: yes
- Files: `scripts/command-metadata.mjs`, `scripts/env-utils.mjs`, `scripts/install-ides.mjs`, `scripts/llm-worker-mcp.mjs` +3 more
- Details: Circular dependency among scripts/command-metadata.mjs → scripts/env-utils.mjs → scripts/install-ides.mjs → scripts/llm-worker-mcp.mjs → package.json → scripts/sync-host-files.mjs → scripts/validate-plugin.mjs → scripts/command-metadata.mjs. Cycles increase coupling, complicate testing, and can cause initialization-order bugs.

### ARC-1a6dcc69-2 — Host-integration config has two sources of truth (install scripts vs. sync generator), with a validator bolted on to police the drift

The same logical artifacts — the MCP server stanza and the ambient-agent policy text injected into each host — are produced in two independent places using two different mechanisms.

- Severity: high
- Confidence: high
- Lens: architecture
- Grounding: grounded
- Systemic: yes
- Files: `scripts/install-ides.mjs`, `scripts/sync-host-files.mjs`, `scripts/validate-plugin.mjs`
- Details: The same logical artifacts — the MCP server stanza and the ambient-agent policy text injected into each host — are produced in two independent places using two different mechanisms. install-ides.mjs builds the server config as live JS objects (mcpServerForVSCode/Claude/OpenCode) and writes them into real user config files; sync-host-files.mjs re-emits the *same* server config and the *same* policy as hand-templated string literals into the in-repo tracked copies (.vscode/mcp.json, claude-desktop-config.example.json, CLAUDE.md, AGENTS.md, copilot-instructions.md, the OpenCode agent). These are not generated from a shared model — they are parallel hand-maintained renderings of one concept. validate-plugin.mjs + the `check:ides` gate exist specifically to detect when these two renderings drift apart, which is the classic signature of a missing single source of truth: the system spends real machinery catching a problem it could have made unrepresentable. The high-leverage redesign is to define the host targets declaratively (one table of {host, configPath, serverShape, instructionFormat}) and have BOTH the in-repo sync output and the live installer render from that one table. Today, adding a host or changing the MCP invocation means editing the logic in two files and praying the validator catches the rest.

### ARC-3227f893-2 — Model auto-selection can turn one cheap `read` into many backend calls, undermining the "effectively free" premise

The whole product is justified by one economic claim repeated in every doc: worker calls are "effectively free compared to primary-agent quota." But the model-resolution path quietly violates that premise.

- Severity: high
- Confidence: high
- Lens: architecture
- Grounding: grounded
- Systemic: yes
- Files: `llm-worker.mjs`
- Details: The whole product is justified by one economic claim repeated in every doc: worker calls are "effectively free compared to primary-agent quota." But the model-resolution path quietly violates that premise. On any cache miss, selectBestModel iterates the model list and issues a full chat.completions probe per bootstrap candidate until one answers (llm-worker.mjs:236-270). Worse, inside runWorker a single 404 from the chosen model triggers nextModel, which re-runs selectBestModel over the remaining candidates — another fan-out of probe calls — and this is inside a retry loop (llm-worker.mjs:401-438). A backend with a long or flaky model list can make one user-issued `read` cost an unbounded number of backend round-trips before any real work happens. The cache mitigates steady state, but the cache key is only (base_url, model-set membership) with a 24h TTL (cacheIsFresh), so it never reflects whether the selected model is actually still serving, and the worst-case cold/large-list behavior is exactly when the user is most likely to be waiting. The design should (a) bound selection to a single bootstrap probe or a deterministic-first strategy, and (b) treat the LLM-driven "pick the best model" step as an optional optimization, not the default hot path — the deterministicFallbackModel logic already proves a no-extra-call heuristic selection is feasible.

### ARC-3227f893-3 — Runtime model-failure recovery is narrower than selection-time eligibility (404-only vs 400/404/422)

Two predicates encode the same inferred contract -- 'a model the backend will not serve must be skipped and the worker must advance to another candidate' -- but they disagree on what counts as unservable.

- Severity: high
- Confidence: high
- Lens: architecture
- Grounding: grounded
- Systemic: yes
- Files: `llm-worker.mjs`
- Details: Two predicates encode the same inferred contract -- 'a model the backend will not serve must be skipped and the worker must advance to another candidate' -- but they disagree on what counts as unservable. selectBestModel (llm-worker.mjs:249) skips a bootstrap model when isUnsupportedModel(err) is true, treating HTTP 400, 404, and 422 as 'this model cannot be used here'. The hot path in runWorker (llm-worker.mjs:421) only advances to nextModel when is404(err) is true; a 400 or 422 returned by the chat.completions call is rethrown and aborts the whole invocation. Counterexample: a backend whose selected model rejects a particular request shape with 422 (or returns 400 for an unsupported parameter such as temperature/max_tokens) was deemed selectable by isUnsupportedModel logic during selection but is fatal at call time -- the documented 'fall through to the next model' guarantee silently does not hold for that class of error. Recommend making the runtime retry predicate consistent with the selection-time predicate (or documenting the intentional asymmetry), so the critical 'advance on unservable model' flow covers the same status codes end to end.

### ARC-eaffc6ab — Dependency cycle: 2 modules

Circular dependency among scripts/env-utils.mjs → scripts/install-ides.mjs → scripts/llm-worker-mcp.mjs → scripts/env-utils.mjs.

- Severity: medium
- Confidence: high
- Lens: architecture
- Grounding: not assessed
- Systemic: yes
- Files: `package.json`, `scripts/env-utils.mjs`, `scripts/install-ides.mjs`, `scripts/llm-worker-mcp.mjs`
- Details: Circular dependency among scripts/env-utils.mjs → scripts/install-ides.mjs → scripts/llm-worker-mcp.mjs → scripts/env-utils.mjs. Cycles increase coupling, complicate testing, and can cause initialization-order bugs.

### ARC-4f12cf70 — Dependency cycle: 4 modules

Circular dependency among scripts/env-utils.mjs → scripts/install-ides.mjs → scripts/llm-worker-mcp.mjs → llm-worker.mjs → scripts/env-utils.mjs.

- Severity: medium
- Confidence: high
- Lens: architecture
- Grounding: not assessed
- Systemic: yes
- Files: `scripts/env-utils.mjs`, `scripts/install-ides.mjs`, `scripts/llm-worker-mcp.mjs`, `llm-worker.mjs`
- Details: Circular dependency among scripts/env-utils.mjs → scripts/install-ides.mjs → scripts/llm-worker-mcp.mjs → llm-worker.mjs → scripts/env-utils.mjs. Cycles increase coupling, complicate testing, and can cause initialization-order bugs.

### MNT-6d8cf619 — Full permission block duplicated under root and agent.auditor in opencode.json

The entire ~45-line permission block (read/glob/grep/external_directory/edit/bash deny+allow lists) is copied verbatim under both the root 'permission' key and 'agent.auditor.permission'.

- Severity: medium
- Confidence: high
- Lens: maintainability
- Grounding: grounded
- Files: `opencode.json:5–52`, `opencode.json:57–104`, `remediation-report.json:99–101`
- Details: The entire ~45-line permission block (read/glob/grep/external_directory/edit/bash deny+allow lists) is copied verbatim under both the root 'permission' key and 'agent.auditor.permission'. Every permission edit must be made in two places to stay consistent; remediation-report.json FINDING-026 confirms this was kept in sync by a validate-plugin parity check rather than single-sourced.
- Evidence: 3 items (top: "opencode.json:5-52 - root permission block with full bash deny/allow lists") — see audit-findings.json for the full list

### ARC-3227f893-4 — MCP transport enforces an input-size ceiling that the CLI/stdin entrypoint does not

The MCP boundary establishes an explicit input contract: callTool rejects non-string/empty input and enforces MAX_INPUT_BYTES = 1 MiB (scripts/llm-worker-mcp.mjs:196-201), with a documented MAX_FRAME_BYTES cap at the byte boundary before allocation.

- Severity: medium
- Confidence: high
- Lens: architecture
- Grounding: grounded
- Systemic: yes
- Files: `llm-worker.mjs`, `scripts/llm-worker-mcp.mjs`
- Details: The MCP boundary establishes an explicit input contract: callTool rejects non-string/empty input and enforces MAX_INPUT_BYTES = 1 MiB (scripts/llm-worker-mcp.mjs:196-201), with a documented MAX_FRAME_BYTES cap at the byte boundary before allocation. The other externally reachable surface into the identical runWorker core -- readInput on the CLI/stdin path (llm-worker.mjs:160-175) -- shares no such ceiling: it reads the entire stdin / --input file / LLM_WORKER_INPUT_PATH into memory and forwards it to the backend with only an emptiness check. Both surfaces funnel into the same runWorker, so the protective invariant asserted at one trust boundary is absent at the other. Counterexample: piping a multi-hundred-MB file to 'llm read' bypasses the 1 MiB guard entirely and is sent to the backend (subject only to backend-side limits), whereas the same payload via the MCP tool is rejected deterministically. Recommend hoisting the size/emptiness contract into runWorker (or a shared validator) so every entrypoint enforces it uniformly.

### ARC-3227f893-5 — nextModel persists a 404-recovery pick as the cache's 'best model', corrupting the selection invariant

The cache contract inferred from refreshCache/resolveModel is that cache.selected_model holds the single best general-purpose model for the current base_url and model set, and cacheIsFresh (llm-worker.mjs:225) trusts that field for up to MAX_CACHE_AGE_MS (24h).

- Severity: medium
- Confidence: high
- Lens: architecture
- Grounding: grounded
- Systemic: yes
- Files: `llm-worker.mjs`
- Details: The cache contract inferred from refreshCache/resolveModel is that cache.selected_model holds the single best general-purpose model for the current base_url and model set, and cacheIsFresh (llm-worker.mjs:225) trusts that field for up to MAX_CACHE_AGE_MS (24h). nextModel (llm-worker.mjs:331) violates that invariant: when the chosen model returns 404 mid-request, it calls selectBestModel over the *shrunken* candidate set (best minus already-tried models) and then writeCache({...existing, selected_model: selected}). This writes a degraded, second-choice model into the field that the rest of the system treats as 'best', without updating fetched_at semantics around quality. Counterexample: model A (best) transiently 404s once; nextModel picks B and persists selected_model=B; every subsequent invocation for the next 24h reads a fresh cache and uses B even after A recovers, because resolveModel never re-selects while the cache is fresh. The recovery pick should be used for the in-flight request without overwriting the persisted best-model selection, or the persistence should be explicitly time-boxed/marked as a fallback.

### ARC-aa12e390-2 — Risk concentrated in top quartile of units

60% of total risk score is concentrated in the top 5 of 18 units: bin, scripts, module-llm-worker-mjs, skills-llm-worker, tests-llm-worker-test-mjs.

- Severity: medium
- Confidence: high
- Lens: architecture
- Grounding: not assessed
- Systemic: yes
- Files: `bin/llm-worker-tools.mjs`, `scripts/command-metadata.mjs`, `scripts/env-utils.mjs`, `scripts/install-ides.mjs` +6 more
- Details: 60% of total risk score is concentrated in the top 5 of 18 units: bin, scripts, module-llm-worker-mjs, skills-llm-worker, tests-llm-worker-test-mjs. Consider decomposing high-risk units or adding isolation boundaries.

### ARC-5ce6946d — The MCP server and CLI duplicate input handling instead of sharing one entry boundary

There are two front doors to runWorker — the CLI (llm-worker.mjs main/runWorker reading stdin or --input via readInput) and the MCP server (scripts/llm-worker-mcp.mjs callTool taking an `input` string argument).

- Severity: medium
- Confidence: high
- Lens: architecture
- Grounding: grounded
- Systemic: yes
- Files: `scripts/llm-worker-mcp.mjs`, `llm-worker.mjs`
- Details: There are two front doors to runWorker — the CLI (llm-worker.mjs main/runWorker reading stdin or --input via readInput) and the MCP server (scripts/llm-worker-mcp.mjs callTool taking an `input` string argument). They enforce different and partially overlapping contracts: the MCP path adds a MAX_INPUT_BYTES ceiling and non-empty-string validation that the CLI path does not, while the CLI path owns stdin/TTY/env-input resolution the MCP path doesn't need. The size guard, the empty-input guard, and the "what counts as valid worker input" rule are genuinely one concern that is currently expressed in two places with different strictness — a `read` over a 5 MB file is rejected through MCP but accepted through the CLI. As more transports appear (the file inventory already hints at multiple host integrations), this divergence multiplies. Consolidating input admission (size + emptiness + normalization) into a single function that both runWorker entry points call would remove a whole class of "behaves differently depending on how you invoked it" bugs and make the byte ceiling a real product invariant rather than an MCP-only one.

### ARC-34b93d00 — Architectural seam: .gemini/commands ↔ .gemini/commands/audit-code.toml

The dependency between .gemini/commands and .gemini/commands/audit-code.toml is a bridge (cut-edge): its removal disconnects the two regions.

- Severity: medium
- Confidence: medium
- Lens: architecture
- Grounding: not assessed
- Systemic: yes
- Files: `.gemini/commands`, `.gemini/commands/audit-code.toml`
- Details: The dependency between .gemini/commands and .gemini/commands/audit-code.toml is a bridge (cut-edge): its removal disconnects the two regions. A single load-bearing link is a fragility and refactor risk.

### ARC-63c8b5a8 — Architectural seam: .github/workflows ↔ .github/workflows/publish.yml

The dependency between .github/workflows and .github/workflows/publish.yml is a bridge (cut-edge): its removal disconnects the two regions.

- Severity: medium
- Confidence: medium
- Lens: architecture
- Grounding: not assessed
- Systemic: yes
- Files: `.github/workflows`, `.github/workflows/publish.yml`
- Details: The dependency between .github/workflows and .github/workflows/publish.yml is a bridge (cut-edge): its removal disconnects the two regions. A single load-bearing link is a fragility and refactor risk.

### ARC-94320dff — Architectural seam: .remediation-artifacts/steps ↔ .remediation-artifacts/steps/current-step.json

The dependency between .remediation-artifacts/steps and .remediation-artifacts/steps/current-step.json is a bridge (cut-edge): its removal disconnects the two regions.

- Severity: medium
- Confidence: medium
- Lens: architecture
- Grounding: not assessed
- Systemic: yes
- Files: `.remediation-artifacts/steps`, `.remediation-artifacts/steps/current-step.json`
- Details: The dependency between .remediation-artifacts/steps and .remediation-artifacts/steps/current-step.json is a bridge (cut-edge): its removal disconnects the two regions. A single load-bearing link is a fragility and refactor risk.

### ARC-3227f893-6 — Architectural seam: llm-worker.mjs ↔ test/deterministic-fallback.test.mjs

The dependency between llm-worker.mjs and test/deterministic-fallback.test.mjs is a bridge (cut-edge): its removal disconnects the two regions.

- Severity: medium
- Confidence: medium
- Lens: architecture
- Grounding: not assessed
- Systemic: yes
- Files: `llm-worker.mjs`, `test/deterministic-fallback.test.mjs`, `test/llm-worker.test.mjs`, `test/model-fallback.test.mjs`
- Details: The dependency between llm-worker.mjs and test/deterministic-fallback.test.mjs is a bridge (cut-edge): its removal disconnects the two regions. A single load-bearing link is a fragility and refactor risk.
- Evidence: runtime:unit:tests-model-fallback-test-mjs: confirmed — Deterministic runtime command succeeded: npm test

### ARC-4f12cf70-2 — Architectural seam: scripts/env-utils.mjs ↔ test/env-utils.test.mjs

The dependency between scripts/env-utils.mjs and test/env-utils.test.mjs is a bridge (cut-edge): its removal disconnects the two regions.

- Severity: medium
- Confidence: medium
- Lens: architecture
- Grounding: not assessed
- Systemic: yes
- Files: `scripts/env-utils.mjs`, `test/env-utils.test.mjs`
- Details: The dependency between scripts/env-utils.mjs and test/env-utils.test.mjs is a bridge (cut-edge): its removal disconnects the two regions. A single load-bearing link is a fragility and refactor risk.

### ARC-f833f9fb — Architectural seam: skills/llm-worker ↔ skills/llm-worker/agents/openai.yaml

The dependency between skills/llm-worker and skills/llm-worker/agents/openai.yaml is a bridge (cut-edge): its removal disconnects the two regions.

- Severity: medium
- Confidence: medium
- Lens: architecture
- Grounding: not assessed
- Systemic: yes
- Files: `skills/llm-worker`, `skills/llm-worker/agents/openai.yaml`
- Details: The dependency between skills/llm-worker and skills/llm-worker/agents/openai.yaml is a bridge (cut-edge): its removal disconnects the two regions. A single load-bearing link is a fragility and refactor risk.

### ARC-3227f893-7 — Deterministic-fallback 'code-capable' guarantee is not honored when every candidate is on the AVOID list

deterministicFallbackModel (llm-worker.mjs:88) is pinned by a documented contract (INV-WC-DETFALLBACK): never silently return the bootstrap, and pick a CODE-CAPABLE candidate deterministically.

- Severity: medium
- Confidence: medium
- Lens: architecture
- Grounding: grounded
- Files: `llm-worker.mjs`
- Details: deterministicFallbackModel (llm-worker.mjs:88) is pinned by a documented contract (INV-WC-DETFALLBACK): never silently return the bootstrap, and pick a CODE-CAPABLE candidate deterministically. The avoid/prefer machinery only filters embedding/vision/etc.; when *every* candidate matches AVOID (e.g. a backend that exposes only embedding/vision/audio model ids), the function deliberately sets pool = sorted (the full avoided set) and, since no PREFER pattern matches, returns pool[0] -- the lexicographically-first embedding/vision model. So the 'code-capable' postcondition the comment promises is violated by construction in that case: the function returns a model it just classified as non-code-capable. This is defensible as 'better than crashing', but the inferred contract ('guarantees gpt-code-xl over ada-embedding-001') overstates what holds. Worse, this fallback value is what nextModel may persist as selected_model (see DR-002). Recommend either documenting that the all-avoided case yields a non-code-capable best-effort pick, or surfacing it as an explicit no-eligible-model error rather than a silent code-capable claim.

### MNT-aa12e390 — High complexity: bin/llm-worker-tools.mjs

bin/llm-worker-tools.mjs has a duplicate-line-count of 11 (reach: js-ts-effective).

- Severity: medium
- Confidence: medium
- Lens: maintainability
- Grounding: not assessed
- Files: `bin/llm-worker-tools.mjs`
- Details: bin/llm-worker-tools.mjs has a duplicate-line-count of 11 (reach: js-ts-effective). Duplicated code multiplies the cost of every future change to that logic.

### MNT-3227f893 — High complexity: llm-worker.mjs

llm-worker.mjs has a cyclomatic-approx of 121 (reach: js-ts-effective).

- Severity: medium
- Confidence: medium
- Lens: maintainability
- Grounding: not assessed
- Files: `llm-worker.mjs`
- Details: llm-worker.mjs has a cyclomatic-approx of 121 (reach: js-ts-effective). High structural complexity is hard to test and change safely.

### MNT-4f12cf70 — High complexity: scripts/env-utils.mjs

scripts/env-utils.mjs has a duplicate-line-count of 1 (reach: js-ts-effective).

- Severity: medium
- Confidence: medium
- Lens: maintainability
- Grounding: not assessed
- Files: `scripts/env-utils.mjs`
- Details: scripts/env-utils.mjs has a duplicate-line-count of 1 (reach: js-ts-effective). Duplicated code multiplies the cost of every future change to that logic.

### MNT-1a6dcc69 — High complexity: scripts/install-ides.mjs

scripts/install-ides.mjs has a duplicate-line-count of 31 (reach: js-ts-effective).

- Severity: medium
- Confidence: medium
- Lens: maintainability
- Grounding: not assessed
- Files: `scripts/install-ides.mjs`
- Details: scripts/install-ides.mjs has a duplicate-line-count of 31 (reach: js-ts-effective). Duplicated code multiplies the cost of every future change to that logic.

### MNT-5ce6946d — High complexity: scripts/llm-worker-mcp.mjs

scripts/llm-worker-mcp.mjs has a duplicate-line-count of 30 (reach: js-ts-effective).

- Severity: medium
- Confidence: medium
- Lens: maintainability
- Grounding: not assessed
- Files: `scripts/llm-worker-mcp.mjs`
- Details: scripts/llm-worker-mcp.mjs has a duplicate-line-count of 30 (reach: js-ts-effective). Duplicated code multiplies the cost of every future change to that logic.

### MNT-54b220fe — High complexity: scripts/validate-plugin.mjs

scripts/validate-plugin.mjs has a duplicate-line-count of 11 (reach: js-ts-effective).

- Severity: medium
- Confidence: medium
- Lens: maintainability
- Grounding: not assessed
- Files: `scripts/validate-plugin.mjs`
- Details: scripts/validate-plugin.mjs has a duplicate-line-count of 11 (reach: js-ts-effective). Duplicated code multiplies the cost of every future change to that logic.

### MNT-6681fb0c — High complexity: test/mcp.test.mjs

test/mcp.test.mjs has a cyclomatic-approx of 17 (reach: js-ts-effective).

- Severity: medium
- Confidence: medium
- Lens: maintainability
- Grounding: not assessed
- Files: `test/mcp.test.mjs`
- Details: test/mcp.test.mjs has a cyclomatic-approx of 17 (reach: js-ts-effective). High structural complexity is hard to test and change safely.

### ARC-1a6dcc69-3 — Install/sync/validate responsibilities are smeared across scripts coupled through package.json, making the packaging surface the real complexity center

The genuinely interesting complexity in this repo is not the worker (which is a clean, well-tested single-call function) — it is the packaging/host-integration layer.

- Severity: medium
- Confidence: medium
- Lens: architecture
- Grounding: grounded
- Systemic: yes
- Files: `scripts/install-ides.mjs`, `scripts/validate-plugin.mjs`, `scripts/command-metadata.mjs`, `package.json`
- Details: The genuinely interesting complexity in this repo is not the worker (which is a clean, well-tested single-call function) — it is the packaging/host-integration layer. install-ides.mjs (~310 lines, the highest real branch count after the worker) shells out to sync-host-files.mjs, which is itself a second renderer of the same content (see DR-003), while validate-plugin.mjs independently re-derives the list of files-that-must-exist and runs node --check across them. All three read package.json for the version, which is why the structural graph reports a thicket of "dependency cycles through package.json" — those cycles are mostly an artifact of treating a data file as a graph node, but they correctly point at the real issue: version, file manifest, command table, and host list are facts duplicated across package.json `files`, validate-plugin's requiredFiles array, command-metadata's SCRIPT_BY_COMMAND, and the installer/sync renderers, with no single declaration any of them derive from. The shape problem is that "what this package ships and where it installs" is encoded four times. A single manifest module that the installer, the sync generator, the validator, and (where possible) package.json all consume would collapse the cycle noise and the drift-policing into ordinary data.

### REL-3762b68c — MCP server exits immediately on stdin end/close, dropping in-flight tool calls

stdin `end`/`close` invoke `disconnect()` which calls `process.exit(0)` synchronously.

- Severity: medium
- Confidence: medium
- Lens: reliability
- Grounding: grounded
- Files: `scripts/llm-worker-mcp.mjs:263–278`, `scripts/llm-worker-mcp.mjs:170–174`
- Details: stdin `end`/`close` invoke `disconnect()` which calls `process.exit(0)` synchronously. Any `tools/call` whose backend request is still awaiting (`handleMessage` is async and fire-and-forget in parseMessages) is terminated without a response, so a client that closed its write side after sending a request gets no reply and no error.
- Evidence: 2 items (top: "scripts/llm-worker-mcp.mjs:267 - disconnect calls process.exit(0) with no drain of pending async tool calls.") — see audit-findings.json for the full list

### ARC-3227f893-8 — No verification seam for advisory output despite every doc insisting the output must be verified

The design's most-repeated user-facing rule is "output is advisory — verify before acting" (README, CLAUDE.md, ambient-agent-policy.md, and the MCP tool descriptions all say it).

- Severity: medium
- Confidence: medium
- Lens: architecture
- Grounding: grounded
- Systemic: yes
- Files: `llm-worker.mjs`, `shared/ambient-agent-policy.md`
- Details: The design's most-repeated user-facing rule is "output is advisory — verify before acting" (README, CLAUDE.md, ambient-agent-policy.md, and the MCP tool descriptions all say it). Yet the system provides no machine-readable signal to support that verification: the worker returns the same opaque JSON shape whether it answered from rich context or hallucinated, and parseWorkerJson only validates structural conformance to the read/write schema, never provenance or confidence. For a tool whose entire safety story rests on the consumer distrusting the result, the absence of any confidence/grounding field, source-attribution, or "insufficient context" sentinel is a missing capability that is cheap now and expensive later — once agents are wired to act on this output ambiently, there is nothing in the contract that lets a caller distinguish a strong answer from a weak one. The read schema already carries `open_questions`; promoting that into a first-class confidence/grounding signal (and having the system surface when the model declined or guessed) would make the advisory contract enforceable instead of merely asserted in prose.

### MNT-381320ce — Package name and version duplicated between plugin.json and package.json

The name "llm-worker-tools" and version "0.2.2" are hard-coded here and also live in the root package.json, so every release bump must be edited in two places to stay consistent with no shared source.

- Severity: low
- Confidence: high
- Lens: maintainability
- Grounding: grounded
- Files: `.codex-plugin/plugin.json:2–3`, `package.json:2–3`
- Evidence: 2 items (top: ".codex-plugin/plugin.json:2-3 - declares name/version literals that mirror the npm package manifest") — see audit-findings.json for the full list

### ARC-381320ce — 3 orphan unit(s) with no graph connections

Units [-codex-plugin, -remediation-artifacts, -vscode] have no import, call, or reference edges in the dependency graph.

- Severity: low
- Confidence: medium
- Lens: architecture
- Grounding: not assessed
- Systemic: yes
- Files: `.codex-plugin/plugin.json`, `.remediation-artifacts/run.log.jsonl`, `.vscode/mcp.json`
- Details: Units [-codex-plugin, -remediation-artifacts, -vscode] have no import, call, or reference edges in the dependency graph. They may be dead code, or the graph extraction missed their connections.

### COR-5c06c147 — Bare 'audit-code' allow prefix contradicts claimed remediation

remediation-report.json FINDING-057 claims the bare 'audit-code' permission prefix was reconciled with the full invocation path, but opencode.json still grants a bare 'audit-code': 'allow' prefix, which allows any argument string beginning with that token (e.g.

- Severity: low
- Confidence: medium
- Lens: correctness
- Grounding: grounded
- Files: `opencode.json:31`, `remediation-report.json:209–211`
- Details: remediation-report.json FINDING-057 claims the bare 'audit-code' permission prefix was reconciled with the full invocation path, but opencode.json still grants a bare 'audit-code': 'allow' prefix, which allows any argument string beginning with that token (e.g. denied subcommands invoked via paths the deny patterns do not cover).
- Evidence: 2 items (top: "opencode.json:31 - bare 'audit-code': 'allow' broad prefix still present (also duplicated at line 83 under agent.auditor)") — see audit-findings.json for the full list

### TST-199e7cda — bin dispatch signal-forwarding branch is untested

bin.test.mjs covers exit-code, error, and ordering paths but never exercises the child `exit` handler's signal branch (code null + signal -> process.kill), leaving the signal re-raise logic unverified.

- Severity: low
- Confidence: medium
- Lens: tests
- Grounding: grounded
- Files: `bin/llm-worker-tools.mjs:51–59`
- Evidence: bin/llm-worker-tools.mjs:55 - the signal-forwarding branch has no corresponding emit('exit', null, signal) test in test/bin.test.mjs.

### MNT-3227f893-2 — Duplicated code: llm-worker.mjs

llm-worker.mjs has a duplicate-line-count of 54 (reach: js-ts-effective).

- Severity: low
- Confidence: medium
- Lens: maintainability
- Grounding: not assessed
- Files: `llm-worker.mjs`
- Details: llm-worker.mjs has a duplicate-line-count of 54 (reach: js-ts-effective). Duplicated code multiplies the cost of every future change to that logic.

### MNT-f21883ee — Duplicated code: scripts/sync-host-files.mjs

scripts/sync-host-files.mjs has a duplicate-line-count of 29 (reach: js-ts-effective).

- Severity: low
- Confidence: medium
- Lens: maintainability
- Grounding: not assessed
- Files: `scripts/sync-host-files.mjs`
- Details: scripts/sync-host-files.mjs has a duplicate-line-count of 29 (reach: js-ts-effective). Duplicated code multiplies the cost of every future change to that logic.

### MNT-20d326d9 — Duplicated code: test/bin.test.mjs

test/bin.test.mjs has a duplicate-line-count of 56 (reach: js-ts-effective).

- Severity: low
- Confidence: medium
- Lens: maintainability
- Grounding: not assessed
- Files: `test/bin.test.mjs`
- Details: test/bin.test.mjs has a duplicate-line-count of 56 (reach: js-ts-effective). Duplicated code multiplies the cost of every future change to that logic.

### MNT-6e34dce5 — Duplicated code: test/config.test.mjs

test/config.test.mjs has a duplicate-line-count of 3 (reach: js-ts-effective).

- Severity: low
- Confidence: medium
- Lens: maintainability
- Grounding: not assessed
- Files: `test/config.test.mjs`
- Details: test/config.test.mjs has a duplicate-line-count of 3 (reach: js-ts-effective). Duplicated code multiplies the cost of every future change to that logic.

### MNT-695ef56d — Duplicated code: test/deterministic-fallback.test.mjs

test/deterministic-fallback.test.mjs has a duplicate-line-count of 10 (reach: js-ts-effective).

- Severity: low
- Confidence: medium
- Lens: maintainability
- Grounding: not assessed
- Files: `test/deterministic-fallback.test.mjs`
- Details: test/deterministic-fallback.test.mjs has a duplicate-line-count of 10 (reach: js-ts-effective). Duplicated code multiplies the cost of every future change to that logic.

### MNT-e59361cd — Duplicated code: test/env-utils.test.mjs

test/env-utils.test.mjs has a duplicate-line-count of 6 (reach: js-ts-effective).

- Severity: low
- Confidence: medium
- Lens: maintainability
- Grounding: not assessed
- Files: `test/env-utils.test.mjs`
- Details: test/env-utils.test.mjs has a duplicate-line-count of 6 (reach: js-ts-effective). Duplicated code multiplies the cost of every future change to that logic.

### MNT-624dcc45 — Duplicated code: test/llm-worker.test.mjs

test/llm-worker.test.mjs has a duplicate-line-count of 47 (reach: js-ts-effective).

- Severity: low
- Confidence: medium
- Lens: maintainability
- Grounding: not assessed
- Files: `test/llm-worker.test.mjs`
- Details: test/llm-worker.test.mjs has a duplicate-line-count of 47 (reach: js-ts-effective). Duplicated code multiplies the cost of every future change to that logic.

### MNT-6681fb0c-2 — Duplicated code: test/mcp.test.mjs

test/mcp.test.mjs has a duplicate-line-count of 38 (reach: js-ts-effective).

- Severity: low
- Confidence: medium
- Lens: maintainability
- Grounding: not assessed
- Files: `test/mcp.test.mjs`
- Details: test/mcp.test.mjs has a duplicate-line-count of 38 (reach: js-ts-effective). Duplicated code multiplies the cost of every future change to that logic.

### MNT-7e2baffd — Duplicated code: test/model-fallback.test.mjs

test/model-fallback.test.mjs has a duplicate-line-count of 11 (reach: js-ts-effective).

- Severity: low
- Confidence: medium
- Lens: maintainability
- Grounding: not assessed
- Files: `test/model-fallback.test.mjs`
- Details: test/model-fallback.test.mjs has a duplicate-line-count of 11 (reach: js-ts-effective). Duplicated code multiplies the cost of every future change to that logic.
- Evidence: runtime:unit:tests-model-fallback-test-mjs: confirmed — Deterministic runtime command succeeded: npm test

### ARC-4f12cf70-3 — loadUserEnv 'undefined-only' merge lets a process-level empty string shadow the configured .env value

Two adjacent contracts in env-utils.mjs interact badly.

- Severity: low
- Confidence: medium
- Lens: architecture
- Grounding: grounded
- Files: `scripts/env-utils.mjs`, `llm-worker.mjs`
- Details: Two adjacent contracts in env-utils.mjs interact badly. (1) parseEnv/formatEnv document that the empty string is intentionally OUTSIDE the round-trip domain -- empty values do not persist (env-utils.mjs:25-27,88-103). (2) loadUserEnv only injects a parsed key when process.env[key] === undefined (env-utils.mjs:84), i.e. an env var explicitly present but set to '' is treated as 'already provided' and the .env value is suppressed. Counterexample: a launcher (or a stale shell) that exports LLM_BACKEND_BASE_URL= (empty) causes loadUserEnv to skip the configured non-empty base URL from ~/.llm-worker-tools/.env, and assertConfig then dies with 'Missing LLM_BACKEND_BASE_URL' even though the file holds a valid value. The precondition 'an empty env var means unset, defer to file' is implied by the empty-string-is-non-persisting policy but is not honored by the undefined-only guard. Recommend treating empty string as absent in loadUserEnv (or documenting that empty process env vars are authoritative and override file config).

### TST-039ba4e1 — MCP error-response paths (tools/call failure, unknown method) lack coverage

mcp.test.mjs asserts initialize, tools/list, callTool validation, and parser framing, but no test drives handleMessage through a tools/call that throws (isError content) or through the unknown-method -32601 reply branch.

- Severity: low
- Confidence: medium
- Lens: tests
- Grounding: grounded
- Files: `scripts/llm-worker-mcp.mjs:243–259`
- Evidence: scripts/llm-worker-mcp.mjs:246 - the tools/call isError response branch and the unknown-method -32601 branch at line 259 are not asserted by any mcp test.

### ARC-a41851b5-2 — Module dependency graph closes a cycle through package.json, coupling runtime code to a data artifact

The deterministic pass flags multiple import cycles, the largest (high severity) running bin/llm-worker-tools.mjs -> scripts/command-metadata.mjs -> scripts/env-utils.mjs -> scripts/install-ides.mjs -> scripts/llm-worker-mcp.mjs -> package.json -> scripts/sync-host-files.mjs -> scripts/validate-plugin.mjs -> back.

- Severity: low
- Confidence: medium
- Lens: architecture
- Grounding: grounded
- Systemic: yes
- Files: `scripts/command-metadata.mjs`, `scripts/env-utils.mjs`, `scripts/install-ides.mjs`, `scripts/llm-worker-mcp.mjs`
- Details: The deterministic pass flags multiple import cycles, the largest (high severity) running bin/llm-worker-tools.mjs -> scripts/command-metadata.mjs -> scripts/env-utils.mjs -> scripts/install-ides.mjs -> scripts/llm-worker-mcp.mjs -> package.json -> scripts/sync-host-files.mjs -> scripts/validate-plugin.mjs -> back. The implied layering contract is that command-metadata/env-utils are low-level leaves that higher-level scripts depend on, not vice versa; the cycle shows that boundary is not enforced. llm-worker-mcp.mjs reaches package.json only via createRequire(...)('../package.json') for the version string (scripts/llm-worker-mcp.mjs:12), so the cycle is partly an artifact of treating a JSON data file as a graph node, but the script-to-script edges through install-ides/sync-host-files/validate-plugin are real and make initialization order and isolated unit testing harder. Recommend extracting the shared low-level constants (command metadata, version) into a dependency-free leaf module that the higher-level scripts import one-directionally, breaking the script-level cycle.

### MNT-85422ee8 — OpenAI-compatible HTTP backend stub duplicated across mcp.test.mjs and model-fallback.test.mjs

Both test files independently implement a near-identical local http server stub (sendJson helper, GET /v1/models, POST /v1/chat/completions with selection-vs-worker branching).

- Severity: low
- Confidence: medium
- Lens: maintainability
- Grounding: grounded
- Files: `test/mcp.test.mjs:20–56`, `test/model-fallback.test.mjs:19–74`
- Details: Both test files independently implement a near-identical local http server stub (sendJson helper, GET /v1/models, POST /v1/chat/completions with selection-vs-worker branching). The shared backend contract is kept consistent by convention; a backend protocol change requires editing both copies.
- Evidence: 3 items (top: "test/mcp.test.mjs:20 - startBackend builds an OpenAI-compatible http stub with /v1/models and /v1/chat/completions handlers.") — see audit-findings.json for the full list

### COR-3ae76802 — runNodeScript exits 1 on signal termination by treating null status as success-or-one

When the spawned sync script is killed by a signal, spawnSync returns status null; `result.status !== 0` is true so it exits, but `result.status || 1` yields 1, masking the actual signal cause.

- Severity: low
- Confidence: medium
- Lens: correctness
- Grounding: grounded
- Files: `scripts/install-ides.mjs:76–82`
- Details: When the spawned sync script is killed by a signal, spawnSync returns status null; `result.status !== 0` is true so it exits, but `result.status || 1` yields 1, masking the actual signal cause. Acceptable for a hard-fail install gate but loses the signal distinction.
- Evidence: scripts/install-ides.mjs:81 - signal-killed child (status null) collapses to exit code 1 with no signal-based handling.

### TST-20d326d9 — Several tests are drift guards policing host-file / metadata duplication instead of single-sourced logic

bin.test.mjs sources the usage 'read' line from metadata to avoid a literal duplicate, and config.test.mjs derives npx args from package name + command metadata, explicitly to keep two copies aligned.

- Severity: low
- Confidence: medium
- Lens: tests
- Grounding: grounded
- Files: `test/bin.test.mjs:7–12`, `test/config.test.mjs:29–34`
- Details: bin.test.mjs sources the usage 'read' line from metadata to avoid a literal duplicate, and config.test.mjs derives npx args from package name + command metadata, explicitly to keep two copies aligned. These are workarounds for format/contract duplicated between source and generated host files; the underlying duplication (single-sourced by sync-host-files plus tests) is the real smell.
- Evidence: 2 items (top: "test/bin.test.mjs:10 - test deliberately re-derives the read usage line from metadata to keep a drift guard from drifting, signalling duplicated banner content.") — see audit-findings.json for the full list

### ARC-3227f893-9 — Single-retry timeout contract is reported against a model that may have changed mid-flight

runWorker's timeout contract (llm-worker.mjs:401-438) is 'time out, back off once, double the budget, retry exactly once, then fail with a message naming the verb and model'.

- Severity: low
- Confidence: medium
- Lens: architecture
- Grounding: grounded
- Files: `llm-worker.mjs`
- Details: runWorker's timeout contract (llm-worker.mjs:401-438) is 'time out, back off once, double the budget, retry exactly once, then fail with a message naming the verb and model'. Inside a single timeout window the inner loop can swap `model` via nextModel on a 404 (llm-worker.mjs:423). If the *second* (doubled-budget) attempt then times out, timeoutMessage(activeTimeoutMs, verb, model) (llm-worker.mjs:432) reports whatever model was current when the abort fired -- which may be a 404-recovery substitute, not the model the user/cache selected, and the `tried` set carried across the retry means the doubled attempt may also begin on a different model than the first. The observability contract ('the failing model is identified') is therefore only loosely true under concurrent 404 fallback. This is diagnostic-quality, not a correctness break, but worth either pinning the reported model to the originally-resolved one or enumerating the tried set in the timeout message.

### CFG-a2c197c9 — workflow_dispatch publish guard hardcodes refs/heads/main alongside the dynamic default-branch check

The dispatch branch of the `if` requires both `github.ref_name == default_branch` AND `github.ref == 'refs/heads/main'`.

- Severity: low
- Confidence: medium
- Lens: config_deployment
- Grounding: grounded
- Files: `.github/workflows/publish.yml:15–19`
- Details: The dispatch branch of the `if` requires both `github.ref_name == default_branch` AND `github.ref == 'refs/heads/main'`. The literal `refs/heads/main` is redundant with the dynamic default-branch comparison and would silently block dispatch publishes if the default branch is ever renamed.
- Evidence: .github/workflows/publish.yml:18 - both a dynamic default-branch check and a hardcoded refs/heads/main check gate the dispatch publish, coupling the workflow to the literal branch name.

### COR-c5ab8ad0 — Model 404 rotation loses the timeout-retry budget by sharing the tried set across retries

On a timeout the outer loop restarts the inner attempt loop, but the shared `tried` set already contains every model the previous attempt rotated through via 404, so a post-timeout retry can immediately hit `nextModel` exhaustion logic on models it never actually re-probed.

- Severity: low
- Confidence: low
- Lens: correctness
- Grounding: grounded
- Files: `llm-worker.mjs:397–438`
- Evidence: llm-worker.mjs:397 - `tried` is declared once outside the timeout-retry `for(;;)` loop and is never reset on the single retry, so models marked tried before a timeout remain excluded on the retry pass.

### TST-441aad81 — No test covers the cache-reuse fast path in refreshCache

refreshCache has a non-force branch that reuses an existing selected_model when the model set is unchanged (setsEqual), skipping selectBestModel.

- Severity: low
- Confidence: low
- Lens: tests
- Grounding: grounded
- Files: `llm-worker.mjs:283–287`
- Details: refreshCache has a non-force branch that reuses an existing selected_model when the model set is unchanged (setsEqual), skipping selectBestModel. Tests exercise selection and rotation but not this reuse short-circuit, so a regression that re-selects unnecessarily would pass.
- Evidence: llm-worker.mjs:283 - the unchanged-model-set reuse branch in refreshCache is not asserted by any test in the packet.

### REL-c5ab8ad0 — Worker network calls rely solely on AbortController timeout with no per-request retry on transient non-timeout failures

In runWorker, the only recovery paths are a single timeout retry (AbortError) and 404-based model rotation.

- Severity: low
- Confidence: low
- Lens: reliability
- Grounding: grounded
- Files: `llm-worker.mjs:420–427`
- Details: In runWorker, the only recovery paths are a single timeout retry (AbortError) and 404-based model rotation. Transient network/server errors (ECONNRESET, ETIMEDOUT socket errors, 5xx, 429) are rethrown immediately with no per-request retry or backoff, so a single transient backend hiccup fails the whole invocation.
- Evidence: 3 items (top: "llm-worker.mjs:426 - only 404 errors are recovered inside the attempt loop; all other errors (including transient 5xx/socket resets) are rethrown without retry.") — see audit-findings.json for the full list

### TST-695ef56d — deterministicFallbackModel comment-only assertion of avoided-id sort order is fragile

The all-avoided test asserts the lexicographically-first embedding id is returned, with sort behavior documented only in a comment; if AVOID patterns change the test silently shifts meaning rather than failing loudly.

- Severity: info
- Confidence: low
- Lens: tests
- Grounding: grounded
- Files: `test/deterministic-fallback.test.mjs:50–56`
- Evidence: test/deterministic-fallback.test.mjs:54 - the expected pick is justified by a `// sorted:` comment rather than an explicit invariant, making the assertion easy to misread on change.

### MNT-b9d605bb — MCP wire-framing reimplemented in test instead of single-sourced

test/mcp.test.mjs hand-rolls the LSP-style Content-Length framing in framed() and decodes it in parseFramedResponses(), duplicating the exact frame format produced by send() in scripts/llm-worker-mcp.mjs.

- Severity: info
- Confidence: low
- Lens: maintainability
- Grounding: grounded
- Files: `test/mcp.test.mjs:58–61`, `scripts/llm-worker-mcp.mjs:65–68`
- Details: test/mcp.test.mjs hand-rolls the LSP-style Content-Length framing in framed() and decodes it in parseFramedResponses(), duplicating the exact frame format produced by send() in scripts/llm-worker-mcp.mjs. The format contract lives in two places, so any change to the header/encoding must be edited in both to stay correct.
- Evidence: 3 items (top: "test/mcp.test.mjs:58-61 - framed() reimplements the Content-Length frame format byte-for-byte") — see audit-findings.json for the full list

### MNT-b9d605bb-2 — parseFramedResponses / framed MCP framing helpers duplicate the wire format under test

test/mcp.test.mjs reimplements Content-Length framing and parsing inline (framed, parseFramedResponses) rather than reusing the production `send`/parser, so the framing contract lives in two places kept aligned by hand.

- Severity: info
- Confidence: low
- Lens: maintainability
- Grounding: grounded
- Files: `test/mcp.test.mjs:58–83`
- Evidence: test/mcp.test.mjs:58 - framed() hand-rolls the Content-Length envelope that production send() already emits.

## Scope and Coverage

This report is deterministic output from the completed audit. Non-auditable files were excluded from scope before task generation.
