import { strict as assert } from "node:assert";
import type { MarketState } from "../types.js";
import { callJev } from "./jevClient.js";

const originalFetch = globalThis.fetch;
const originalApiKey = process.env.AI_GATEWAY_API_KEY;
const originalModelVersion = process.env.JEV_MODEL_VERSION;

const market: MarketState = {
  ativo: "BTCUSDT",
  timeframe: "1h",
  timestamp: 1_700_000_000_000,
  dataAsOf: 1_700_000_000_000,
  precoAtual: 100_000,
  indicators: {
    ema9: 100_100,
    ema21: 99_900,
    rsi: 55,
    vwap: 100_000,
    atr: 1_000,
  },
  noticiaSentimento: 0,
};

function response(status = 200, body: unknown = undefined, headers: Record<string, string> = {}): Response {
  const payload = body === undefined
    ? {
        answers: {
          direcao: { choice: "ALTA", probabilities: { ALTA: 0.8, BAIXA: 0.1, AGUARDAR: 0.1 }, confidence: 0.9 },
          risco_elevado: { probabilities: {}, confidence: 1, noul: 0 },
          qualidade: { probabilities: {}, confidence: 1, score: 0.8 },
        },
        modelVersion: "typesafe-ai/jev@v1",
      }
    : body;

  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "error",
    headers: new Headers(headers),
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  } as Response;
}

async function expectReject(promise: Promise<unknown>, messagePart: string): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    return error instanceof Error && error.message.includes(messagePart);
  });
}

async function run(): Promise<void> {
  process.env.AI_GATEWAY_API_KEY = "test-key";
  delete process.env.JEV_MODEL_VERSION;

  {
    let calls = 0;
    const result = await callJev(market, {
      fetchImpl: async () => {
        calls += 1;
        return response();
      },
    });
    assert.equal(result.direcao.choice, "ALTA");
    assert.equal(result.modelVersion, "typesafe-ai/jev@v1");
    assert.equal(calls, 1);
  }

  {
    await expectReject(
      callJev(market, {
        fetchImpl: async () => response(200, { answers: {} }),
      }),
      "campos obrigatórios ausentes",
    );
  }

  {
    let calls = 0;
    const result = await callJev(market, {
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) return response(429, { error: "rate limit" }, { "retry-after": "0" });
        if (calls === 2) return response(503, { error: "temporary" });
        return response();
      },
      sleepImpl: async () => {},
    });
    assert.equal(calls, 3);
    assert.equal(result.modelVersion, "typesafe-ai/jev@v1");
  }

  {
    await expectReject(
      callJev(market, {
        timeoutMs: 5,
        fetchImpl: async (_input, init) => new Promise<Response>((_resolve, reject) => {
          const onAbort = () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          };
          init?.signal?.addEventListener("abort", onAbort, { once: true });
        }),
      }),
      "timed out",
    );
  }

  {
    process.env.JEV_MODEL_VERSION = "typesafe-ai/jev@expected";
    await expectReject(
      callJev(market, {
        fetchImpl: async () => response(),
      }),
      "model/version mismatch",
    );
  }

  process.env.JEV_MODEL_VERSION = "typesafe-ai/jev@v1";
  const result = await callJev(market, {
    fetchImpl: async () => response(),
  });
  assert.equal(result.modelVersion, "typesafe-ai/jev@v1");

  console.log("jev client tests passed");
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.AI_GATEWAY_API_KEY;
    else process.env.AI_GATEWAY_API_KEY = originalApiKey;
    if (originalModelVersion === undefined) delete process.env.JEV_MODEL_VERSION;
    else process.env.JEV_MODEL_VERSION = originalModelVersion;
  });
