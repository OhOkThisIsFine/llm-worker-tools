#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { SCRIPT_BY_COMMAND, isWorkerCommand, usageText } from "../scripts/command-metadata.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function usage() {
  console.log(usageText());
}

export function dispatch(argv = process.argv, { spawnFn = spawn, exitFn = process.exit, stdout = console.log, stderr = console.error } = {}) {
  const args = argv.slice(2);
  const command = args[0];

  if (!command || command === "--help" || command === "-h") {
    stdout(usageText());
    exitFn(0);
    return null;
  }

  if (!SCRIPT_BY_COMMAND.has(command)) {
    stderr(`Unknown command: ${command}`);
    stdout(usageText());
    exitFn(1);
    return null;
  }

  const script = path.join(packageRoot, SCRIPT_BY_COMMAND.get(command));
  const childArgs = args.slice(1);
  const env = isWorkerCommand(command)
    ? { ...process.env, LLM_WORKER_TOOLS_COMMAND: command }
    : process.env;

  const child = spawnFn(process.execPath, [script, ...childArgs], {
    cwd: packageRoot,
    env,
    stdio: "inherit",
  });

  child.on("exit", (code, signal) => {
    if (code !== null) {
      exitFn(code);
      return;
    }
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    exitFn(1);
  });
  child.on("error", error => {
    stderr(`Failed to spawn command "${command}" (script: ${script}).`);
    stderr(error?.stack || error?.message || String(error));
    exitFn(1);
  });

  return { command, script, childArgs };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  dispatch();
}
