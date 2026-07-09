import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  cacheIsFresh,
  createConfig,
  extractJsonPayload,
  findJsonSpans,
  is404,
  isJsonModeRejected,
  parseArgs,
  parseWorkerJson,
  readInput,
  readCache,
  runWorker,
  setsEqual,
  writeCache,
} from "../llm-worker.mjs";

function tmpCachePath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "llm-worker-test-")), "models.json");
}

function abortError() {
  const error = new Error("aborted");
  error.name = "AbortError";
  return error;
}

test("setsEqual compares sorted arrays by index", () => {
  assert.equal(setsEqual(["a", "b"], ["a", "b"]), true);
  assert.equal(setsEqual(["a", "b"], ["b", "a"]), false);
  assert.equal(setsEqual(["a"], ["a", "b"]), false);
  assert.equal(setsEqual(["a", "c"], ["a", "b"]), false);
});

test("parseWorkerJson validates read and write schemas", () => {
  const read = parseWorkerJson("```json\n{\"summary\":\"ok\",\"findings\":[\"a\"],\"open_questions\":[]}\n```", "read");
  assert.deepEqual(JSON.parse(read), { summary: "ok", findings: ["a"], open_questions: [] });

  const write = parseWorkerJson("{\"files\":[{\"path\":\"a.txt\",\"content\":\"x\"}],\"notes\":[\"n\"]}", "write");
  assert.deepEqual(JSON.parse(write), { files: [{ path: "a.txt", content: "x" }], notes: ["n"] });

  assert.throws(() => parseWorkerJson("{", "read"), /invalid JSON/);
  assert.throws(() => parseWorkerJson("{\"summary\":\"ok\",\"findings\":[1],\"open_questions\":[]}", "read"), /read schema/);
  assert.throws(() => parseWorkerJson("{\"files\":[{\"path\":\"a.txt\"}],\"notes\":[]}", "write"), /write schema/);
});

test("parseWorkerJson tolerates reasoning prose before/after the JSON object", () => {
  const reasoning = "Let me analyze this diff carefully.\n\n" +
    "First I'll look at the changes, then summarize.\n\n" +
    "{\"summary\":\"ok\",\"findings\":[\"a\",\"b\"],\"open_questions\":[]}\n\n" +
    "Hope this helps!";
  const output = parseWorkerJson(reasoning, "read");
  assert.deepEqual(JSON.parse(output), { summary: "ok", findings: ["a", "b"], open_questions: [] });
});

test("parseWorkerJson tolerates a fenced JSON block preceded by prose", () => {
  const reasoning = "Here is my analysis as JSON:\n\n```json\n" +
    "{\"summary\":\"fenced\",\"findings\":[],\"open_questions\":[]}\n```\n\nDone.";
  const output = parseWorkerJson(reasoning, "read");
  assert.deepEqual(JSON.parse(output), { summary: "fenced", findings: [], open_questions: [] });
});

test("parseWorkerJson prefers the LAST balanced JSON object when multiple appear", () => {
  const reasoning = "For example the shape looks like {\"summary\":\"example\",\"findings\":[],\"open_questions\":[]}. " +
    "But the real answer is: {\"summary\":\"actual\",\"findings\":[],\"open_questions\":[]}";
  const output = parseWorkerJson(reasoning, "read");
  assert.deepEqual(JSON.parse(output), { summary: "actual", findings: [], open_questions: [] });
});

test("parseWorkerJson still dies when no candidate span parses or validates", () => {
  assert.throws(() => parseWorkerJson("Let me think about this. No JSON here.", "read"), /invalid JSON/);
});

test("findJsonSpans ignores braces embedded inside string literals", () => {
  const text = "prose { not json \"a { b }\" } trailing {\"summary\":\"real\",\"findings\":[],\"open_questions\":[]}";
  const spans = findJsonSpans(text);
  const last = spans[spans.length - 1];
  assert.deepEqual(JSON.parse(text.slice(...last)), { summary: "real", findings: [], open_questions: [] });
});

test("extractJsonPayload returns the strict-parse error when nothing salvages", () => {
  const result = extractJsonPayload("{");
  assert.equal("error" in result, true);
  assert.match(result.error.message, /JSON/i);
});

test("isJsonModeRejected matches 400/422 but not 404", () => {
  assert.equal(isJsonModeRejected({ status: 400 }), true);
  assert.equal(isJsonModeRejected({ status: 422 }), true);
  assert.equal(isJsonModeRejected({ status: 404 }), false);
  assert.equal(isJsonModeRejected({ response: { status: 400 } }), true);
  assert.equal(isJsonModeRejected({}), false);
});

