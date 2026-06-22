#!/usr/bin/env node
// Smoke driver for llm-worker-tools — drives the REAL CLI + MCP server with no
// real LLM backend. It stands up a mock OpenAI-compatible server, points the
// worker at it via env, then exercises:
//   1. `llm-worker-tools models`   (model discovery + selection + cache write)
//   2. `llm read`                  (worker read verb over piped stdin)
//   3. the MCP stdio server        (initialize -> tools/list -> tools/call)
//
// Run:  node .claude/skills/run-llm-worker-tools/driver.mjs
// Exit: 0 = all checks passed, non-zero = a check failed (message on stderr).
//
// No network, no GPU, no display. Pure Node + a loopback HTTP mock.

import http from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const BIN = path.join(REPO, "bin", "llm-worker-tools.mjs");
const WORKER = path.join(REPO, "llm-worker.mjs");
const MCP = path.join(REPO, "scripts", "llm-worker-mcp.mjs");

const READ_JSON = JSON.stringify({
  summary: "mock summary",
  findings: ["mock finding one"],
  open_questions: ["mock open question"],
});

// ---- Mock OpenAI-compatible backend ---------------------------------------
// GET  /v1/models             -> one model
// POST /v1/chat/completions   -> if the prompt looks like model-selection
//                                (mentions our model id), echo the id; else
//                                return the read/write JSON contract payload.
function startMockBackend() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        if (req.url.endsWith("/models") && req.method === "GET") {
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ object: "list", data: [{ id: "mock-model", object: "model" }] }));
          return;
        }
        if (req.url.endsWith("/chat/completions") && req.method === "POST") {
          // The read/write worker prompt embeds the JSON output schema keys
          // (open_questions / notes); the model-selection prompt does not.
          const isRead = body.includes("open_questions");
          const content = isRead ? READ_JSON : "mock-model";
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({
            id: "chatcmpl-mock",
            object: "chat.completion",
            choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
          }));
          return;
        }
        res.statusCode = 404;
        res.end("{}");
      });
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

// ---- Spawn the CLI / worker and capture stdout ----------------------------
function run(file, args, { input, env } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [file, ...args], {
      cwd: REPO,
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "", err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code) => resolve({ code, out, err }));
    if (input !== undefined) child.stdin.end(input);
    else child.stdin.end();
  });
}

// ---- Drive the MCP stdio server (Content-Length framed JSON-RPC) -----------
function frame(obj) {
  const json = JSON.stringify(obj);
  return `Content-Length: ${Buffer.byteLength(json, "utf8")}\r\n\r\n${json}`;
}
function parseFrames(buf) {
  const msgs = [];
  let s = buf;
  while (true) {
    const m = /Content-Length:\s*(\d+)\r\n\r\n/i.exec(s);
    if (!m) break;
    const start = m.index + m[0].length;
    const len = Number(m[1]);
    if (s.length < start + len) break;
    msgs.push(JSON.parse(s.slice(start, start + len)));
    s = s.slice(start + len);
  }
  return msgs;
}
function driveMcp(env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [MCP], { cwd: REPO, env: { ...process.env, ...env }, stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "", done = false;
    const finish = () => {
      if (done) return; done = true;
      clearTimeout(timer);
      try { child.stdin.end(); } catch {}
      try { child.kill(); } catch {}
      resolve({ msgs: parseFrames(out), err });
    };
    // The server exits on stdin 'end'; tools/call is async (a backend round-trip),
    // so we must NOT end stdin until its reply (id=3) has actually been received.
    child.stdout.on("data", (d) => { out += d; if (parseFrames(out).some((m) => m.id === 3)) finish(); });
    child.stderr.on("data", (d) => (err += d));
    child.on("close", finish);
    const timer = setTimeout(finish, 15000);
    child.stdin.write(frame({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }));
    child.stdin.write(frame({ jsonrpc: "2.0", method: "notifications/initialized" }));
    child.stdin.write(frame({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }));
    child.stdin.write(frame({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "llm_worker_read", arguments: { input: "function add(a,b){return a+b}" } } }));
  });
}

// ---- Harness ---------------------------------------------------------------
const checks = [];
const ok = (name, cond, detail = "") => { checks.push({ name, pass: !!cond, detail }); console.log(`${cond ? "[PASS]" : "[FAIL]"} ${name}${detail ? "  — " + detail : ""}`); };

const tmp = mkdtempSync(path.join(os.tmpdir(), "llm-worker-driver-"));
const { server, port } = await startMockBackend();
const env = {
  LLM_BACKEND_BASE_URL: `http://127.0.0.1:${port}/v1`,
  LLM_BACKEND_API_KEY: "test-key",
  LLM_MODEL_CACHE_PATH: path.join(tmp, "models.json"),
};

try {
  // 0. Usage banner (no backend needed)
  const usage = await run(BIN, []);
  ok("CLI usage banner", usage.code === 0 && /llm-worker-tools read/.test(usage.out), `exit=${usage.code}`);

  // 1. models — discover + select + cache against the mock backend
  const models = await run(BIN, ["models"], { env });
  let modelsJson = null; try { modelsJson = JSON.parse(models.out); } catch {}
  ok("CLI `models` selects mock-model", models.code === 0 && modelsJson && modelsJson.selected === "mock-model", `out=${models.out.trim().slice(0, 80)}`);

  // 2. read — pipe code in, expect the read-schema JSON back
  const read = await run(WORKER, ["read"], { input: "export const x = 1;\n", env });
  let readJson = null; try { readJson = JSON.parse(read.out); } catch {}
  ok("worker `read` returns {summary,findings,open_questions}", read.code === 0 && readJson && typeof readJson.summary === "string" && Array.isArray(readJson.findings), `out=${read.out.trim().slice(0, 80)}`);

  // 3. MCP server — initialize / tools/list / tools/call
  const mcp = await driveMcp(env);
  const init = mcp.msgs.find((m) => m.id === 1);
  const list = mcp.msgs.find((m) => m.id === 2);
  const call = mcp.msgs.find((m) => m.id === 3);
  ok("MCP initialize -> serverInfo", init && init.result && init.result.serverInfo && init.result.serverInfo.name === "llm-worker-tools");
  ok("MCP tools/list exposes llm_worker_read", list && list.result && (list.result.tools || []).some((t) => t.name === "llm_worker_read"));
  ok("MCP tools/call(llm_worker_read) returns content", call && call.result && Array.isArray(call.result.content) && call.result.content.length > 0 && !call.result.isError, call ? JSON.stringify(call.result.content?.[0]?.text || "").slice(0, 80) : "no reply");
} finally {
  server.close();
  rmSync(tmp, { recursive: true, force: true });
}

const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length) { console.error("FAIL: " + failed.map((c) => c.name).join("; ")); process.exit(1); }
console.log("PASS: llm-worker-tools driver smoke");
