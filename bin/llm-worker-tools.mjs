#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const command = args[0];

const scriptByCommand = new Map([
  ["install", "scripts/install-ides.mjs"],
  ["setup", "scripts/install-ides.mjs"],
  ["mcp", "scripts/llm-worker-mcp.mjs"],
  ["read", "llm-worker.mjs"],
  ["write", "llm-worker.mjs"],
  ["models", "llm-worker.mjs"],
]);

function usage() {
  console.log([
    "Usage:",
    "  llm-worker-tools install",
    "  llm-worker-tools read   [--model <id>] [--input <path>]",
    "  llm-worker-tools write  [--model <id>] [--input <path>]",
    "  llm-worker-tools models [--refresh]",
    "  llm-worker-tools mcp",
  ].join("\n"));
}

if (!command || command === "--help" || command === "-h") {
  usage();
  process.exit(0);
}

if (!scriptByCommand.has(command)) {
  console.error(`Unknown command: ${command}`);
  usage();
  process.exit(1);
}

const script = path.join(packageRoot, scriptByCommand.get(command));
// install/setup/mcp strip the command word (args.slice(1)) because their scripts parse only flags; read/write/models forward full args because llm-worker.mjs expects the verb as argv[2].
const childArgs = ["install", "setup", "mcp"].includes(command) ? args.slice(1) : args;

const child = spawn(process.execPath, [script, ...childArgs], {
  cwd: packageRoot,
  env: process.env,
  stdio: "inherit",
});

child.on("exit", code => process.exit(code ?? 1));
child.on("error", error => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});

