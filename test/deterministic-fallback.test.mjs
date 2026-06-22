/**
 * Deterministic code-capable fallback in selectBestModel (INV-WC-DETFALLBACK /
 * COR-ffcd10d5 / CE-001).
 *
 * When the bootstrap model replies with an id NOT in the candidate set,
 * selectBestModel must fall back to a DETERMINISTIC, code-capable member of the
 * candidate set — never silently return the bootstrap, never a non-deterministic
 * or arbitrary-anchor (e.g. lexicographically-first embedding model) pick.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deterministicFallbackModel,
  selectBestModel,
} from "../llm-worker.mjs";

test("CE-001: prefers code-capable over lexicographically-first embedding model", () => {
  const models = ["ada-embedding-001", "gpt-code-xl", "vision-preview"];
  assert.equal(deterministicFallbackModel(models), "gpt-code-xl");
});

test("deterministicFallbackModel is stable across identical inputs and input order", () => {
  const a = deterministicFallbackModel(["vision-preview", "gpt-code-xl", "ada-embedding-001"]);
  const b = deterministicFallbackModel(["ada-embedding-001", "gpt-code-xl", "vision-preview"]);
  const c = deterministicFallbackModel(["gpt-code-xl", "vision-preview", "ada-embedding-001"]);
  assert.equal(a, "gpt-code-xl");
  assert.equal(b, "gpt-code-xl");
  assert.equal(c, "gpt-code-xl");
});

test("deterministicFallbackModel always returns a member of the candidate set", () => {
  const models = ["alpha-7b-instruct", "beta-3b-chat", "zeta-1b"];
  const picked = deterministicFallbackModel(models);
  assert.ok(models.includes(picked), `picked "${picked}" must be a member`);
});

test("deterministicFallbackModel resolves preference ties lexicographically", () => {
  // Two instruct models, neither avoided, no higher-priority code/instruct match
  // distinguishes them beyond sort order.
  const models = ["mango-instruct", "apple-instruct"];
  assert.equal(deterministicFallbackModel(models), "apple-instruct");
});

test("deterministicFallbackModel falls back to first sorted id when nothing preferred matches", () => {
  const models = ["zzz-model", "aaa-model"];
  assert.equal(deterministicFallbackModel(models), "aaa-model");
});

test("deterministicFallbackModel returns an avoided id only when every candidate is avoided", () => {
  const models = ["text-embedding-3-large", "text-embedding-3-small"];
  const picked = deterministicFallbackModel(models);
  assert.ok(models.includes(picked));
  // sorted: 3-large before 3-small
  assert.equal(picked, "text-embedding-3-large");
});

// ── selectBestModel integration: bootstrap returns out-of-list id ──────────

function fakeClient(outOfListReply) {
  const calls = [];
  return {
    calls,
    chat: {
      completions: {
        create: async (body, opts) => {
          calls.push({ model: body.model, signal: opts?.signal });
          return {
            choices: [{ message: { content: outOfListReply } }],
          };
        },
      },
    },
  };
}

test("selectBestModel falls back deterministically, NOT to bootstrap, on out-of-list reply", async () => {
  const models = ["ada-embedding-001", "gpt-code-xl", "vision-preview"];
  // bootstrap is the first candidate (ada-embedding-001); LLM replies a junk id.
  const client = fakeClient("totally-made-up-model");
  const logs = [];
  const selected = await selectBestModel(client, models, undefined, msg => logs.push(msg));

  assert.equal(selected, "gpt-code-xl", "must be the deterministic code-capable pick");
  assert.notEqual(selected, models[0], "must NOT silently return the bootstrap");
  assert.ok(
    logs.some(l => l.includes("deterministic code-capable pick")),
    "warning log line preserved",
  );
});

test("selectBestModel threads the AbortSignal into bootstrap probes", async () => {
  const models = ["gpt-code-xl", "ada-embedding-001"];
  const client = fakeClient("gpt-code-xl");
  const signal = new AbortController().signal;
  await selectBestModel(client, models, signal, () => {});
  assert.equal(client.calls[0].signal, signal, "signal must be passed to chat.completions.create");
});
