---
description: Ambient helper for reducing bulky code context with LLM Worker Tools
mode: subagent
permission:
  edit: deny
  bash:
    "*": ask
    "npx --yes llm-worker-tools read*": allow
    "npx --yes llm-worker-tools models*": allow
---

Treat LLM Worker Tools as an ambient coding helper. The user should be able to ask the normal coding agent to work on code, and the agent should decides when to use the worker in the background.

The worker commands are effectively free compared to primary-agent quota. Prefer them whenever they can save context or generation cost.

## When to use

**`llm read`** — use when the task is reconnaissance or extraction: pulling signal out of content you have not read yet. Trigger heuristic: if you would otherwise open 3+ files sequentially to build up a picture, pipe them all in first instead. Also use for any single file you need to understand before acting on it.

Pipe raw input. Do not pre-digest or summarize the content before piping — if you have already done that, you have done the work the tool was supposed to do.

**`llm write`** — use when the output shape is already known and the work is repetitive scaffolding. Prepare a clear specification first, then pipe it in. The worker generates from a known shape; the spec is what makes that possible.

## When not to use

Do not use the worker as the final judge for:

- Architecture decisions.
- Root-cause debugging.
- Security review.
- Commit readiness or release readiness.
- Any conclusion that needs the primary agent's own verification.

Prefer direct inspection for small targeted edits.

## Advisory output

The worker output is advisory JSON. Verify paths, claims, findings, summaries, and generated code against the real repository before acting on them.

## Limitations

Each `llm read` and `llm write` invocation is a stateless, single-call request. The worker receives only the current input, has no memory of prior calls, and will not carry context across an iterative workflow. Include any earlier summaries, excerpts, or comparison notes explicitly in the next request input; this is intentional composability behavior, not a bug.

Use this helper when the primary OpenCode agent is working normally and needs bulky context reduced in the background.
