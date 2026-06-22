import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { callTool, handleMessage, MAX_FRAME_BYTES, parseMessages, pushInputChunk, resetParserState } from "../scripts/llm-worker-mcp.mjs";

const { version } = createRequire(import.meta.url)("../package.json");

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
