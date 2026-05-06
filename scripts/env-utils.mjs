import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function defaultConfigDir() {
  return process.env.LLM_WORKER_TOOLS_HOME || path.join(os.homedir(), ".llm-worker-tools");
}

export function defaultEnvPath() {
  return process.env.LLM_WORKER_ENV_PATH || path.join(defaultConfigDir(), ".env");
}

export function parseEnv(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

export function loadUserEnv(envPath = defaultEnvPath()) {
  if (!fs.existsSync(envPath)) return false;
  const values = parseEnv(fs.readFileSync(envPath, "utf8"));
  for (const [key, value] of Object.entries(values)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
  return true;
}

export function formatEnv(values) {
  return `${Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== null && String(value).length > 0)
    .map(([key, value]) => `${key}=${String(value).replace(/\r?\n/g, "")}`)
    .join("\n")}\n`;
}

