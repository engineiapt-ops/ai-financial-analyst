import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("./createApp.ts", import.meta.url),
  "utf8",
);

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

assert(
  source.includes("process.env.SERVE_STATIC === 'true'"),
  "static serving must be explicitly opt-in",
);
assert(
  source.includes("path.join(__dirname, '../../dist')"),
  "static assets must resolve from the repository dist directory",
);
assert(
  source.includes("res.status(404).json({ status: 'error', error: 'not found' })"),
  "backend must return JSON 404s when static serving is disabled",
);

const apiMount = source.indexOf("coreApiApp(req, res, next)");
const staticMount = source.indexOf("express.static(distPath)");
assert(apiMount >= 0, "core API app must be mounted in production");
assert(staticMount >= 0, "static middleware must be present for explicit static mode");
assert(
  apiMount < staticMount,
  "API routes must be mounted before the static SPA fallback",
);

assert(
  !source.includes("path.join(__dirname, 'dist', 'index.html')"),
  "legacy src/app/dist fallback path must not remain",
);

console.log("createApp static serving tests: OK");
