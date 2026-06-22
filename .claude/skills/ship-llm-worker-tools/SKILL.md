---
name: ship-llm-worker-tools
description: Cut and publish a release of llm-worker-tools. Use to ship, release, publish, tag, or bump the version — runs the preflight checker, then bumps + tags + pushes so CI publishes to npm via trusted publishing.
---

# Ship llm-worker-tools

Releases are **tag-triggered**: pushing a `v*` tag runs
`.github/workflows/publish.yml`, which `npm publish`es to npm via **trusted
publishing (OIDC)** — no `NPM_TOKEN`, and the package gets SLSA build
provenance automatically. There is no manual `npm publish` step; you bump,
tag, and push, and CI does the rest.

All paths below are relative to the repo root. The preflight checker lives at
`.claude/skills/ship-llm-worker-tools/preflight.mjs`.

## Preflight (run this first)

Before touching the version, confirm it's safe to ship. The checker reads
git/npm/version state and runs the test + plugin gates — it never commits,
tags, or publishes:

```bash
node .claude/skills/ship-llm-worker-tools/preflight.mjs
```

It blocks (exit 1) on: a dirty tree, not-on-`main`, unpushed commits, a
`package.json`/`.codex-plugin/plugin.json` version mismatch, a version already
on npm, or failing `node --test` / `validate-plugin`. Fix every blocker until
it prints `READY: tag vX.Y.Z`.

## Release steps (the flow that shipped 0.2.2)

1. **Bump BOTH version files in lockstep.** `scripts/validate-plugin.mjs`
   enforces `package.json.version === .codex-plugin/plugin.json.version`;
   bumping only one fails CI. (The preflight catches this.)

   ```bash
   node -e 'const fs=require("fs");for(const f of ["package.json",".codex-plugin/plugin.json"]){const j=JSON.parse(fs.readFileSync(f,"utf8"));j.version="0.2.2";fs.writeFileSync(f,JSON.stringify(j,null,2)+"\n");}'
   ```

2. **Verify green** (the gates CI will re-run):

   ```bash
   node --test                       # 47/47
   node scripts/validate-plugin.mjs  # "Codex plugin smoke check passed."
   ```

3. **Commit, tag, push** — the tag push is what triggers the publish:

   ```bash
   git commit -am "Release 0.2.2"
   git push origin main
   git tag v0.2.2
   git push origin v0.2.2
   ```

4. **Watch CI publish** (trusted publishing; pauses for review only if the
   `release` Environment has required reviewers configured):

   ```bash
   gh run list --workflow=publish.yml --limit 1
   gh run watch <run-id> --exit-status
   ```

5. **Verify live** — version is published and carries provenance:

   ```bash
   npm view llm-worker-tools version           # -> 0.2.2
   npm view llm-worker-tools@0.2.2 dist         # dist.attestations.provenance present
   ```

6. **Reinstall the global bin** so local `llm` / `llm-worker-tools` match:

   ```bash
   npm install -g llm-worker-tools@0.2.2
   llm-worker-tools | head -1                   # Usage:
   ```

## Gotchas

- **Lockstep version bump is mandatory.** `validate-plugin.mjs` fails the CI
  `npm test` if `package.json` and `.codex-plugin/plugin.json` versions differ.
  Always bump both (step 1 does both).
- **No `NPM_TOKEN`.** Publishing is OIDC trusted publishing — the workflow's
  `id-token: write` + the package's npm Trusted Publisher config authenticate
  the publish. Don't add a token secret; if `npm publish` ever fails on auth,
  the trusted-publisher link (npmjs.com > package > Settings) is the thing to
  fix, not a missing token.
- **The `environment: release` gate is inert** until a `release` Environment
  with required reviewers exists in repo Settings > Environments. Until then a
  tag push publishes unblocked.
- **npm rejects republishing a version.** Bump before every ship; the preflight
  checks the registry and blocks a duplicate.
- **Windows CRLF makes `npm test` false-fail `check:ides`.** Use `node --test`
  as the real local code gate (the preflight does), or run `npm run sync:ides`
  first. CI on Linux is unaffected, so it doesn't block the release.

## Troubleshooting

- Preflight says `version ... is ALREADY published` → bump (step 1); you can't
  republish.
- Preflight says `version mismatch` → you bumped only one file; set both.
- CI `npm test` fails on `check:ides` but `node --test` is green locally → host
  files committed with CRLF or out of sync; `npm run sync:ides` and commit, or
  it's a transient — confirm the committed (LF) files match the generator.
- `npm publish` fails with an auth/OIDC error in CI → the package's npm Trusted
  Publisher isn't pointed at this repo + the `Publish Package` workflow.
