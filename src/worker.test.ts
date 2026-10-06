import { strict as assert } from "node:assert";

const originalFetch = globalThis.fetch;

try {
  let capturedUrl = "";
  let capturedApiKey = "";

  globalThis.fetch = async (input, init) => {
    capturedUrl = input instanceof Request ? input.url : String(input);
    capturedApiKey = new Headers(init?.headers).get("X-API-Key") ?? "";
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const module = await import("./worker.ts");
  const assets = {
    async fetch() {
      return new Response("frontend", { status: 200 });
    },
  };

  const apiResponse = await module.default.fetch(
    new Request("https://ai-financial-analyst.engineia-pt.workers.dev/api/health?x=1"),
    {
      ASSETS: assets,
      BACKEND_API_KEY: "test-secret",
      BACKEND_ORIGIN: "https://backend.example.test",
    },
  );

  assert.equal(apiResponse.status, 200);
  assert.equal(capturedUrl, "https://backend.example.test/api/health?x=1");
  assert.equal(capturedApiKey, "test-secret");

  const assetResponse = await module.default.fetch(
    new Request("https://ai-financial-analyst.engineia-pt.workers.dev/"),
    {
      ASSETS: assets,
      BACKEND_API_KEY: "test-secret",
      BACKEND_ORIGIN: "https://backend.example.test",
    },
  );

  assert.equal(assetResponse.status, 200);
  assert.equal(await assetResponse.text(), "frontend");

  const missingSecret = await module.default.fetch(
    new Request("https://ai-financial-analyst.engineia-pt.workers.dev/api/health"),
    {
      ASSETS: assets,
      BACKEND_API_KEY: "",
      BACKEND_ORIGIN: "https://backend.example.test",
    },
  );

  assert.equal(missingSecret.status, 503);
} finally {
  globalThis.fetch = originalFetch;
}

console.log("cloudflare worker proxy tests: OK");
