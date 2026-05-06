---
name: llm-worker
description: Proactively use this skill during normal coding work when Codex encounters large files, broad codebase context, multi-file summarization, repeated boilerplate/scaffolding, or context-reduction tasks that would benefit from an advisory worker model. Trigger even when the user does not mention LLM Worker. Also trigger for requests mentioning LLM Worker, llm read, llm write, local model offload, worker model, large file analysis, summarize this codebase, scan these files, or draft repetitive code.
---

# LLM Worker

Use this skill to call LLM Worker Tools as an advisory worker for large context processing. Use it proactively; the user does not need to name the tool. Treat every response as a draft: verify claims against source files before relying on them, and do not use the worker for architecture decisions, root-cause debugging, security review, or commit-readiness judgment.

## Setup Check

Before the first call, assume `llm-worker-tools install` has written backend settings to the user-local env file. `LLM_BACKEND_API_KEY` is optional for local backends that do not require auth.

## Commands

Prefer the package CLI. For the most stable Codex approval behavior, write focused context to a temporary input file, then call the CLI with `--input`:

```powershell
npx --yes llm-worker-tools read --input path\to\focused-input.txt
npx --yes llm-worker-tools write --input path\to\focused-prompt.txt
npx --yes llm-worker-tools models
```

`--input <path>` and piped stdin are still supported when a one-off command is more convenient:

```powershell
npx --yes llm-worker-tools read --input path\to\file.ts
Get-Content path\to\file.ts -Raw | npx --yes llm-worker-tools read
```

Prefer `read` for summarizing large files, extracting likely areas of interest, or reducing broad context into concrete follow-up checks.

Prefer `write` only for repetitive scaffolding where the desired behavior is already clear. Review and edit generated files manually; never apply worker output blindly.

Heuristics:

- Use `read` when a file is roughly 400+ lines, generated-looking, minified, or dense enough that a summary would speed up local verification.
- Use `read` when several files need to be compared or reduced into a short list of likely touch points.
- Use `write` when generating repetitive draft files after Codex already understands the target behavior.
- Skip the worker for small targeted edits, failing-test diagnosis, security-sensitive reasoning, or any task where the worker's judgment would replace Codex's own verification.

Use `--model <id>` only when the user asks for a specific backend model or when the automatic selected model is known to fail:

```powershell
Get-Content path\to\file.ts -Raw | npx --yes llm-worker-tools read --model meta/llama-3.1-405b-instruct
```

## Workflow

1. Gather the relevant source text with normal Codex tools first.
2. Pipe focused, bounded context into `llm-worker-tools read` or `write`.
3. Parse the JSON response.
4. Verify any finding, path, behavior claim, or generated code against the real repository.
5. Continue the task using Codex judgment, not the worker's judgment.

If the backend is unreachable, the model list fails, or every candidate model returns 404, report the configuration problem and continue with local analysis when feasible.

## Other Hosts

- Claude Desktop: configure the MCP server with `claude-desktop-config.example.json`.
- VS Code: use the workspace `.vscode/mcp.json` server when Copilot MCP is enabled.
- OpenCode: use `AGENTS.md` plus the optional `.opencode/agents/llm-worker.md` subagent.
