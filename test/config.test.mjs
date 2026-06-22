import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { SCRIPT_BY_COMMAND } from "../scripts/command-metadata.mjs";

const { name: packageName } = createRequire(import.meta.url)("../package.json");

test("plugin manifest uses canonical project URLs and no OpenAI policy URLs", () => {
  const manifest = JSON.parse(fs.readFileSync(".codex-plugin/plugin.json", "utf8"));

  // The repository URL is the single source of truth; homepage and the
  // interface website must agree with it rather than repeat a hand-typed literal.
  const repoUrl = manifest.repository;
  assert.match(repoUrl, /^https:\/\/github\.com\/[^/]+\/llm-worker-tools$/);
  assert.ok(!/openai/i.test(repoUrl), "repository URL is project-owned, not OpenAI");
  assert.equal(manifest.homepage, repoUrl);
  assert.equal(manifest.interface.websiteURL, repoUrl);
  assert.equal("privacyPolicyURL" in manifest.interface, false);
  assert.equal("termsOfServiceURL" in manifest.interface, false);
});

test("VS Code MCP config does not force empty env placeholder", () => {
  const config = JSON.parse(fs.readFileSync(".vscode/mcp.json", "utf8"));
  const server = config.servers["llm-worker-tools"];

  // Derive the expected npx args from the published package name and the "mcp"
  // command token registered in command-metadata, rather than duplicating the
  // literal arg list inline where it can drift from the real entrypoint.
  assert.ok(SCRIPT_BY_COMMAND.has("mcp"), "mcp is a registered command");
  const expectedArgs = ["--yes", packageName, "mcp"];

  assert.equal(server.command, "npx");
  assert.deepEqual(server.args, expectedArgs);
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
