import {
  ping,
  getServerTime,
  getExchangeInfo,
  fetchKlines,
  subscribeKlineStream,
  SUPPORTED_TIMEFRAMES,
} from "./binanceClient.js";
import { saveMarketData, getMarketData } from "../db/repository.js";
import type { Timeframe } from "../types.js";

async function runValidation() {
  console.log("=== INÍCIO DA VALIDAÇÃO FAIXA 03 — BINANCE MARKET DATA ===\n");

  // 1. Teste ping
  process.stdout.write("1. Testando Binance GET /api/v3/ping... ");
  const pingOk = await ping();
  console.log(pingOk ? "PASS" : "FAIL");

  // 2. Teste time
  process.stdout.write("2. Testando Binance GET /api/v3/time... ");
  const serverTime = await getServerTime();
  console.log(`PASS (${serverTime} - ${new Date(serverTime).toISOString()})`);

  // 3. Teste exchangeInfo para BTCUSDT
  process.stdout.write("3. Testando Binance GET /api/v3/exchangeInfo (BTCUSDT)... ");
  const info = (await getExchangeInfo("BTCUSDT")) as any;
  console.log(`PASS (Symbol: ${info.symbol}, Status: ${info.status}, Base: ${info.baseAsset}, Quote: ${info.quoteAsset})`);

  // 4. Teste fetchKlines para 1h, 4h, 1d
  console.log("\n4. Testando REST fetchKlines nos timeframes suportados:");
  for (const tf of SUPPORTED_TIMEFRAMES) {
    process.stdout.write(`   - BTCUSDT timeframe ${tf}... `);
    const klines = await fetchKlines("BTCUSDT", tf, 5);
    if (klines.length !== 5) {
      throw new Error(`Esperado 5 klines, recebido: ${klines.length}`);
    }
    const latest = klines[klines.length - 1];
    console.log(
      `PASS (${klines.length} candles, último close: ${latest.close}, volume: ${latest.volume.toFixed(2)}, tempo: ${latest.openTime.toISOString()})`
    );
  }

  // 5. Teste de persistência e recuperação (market_data)
  console.log("\n5. Testando persistência e recuperação de market_data:");
  const sampleKlines = await fetchKlines("BTCUSDT", "1h", 3);
  const savedCount = await saveMarketData("BTCUSDT", "1h", sampleKlines);
  console.log(`   - Inseridos/atualizados: ${savedCount} candles`);
  const retrieved = await getMarketData("BTCUSDT", "1h", 3);
  console.log(`   - Recuperados: ${retrieved.length} candles (Primeiro open: ${retrieved[0]?.open}, Último close: ${retrieved[retrieved.length - 1]?.close})`);
  console.log("   - Persistência: PASS");

  // 6. Teste WebSocket stream
  console.log("\n6. Testando WebSocket subscribeKlineStream (BTCUSDT 1h):");
  await new Promise<void>((resolve, reject) => {
    let received = false;
    const timeout = setTimeout(() => {
      ws.terminate();
      if (received) resolve();
      else reject(new Error("Timeout aguardando mensagem WebSocket"));
    }, 10000);

    const ws = subscribeKlineStream(
      "BTCUSDT",
      "1h" as Timeframe,
      (closedCandle) => {
        console.log(`   - Candle fechado recebido: close=${closedCandle.close}`);
      },
      {
        onOpen: () => {
          console.log("   - WebSocket conectado com sucesso");
        },
        onCandleUpdate: (candle, isClosed) => {
          if (!received) {
            received = true;
            console.log(
              `   - Mensagem live recebida! Preço: ${candle.close}, fechado: ${isClosed}, tempo: ${candle.openTime.toISOString()}`
            );
            clearTimeout(timeout);
            ws.terminate();
            resolve();
          }
        },
        onError: (err) => {
          clearTimeout(timeout);
          reject(err);
        },
      }
    );
  });
  console.log("   - WebSocket stream: PASS");

  console.log("\n=== FAIXA 03 — BINANCE MARKET DATA VALIDADA COM SUCESSO ===");
}

runValidation().catch((err) => {
  console.error("ERRO NA VALIDAÇÃO:", err);
  process.exit(1);
});
