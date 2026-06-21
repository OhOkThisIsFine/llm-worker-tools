#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { defaultConfigDir, defaultEnvPath, formatEnv, loadUserEnv } from "./env-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dryRun = process.argv.includes("--dry-run");
const nonInteractive = process.argv.includes("--yes") || process.argv.includes("-y");
const useLocalPaths = process.argv.includes("--use-local-paths");
const home = os.homedir();
const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
const envPath = defaultEnvPath();

function toSlash(filePath) {
  return filePath.replaceAll("\\", "/");
}

function log(action) {
  console.log(`${dryRun ? "would " : ""}${action}`);
}

function ensureDir(dir) {
  if (dryRun) {
    log(`create directory ${dir}`);
    return;
  }
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  if (dryRun) {
    log(`write ${filePath}`);
    return;
  }
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  log(`wrote ${filePath}`);
}

function writeText(filePath, value, mode) {
  ensureDir(path.dirname(filePath));
  if (dryRun) {
    log(`write ${filePath}`);
    return;
  }
  fs.writeFileSync(filePath, `${value.trim()}\n`, { encoding: "utf8", mode });
  if (mode) {
    try { fs.chmodSync(filePath, mode); } catch {}
  }
  log(`wrote ${filePath}`);
}

function copyDir(source, target) {
  ensureDir(path.dirname(target));
  if (dryRun) {
    log(`copy ${source} -> ${target}`);
    return;
  }
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(source, target, { recursive: true });
  log(`copied ${source} -> ${target}`);
}

