import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function defaultConfigDir() {
  return process.env.LLM_WORKER_TOOLS_HOME || path.join(os.homedir(), ".llm-worker-tools");
}

export function defaultEnvPath() {
  return process.env.LLM_WORKER_ENV_PATH || path.join(defaultConfigDir(), ".env");
}

// Values that round-trip unquoted: no surrounding whitespace, no leading quote
// char, no '#', no embedded CR/LF. Anything else MUST be double-quoted and
// escaped by formatEnv so that parseEnv reconstructs it byte-for-byte.
function needsQuoting(value) {
  if (value.length === 0) return false; // empty strings do not persist (see formatEnv)
  if (value !== value.trim()) return true; // leading/trailing whitespace
  if (value[0] === '"' || value[0] === "'") return true; // leading quote char is data
  if (value.includes("#")) return true; // '#' would look like a comment
  if (/[\r\n]/.test(value)) return true; // embedded newlines
  return false;
}

// Empty-string policy: an empty value is NON-PERSISTING. formatEnv drops it and
// parseEnv never produces one, so the empty string is intentionally OUTSIDE the
// parseEnv(formatEnv(x)) === x domain. Every non-empty value round-trips.
export function parseEnv(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    if (!key) continue;
    let raw = line.slice(index + 1);
    let value;
    // A genuine formatEnv wrapper is a double-quoted token spanning the whole
    // value region (after trimming surrounding whitespace that formatEnv never
    // emits). Strip + unescape ONLY then; otherwise the value is literal data.
    const trimmedRaw = raw.trim();
    if (trimmedRaw.length >= 2 && trimmedRaw[0] === '"' && trimmedRaw[trimmedRaw.length - 1] === '"' && isWrappedQuote(trimmedRaw)) {
      value = unescapeQuoted(trimmedRaw.slice(1, -1));
    } else {
      value = trimmedRaw;
    }
    values[key] = value;
  }
  return values;
}

// True only when the surrounding double quotes are a balanced wrapper, i.e. the
// closing quote is not itself escaped. Guards against data like `"a\"` whose
// trailing quote is escaped and therefore not a real wrapper terminator.
function isWrappedQuote(token) {
  let backslashes = 0;
  for (let i = token.length - 2; i > 0 && token[i] === "\\"; i--) backslashes++;
  return backslashes % 2 === 0;
}

function unescapeQuoted(body) {
  let out = "";
  for (let i = 0; i < body.length; i++) {
    if (body[i] === "\\" && i + 1 < body.length) {
      const next = body[i + 1];
      if (next === "n") out += "\n";
      else if (next === "r") out += "\r";
      else if (next === "\\") out += "\\";
      else if (next === '"') out += '"';
      else out += next;
      i++;
    } else {
      out += body[i];
    }
  }
  return out;
}

export function loadUserEnv(envPath = defaultEnvPath()) {
  if (!fs.existsSync(envPath)) return false;
  const values = parseEnv(fs.readFileSync(envPath, "utf8"));
  for (const [key, value] of Object.entries(values)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
  return true;
}

export function formatEnv(values) {
  const lines = Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== null && String(value).length > 0)
    .map(([key, value]) => {
      const str = String(value);
      if (needsQuoting(str)) {
        const escaped = str
          .replace(/\\/g, "\\\\")
          .replace(/"/g, '\\"')
          .replace(/\r/g, "\\r")
          .replace(/\n/g, "\\n");
        return `${key}="${escaped}"`;
      }
      return `${key}=${str}`;
    });
  return `${lines.join("\n")}\n`;
}

