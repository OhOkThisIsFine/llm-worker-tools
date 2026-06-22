import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import OpenAI from "openai";
import { createConfig, runWorker } from "../llm-worker.mjs";

const VALID_READ_JSON = JSON.stringify({
  summary: "test summary",
  findings: ["finding one"],
  open_questions: ["open question one"],
});

// Spin a local OpenAI-compatible backend where model-1 always 404s on a chat
// completion and model-2 succeeds. An ordered hit-log records the model id seen
// on every /chat/completions call so we can assert per-model 404 rotation.
function startServer(hits) {
  const models = ["model-1", "model-2"];
  const server = http.createServer((req, res) => {
    const sendJson = (status, body) => {
      const payload = JSON.stringify(body);
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      });
      res.end(payload);
    };

    if (req.method === "GET" && req.url === "/v1/models") {
      sendJson(200, { object: "list", data: models.map(id => ({ id, object: "model" })) });
      return;
    }

    if (req.method === "POST" && req.url === "/v1/chat/completions") {
      let body = "";
      req.on("data", chunk => { body += chunk; });
      req.on("end", () => {
        let parsed;
        try { parsed = JSON.parse(body); } catch { parsed = {}; }
        const model = parsed.model || "";
        hits.push(model);

        if (model === "model-1") {
          sendJson(404, { error: { message: "model not found", type: "invalid_request_error" } });
          return;
        }

        sendJson(200, {
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
  });

  return new Promise(resolve => {
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, port: server.address().port });
    });
  });
}

test("runWorker rotates past a per-model 404 to a working model over HTTP", async () => {
  const hits = [];
  const { server, port } = await startServer(hits);
  const baseUrl = `http://127.0.0.1:${port}/v1`;
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "llm-worker-fallback-"));
  const cachePath = path.join(cacheDir, "models.json");

  try {
    const config = createConfig({
      LLM_BACKEND_BASE_URL: baseUrl,
      LLM_BACKEND_API_KEY: "test-key",
      LLM_MODEL_CACHE_PATH: cachePath,
      LLM_WORKER_TIMEOUT_RETRY_BACKOFF_MS: "1",
    });
    const client = new OpenAI({ apiKey: "test-key", baseURL: baseUrl });

    const result = await runWorker("read", {
      input: "hello",
      client,
      config,
      cachePath,
      logger: () => {},
    });

    assert.equal(typeof result, "string");
    assert.equal(JSON.parse(result).summary, "test summary");

    // model-1 must have been attempted (and 404'd) before model-2 served the
    // request — proves ordered per-model rotation, not a lucky first pick.
    const firstModel1 = hits.indexOf("model-1");
    const firstModel2 = hits.indexOf("model-2");
    assert.ok(firstModel1 >= 0, "model-1 was attempted");
    assert.ok(firstModel2 >= 0, "model-2 was attempted");
    assert.ok(firstModel1 < firstModel2, "model-1 attempted before model-2 served");

    const cache = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    assert.equal(cache.selected_model, "model-2");
  } finally {
    server.close();
    fs.rmSync(cacheDir, { recursive: true, force: true });
  }
});
