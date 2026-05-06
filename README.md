# LLM Worker Tools

Backend-neutral helper for letting coding agents offload bulky context reduction to an OpenAI-compatible LLM backend. The intended experience is ambient: ask your normal IDE agent to work on code, and the agent uses the worker in the background when the task fits.

## One-Command Setup

After this package is published, install everywhere with:

```powershell
npx --yes llm-worker-tools install
```

The installer prompts for:

- Backend URL.
- API key, optional.
- Model cache path.

Secrets are written only to:

```text
~/.llm-worker-tools/.env
```

IDE configs point to that env file path and do not contain the API key.

For local development from this repository:

```powershell
cd C:\Code\llm-worker-tools
npm run setup:ides
```

The install command regenerates host files from the shared policy and configures:

- Codex Desktop global skill link.
- Claude Desktop MCP server and Claude instruction pointer.
- VS Code user MCP server.
- OpenCode MCP server, global instructions, and helper subagent.

If dependencies are already installed locally, use:

```powershell
npm run install:ides
```

To preview changes:

```powershell
node scripts\install-ides.mjs --dry-run --use-local-paths
```

## Drift Control

The shared behavior lives in:

```text
shared/ambient-agent-policy.md
```

Host-specific instruction files are generated from that source:

```powershell
npm run sync:ides
npm run check:ides
```

`npm run smoke:codex-plugin` also checks that generated files are in sync.

## Manual CLI

Agents should prefer MCP or their host integration, but the shared CLI remains available:

```powershell
npx --yes llm-worker-tools models
Get-Content path\to\file.ts -Raw | npx --yes llm-worker-tools read
Get-Content prompt.txt -Raw | npx --yes llm-worker-tools write
```

## Trusted Publishing

The GitHub Actions workflow in `.github/workflows/publish.yml` is configured for npm trusted publishing with OIDC. On npmjs.com, add a trusted publisher for:

- Repository: `OhOkThisIsFine/llm-worker-tools`
- Workflow filename: `publish.yml`
- Environment: leave blank unless you add one to the workflow

Then push a version tag such as `v0.2.0`. The workflow uses Node 24, grants `id-token: write`, runs `npm test`, and publishes with `npm publish --access public`.