function runNodeScript(relativePath, args = []) {
  const result = spawnSync(process.execPath, [path.join(root, relativePath), ...args], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

function cliCommand() {
  if (useLocalPaths) {
    return {
      command: "node",
      args: [toSlash(path.join(root, "bin", "llm-worker-tools.mjs"))],
    };
  }
  return {
    command: "npx",
    args: ["--yes", "llm-worker-tools"],
  };
}

function cliCommandLine(...args) {
  const cli = cliCommand();
  return [cli.command, ...cli.args, ...args].join(" ");
}

function mcpServerForVSCode() {
  const cli = cliCommand();
  return {
    type: "stdio",
    command: cli.command,
    args: [...cli.args, "mcp"],
    env: {
      LLM_WORKER_ENV_PATH: toSlash(envPath),
    },
  };
}

function mcpServerForOpenCode() {
  const cli = cliCommand();
  return {
    type: "local",
    command: [cli.command, ...cli.args, "mcp"],
    environment: {
      LLM_WORKER_ENV_PATH: toSlash(envPath),
    },
    enabled: true,
  };
}

function mcpServerForClaude() {
  const server = mcpServerForVSCode();
  return {
    type: "stdio",
    command: server.command,
    args: server.args,
    env: server.env,
  };
}

async function promptForConfig() {
  loadUserEnv(envPath);
  const existingBaseUrl = process.env.LLM_BACKEND_BASE_URL || "";
  const existingApiKey = process.env.LLM_BACKEND_API_KEY || "";
  const existingCachePath = process.env.LLM_MODEL_CACHE_PATH || path.join(process.env.USERPROFILE || os.homedir(), ".cache", "llm-worker", "models.json");

  if (nonInteractive) {
    if (!existingBaseUrl) {
      throw new Error("LLM_BACKEND_BASE_URL is required in --yes mode.");
    }
    return {
      LLM_BACKEND_BASE_URL: existingBaseUrl,
      LLM_BACKEND_API_KEY: existingApiKey,
      LLM_MODEL_CACHE_PATH: existingCachePath,
    };
  }

  const rl = readline.createInterface({ input, output });
  try {
    const backendAnswer = await rl.question(`Backend URL${existingBaseUrl ? ` [${existingBaseUrl}]` : ""}: `);
    const backendUrl = (backendAnswer.trim() || existingBaseUrl).trim();
    if (!backendUrl) throw new Error("Backend URL is required.");

    const keyAnswer = await rl.question(`API key (optional${existingApiKey ? ", press Enter to keep existing" : ""}): `);
    const apiKey = keyAnswer.length === 0 ? existingApiKey : keyAnswer.trim();

    const cacheAnswer = await rl.question(`Model cache path [${existingCachePath}]: `);
    const cachePath = (cacheAnswer.trim() || existingCachePath).trim();

    return {
      LLM_BACKEND_BASE_URL: backendUrl,
      LLM_BACKEND_API_KEY: apiKey,
      LLM_MODEL_CACHE_PATH: cachePath,
    };
  } finally {
    rl.close();
  }
}

function installEnv(values) {
  writeText(envPath, formatEnv(values), 0o600);
  return dryRun ? "would modify" : "modified";
}

function installCodexSkill() {
  const target = path.join(home, ".codex", "skills", "llm-worker");
  const source = path.join(root, "skills", "llm-worker");
  copyDir(source, target);
  return dryRun ? "would modify" : "modified";
}

function installClaudeDesktop() {
  const configPath = path.join(appData, "Claude", "claude_desktop_config.json");
  const config = readJson(configPath, {});
  config.mcpServers = config.mcpServers || {};
  config.mcpServers["llm-worker-tools"] = mcpServerForClaude();
  writeJson(configPath, config);

  const instructionPath = path.join(home, ".claude", "CLAUDE.md");
  const existing = fs.existsSync(instructionPath) ? fs.readFileSync(instructionPath, "utf8") : "";
  const section = [
    "# LLM Worker Tools",
    "Use LLM Worker Tools as an ambient coding helper. Prefer the `llm-worker-tools` MCP tools for bulky code context reduction, and verify all worker output against source before acting.",
  ].join("\n");
  if (!existing.includes("LLM Worker Tools")) {
    const trimmedExisting = existing.trim();
    writeText(instructionPath, trimmedExisting ? `${trimmedExisting}\n\n${section}` : section);
    return dryRun ? "would modify" : "modified";
  } else {
    log(`Claude instructions already mention LLM Worker Tools at ${instructionPath}`);
    return "already up-to-date";
  }
}

function installVSCode() {
  const userMcpPath = path.join(appData, "Code", "User", "mcp.json");
  const config = readJson(userMcpPath, {});
  config.servers = config.servers || {};
  config.servers["llm-worker-tools"] = mcpServerForVSCode();
  writeJson(userMcpPath, config);
  return dryRun ? "would modify" : "modified";
}

function installOpenCode() {
  const configDir = path.join(home, ".config", "opencode");
  const configPath = path.join(configDir, "opencode.json");
  const config = readJson(configPath, { $schema: "https://opencode.ai/config.json" });
  config.mcp = config.mcp || {};
  config.mcp["llm-worker-tools"] = mcpServerForOpenCode();
  config.instructions = Array.isArray(config.instructions) ? config.instructions : [];
  const policyPath = toSlash(path.join(defaultConfigDir(), "AGENTS.md"));
  if (!config.instructions.includes(policyPath)) config.instructions.push(policyPath);
  config.agent = config.agent || {};
  config.agent["llm-worker"] = {
    description: "Ambient helper for reducing bulky code context with LLM Worker Tools",
    mode: "subagent",
    prompt: fs.readFileSync(path.join(root, ".opencode", "agents", "llm-worker.md"), "utf8"),
    permission: {
      edit: "deny",
      bash: {
        "*": "ask",
        [`${cliCommandLine("read")}*`]: "allow",
        [`${cliCommandLine("models")}*`]: "allow",
      },
    },
  };
  writeJson(configPath, config);
  return dryRun ? "would modify" : "modified";
}

function installSharedInstructions() {
  const target = path.join(defaultConfigDir(), "AGENTS.md");
  const canonical = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8").trim();
  if (!fs.existsSync(target)) {
    writeText(target, canonical);
    return dryRun ? "would modify" : "modified";
  }

  const existing = fs.readFileSync(target, "utf8");
  if (existing.trim() === canonical || existing.includes(canonical)) {
    log(`shared instructions already current at ${target}`);
    return "already up-to-date";
  }

  const delimiterStart = "<!-- BEGIN LLM Worker Tools managed instructions -->";
  const delimiterEnd = "<!-- END LLM Worker Tools managed instructions -->";
  const managedBlock = `${delimiterStart}\n${canonical}\n${delimiterEnd}`;
  const withoutOldBlock = existing.replace(
    new RegExp(`\\n?${delimiterStart}[\\s\\S]*?${delimiterEnd}\\n?`, "m"),
    "\n"
  ).trim();
  writeText(target, `${withoutOldBlock}\n\n${managedBlock}`);
  return dryRun ? "would modify" : "modified";
}

try {
  runNodeScript("scripts/sync-host-files.mjs", dryRun ? ["--check"] : []);
  const values = await promptForConfig();
  const outcomes = [
    ["Environment", installEnv(values)],
    ["Shared instructions", installSharedInstructions()],
    ["Codex skill", installCodexSkill()],
    ["Claude Desktop", installClaudeDesktop()],
    ["VS Code", installVSCode()],
    ["OpenCode", installOpenCode()],
  ];

  console.log("");
  console.log("LLM Worker Tools IDE install complete.");
  for (const [name, outcome] of outcomes) {
    console.log(`- ${name}: ${outcome}`);
  }
  console.log(`Credentials were written only to ${envPath}.`);
  console.log("IDE configs reference that file path but do not contain the API key.");
} catch (error) {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
}
