#!/usr/bin/env node

import process from "node:process";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { loadUserEnv } from "./env-utils.mjs";
import { runWorker, showModels } from "../llm-worker.mjs";

loadUserEnv();

const { version } = createRequire(import.meta.url)("../package.json");
const CR = 13;
const LF = 10;
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const tools = [
  {
    name: "llm_worker_read",
    description: "Summarize or reduce bulky code context with the configured advisory LLM worker. Verify the JSON result against source before relying on it.",
    inputSchema: {
      type: "object",
      properties: {
        input: { type: "string", description: "Focused source text or notes to analyze." },
        model: { type: "string", description: "Optional backend model ID override." }
      },
      required: ["input"]
    }
  },
  {
    name: "llm_worker_write",
    description: "Draft repetitive scaffolding with the configured advisory LLM worker. Review and edit generated files manually before applying them.",
    inputSchema: {
      type: "object",
      properties: {
        input: { type: "string", description: "Detailed instructions and examples for the draft." },
        model: { type: "string", description: "Optional backend model ID override." }
      },
      required: ["input"]
    }
  },
  {
    name: "llm_worker_models",
    description: "Show the selected worker model and available backend models.",
    inputSchema: {
      type: "object",
      properties: {
        refresh: { type: "boolean", description: "Refresh model discovery before returning." }
      }
    }
  }
];

let inputChunks = [];
let inputBytes = 0;

export function send(message, stdout = process.stdout) {
  const json = JSON.stringify(message);
  stdout.write(`Content-Length: ${Buffer.byteLength(json, "utf8")}\r\n\r\n${json}`);
}

function byteAt(offset) {
  let index = offset;
  for (const chunk of inputChunks) {
    if (index < chunk.length) return chunk[index];
    index -= chunk.length;
  }
  return undefined;
}

function findHeaderEnd() {
  for (let i = 0; i <= inputBytes - 4; i++) {
    if (byteAt(i) === CR && byteAt(i + 1) === LF && byteAt(i + 2) === CR && byteAt(i + 3) === LF) {
      return i;
    }
  }
  return -1;
}

function readBytes(length) {
  const output = Buffer.alloc(length);
  let written = 0;
  for (const chunk of inputChunks) {
    if (written >= length) break;
    const size = Math.min(chunk.length, length - written);
    chunk.copy(output, written, 0, size);
    written += size;
  }
  return output;
}

function consumeBytes(length) {
  let remaining = length;
  while (remaining > 0 && inputChunks.length > 0) {
    const chunk = inputChunks[0];
    if (remaining >= chunk.length) {
      remaining -= chunk.length;
      inputBytes -= chunk.length;
      inputChunks.shift();
    } else {
      inputChunks[0] = chunk.subarray(remaining);
      inputBytes -= remaining;
      remaining = 0;
    }
  }
}

export function resetParserState() {
  inputChunks = [];
  inputBytes = 0;
}

export function pushInputChunk(chunk) {
  inputChunks.push(Buffer.from(chunk));
  inputBytes += chunk.length;
}

export function parseMessages({ stdout = process.stdout } = {}) {
  for (;;) {
    const headerEnd = findHeaderEnd();
    if (headerEnd === -1) return;

    const header = readBytes(headerEnd).toString("utf8");
    const lengthMatch = /^Content-Length:\s*(\d+)$/im.exec(header);
    if (!lengthMatch) {
      resetParserState();
      return;
    }

    const length = Number(lengthMatch[1]);
    const frameLength = headerEnd + 4 + length;
    if (inputBytes < frameLength) return;

    consumeBytes(headerEnd + 4);
    const raw = readBytes(length).toString("utf8");
    consumeBytes(length);

    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      continue;
    }

    handleMessage(message, { stdout }).catch(error => {
      if (message.id !== undefined) {
        send({ jsonrpc: "2.0", id: message.id, error: { code: -32603, message: error.message } }, stdout);
      }
    });
  }
}

function contentFromResult(result) {
  const content = [{ type: "text", text: result.output }];
  if (result.diagnostics) {
    content.push({ type: "text", text: `Diagnostics:\n${result.diagnostics}` });
  }
  return content;
}

export async function callTool(name, args = {}) {
  const diagnostics = [];
  const logger = message => diagnostics.push(String(message));

  if (name === "llm_worker_models") {
    const output = await showModels(Boolean(args.refresh), { logger });
    return { output, diagnostics: diagnostics.join("\n") };
  }

  if (name === "llm_worker_read" || name === "llm_worker_write") {
    if (typeof args.input !== "string" || !args.input.trim()) {
      throw new Error("Tool argument input must be a non-empty string.");
    }
    const verb = name === "llm_worker_read" ? "read" : "write";
    const output = await runWorker(verb, {
      input: args.input,
      modelOverride: args.model,
      logger,
    });
    return { output, diagnostics: diagnostics.join("\n") };
  }

  throw new Error(`Unknown tool: ${name}`);
}

export async function handleMessage(message, { stdout = process.stdout } = {}) {
  if (message.method === "initialize") {
    send({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        protocolVersion: message.params?.protocolVersion || "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "llm-worker-tools", version }
      }
    }, stdout);
    return;
  }

  if (message.method === "notifications/initialized") return;

  if (message.method === "tools/list") {
    send({ jsonrpc: "2.0", id: message.id, result: { tools } }, stdout);
    return;
  }

  if (message.method === "tools/call") {
    try {
      const result = await callTool(message.params?.name, message.params?.arguments || {});
      send({
        jsonrpc: "2.0",
        id: message.id,
        result: { content: contentFromResult(result) }
      }, stdout);
    } catch (error) {
      send({
        jsonrpc: "2.0",
        id: message.id,
        result: { isError: true, content: [{ type: "text", text: error.message }] }
      }, stdout);
    }
    return;
  }

  if (message.id !== undefined) {
    send({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: `Unknown method: ${message.method}` } }, stdout);
  }
}

export function startServer({ stdin = process.stdin, stdout = process.stdout, stderr = process.stderr } = {}) {
  let disconnecting = false;
  const disconnect = () => {
    if (disconnecting) return;
    disconnecting = true;
    process.exit(0);
  };

  stderr.write(`llm-worker-tools MCP server ready from ${packageRoot}\n`);
  stdin.on("data", chunk => {
    pushInputChunk(chunk);
    parseMessages({ stdout });
  });
  stdin.on("end", disconnect);
  stdin.on("close", disconnect);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startServer();
}
