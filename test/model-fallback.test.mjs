/**
 * Standalone ESM test: model-fallback behavior in runWorker.
 *
 * Spins a local HTTP server where:
 *   model-1  always returns HTTP 404
 *   model-2  returns a valid OpenAI chat-completion response
 *
 * Verifies:
 *   1. runWorker does not throw
 *   2. Result is a non-empty string
 *   3. Model cache file exists and contains valid JSON with selected_model
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import process from "node:process";

// ── Local server ─────────────────────────────────────────────────────

const MODELS = ["model-1", "model-2"];

const VALID_READ_JSON = JSON.stringify({
  summary: "test summary",
  findings: ["finding one"],
  open_questions: ["open question one"],
});

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function handleRequest(req, res) {
  // Models list — no body needed, respond immediately.
  if (req.method === "GET" && req.url === "/v1/models") {
    sendJson(res, 200, {
      object: "list",
      data: MODELS.map((id) => ({ id, object: "model" })),
    });
    return;
  }

  // Chat completions — accumulate body then respond.
  if (req.method === "POST" && req.url === "/v1/chat/completions") {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      let parsed;
      try { parsed = JSON.parse(body); } catch { parsed = {}; }
      const model = parsed.model || "";

      if (model === "model-1") {
        sendJson(res, 404, { error: { message: "model not found", type: "invalid_request_error" } });
        return;
      }

      // model-2 (or any other): return a valid OpenAI completion.
      sendJson(res, 200, {
        id: "chatcmpl-test",
        object: "chat.completion",
        model,
        choices: [{
          index: 0,
          message: { role: "assistant", content: VALID_READ_JSON },
          finish_reason: "stop",
        }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      });
    });
    return;
  }

  res.writeHead(404);
  res.end("not found");
}

// ── Helpers ───────────────────────────────────────────────────────────

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer(handleRequest);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

// ── Main ──────────────────────────────────────────────────────────────

const { server, port } = await startServer();
const baseUrl = `http://127.0.0.1:${port}/v1`;
const cacheFile = path.join(os.tmpdir(), `llm-worker-test-cache-${process.pid}.json`);

// Set env vars BEFORE dynamic import so module-level constants pick them up.
process.env.LLM_BACKEND_BASE_URL = baseUrl;
process.env.LLM_BACKEND_API_KEY = "test-key";
process.env.LLM_MODEL_CACHE_PATH = cacheFile;

// Clean up any leftover cache from a previous run.
try { fs.unlinkSync(cacheFile); } catch { /* ignore */ }

try {
  // Dynamic import AFTER env vars are set.
  const { runWorker } = await import("../llm-worker.mjs");

  // Build an OpenAI client pointed at our local server.
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey: "test-key", baseURL: baseUrl });

  // Run the worker.
  const result = await runWorker("read", { input: "hello" }, client);

  // 1. Did not throw — we got here.

  // 2. Result is a non-empty string.
  assert(typeof result === "string" && result.trim().length > 0, "result is non-empty string");

  // 3. Cache file exists and contains valid JSON with selected_model.
  assert(fs.existsSync(cacheFile), "cache file exists");
  const cacheRaw = fs.readFileSync(cacheFile, "utf8");
  let cache;
  try { cache = JSON.parse(cacheRaw); } catch (e) { throw new Error(`cache not valid JSON: ${e.message}`); }
  assert(typeof cache.selected_model === "string" && cache.selected_model.length > 0, "cache has selected_model");

  console.log("PASS: model-fallback test passed");
  console.log(`  result length : ${result.length}`);
  console.log(`  selected_model: ${cache.selected_model}`);
  process.exit(0);
} catch (err) {
  console.error("FAIL:", err.message);
  process.exit(1);
} finally {
  server.close();
  try { fs.unlinkSync(cacheFile); } catch { /* ignore */ }
}