test("cache helpers read, write, and validate freshness", () => {
  const cachePath = tmpCachePath();
  const config = createConfig({
    LLM_BACKEND_BASE_URL: "http://backend",
    LLM_MODEL_CACHE_PATH: cachePath,
  });
  const cache = {
    fetched_at: new Date().toISOString(),
    base_url: "http://backend",
    models: ["a"],
    selected_model: "a",
  };

  assert.equal(readCache(cachePath), null);
  writeCache(cache, cachePath);
  assert.deepEqual(readCache(cachePath), cache);
  assert.equal(cacheIsFresh(cache, config), true);
  assert.equal(cacheIsFresh(null, config), false);
  assert.equal(cacheIsFresh({ ...cache, base_url: "http://other" }, config), false);
  assert.equal(cacheIsFresh({ ...cache, selected_model: "" }, config), false);
  assert.equal(cacheIsFresh({ ...cache, fetched_at: "not a date" }, config), false);
  assert.equal(cacheIsFresh({ ...cache, fetched_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString() }, config), false);
});

test("is404 uses structured status fields only", () => {
  assert.equal(is404({ status: 404 }), true);
  assert.equal(is404({ response: { status: 404 } }), true);
  assert.equal(is404({ error: { status: 404 } }), true);
  assert.equal(is404({ status: 500, message: "model 404-ish failed" }), false);
  assert.equal(is404({ message: "404" }), false);
});

test("parseArgs accepts wrapper-provided worker command fallback", () => {
  const previous = process.env.LLM_WORKER_TOOLS_COMMAND;
  process.env.LLM_WORKER_TOOLS_COMMAND = "read";
  try {
    assert.deepEqual(parseArgs(["node", "llm-worker.mjs", "--input", "a.txt"]), {
      positional: ["read"],
      model: null,
      inputPath: "a.txt",
      refresh: false,
    });
  } finally {
    if (previous === undefined) delete process.env.LLM_WORKER_TOOLS_COMMAND;
    else process.env.LLM_WORKER_TOOLS_COMMAND = previous;
  }
});

test("readInput treats whitespace-only non-TTY stdin as selected empty input", () => {
  const fsModule = {
    existsSync: filePath => filePath === "fallback.txt",
    readFileSync: filePath => filePath === 0 ? "   \n\t" : "fallback content",
  };

  const input = readInput(null, {
    stdin: { isTTY: false },
    fsModule,
    config: { envInputPath: "fallback.txt" },
  });

  assert.equal(input, "");
});

test("runWorker returns parsed JSON and passes AbortSignal", async () => {
  let sawSignal = false;
  const client = {
    chat: {
      completions: {
        create: async (body, options) => {
          assert.equal(body.model, "chosen");
          sawSignal = options?.signal instanceof AbortSignal;
          return { choices: [{ message: { content: "{\"summary\":\"ok\",\"findings\":[],\"open_questions\":[]}" } }] };
        },
      },
    },
  };

  const output = await runWorker("read", {
    modelOverride: "chosen",
    input: "source",
    client,
    config: createConfig({ LLM_BACKEND_BASE_URL: "http://backend", LLM_WORKER_TIMEOUT_RETRY_BACKOFF_MS: "1" }),
  });

  assert.equal(sawSignal, true);
  assert.equal(JSON.parse(output).summary, "ok");
});

test("runWorker retries one timeout before succeeding", async () => {
  let calls = 0;
  const client = {
    chat: {
      completions: {
        create: async () => {
          calls += 1;
          if (calls === 1) throw abortError();
          return { choices: [{ message: { content: "{\"summary\":\"retry ok\",\"findings\":[],\"open_questions\":[]}" } }] };
        },
      },
    },
  };

  const output = await runWorker("read", {
    modelOverride: "chosen",
    input: "source",
    client,
    sleepFn: async () => {},
    logger: () => {},
    config: createConfig({ LLM_BACKEND_BASE_URL: "http://backend", LLM_WORKER_TIMEOUT_RETRY_BACKOFF_MS: "1" }),
  });

  assert.equal(calls, 2);
  assert.equal(JSON.parse(output).summary, "retry ok");
});

test("runWorker dies after the single timeout retry is exhausted", async () => {
  let calls = 0;
  const client = {
    chat: {
      completions: {
        create: async () => {
          calls += 1;
          throw abortError();
        },
      },
    },
  };

  await assert.rejects(
    () => runWorker("read", {
      modelOverride: "chosen",
      input: "source",
      client,
      sleepFn: async () => {},
      logger: () => {},
      config: createConfig({ LLM_BACKEND_BASE_URL: "http://backend", LLM_WORKER_TIMEOUT_RETRY_BACKOFF_MS: "1" }),
    }),
    /Timed out after .* while running read with model "chosen"\./,
  );

  // Initial attempt + exactly one retry, then the terminal die().
  assert.equal(calls, 2);
});

