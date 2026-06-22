import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEnv, formatEnv } from "../scripts/env-utils.mjs";

// Empty-string policy: empty values are non-persisting and EXCLUDED from the
// inverse domain. Every other value must satisfy parseEnv(formatEnv(x)) === x.
const roundTripValues = [
  "plain",
  "with spaces",
  "  leading-and-trailing  ",
  " leading",
  "trailing ",
  "has#hash",
  "#leadinghash",
  '"leading-double-quote',
  "'leading-single-quote",
  'embedded"double"quote',
  "back\\slash",
  "tab\tinside",
  "line1\nline2",
  "carriage\rreturn",
  "crlf\r\npair",
  "=equals=inside=",
  "url=https://x.example/a?b=c#frag",
  "value\\nliteral-backslash-n",
];

test("parseEnv is the inverse of formatEnv for non-empty values", () => {
  for (const v of roundTripValues) {
    const text = formatEnv({ KEY: v });
    const parsed = parseEnv(text);
    assert.deepEqual(parsed, { KEY: v }, `round-trip failed for ${JSON.stringify(v)} -> ${JSON.stringify(text)}`);
  }
});

test("empty string does not persist (non-inverse domain, documented)", () => {
  assert.equal(formatEnv({ KEY: "" }), "\n");
  assert.deepEqual(parseEnv(formatEnv({ KEY: "" })), {});
});

test("multiple keys keep insertion order with single trailing newline", () => {
  const out = formatEnv({ A: "1", B: "2", C: "3" });
  assert.equal(out, "A=1\nB=2\nC=3\n");
  assert.deepEqual(parseEnv(out), { A: "1", B: "2", C: "3" });
});

test("plain values are not quoted (no needless escaping)", () => {
  assert.equal(formatEnv({ K: "simple-value_123" }), "K=simple-value_123\n");
});

test("values needing protection are double-quoted", () => {
  assert.equal(formatEnv({ K: " spaced " }), 'K=" spaced "\n');
  assert.equal(formatEnv({ K: "a#b" }), 'K="a#b"\n');
  assert.equal(formatEnv({ K: "x\ny" }), 'K="x\\ny"\n');
});

test("parseEnv skips comments and blank lines", () => {
  const text = "# comment\n\nA=1\n   # indented comment\nB=2\n";
  assert.deepEqual(parseEnv(text), { A: "1", B: "2" });
});

test("parseEnv leaves literal quote-char data intact (no unconditional peel)", () => {
  // A bare single-quoted token written by hand is data, not a formatEnv wrapper.
  assert.deepEqual(parseEnv("K='quoted'\n"), { K: "'quoted'" });
  // A double-quoted token that is NOT a balanced wrapper (escaped closing quote).
  assert.deepEqual(parseEnv('K="a\\"\n'), { K: '"a\\"' });
});
