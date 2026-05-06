#!/usr/bin/env node

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { loadUserEnv } from "./env-utils.mjs";

loadUserEnv();

const workerPath = fileURLToPath(new URL("../llm-worker.mjs", import.meta.url));
let inputBuffer = Buffer.alloc(0);

const tools = [
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

function send(message) {
  const json = JSON.stringify(message);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(json, "utf8")}\r\n\r\n${json}`);
}

function parseMessages() {
  for (;;) {
    const headerEnd = inputBuffer.indexOf("\r\n\r\n");
    if (headerEnd === -1) return;

    const header = inputBuffer.slice(0, headerEnd).toString("utf8");
    const lengthMatch = /^Content-Length:\s*(\d+)$/im.exec(header);
    if (!lengthMatch) {
      inputBuffer = Buffer.alloc(0);
      return;
    }

    const length = Number(lengthMatch[1]);
    const messageStart = headerEnd + 4;
    const messageEnd = messageStart + length;
    if (inputBuffer.length < messageEnd) return;

    const raw = inputBuffer.slice(messageStart, messageEnd).toString("utf8");
    inputBuffer = inputBuffer.slice(messageEnd);
    let message;
    try {
      message = JSON.parse(raw);
    } catch (error) {
      continue;
    }

    handleMessage(message).catch(error => {
      if (message.id !== undefined) {
        const id = message.id;
        send({ jsonrpc: "2.0", id, error: { code: -32603, message: error.message } });
      }
    });
  }
}

function runWorker(args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [workerPath, ...args], {
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", code => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error((stderr || stdout || `Worker exited with code ${code}`).trim()));
    });
    child.stdin.end(input || "");
  });
}

async function callTool(name, args = {}) {
  if (name === "llm_worker_models") {
    const output = await runWorker(["models", ...(args.refresh ? ["--refresh"] : [])], "");
    return output;
  }

  if (name === "llm_worker_read" || name === "llm_worker_write") {
    if (typeof args.input !== "string" || !args.input.trim()) {
      throw new Error("Tool argument input must be a non-empty string.");
    }
    const verb = name === "llm_worker_read" ? "read" : "write";
    const workerArgs = [verb, ...(args.model ? ["--model", args.model] : [])];
    return await runWorker(workerArgs, args.input);
  }

  throw new Error(`Unknown tool: ${name}`);
}

async function handleMessage(message) {
  if (message.method === "initialize") {
    send({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        protocolVersion: message.params?.protocolVersion || "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "llm-worker-tools", version: "0.2.0" }
      }
    });
    return;
  }

  if (message.method === "notifications/initialized") return;

  if (message.method === "tools/list") {
    send({ jsonrpc: "2.0", id: message.id, result: { tools } });
    return;
  }

  if (message.method === "tools/call") {
    try {
      const output = await callTool(message.params?.name, message.params?.arguments || {});
      send({
        jsonrpc: "2.0",
        id: message.id,
        result: { content: [{ type: "text", text: output }] }
      });
    } catch (error) {
      send({
        jsonrpc: "2.0",
        id: message.id,
        result: { isError: true, content: [{ type: "text", text: error.message }] }
      });
    }
    return;
  }

  if (message.id !== undefined) {
    send({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: `Unknown method: ${message.method}` } });
  }
}

process.stdin.on("data", chunk => {
  inputBuffer = Buffer.concat([inputBuffer, chunk]);
  parseMessages();
});
