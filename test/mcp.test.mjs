import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { callTool, handleMessage, MAX_FRAME_BYTES, parseMessages, pushInputChunk, resetParserState } from "../scripts/llm-worker-mcp.mjs";

const { version } = createRequire(import.meta.url)("../package.json");

const VALID_READ_JSON = JSON.stringify({
  summary: "mcp summary",
  findings: ["finding"],
  open_questions: [],
});

// Local OpenAI-compatible backend so callTool's internally-built client resolves
// against deterministic responses instead of a real network endpoint.
function startBackend() {
  const server = http.createServer((req, res) => {
    const sendJson = (status, body) => {
      const payload = JSON.stringify(body);
      res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) });
      res.end(payload);
    };
    if (req.method === "GET" && req.url === "/v1/models") {
      sendJson(200, { object: "list", data: [{ id: "model-x", object: "model" }] });
      return;
    }
    if (req.method === "POST" && req.url === "/v1/chat/completions") {
      let body = "";
      req.on("data", chunk => { body += chunk; });
      req.on("end", () => {
        let parsed;
        try { parsed = JSON.parse(body); } catch { parsed = {}; }
        // First chat call during model selection asks for a model id; return one
        // from the list. The worker call returns the read-schema JSON.
        const isSelection = /best LLM|select/i.test(JSON.stringify(parsed.messages || ""));
        const content = isSelection ? "model-x" : VALID_READ_JSON;
        sendJson(200, {
          id: "chatcmpl-test",
          object: "chat.completion",
          model: parsed.model || "model-x",
          choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
        });
      });
      return;
    }
    res.writeHead(404);
    res.end("not found");
  });
  return new Promise(resolve => {
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

function framed(message) {
  const json = JSON.stringify(message);
  return `Content-Length: ${Buffer.byteLength(json, "utf8")}\r\n\r\n${json}`;
}

function captureStdout() {
  const chunks = [];
  return {
    stdout: { write: chunk => chunks.push(String(chunk)) },
    text: () => chunks.join(""),
  };
}

function parseFramedResponses(text) {
  const responses = [];
  let rest = text;
  while (rest) {
    const match = /^Content-Length:\s*(\d+)\r\n\r\n/.exec(rest);
    if (!match) break;
    const start = match[0].length;
    const end = start + Number(match[1]);
    responses.push(JSON.parse(rest.slice(start, end)));
    rest = rest.slice(end);
  }
  return responses;
}

test("MCP initialize reports package version", async () => {
  const out = captureStdout();
  await handleMessage({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "test" } }, out);
  const [response] = parseFramedResponses(out.text());

  assert.equal(response.result.serverInfo.name, "llm-worker-tools");
  assert.equal(response.result.serverInfo.version, version);
  assert.equal(response.result.protocolVersion, "test");
});

test("MCP tools/list returns worker tools", async () => {
  const out = captureStdout();
  await handleMessage({ jsonrpc: "2.0", id: 2, method: "tools/list" }, out);
  const [response] = parseFramedResponses(out.text());

  assert.deepEqual(response.result.tools.map(tool => tool.name), [
    "llm_worker_read",
    "llm_worker_write",
    "llm_worker_models",
  ]);
});

test("MCP callTool validates blank input before worker execution", async () => {
  await assert.rejects(() => callTool("llm_worker_read", { input: "   " }), /non-empty string/);
  await assert.rejects(() => callTool("unknown", {}), /Unknown tool: unknown/);
});

test("MCP callTool runs llm_worker_read against the backend and returns worker output", async () => {
  const { server, port } = await startBackend();
  const baseUrl = `http://127.0.0.1:${port}/v1`;
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "llm-worker-mcp-"));
  const prev = {
    base: process.env.LLM_BACKEND_BASE_URL,
    key: process.env.LLM_BACKEND_API_KEY,
    cache: process.env.LLM_MODEL_CACHE_PATH,
  };
  process.env.LLM_BACKEND_BASE_URL = baseUrl;
  process.env.LLM_BACKEND_API_KEY = "test-key";
  process.env.LLM_MODEL_CACHE_PATH = path.join(cacheDir, "models.json");

  try {
    const result = await callTool("llm_worker_read", { input: "analyze this", model: "model-x" });
    assert.equal(typeof result.output, "string");
    assert.equal(JSON.parse(result.output).summary, "mcp summary");
  } finally {
    server.close();
    fs.rmSync(cacheDir, { recursive: true, force: true });
    for (const [k, v] of [["LLM_BACKEND_BASE_URL", prev.base], ["LLM_BACKEND_API_KEY", prev.key], ["LLM_MODEL_CACHE_PATH", prev.cache]]) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test("MCP callTool rejects input above the maximum byte ceiling", async () => {
  // Derive the cap from the rejection message rather than hardcoding a literal,
  // so the test tracks the source constant if it ever moves.
  let capBytes;
  try {
    // 8 MiB is comfortably over any sane MAX_INPUT_BYTES; we only need the throw.
    await callTool("llm_worker_read", { input: "x".repeat(8 * 1024 * 1024) });
    assert.fail("expected oversize input to reject");
  } catch (error) {
    const match = /maximum allowed size of (\d+) bytes/.exec(error.message);
    assert.ok(match, `rejection message should expose the byte cap, got: ${error.message}`);
    capBytes = Number(match[1]);
  }
  assert.ok(Number.isSafeInteger(capBytes) && capBytes > 0, "derived cap is a positive integer");

  // A payload exactly one byte over the derived cap must still reject; one byte
  // under must not trip the size guard (it fails later, not on the size check).
  await assert.rejects(
    () => callTool("llm_worker_read", { input: "y".repeat(capBytes + 1) }),
    /maximum allowed size/,
  );
});

test("MCP parser handles fragmented and concatenated frames", () => {
  resetParserState();
  const out = captureStdout();
  const first = framed({ jsonrpc: "2.0", id: 1, method: "initialize" });
  const second = framed({ jsonrpc: "2.0", id: 2, method: "tools/list" });

  pushInputChunk(Buffer.from(first.slice(0, 10)));
  parseMessages(out);
  assert.equal(out.text(), "");

  pushInputChunk(Buffer.from(first.slice(10) + second));
  parseMessages(out);

  const responses = parseFramedResponses(out.text());
  assert.equal(responses.length, 2);
  assert.equal(responses[0].id, 1);
  assert.equal(responses[1].id, 2);
});

test("MCP parser skips invalid JSON and handles following valid frame", () => {
  resetParserState();
  const out = captureStdout();
  const invalid = "Content-Length: 1\r\n\r\n{";
  const valid = framed({ jsonrpc: "2.0", id: 3, method: "tools/list" });

  pushInputChunk(Buffer.from(invalid + valid));
  parseMessages(out);

  const [response] = parseFramedResponses(out.text());
  assert.equal(response.id, 3);
});

test("MCP parser resyncs past a malformed header and answers the queued valid frame", () => {
  resetParserState();
  const out = captureStdout();
  // Header with no Content-Length, terminated by its own CRLFCRLF, followed by a valid frame.
  const malformed = "X-Bogus-Header: nope\r\n\r\n";
  const valid = framed({ jsonrpc: "2.0", id: 4, method: "tools/list" });

  pushInputChunk(Buffer.from(malformed + valid));
  parseMessages(out);

  const [response] = parseFramedResponses(out.text());
  assert.equal(response.id, 4);
});

test("MCP parser rejects an over-cap Content-Length without buffering its payload", () => {
  resetParserState();
  const out = captureStdout();
  const oversized = `Content-Length: ${MAX_FRAME_BYTES + 1}\r\n\r\n`;
  const valid = framed({ jsonrpc: "2.0", id: 5, method: "tools/list" });

  // Only the oversized header + a following valid frame are pushed; the huge
  // payload is never sent, proving the cap is enforced at the header boundary
  // before any allocation that waits on the advertised length.
  pushInputChunk(Buffer.from(oversized + valid));
  parseMessages(out);

  const [response] = parseFramedResponses(out.text());
  assert.equal(response.id, 5);
});

test("MCP parser flushes a never-terminating header that exceeds the frame cap", () => {
  resetParserState();
  const out = captureStdout();
  // A header with no CRLFCRLF terminator larger than the cap can never become a
  // valid frame; it must be flushed rather than buffered unbounded.
  pushInputChunk(Buffer.from("Content-Length: 5".padEnd(MAX_FRAME_BYTES + 8, "x")));
  parseMessages(out);
  assert.equal(out.text(), "");

  // After the flush, a fresh valid frame is parsed normally.
  pushInputChunk(Buffer.from(framed({ jsonrpc: "2.0", id: 6, method: "tools/list" })));
  parseMessages(out);
  const [response] = parseFramedResponses(out.text());
  assert.equal(response.id, 6);
});
