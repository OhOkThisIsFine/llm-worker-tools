export const WORKER_COMMANDS = ["read", "write", "models"];
export const SETUP_COMMANDS = ["install", "setup", "mcp"];

export const SCRIPT_BY_COMMAND = new Map([
  ["install", "scripts/install-ides.mjs"],
  ["setup", "scripts/install-ides.mjs"],
  ["mcp", "scripts/llm-worker-mcp.mjs"],
  ["read", "llm-worker.mjs"],
  ["write", "llm-worker.mjs"],
  ["models", "llm-worker.mjs"],
]);

export function usageText(binary = "llm-worker-tools") {
  return [
    "Usage:",
    `  ${binary} install`,
    `  ${binary} read   [--model <id>] [--input <path>]`,
    `  ${binary} write  [--model <id>] [--input <path>]`,
    `  ${binary} models [--refresh]`,
    `  ${binary} mcp`,
  ].join("\n");
}

export function isWorkerCommand(command) {
  return WORKER_COMMANDS.includes(command);
}
