import { getSentiment, scoreHeadlines, type NewsHeadline, type NewsSource } from "./sentimentPipeline.js";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function assertCloseTo(actual: number, expected: number, epsilon = 0.0001, message = "") {
  if (Math.abs(actual - expected) > epsilon) {
    throw new Error(
      `ASSERTION FAILED: ${message} (Esperado: ${expected}, Obtido: ${actual})`
    );
  }
}

function headline(source: string, title: string): NewsHeadline {
  return { source, title, publishedAt: new Date("2026-09-24T12:00:00Z") };
}

export async function runSentimentPipelineTests() {
  console.log("=== INÍCIO DOS TESTES DE SENTIMENT (FAIXA 05) ===\n");

  {
    process.stdout.write("1. Testando score neutro sem manchetes... ");
    assert(scoreHeadlines([]) === 0, "lista vazia deve ser neutra");
    console.log("PASS");
  }

  {
    process.stdout.write("2. Testando sinais positivos e negativos... ");
    const positive = [
      headline("test", "Bitcoin rally after ETF inflow"),
      headline("test", "Bitcoin adoption rises"),
    ];
    const negative = [
      headline("test", "Bitcoin crash after hack"),
      headline("test", "Bitcoin bearish outlook"),
    ];

    assert(scoreHeadlines(positive) > 0, "manchetes positivas devem gerar score positivo");
    assert(scoreHeadlines(negative) < 0, "manchetes negativas devem gerar score negativo");
    assertCloseTo(scoreHeadlines([...positive, ...negative]), 0, 0.0001, "sinais equilibrados");
    console.log("PASS");
  }

  {
    process.stdout.write("3. Testando limites do score e headlines inválidas... ");
    const manyPositive = Array.from({ length: 20 }, (_, i) =>
      headline("test", `Bitcoin surge rally bullish ${i}`)
    );
    assert(scoreHeadlines(manyPositive) === 1, "score positivo deve ser limitado a +1");

    const invalid = [
      headline("test", ""),
      { source: "test", title: "Bitcoin rally", publishedAt: new Date("invalid") },
    ];
    assertCloseTo(scoreHeadlines(invalid), 0, 0.0001, "headlines inválidas não devem contaminar o score");
    console.log("PASS");
  }

  {
    process.stdout.write("4. Testando agregação com fonte saudável e fonte indisponível... ");
    const healthy: NewsSource = {
      async fetchRecent() {
        return [
          headline("healthy", "Bitcoin rally"),
          headline("healthy", "Bitcoin adoption"),
        ];
      },
    };
    const failing: NewsSource = {
      async fetchRecent() {
        throw new Error("provider offline");
      },
    };

    const score = await getSentiment("BTCUSDT", [healthy, failing]);
    assert(score > 0, "falha de uma fonte não deve derrubar a fonte saudável");
    console.log("PASS");
  }

  {
    process.stdout.write("5. Testando ausência de fontes... ");
    assert(await getSentiment("BTCUSDT", []) === 0, "sem fontes deve retornar neutro");
    console.log("PASS");
  }

  {
    process.stdout.write("6. Testando aliases BTC/BTCUSD/BTCUSDT via fonte mock... ");
    const received: string[] = [];
    const source: NewsSource = {
      async fetchRecent(ativo) {
        received.push(ativo);
        return [];
      },
    };

    await getSentiment("BTCUSDT", [source]);
    await getSentiment("BTCUSD", [source]);
    await getSentiment("BTC", [source]);

    assert(received.length === 3, "a fonte deve ser chamada uma vez por solicitação");
    console.log("PASS");
  }

  console.log("\n=== TESTES DE SENTIMENT CONCLUÍDOS ===");
}

if (process.argv[1]?.endsWith("sentimentPipeline.test.ts") || process.argv[1]?.endsWith("sentimentPipeline.test.js")) {
  runSentimentPipelineTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
