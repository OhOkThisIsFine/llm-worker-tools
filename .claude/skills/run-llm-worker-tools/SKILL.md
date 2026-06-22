---
name: run-llm-worker-tools
description: Build, run, and drive the llm-worker-tools CLI and its MCP server. Use to run, start, smoke-test, or exercise the `llm` / `llm-worker-tools` commands and the stdio MCP server end-to-end without a real LLM backend.
---

# Run llm-worker-tools

`llm-worker-tools` is a backend-neutral Node CLI that offloads bulk context
processing to a local OpenAI-compatible LLM backend. Two surfaces:

- **CLI** — `llm read` / `llm write` / `llm-worker-tools models` (reads stdin,
  calls the backend, prints advisory JSON).
- **MCP server** — `llm-worker-tools mcp` (`scripts/llm-worker-mcp.mjs`), a
  Content-Length-framed JSON-RPC server over stdio exposing `llm_worker_read`,
  `llm_worker_write`, `llm_worker_models`.

There is **no GUI and no web server** — it's a CLI + stdio MCP tool. It needs an
OpenAI-compatible backend (`LLM_BACKEND_BASE_URL`). To drive it with no real
backend, the driver stands up a loopback mock and exercises every surface.

All paths below are relative to the repo root (the unit). The driver lives at
`.claude/skills/run-llm-worker-tools/driver.mjs`.

## Prerequisites

Node **>= 22.14** (engines field; verified on v26.3.1) and the one dependency.
No OS packages, no display, no GPU.

```bash
node --version          # v26.3.1 here; must be >= 22.14
npm install             # installs `openai` (the only runtime dep)
```

## Build

Nothing to compile — it's plain `.mjs`. Syntax-check the sources:

```bash
npm run check           # node --check over the shipped .mjs files
```

## Run (agent path) — the driver

The driver is the primary way to exercise the app. It starts a mock
OpenAI-compatible backend, points the worker at it via env, then drives the
real CLI, the real `read` worker, and the real MCP server (initialize →
tools/list → tools/call) and asserts each result. No network, no backend.

```bash
node .claude/skills/run-llm-worker-tools/driver.mjs
```

Expected tail (exit 0):

```
[PASS] CLI usage banner  — exit=0
[PASS] CLI `models` selects mock-model  — out={ ... "selected": "mock-model" ...
[PASS] worker `read` returns {summary,findings,open_questions}  — out={ ...
[PASS] MCP initialize -> serverInfo
[PASS] MCP tools/list exposes llm_worker_read
[PASS] MCP tools/call(llm_worker_read) returns content  — "{ ... mock summary ...
6/6 checks passed
PASS: llm-worker-tools driver smoke
```

To point at a **real** backend instead, set `LLM_BACKEND_BASE_URL` (and
optionally `LLM_BACKEND_API_KEY`) and run the CLI directly:

```bash
node bin/llm-worker-tools.mjs            # prints the usage banner, exit 0
LLM_BACKEND_BASE_URL=http://localhost:1234/v1 node bin/llm-worker-tools.mjs models
echo "export const x = 1;" | LLM_BACKEND_BASE_URL=http://localhost:1234/v1 node llm-worker.mjs read
```

## Direct invocation (PRs touching internals)

Most modules export pure functions — import and call them, no full app needed:

```bash
node -e 'import("./scripts/env-utils.mjs").then(m=>console.log(m.parseEnv(m.formatEnv({K:"a b#c"})).K))'
# -> a b#c   (parseEnv/formatEnv are a guaranteed-inverse pair)
```

Run one module's tests in isolation:

```bash
node --test test/mcp.test.mjs            # 10/10 here
```

## Test

```bash
node --test                              # the node:test suite — 47/47 pass
```

`npm test` additionally runs `check:ides` + the codex-plugin smoke check. As of
2026-06-21 `check:ids` reports pre-existing drift in `AGENTS.md` /
`.github/copilot-instructions.md` and exits non-zero — use `node --test` for the
real code gate, or `npm run sync:ides` to regenerate the host files.

## Gotchas

- **Every chat request embeds the selected model id** (`"model":"mock-model"`)
  in its body, so a mock backend can't tell a model-selection call from a
  read/write call by looking for the model id. The driver discriminates on the
  read/write prompt's schema keys (`open_questions` present → return the read
  JSON contract; otherwise return a model id). See `startMockBackend` in the
  driver.
- **`llm read`/`write` require input** — piped stdin, `--input <path>`, or
  `LLM_WORKER_INPUT_PATH`. With none it dies with a usage hint, not a hang.
- **`models` writes a cache** at `LLM_MODEL_CACHE_PATH` (default
  `~/.cache/llm-worker/models.json`). The driver redirects it to a `mkdtemp`
  dir so runs are hermetic; do likewise to avoid a stale cache poisoning a run.
- **The MCP server exits on stdin `end`** — and `tools/call` is async (a backend
  round-trip). If you write the `tools/call` frame and immediately `end()` stdin,
  the server can exit before flushing the reply, and you lose the response
  (intermittent). The driver waits until the `id=3` reply is parsed off stdout
  *before* ending/killing the child (`driveMcp`). Don't `stdin.end()` eagerly.
- **MCP framing is byte-exact** `Content-Length: N\r\n\r\n<json>` (N = UTF-8
  byte length, not char count). The parser caps a single frame and resyncs past
  a malformed header without dropping queued frames — keep `\r\n` literal and
  count bytes when hand-framing.
- **No GUI / no screenshot** — this is a CLI + stdio server; the driver's
  pass/fail output is the observable result, not a window.

## Troubleshooting

- `Missing LLM_BACKEND_BASE_URL.` → set `LLM_BACKEND_BASE_URL` to an
  OpenAI-compatible `/v1` base (the driver does this automatically).
- `Backend returned invalid JSON for read: Unexpected token ...` → the backend
  returned non-JSON content for a read/write call (e.g. a mock that answered a
  read with a bare model id). The worker requires `{summary,findings,
  open_questions}` for read and `{files,notes}` for write.
- Driver exits 1 with `FAIL: <check names>` → one surface regressed; the
  per-check line above it shows the captured output for that surface.
