#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import OpenAI from "openai";
import { loadUserEnv } from "./scripts/env-utils.mjs";

loadUserEnv();

// ── Config ──────────────────────────────────────────────────────────

const BASE_URL    = process.env.LLM_BACKEND_BASE_URL;
const API_KEY     = process.env.LLM_BACKEND_API_KEY || "local-backend";
const TIMEOUT_MS  = Number(process.env.LLM_WORKER_TIMEOUT_MS) || 120_000;
const CACHE_PATH  = process.env.LLM_MODEL_CACHE_PATH || path.join(
  process.env.USERPROFILE || process.env.HOME || ".",
  ".cache", "llm-worker", "models.json"
);

const MAX_CACHE_AGE_MS = 24 * 60 * 60 * 1000;

// ── Prompts ─────────────────────────────────────────────────────────

const SYSTEM = {
  read: `You are a codebase analysis worker.
Return valid JSON only. No markdown fences, no preamble.

Schema:
{
  "summary": string,
  "findings": string[],
  "open_questions": string[]
}

Rules:
- Be concise. Prefer concrete file names, symbols, and behavior.
- Do not invent facts. If input is incomplete, say what is unknown.`,

  write: `You are a code generation worker.
Return valid JSON only. No markdown fences, no preamble.

Schema:
{
  "files": [
    { "path": string, "content": string }
  ],
  "notes": string[]
}

Rules:
- Generate content only when behavior is clear from the input.
- Match existing project style when examples are provided.
- Do not claim correctness. Output is a draft for human review.`,
};

const TEMPS = { read: 0, write: 0.2 };
const MAX_TOKENS = { read: 4096, write: 8192 };

const MODEL_SELECTION_PROMPT = `You are selecting the best LLM for code analysis and generation tasks.

Given the following available model IDs, pick the single strongest general-purpose model for code understanding, summarization, and generation.

Prefer: large parameter counts, recent releases, strong reasoning and code benchmarks.
Avoid: embedding models, vision-only models, small/quantized variants when full versions exist.

Available models:
{MODEL_LIST}

Return ONLY the model ID string. No explanation, no markdown, no quotes.`;

// ── Utilities ───────────────────────────────────────────────────────

function die(msg, code = 1) { console.error(msg); process.exit(code); }

function is404(err) {
  return err?.status === 404 ||
    (typeof err?.message === "string" && err.message.includes("404"));
}

function isUnsupportedModel(err) {
  return [400, 404, 422].includes(err?.status);
}

function assertConfig() {
  if (!BASE_URL) die("Missing LLM_BACKEND_BASE_URL.");
}

function stripFences(text) {
  return text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
}

function readInput(inputPath) {
  if (inputPath) {
    if (!fs.existsSync(inputPath)) die(`Input file not found: ${inputPath}`);
    return fs.readFileSync(inputPath, "utf8").trim();
  }

  if (!process.stdin.isTTY) {
    const stdin = fs.readFileSync(0, "utf8").trim();
    if (stdin) return stdin;
  }

  const envInputPath = process.env.LLM_WORKER_INPUT_PATH;
  if (envInputPath && fs.existsSync(envInputPath)) {
    return fs.readFileSync(envInputPath, "utf8").trim();
  }

  die("Expected piped input on stdin, --input <path>, or LLM_WORKER_INPUT_PATH.\n\nUsage: cat file.ts | llm read\n       llm read --input file.ts");
}

function setsEqual(a, b) {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every(item => setB.has(item));
}

function parseWorkerJson(text, verb) {
  let parsed;
  try {
    parsed = JSON.parse(stripFences(text));
  } catch (err) {
    die(`Backend returned invalid JSON for ${verb}: ${err.message}`);
  }

  if (verb === "read") {
    const valid = parsed &&
      typeof parsed.summary === "string" &&
      Array.isArray(parsed.findings) &&
      parsed.findings.every(item => typeof item === "string") &&
      Array.isArray(parsed.open_questions) &&
      parsed.open_questions.every(item => typeof item === "string");
    if (!valid) die("Backend JSON did not match read schema.");
  }

  if (verb === "write") {
    const valid = parsed &&
      Array.isArray(parsed.files) &&
      parsed.files.every(file => file && typeof file.path === "string" && typeof file.content === "string") &&
      Array.isArray(parsed.notes) &&
      parsed.notes.every(item => typeof item === "string");
    if (!valid) die("Backend JSON did not match write schema.");
  }

  return JSON.stringify(parsed, null, 2);
}

// ── Model cache & selection ─────────────────────────────────────────

function readCache() {
  try { return JSON.parse(fs.readFileSync(CACHE_PATH, "utf8")); }
  catch { return null; }
}

function writeCache(cache) {
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}

function cacheIsFresh(cache) {
  if (!cache || cache.base_url !== BASE_URL || !cache.selected_model) return false;
  const age = Date.now() - Date.parse(cache.fetched_at || "");
  return !Number.isNaN(age) && age < MAX_CACHE_AGE_MS;
}

async function fetchModelList(client) {
  const response = await client.models.list();
  return response.data.map(m => m.id).filter(Boolean).sort();
}

