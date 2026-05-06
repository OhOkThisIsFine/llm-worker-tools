# LLM Worker Tools

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

Prefer the workspace or user MCP server named `llm-worker-tools` when it is available in VS Code. Otherwise run the shared CLI:

```powershell
Get-Content path\to\file.ts -Raw | npx --yes llm-worker-tools read
```
