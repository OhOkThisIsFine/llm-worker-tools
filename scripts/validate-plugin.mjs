#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { SCRIPT_BY_COMMAND } from "./command-metadata.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requiredFiles = [
  ".codex-plugin/plugin.json",
  ".github/copilot-instructions.md",
  ".opencode/agents/llm-worker.md",
  ".vscode/mcp.json",
  "CLAUDE.md",
  "skills/llm-worker/SKILL.md",
  "skills/llm-worker/agents/openai.yaml",
  "claude-desktop-config.example.json",
  "shared/ambient-agent-policy.md",
  "bin/llm-worker-tools.mjs",
  "scripts/command-metadata.mjs",
  "scripts/env-utils.mjs",
  "scripts/install-ides.mjs",
  "scripts/sync-host-files.mjs",
  "scripts/llm-worker-mcp.mjs",
  "llm-worker.mjs"
];

function fail(message) {
  console.error(message);
  process.exit(1);
}

for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(root, file))) {
    fail(`Missing required file: ${file}`);
  }
}

const manifestPath = path.join(root, ".codex-plugin/plugin.json");
let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
} catch (error) {
  fail(`Invalid plugin manifest JSON: ${error.message}`);
}

for (const field of ["name", "version", "description", "skills", "interface"]) {
  if (!manifest[field]) fail(`plugin.json is missing required field: ${field}`);
}

if (manifest.name !== "llm-worker-tools") {
  fail(`plugin.json name must be llm-worker-tools, got ${manifest.name}`);
}

if (manifest.skills !== "./skills/") {
  fail(`plugin.json skills must be ./skills/, got ${manifest.skills}`);
}

for (const command of ["install", "setup", "mcp", "read", "write", "models"]) {
  if (!SCRIPT_BY_COMMAND.has(command)) {
    fail(`Missing CLI command metadata for ${command}.`);
  }
}

for (const field of ["homepage", "repository"]) {
  if (manifest[field] === "https://github.com/") {
    fail(`plugin.json ${field} must not be the bare GitHub root placeholder.`);
  }
}

for (const field of ["privacyPolicyURL", "termsOfServiceURL"]) {
  const value = manifest.interface[field];
  if (typeof value === "string" && value.includes("openai.com/policies")) {
    fail(`plugin.json interface.${field} must not point to OpenAI policies.`);
  }
}

const skillText = fs.readFileSync(path.join(root, "skills/llm-worker/SKILL.md"), "utf8");
if (!skillText.startsWith("---\n")) {
  fail("SKILL.md must start with YAML frontmatter.");
}

if (!/^name:\s*llm-worker$/m.test(skillText)) {
  fail("SKILL.md frontmatter must include name: llm-worker");
}

if (!/^description:\s*.+/m.test(skillText)) {
  fail("SKILL.md frontmatter must include a description.");
}

const check = spawnSync(process.execPath, ["--check", path.join(root, "llm-worker.mjs")], {
  cwd: root,
  stdio: "inherit"
});

if (check.status !== 0) {
  fail("llm-worker.mjs failed node --check.");
}

const mcpCheck = spawnSync(process.execPath, ["--check", path.join(root, "scripts/llm-worker-mcp.mjs")], {
  cwd: root,
  stdio: "inherit"
});

if (mcpCheck.status !== 0) {
  fail("llm-worker-mcp.mjs failed node --check.");
}

for (const script of ["bin/llm-worker-tools.mjs", "scripts/command-metadata.mjs", "scripts/env-utils.mjs", "scripts/install-ides.mjs", "scripts/sync-host-files.mjs"]) {
  const scriptCheck = spawnSync(process.execPath, ["--check", path.join(root, script)], {
    cwd: root,
    stdio: "inherit"
  });

  if (scriptCheck.status !== 0) {
    fail(`${script} failed node --check.`);
  }
}

const syncCheck = spawnSync(process.execPath, [path.join(root, "scripts/sync-host-files.mjs"), "--check"], {
  cwd: root,
  stdio: "inherit"
});

if (syncCheck.status !== 0) {
  fail("Generated host files are out of sync.");
}

for (const jsonFile of [".vscode/mcp.json", "claude-desktop-config.example.json"]) {
  try {
    JSON.parse(fs.readFileSync(path.join(root, jsonFile), "utf8"));
  } catch (error) {
    fail(`${jsonFile} is not valid JSON: ${error.message}`);
  }
}

console.log("Codex plugin smoke check passed.");