async function selectBestModel(client, models) {
  const prompt = MODEL_SELECTION_PROMPT.replace("{MODEL_LIST}", models.join("\n"));

  for (const bootstrap of models) {
    let response;
    try {
      response = await client.chat.completions.create({
        model: bootstrap,
        temperature: 0,
        max_tokens: 100,
        messages: [{ role: "user", content: prompt }],
      });
    } catch (err) {
      if (isUnsupportedModel(err)) {
        console.error(`Bootstrap "${bootstrap}" unavailable (${err.status || "unsupported"}), trying next...`);
        continue;
      }
      throw err;
    }

    const raw = response.choices?.[0]?.message?.content?.trim();
    if (!raw) continue;

    const selected = raw.replace(/^["'`]+|["'`]+$/g, "").trim();
    if (models.includes(selected)) return selected;

    console.error(`Warning: LLM selected "${selected}" not in list. Using "${bootstrap}".`);
    return bootstrap;
  }

  die("No models responded to the selection prompt. Check your API key and account access.");
}

async function refreshCache(client, force = false) {
  const models = await fetchModelList(client);
  const existing = readCache();

  if (!force && existing?.selected_model && models.includes(existing.selected_model) && setsEqual(existing.models, models)) {
    const cache = { fetched_at: new Date().toISOString(), base_url: BASE_URL, models, selected_model: existing.selected_model };
    writeCache(cache);
    return cache;
  }

  console.error("Model list changed. Selecting best model...");
  const selected = await selectBestModel(client, models);
  const cache = { fetched_at: new Date().toISOString(), base_url: BASE_URL, models, selected_model: selected };
  writeCache(cache);
  console.error(`Selected: ${selected}`);
  return cache;
}

async function resolveModel(client) {
  const existing = readCache();
  if (cacheIsFresh(existing)) return existing.selected_model;
  const cache = await refreshCache(client);
  return cache.selected_model;
}

async function nextModel(client, tried) {
  let existing = readCache();
  let candidates = (existing?.models || []).filter(m => !tried.has(m));

  if (candidates.length === 0) {
    console.error("All cached models exhausted. Refreshing model list...");
    existing = await refreshCache(client, true);
    candidates = existing.models.filter(m => !tried.has(m));
    if (candidates.length === 0) {
      die("All available models returned 404. Check your API key and account access.");
    }
  }

  console.error(`Selecting from ${candidates.length} remaining model(s)...`);
  const selected = await selectBestModel(client, candidates);
  writeCache({ ...existing, selected_model: selected });
  console.error(`Now using: ${selected}`);
  return selected;
}

// ── Commands ────────────────────────────────────────────────────────

async function runWorker(verb, { modelOverride, inputPath }) {
  assertConfig();
  const input = readInput(inputPath);
  if (!input) die(inputPath ? `Empty input file: ${inputPath}` : "Empty stdin.");

  const client = new OpenAI({ apiKey: API_KEY, baseURL: BASE_URL });
  let model = modelOverride || await resolveModel(client);
  const tried = new Set();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    for (;;) {
      tried.add(model);
      try {
        const response = await client.chat.completions.create({
          model,
          temperature: TEMPS[verb],
          max_tokens: MAX_TOKENS[verb],
          messages: [
            { role: "system", content: SYSTEM[verb] },
            { role: "user",   content: input },
          ],
        }, { signal: controller.signal });

        const content = response.choices?.[0]?.message?.content;
        if (!content) die("Backend returned no content.");
        console.log(parseWorkerJson(content, verb));
        return;
      } catch (err) {
        if (!modelOverride && is404(err)) {
          console.error(`Model "${model}" returned 404.`);
          model = await nextModel(client, tried);
          continue;
        }
        throw err;
      }
    }
  } finally {
    clearTimeout(timer);
  }
}

async function showModels(forceRefresh) {
  assertConfig();
  const client = new OpenAI({ apiKey: API_KEY, baseURL: BASE_URL });
  const existing = readCache();
  const cache = forceRefresh || !cacheIsFresh(existing) ? await refreshCache(client, forceRefresh) : existing;
  console.log(JSON.stringify({ selected: cache.selected_model, available: cache.models }, null, 2));
}

// ── CLI dispatch ────────────────────────────────────────────────────

function usage() {
  die([
    "Usage:",
    "  llm read                   [--model <id>] [--input <path>]",
    "  llm write                  [--model <id>] [--input <path>]",
    "  llm models                 [--refresh]",
    "",
    "read/write expect piped stdin or --input <path>.",
  ].join("\n"), 0);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const positional = [];
  let model = null;
  let inputPath = null;
  let refresh = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--model" && args[i + 1]) { model = args[++i]; }
    else if (args[i] === "--input" && args[i + 1]) { inputPath = args[++i]; }
    else if (args[i] === "--refresh") { refresh = true; }
    else if (args[i] === "--help" || args[i] === "-h") { usage(); }
    else { positional.push(args[i]); }
  }

  return { positional, model, inputPath, refresh };
}

async function main() {
  const { positional, model, inputPath, refresh } = parseArgs(process.argv);
  const verb = positional[0];

  if (!verb) usage();
  if (!["read", "write", "models"].includes(verb)) die(`Unknown command: ${verb}`);

  try {
    if (verb === "models") {
      await showModels(refresh);
    } else {
      await runWorker(verb, { modelOverride: model, inputPath });
    }
  } catch (err) {
    if (err.name === "AbortError") die(`Timed out after ${TIMEOUT_MS / 1000}s.`);
    die(err?.stack || err?.message || String(err));
  }
}

await main();