test("runWorker requests response_format json_object and falls back if the backend 4xxs on it", async () => {
  const calls = [];
  const client = {
    chat: {
      completions: {
        create: async body => {
          calls.push(body);
          if (body.response_format) {
            const error = new Error("Unrecognized request argument: response_format");
            error.status = 400;
            throw error;
          }
          return { choices: [{ message: { content: "{\"summary\":\"no json mode\",\"findings\":[],\"open_questions\":[]}" } }] };
        },
      },
    },
  };

  const output = await runWorker("read", {
    modelOverride: "chosen",
    input: "source",
    client,
    logger: () => {},
    config: createConfig({ LLM_BACKEND_BASE_URL: "http://backend" }),
  });

  assert.equal(JSON.parse(output).summary, "no json mode");
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].response_format, { type: "json_object" });
  assert.equal(calls[1].response_format, undefined);
});

test("runWorker retries once with a stricter nudge when the backend emits reasoning prose instead of JSON", async () => {
  const seenSystemPrompts = [];
  let calls = 0;
  const client = {
    chat: {
      completions: {
        create: async body => {
          calls += 1;
          seenSystemPrompts.push(body.messages[0].content);
          if (calls === 1) {
            return { choices: [{ message: { content: "Let me think step by step about this diff before answering." } }] };
          }
          return { choices: [{ message: { content: "{\"summary\":\"nudged\",\"findings\":[],\"open_questions\":[]}" } }] };
        },
      },
    },
  };

  const output = await runWorker("read", {
    modelOverride: "chosen",
    input: "source",
    client,
    logger: () => {},
    config: createConfig({ LLM_BACKEND_BASE_URL: "http://backend" }),
  });

  assert.equal(calls, 2);
  assert.equal(JSON.parse(output).summary, "nudged");
  assert.doesNotMatch(seenSystemPrompts[0], /CRITICAL/);
  assert.match(seenSystemPrompts[1], /CRITICAL/);
});

test("runWorker gives the nudge retry a fresh timeout window (not starved by attempt-1 latency)", async () => {
  // Window is 150ms; each backend call takes ~100ms. Under a SHARED window the
  // retry would start at t=100 and be aborted at t=150 mid-flight. With a
  // fresh window per attempt, both calls complete without any timeout.
  const logs = [];
  let calls = 0;
  const client = {
    chat: {
      completions: {
        create: async (body, options) => {
          calls += 1;
          await new Promise(resolve => setTimeout(resolve, 100));
          if (options?.signal?.aborted) throw abortError();
          if (calls === 1) {
            return { choices: [{ message: { content: "Let me reason at length about this before answering." } }] };
          }
          return { choices: [{ message: { content: "{\"summary\":\"fresh window\",\"findings\":[],\"open_questions\":[]}" } }] };
        },
      },
    },
  };

  const output = await runWorker("read", {
    modelOverride: "chosen",
    input: "source",
    client,
    logger: message => logs.push(message),
    config: createConfig({ LLM_BACKEND_BASE_URL: "http://backend", LLM_WORKER_TIMEOUT_MS: "150" }),
  });

  assert.equal(calls, 2);
  assert.equal(JSON.parse(output).summary, "fresh window");
  assert.equal(logs.some(line => /Timed out/.test(line)), false);
});

test("runWorker dies with the standard invalid-JSON error if the retried nudge also fails", async () => {
  const client = {
    chat: {
      completions: {
        create: async () => ({ choices: [{ message: { content: "Still just reasoning prose, no JSON at all." } }] }),
      },
    },
  };

  await assert.rejects(
    () => runWorker("read", {
      modelOverride: "chosen",
      input: "source",
      client,
      logger: () => {},
      config: createConfig({ LLM_BACKEND_BASE_URL: "http://backend" }),
    }),
    /Backend returned invalid JSON for read/,
  );
});

test("runWorker rotates cached model on structured 404", async () => {
  const cachePath = tmpCachePath();
  writeCache({
    fetched_at: new Date().toISOString(),
    base_url: "http://backend",
    models: ["a", "b"],
    selected_model: "a",
  }, cachePath);

  const seenModels = [];
  const client = {
    chat: {
      completions: {
        create: async body => {
          seenModels.push(body.model);
          if (body.model === "a") {
            const error = new Error("missing");
            error.status = 404;
            throw error;
          }
          if (body.messages.length === 1) {
            return { choices: [{ message: { content: "b" } }] };
          }
          return { choices: [{ message: { content: "{\"summary\":\"rotated\",\"findings\":[],\"open_questions\":[]}" } }] };
        },
      },
    },
  };

  const output = await runWorker("read", {
    input: "source",
    client,
    cachePath,
    logger: () => {},
    config: createConfig({ LLM_BACKEND_BASE_URL: "http://backend", LLM_MODEL_CACHE_PATH: cachePath }),
  });

  assert.deepEqual(seenModels, ["a", "b", "b"]);
  assert.equal(JSON.parse(output).summary, "rotated");
});
