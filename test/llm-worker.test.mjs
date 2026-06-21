import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  cacheIsFresh,
  createConfig,
  is404,
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
