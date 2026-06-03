#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import { loadUserEnv } from "./scripts/env-utils.mjs";

loadUserEnv();

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_TIMEOUT_RETRY_BACKOFF_MS = 5_000;
export const MAX_CACHE_AGE_MS = 24 * 60 * 60 * 1000;

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

export function createConfig(env = process.env) {
  const home = env.USERPROFILE || env.HOME || ".";
  const timeoutMs = Number(env.LLM_WORKER_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
  return {
    baseUrl: env.LLM_BACKEND_BASE_URL,
    apiKey: env.LLM_BACKEND_API_KEY || "local-backend",
    timeoutMs,
    readTimeoutMs: Number(env.LLM_WORKER_READ_TIMEOUT_MS) || timeoutMs,
    writeTimeoutMs: Number(env.LLM_WORKER_WRITE_TIMEOUT_MS) || timeoutMs,
    timeoutRetryBackoffMs: Number(env.LLM_WORKER_TIMEOUT_RETRY_BACKOFF_MS) || DEFAULT_TIMEOUT_RETRY_BACKOFF_MS,
    cachePath: env.LLM_MODEL_CACHE_PATH || path.join(home, ".cache", "llm-worker", "models.json"),
    envInputPath: env.LLM_WORKER_INPUT_PATH,
  };
}

function workerError(message, code = 1) {
  const error = new Error(message);
  error.exitCode = code;
  return error;
}

function die(message, code = 1) {
  throw workerError(message, code);
}

function assertConfig(config) {
  if (!config.baseUrl) die("Missing LLM_BACKEND_BASE_URL.");
}

export function is404(err) {
  return err?.status === 404 ||
    err?.response?.status === 404 ||
    err?.error?.status === 404;
}

export function isUnsupportedModel(err) {
  return [400, 404, 422].includes(err?.status) ||
    [400, 404, 422].includes(err?.response?.status) ||
    [400, 404, 422].includes(err?.error?.status);
}

export function stripFences(text) {
  return text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
}

export function readInput(inputPath, { config = createConfig(), stdin = process.stdin, fsModule = fs } = {}) {
  if (inputPath) {
    if (!fsModule.existsSync(inputPath)) die(`Input file not found: ${inputPath}`);
    return fsModule.readFileSync(inputPath, "utf8").trim();
  }

  if (!stdin.isTTY) {
    return fsModule.readFileSync(0, "utf8").trim();
  }

  if (config.envInputPath && fsModule.existsSync(config.envInputPath)) {
    return fsModule.readFileSync(config.envInputPath, "utf8").trim();
  }

  die("Expected piped input on stdin, --input <path>, or LLM_WORKER_INPUT_PATH.\n\nUsage: cat file.ts | llm read\n       llm read --input file.ts");
}

export function setsEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function parseWorkerJson(text, verb) {
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

export function readCache(cachePath = createConfig().cachePath, fsModule = fs) {
  try { return JSON.parse(fsModule.readFileSync(cachePath, "utf8")); }
  catch { return null; }
}

export function writeCache(cache, cachePath = createConfig().cachePath, fsModule = fs) {
  fsModule.mkdirSync(path.dirname(cachePath), { recursive: true });
  fsModule.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
}

export function cacheIsFresh(cache, config = createConfig(), now = Date.now()) {
  if (!cache || cache.base_url !== config.baseUrl || !cache.selected_model) return false;
  const age = now - Date.parse(cache.fetched_at || "");
  return !Number.isNaN(age) && age < MAX_CACHE_AGE_MS;
}

export async function fetchModelList(client, signal) {
  const response = await client.models.list({ signal });
  return response.data.map(m => m.id).filter(Boolean).sort();
}

export async function selectBestModel(client, models, signal, logger = console.error) {
  const prompt = MODEL_SELECTION_PROMPT.replace("{MODEL_LIST}", models.join("\n"));

  for (const bootstrap of models) {
    let response;
    try {
      response = await client.chat.completions.create({
        model: bootstrap,
        temperature: 0,
        max_tokens: 100,
        messages: [{ role: "user", content: prompt }],
      }, { signal });
    } catch (err) {
      if (isUnsupportedModel(err)) {
        logger(`Bootstrap "${bootstrap}" unavailable (${err.status || err?.response?.status || err?.error?.status || "unsupported"}), trying next...`);
        continue;
      }
      throw err;
    }

    const raw = response.choices?.[0]?.message?.content;
    if (!raw?.trim()) continue;

    const selected = raw.trim().replace(/^["'`]+|["'`]+$/g, "").trim();
    if (models.includes(selected)) return selected;

    logger(`Warning: LLM selected "${selected}" not in list. Using "${bootstrap}". Raw selection response: ${JSON.stringify(raw)}.`);
    return bootstrap;
  }

  die("No models responded to the selection prompt. Check your API key and account access.");
}

export async function refreshCache(client, {
  force = false,
  config = createConfig(),
  signal,
  logger = console.error,
  cachePath = config.cachePath,
  fsModule = fs,
} = {}) {
  const models = await fetchModelList(client, signal);
  const existing = readCache(cachePath, fsModule);

  if (!force && existing?.selected_model && models.includes(existing.selected_model) && setsEqual(existing.models || [], models)) {
    const cache = { fetched_at: new Date().toISOString(), base_url: config.baseUrl, models, selected_model: existing.selected_model };
    writeCache(cache, cachePath, fsModule);
    return cache;
  }

  logger("Model list changed. Selecting best model...");
  const selected = await selectBestModel(client, models, signal, logger);
  const cache = { fetched_at: new Date().toISOString(), base_url: config.baseUrl, models, selected_model: selected };
  writeCache(cache, cachePath, fsModule);
  logger(`Selected: ${selected}`);
  return cache;
}

export async function resolveModel(client, {
  config = createConfig(),
  signal,
  logger = console.error,
  cachePath = config.cachePath,
  fsModule = fs,
} = {}) {
  const existing = readCache(cachePath, fsModule);
  if (cacheIsFresh(existing, config)) return existing.selected_model;
  const cache = await refreshCache(client, { config, signal, logger, cachePath, fsModule });
  return cache.selected_model;
}

export async function nextModel(client, tried, {
  config = createConfig(),
  signal,
  logger = console.error,
  cachePath = config.cachePath,
  fsModule = fs,
} = {}) {
  let existing = readCache(cachePath, fsModule);
  let candidates = (existing?.models || []).filter(m => !tried.has(m));

  if (candidates.length === 0) {
    logger("All cached models exhausted. Refreshing model list...");
    existing = await refreshCache(client, { force: true, config, signal, logger, cachePath, fsModule });
    candidates = existing.models.filter(m => !tried.has(m));
    if (candidates.length === 0) {
      die("All available models returned 404. Check your API key and account access.");
    }
  }

  logger(`Selecting from ${candidates.length} remaining model(s)...`);
  const selected = await selectBestModel(client, candidates, signal, logger);
  writeCache({ ...existing, selected_model: selected }, cachePath, fsModule);
  logger(`Now using: ${selected}`);
  return selected;
}

function isAbortError(error) {
  return error?.name === "AbortError";
}

async function withTimeout(timeoutMs, task, {
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
} = {}) {
  const controller = new AbortController();
  const timer = setTimeoutFn(() => controller.abort(), timeoutMs);
  try {
    return await task(controller.signal);
  } finally {
    clearTimeoutFn(timer);
  }
}

function sleep(ms, sleepFn = value => new Promise(resolve => setTimeout(resolve, value))) {
  return sleepFn(ms);
}

function timeoutMessage(timeoutMs, verb, model) {
  return `Timed out after ${timeoutMs / 1000}s while running ${verb} with model "${model}".`;
}

export async function runWorker(verb, {
  modelOverride,
  inputPath,
  input,
  client,
  config = createConfig(),
  logger = console.error,
  cachePath = config.cachePath,
  fsModule = fs,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  sleepFn,
} = {}) {
  assertConfig(config);
  const workerInput = input ?? readInput(inputPath, { config, fsModule });
  if (!workerInput) die(inputPath ? `Empty input file: ${inputPath}` : "Empty stdin.");

  const activeClient = client || new OpenAI({ apiKey: config.apiKey, baseURL: config.baseUrl });
  const timeoutMs = verb === "write" ? config.writeTimeoutMs : config.readTimeoutMs;
  let model = modelOverride;

  if (!model) {
    try {
      model = await withTimeout(timeoutMs, signal => resolveModel(activeClient, {
        config,
        signal,
        logger,
        cachePath,
        fsModule,
      }), { setTimeoutFn, clearTimeoutFn });
    } catch (err) {
      if (isAbortError(err)) die(`Timed out after ${timeoutMs / 1000}s while resolving a model for ${verb}.`);
      throw err;
    }
  }

  const tried = new Set();
  let timedOutOnce = false;
  let activeTimeoutMs = timeoutMs;

  for (;;) {
    try {
      return await withTimeout(activeTimeoutMs, async signal => {
        for (;;) {
          tried.add(model);
          try {
            const response = await activeClient.chat.completions.create({
              model,
              temperature: TEMPS[verb],
              max_tokens: MAX_TOKENS[verb],
              messages: [
                { role: "system", content: SYSTEM[verb] },
                { role: "user", content: workerInput },
              ],
            }, { signal });

            const content = response.choices?.[0]?.message?.content;
            if (!content) die("Backend returned no content.");
            return parseWorkerJson(content, verb);
          } catch (err) {
            if (!modelOverride && is404(err)) {
              logger(`Model "${model}" returned 404.`);
              model = await nextModel(activeClient, tried, { config, signal, logger, cachePath, fsModule });
              continue;
            }
            throw err;
          }
        }
      }, { setTimeoutFn, clearTimeoutFn });
    } catch (err) {
      if (!isAbortError(err)) throw err;
      if (timedOutOnce) die(timeoutMessage(activeTimeoutMs, verb, model));
      timedOutOnce = true;
      await sleep(config.timeoutRetryBackoffMs, sleepFn);
      activeTimeoutMs *= 2;
      logger(`Timed out while running ${verb} with model "${model}". Retrying once with ${activeTimeoutMs / 1000}s timeout...`);
    }
  }
}

export async function showModels(forceRefresh, {
  client,
  config = createConfig(),
  logger = console.error,
  cachePath = config.cachePath,
  fsModule = fs,
} = {}) {
  assertConfig(config);
  const activeClient = client || new OpenAI({ apiKey: config.apiKey, baseURL: config.baseUrl });
  const existing = readCache(cachePath, fsModule);
  const cache = forceRefresh || !cacheIsFresh(existing, config)
    ? await refreshCache(activeClient, { force: forceRefresh, config, logger, cachePath, fsModule })
    : existing;
  return JSON.stringify({ selected: cache.selected_model, available: cache.models }, null, 2);
}

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

export function parseArgs(argv) {
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

  if (process.env.LLM_WORKER_TOOLS_COMMAND && positional.length === 0) {
    positional.push(process.env.LLM_WORKER_TOOLS_COMMAND);
  }

  return { positional, model, inputPath, refresh };
}

export async function main(argv = process.argv) {
  const { positional, model, inputPath, refresh } = parseArgs(argv);
  const verb = positional[0];

  if (!verb) usage();
  if (!["read", "write", "models"].includes(verb)) die(`Unknown command: ${verb}`);

  if (verb === "models") {
    console.log(await showModels(refresh));
  } else {
    console.log(await runWorker(verb, { modelOverride: model, inputPath }));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (err) {
    console.error(err?.stack || err?.message || String(err));
    process.exit(err?.exitCode ?? 1);
  }
}
