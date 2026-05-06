#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checkOnly = process.argv.includes("--check");

function posixPath(filePath) {
  return filePath.replaceAll("\\", "/");
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8").trim();
}

function writeGenerated(relativePath, content) {
  const target = path.join(root, relativePath);
  const normalized = `${content.trim()}\n`;
  if (checkOnly) {
    const current = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
    if (current !== normalized) {
      console.error(`${relativePath} is out of sync. Run npm run sync:ides.`);
      process.exitCode = 1;
    }
    return;
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, normalized, "utf8");
  console.log(`synced ${relativePath}`);
}

const policy = read("shared/ambient-agent-policy.md").replace(/^# Ambient Agent Policy\s*/, "").trim();
const cli = "npx --yes llm-worker-tools";

writeGenerated("AGENTS.md", `
# LLM Worker Tools Agent Instructions

${policy}

## Host Behavior

Codex Desktop:

- Use the global \`llm-worker\` skill automatically when the task fits the policy above.
- Prefer writing focused context to a temporary input file, then run:

\`\`\`powershell
${cli} read --input path\\to\\focused-input.txt
\`\`\`

- For draft generation:

\`\`\`powershell
${cli} write --input path\\to\\focused-prompt.txt
\`\`\`

Claude Desktop:

- Prefer the \`llm-worker-tools\` MCP tools when the local server is configured.
- Use \`llm_worker_read\`, \`llm_worker_write\`, and \`llm_worker_models\` instead of shell commands when available.

VS Code / Copilot:

- Prefer the workspace or user MCP server named \`llm-worker-tools\`.
- Keep \`.github/copilot-instructions.md\` in projects where Copilot should use this ambient helper.

OpenCode:

- Read this file through the global OpenCode \`instructions\` setting.
- Use the \`llm-worker\` subagent or the \`llm-worker-tools\` MCP server when bulky context should be reduced.

## Shared CLI Fallback

If a host cannot use MCP, run the CLI directly:

\`\`\`powershell
Get-Content path\\to\\file.ts -Raw | ${cli} read
Get-Content prompt.txt -Raw | ${cli} write
${cli} models
\`\`\`
`);

writeGenerated("CLAUDE.md", `
# LLM Worker Tools

${policy}

Prefer the \`llm-worker-tools\` MCP tools when Claude Desktop has the local server configured:

- \`llm_worker_read\`
- \`llm_worker_write\`
- \`llm_worker_models\`

If MCP is unavailable and shell access is available, fall back to:

\`\`\`powershell
Get-Content path\\to\\file.ts -Raw | ${cli} read
\`\`\`
`);

writeGenerated("CLAUDE-SNIPPET.md", `
# LLM Worker Tools

${policy}

## Commands

\`\`\`powershell
Get-Content file.ts -Raw | ${cli} read
Get-Content prompt.txt -Raw | ${cli} write
${cli} models
\`\`\`

Both \`read\` and \`write\` accept \`--model <id>\` to override automatic selection. Output is always JSON.

For Claude Desktop, prefer configuring the local MCP server from \`claude-desktop-config.example.json\`. It exposes \`llm_worker_read\`, \`llm_worker_write\`, and \`llm_worker_models\` backed by the same CLI.
`);

writeGenerated(".github/copilot-instructions.md", `
# LLM Worker Tools

${policy}

Prefer the workspace or user MCP server named \`llm-worker-tools\` when it is available in VS Code. Otherwise run the shared CLI:

\`\`\`powershell
Get-Content path\\to\\file.ts -Raw | ${cli} read
\`\`\`
`);

writeGenerated(".opencode/agents/llm-worker.md", `
---
description: Ambient helper for reducing bulky code context with LLM Worker Tools
mode: subagent
permission:
  edit: deny
  bash:
    "*": ask
    "${cli} read*": allow
    "${cli} models*": allow
---

${policy}

Use this helper when the primary OpenCode agent is working normally and needs bulky context reduced in the background.
`);

writeGenerated(".vscode/mcp.json", JSON.stringify({
  servers: {
    "llm-worker-tools": {
      type: "stdio",
      command: "npx",
      args: ["--yes", "llm-worker-tools", "mcp"],
      env: {
        LLM_WORKER_ENV_PATH: "${env:LLM_WORKER_ENV_PATH}"
      }
    }
  }
}, null, 2));

writeGenerated("claude-desktop-config.example.json", JSON.stringify({
  mcpServers: {
    "llm-worker-tools": {
      type: "stdio",
      command: "npx",
      args: ["--yes", "llm-worker-tools", "mcp"],
      env: {
        LLM_WORKER_ENV_PATH: "C:/Users/you/.llm-worker-tools/.env"
      }
    }
  }
}, null, 2));

if (process.exitCode) process.exit(process.exitCode);
