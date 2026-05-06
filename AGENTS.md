# LLM Worker Tools Agent Instructions

Treat LLM Worker Tools as an ambient coding helper. The user should be able to ask the normal coding agent to work on code, and the agent should decide when to use the worker in the background.

Use the worker proactively for:

- Summarizing large or dense files before local verification.
- Reducing broad multi-file context into likely touch points.
- Extracting advisory findings or open questions from bulky code input.
- Drafting repetitive scaffolding after the desired behavior is clear.

Prefer direct inspection for small targeted edits.

Do not use the worker as the final judge for:

- Architecture decisions.
- Root-cause debugging.
- Security review.
- Commit readiness or release readiness.
- Any conclusion that needs the primary agent's own verification.

The worker output is advisory JSON. Verify paths, claims, findings, summaries, and generated code against the real repository before acting on them.

## Host Behavior

Codex Desktop:

- Use the global `llm-worker` skill automatically when the task fits the policy above.
- Prefer writing focused context to a temporary input file, then run:

```powershell
npx --yes llm-worker-tools read --input path\to\focused-input.txt
```

- For draft generation:

```powershell
npx --yes llm-worker-tools write --input path\to\focused-prompt.txt
```

Claude Desktop:

- Prefer the `llm-worker-tools` MCP tools when the local server is configured.
- Use `llm_worker_read`, `llm_worker_write`, and `llm_worker_models` instead of shell commands when available.

VS Code / Copilot:

- Prefer the workspace or user MCP server named `llm-worker-tools`.
- Keep `.github/copilot-instructions.md` in projects where Copilot should use this ambient helper.

OpenCode:

- Read this file through the global OpenCode `instructions` setting.
- Use the `llm-worker` subagent or the `llm-worker-tools` MCP server when bulky context should be reduced.

## Shared CLI Fallback

If a host cannot use MCP, run the CLI directly:

```powershell
Get-Content path\to\file.ts -Raw | npx --yes llm-worker-tools read
Get-Content prompt.txt -Raw | npx --yes llm-worker-tools write
npx --yes llm-worker-tools models
```
