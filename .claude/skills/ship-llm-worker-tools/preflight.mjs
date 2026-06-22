#!/usr/bin/env node
// Release preflight for llm-worker-tools — answers "is it safe to cut a release
// right now?" BEFORE you tag. It only READS state (and runs the test suite); it
// never commits, tags, or publishes. Run it, read the verdict, then follow
// SKILL.md to actually ship.
//
// Run:  node .claude/skills/ship-llm-worker-tools/preflight.mjs
// Exit: 0 = ready to tag, non-zero = blockers printed (fix them first).

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import https from "node:https";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const sh = (cmd, args) => execFileSync(cmd, args, { cwd: REPO, encoding: "utf8" }).trim();
const json = (p) => JSON.parse(readFileSync(path.join(REPO, p), "utf8"));

const blockers = [];
const notes = [];
const add = (cond, msg) => { if (!cond) blockers.push(msg); };

// 1. Versions must move in lockstep — scripts/validate-plugin.mjs enforces
//    plugin.json.version === package.json.version; bumping only one fails CI.
const pkgV = json("package.json").version;
const pluginV = json(".codex-plugin/plugin.json").version;
add(pkgV === pluginV, `version mismatch: package.json ${pkgV} != .codex-plugin/plugin.json ${pluginV} (bump BOTH in lockstep)`);
notes.push(`version: ${pkgV}${pkgV === pluginV ? "" : " / plugin " + pluginV}`);

// 2. Working tree must be clean (the tag should capture committed state).
const dirty = sh("git", ["status", "--porcelain"]);
add(dirty === "", `working tree not clean:\n${dirty}`);

// 3. Should be on main (the release branch).
const branch = sh("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
add(branch === "main", `on branch '${branch}', expected 'main'`);

// 4. HEAD should be pushed (tag triggers CI off the pushed commit).
try {
  const ahead = sh("git", ["rev-list", "--count", "@{u}..HEAD"]);
  add(ahead === "0", `${ahead} commit(s) not pushed to upstream — push main first`);
} catch { notes.push("no upstream tracking branch configured (skipped push check)"); }

// 5. The version must NOT already exist on npm — npm rejects republishing.
const published = await new Promise((resolve) => {
  https.get("https://registry.npmjs.org/llm-worker-tools", (res) => {
    let b = ""; res.on("data", (d) => (b += d));
    res.on("end", () => { try { resolve(Object.keys(JSON.parse(b).versions || {})); } catch { resolve([]); } });
  }).on("error", () => resolve(null));
});
if (published === null) notes.push("could not reach npm registry (skipped already-published check)");
else add(!published.includes(pkgV), `version ${pkgV} is ALREADY published on npm — bump before shipping`);

// 6. Test suite must be green. node --test is the real code gate; the full
//    `npm test` also runs check:ides which false-flags CRLF drift on Windows.
let testsOk = false;
try { sh("node", ["--test", "test/*.test.mjs"]); testsOk = true; } catch (e) { testsOk = false; }
add(testsOk, "node --test failed — fix before shipping (run `node --test` to see details)");

// 7. Plugin smoke + version/permission parity guard must pass.
let pluginOk = false;
try { sh("node", ["scripts/validate-plugin.mjs"]); pluginOk = true; } catch { pluginOk = false; }
add(pluginOk, "node scripts/validate-plugin.mjs failed (version parity / opencode permission parity / host-file drift)");

// ---- verdict ---------------------------------------------------------------
console.log("llm-worker-tools release preflight");
console.log("  " + notes.join("\n  "));
console.log("");
if (blockers.length === 0) {
  console.log(`READY: tag v${pkgV} and push it to ship (see SKILL.md).`);
  process.exit(0);
}
console.log("NOT READY — blockers:");
for (const b of blockers) console.log("  - " + b);
process.exit(1);
