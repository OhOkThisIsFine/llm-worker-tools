import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("plugin manifest uses canonical project URLs and no OpenAI policy URLs", () => {
  const manifest = JSON.parse(fs.readFileSync(".codex-plugin/plugin.json", "utf8"));

  assert.equal(manifest.homepage, "https://github.com/OhOkThisIsFine/llm-worker-tools");
  assert.equal(manifest.repository, "https://github.com/OhOkThisIsFine/llm-worker-tools");
  assert.equal(manifest.interface.websiteURL, "https://github.com/OhOkThisIsFine/llm-worker-tools");
  assert.equal("privacyPolicyURL" in manifest.interface, false);
  assert.equal("termsOfServiceURL" in manifest.interface, false);
});

test("VS Code MCP config does not force empty env placeholder", () => {
  const config = JSON.parse(fs.readFileSync(".vscode/mcp.json", "utf8"));
  const server = config.servers["llm-worker-tools"];

  assert.equal(server.command, "npx");
  assert.deepEqual(server.args, ["--yes", "llm-worker-tools", "mcp"]);
  assert.equal(server.env?.LLM_WORKER_ENV_PATH, undefined);
});

test("agent descriptor has top-level name", () => {
  const text = fs.readFileSync("skills/llm-worker/agents/openai.yaml", "utf8");

  assert.match(text, /^name:\s*"llm-worker"$/m);
  assert.match(text, /^interface:/m);
});

test("validate-plugin does not import the CLI entrypoint", () => {
  const text = fs.readFileSync("scripts/validate-plugin.mjs", "utf8");

  assert.doesNotMatch(text, /import\s+.*bin\/llm-worker-tools\.mjs/);
  assert.match(text, /fileURLToPath\(import\.meta\.url\)/);
});
