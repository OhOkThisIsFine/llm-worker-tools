import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { dispatch } from "../bin/llm-worker-tools.mjs";
import { usageText } from "../scripts/command-metadata.mjs";

// Source the banner's "read" line straight from the metadata rather than a
// duplicated literal, so a wording change in one place can't silently drift the
// drift-guard out from under this assertion.
const READ_USAGE_LINE = usageText()
  .split("\n")
  .find(line => /\bread\b/.test(line));

function fakeSpawn(calls, child = new EventEmitter()) {
  return (...args) => {
    calls.push(args);
    return child;
  };
}

test("bin dispatch shows usage for help without spawning", () => {
  const calls = [];
  const stdout = [];
  const exits = [];

  dispatch(["node", "bin", "--help"], {
    spawnFn: fakeSpawn(calls),
    stdout: message => stdout.push(message),
    stderr: () => {},
    exitFn: code => exits.push(code),
  });

  assert.equal(calls.length, 0);
  assert.deepEqual(exits, [0]);
  assert.ok(READ_USAGE_LINE, "usageText exposes a read line");
  assert.ok(stdout.join("\n").includes(READ_USAGE_LINE), "banner contains the metadata read line");
});

test("bin dispatch rejects unknown commands without spawning", () => {
  const calls = [];
  const stdout = [];
  const stderr = [];
  const exits = [];

  dispatch(["node", "bin", "bogus"], {
    spawnFn: fakeSpawn(calls),
    stdout: message => stdout.push(message),
    stderr: message => stderr.push(message),
    exitFn: code => exits.push(code),
  });

  assert.equal(calls.length, 0);
  assert.deepEqual(exits, [1]);
  assert.match(stderr.join("\n"), /Unknown command: bogus/);
  assert.match(stdout.join("\n"), /Usage:/);
});

test("bin dispatch strips wrapper command and preserves worker verb in env", () => {
  const calls = [];
  const child = new EventEmitter();
  const result = dispatch(["node", "bin", "read", "--input", "sample.txt"], {
    spawnFn: fakeSpawn(calls, child),
    stdout: () => {},
    stderr: () => {},
    exitFn: () => {},
  });

  assert.deepEqual(result.childArgs, ["--input", "sample.txt"]);
  assert.equal(calls[0][1][1], "--input");
  assert.equal(calls[0][2].env.LLM_WORKER_TOOLS_COMMAND, "read");
  assert.equal(calls[0][2].stdio, "inherit");
});

test("bin dispatch forwards setup options without command token", () => {
  const calls = [];
  const result = dispatch(["node", "bin", "install", "--yes"], {
    spawnFn: fakeSpawn(calls),
    stdout: () => {},
    stderr: () => {},
    exitFn: () => {},
  });

  assert.deepEqual(result.childArgs, ["--yes"]);
  assert.equal(calls[0][2].env, process.env);
});

test("bin dispatch includes context on spawn errors", () => {
  const calls = [];
  const child = new EventEmitter();
  const stderr = [];
  const exits = [];

  dispatch(["node", "bin", "models", "--refresh"], {
    spawnFn: fakeSpawn(calls, child),
    stdout: () => {},
    stderr: message => stderr.push(message),
    exitFn: code => exits.push(code),
  });

  child.emit("error", new Error("spawn failed"));
  assert.deepEqual(exits, [1]);
  assert.match(stderr.join("\n"), /command "models"/);
  assert.match(stderr.join("\n"), /llm-worker\.mjs/);
  assert.match(stderr.join("\n"), /spawn failed/);
});

test("bin dispatch settles once when error follows exit", () => {
  const calls = [];
  const child = new EventEmitter();
  const exits = [];

  dispatch(["node", "bin", "models"], {
    spawnFn: fakeSpawn(calls, child),
    stdout: () => {},
    stderr: () => {},
    exitFn: code => exits.push(code),
  });

  child.emit("exit", 0, null);
  child.emit("error", new Error("late error"));
  assert.deepEqual(exits, [0]);
});

test("bin dispatch settles once when exit follows error", () => {
  const calls = [];
  const child = new EventEmitter();
  const exits = [];
  const stderr = [];

  dispatch(["node", "bin", "models"], {
    spawnFn: fakeSpawn(calls, child),
    stdout: () => {},
    stderr: message => stderr.push(message),
    exitFn: code => exits.push(code),
  });

  child.emit("error", new Error("spawn failed"));
  child.emit("exit", 0, null);
  assert.deepEqual(exits, [1]);
});
