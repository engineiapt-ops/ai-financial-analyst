export {};

process.env.JEV_MODEL_VERSION = "jev-test-v1";
process.env.AI_GATEWAY_API_KEY = "test-key";

const { callJev } = await import("./jevClient.js");

const originalFetch = globalThis.fetch;
const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;

function restore(): void {
  globalThis.fetch = originalFetch;
  globalThis.setTimeout = originalSetTimeout;
  globalThis.clearTimeout = originalClearTimeout;
  delete process.env.JEV_MODEL_VERSION;
  delete process.env.AI_GATEWAY_API_KEY;
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const market = {
  ativo: "BTCUSDT",
  timeframe: "1h" as const,
  timestamp: 1_700_000_000_000,
  dataAsOf: 1_700_000_000_000,
  precoAtual: 100_000,
  indicators: {
    ema9: 100_100,
    ema21: 99_900,
    rsi: 60,
    vwap: 100_000,
    atr: 1_000,
  },
  noticiaSentimento: 0,
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function validPayload(): Record<string, unknown> {
  return {
    modelVersion: "jev-test-v1",
    direcao: {
      choice: "ALTA",
      probabilities: { ALTA: 0.8, BAIXA: 0.1, AGUARDAR: 0.1 },
      confidence: 0.9,
    },
    risco_elevado: { noul: 0.1, probabilities: {}, confidence: 0.9 },
    qualidade: { score: 0.8, probabilities: {}, confidence: 0.9 },
  };
}

try {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return response({ answers: validPayload() });
  };
  const success = await callJev(market);
  assert(success.modelVersion === "jev-test-v1", "success should expose returned model version");
  assert(calls === 1, "success should make one request");

  globalThis.fetch = async () => response({
    answers: { modelVersion: "jev-test-v1", invalid: true },
  });
  let invalidFailed = false;
  try { await callJev(market); } catch (error) {
    invalidFailed = error instanceof Error && error.message.includes("campos obrigatórios ausentes");
  }
  assert(invalidFailed, "invalid response should fail validation");

  let retryCalls = 0;
  globalThis.setTimeout = ((callback: (...args: unknown[]) => void) => {
    callback();
    return 0 as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;
  globalThis.clearTimeout = (() => {}) as typeof clearTimeout;
  globalThis.fetch = async () => {
    retryCalls += 1;
    if (retryCalls < 3) return response({ error: "rate limited" }, retryCalls === 1 ? 429 : 503);
    return response(validPayload());
  };
  const retried = await callJev(market);
  assert(retryCalls === 3, "429/5xx should retry before success");
  assert(retried.modelVersion === "jev-test-v1", "retry success should preserve model version");

  globalThis.fetch = async (_input, init) => {
    await Promise.resolve();
    if (init?.signal?.aborted) {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    }
    return new Promise<Response>(() => {});
  };
  let timeoutFailed = false;
  try { await callJev(market); } catch (error) {
    timeoutFailed = error instanceof Error && error.name === "AbortError";
  }
  assert(timeoutFailed, "timeout should abort the request");

  process.env.JEV_MODEL_VERSION = "different-version";
  globalThis.fetch = async () => response(validPayload());
  let mismatchFailed = false;
  try { await callJev(market); } catch (error) {
    mismatchFailed = error instanceof Error && error.message.includes("model version mismatch");
  }
  assert(mismatchFailed, "configured version mismatch should fail explicitly");

  console.log("jev client tests passed");
} finally {
  restore();
}
