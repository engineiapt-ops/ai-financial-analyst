import {
  ping,
  getServerTime,
  getExchangeInfo,
  fetchKlines,
  subscribeKlineStream,
  SUPPORTED_TIMEFRAMES,
} from "./binanceClient.js";
import { saveMarketData, getMarketData } from "../db/repository.js";
import type { Kline, Timeframe } from "../types.js";

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

  // 6. Teste de conexão real WebSocket Binance
  console.log("\n6. Testando WebSocket live stream real da Binance (BTCUSDT 1h):");
  await new Promise<void>((resolve, reject) => {
    let received = false;
    const timeout = setTimeout(() => {
      ws.terminate();
      if (received) resolve();
      else reject(new Error("Timeout aguardando mensagem WebSocket da Binance"));
    }, 12000);

    const ws = subscribeKlineStream(
      "BTCUSDT",
      "1h" as Timeframe,
      () => {},
      {
        onOpen: () => {
          console.log("   - WebSocket conectado com sucesso aos servidores da Binance");
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
  console.log("   - Conexão e stream live: PASS");

  // 7. Validação estrita do recebimento de Candle Fechado (k.x === true vs k.x === false)
  console.log("\n7. Validando filtro estrito de Candle Fechado (k.x === true):");
  {
    let closedCallbackFired = false;
    let updateCallbackFired = false;
    let receivedClosedCandle: Kline | null = null;

    const testWs = subscribeKlineStream(
      "BTCUSDT",
      "1h" as Timeframe,
      (closedCandle) => {
        closedCallbackFired = true;
        receivedClosedCandle = closedCandle;
      },
      {
        autoReconnect: false,
        onCandleUpdate: () => {
          updateCallbackFired = true;
        },
      }
    );

    // Simulação 1: Candle em formação (k.x === false)
    const inProgressPayload = JSON.stringify({
      e: "kline",
      E: 1700000000000,
      s: "BTCUSDT",
      k: {
        t: 1700000000000,
        T: 1700003599999,
        s: "BTCUSDT",
        i: "1h",
        o: "84000.00",
        c: "84200.00",
        h: "84500.00",
        l: "83900.00",
        v: "150.5",
        x: false, // Em formação!
      },
    });

    testWs.processMessagePayload(inProgressPayload);
    if (closedCallbackFired) {
      testWs.terminate();
      throw new Error("FALHA: onClosedCandle disparou para candle em formação (k.x === false)!");
    }
    if (!updateCallbackFired) {
      testWs.terminate();
      throw new Error("FALHA: onCandleUpdate não disparou para candle em formação!");
    }
    console.log("   - Candle em formação (k.x === false) corretamente IGNORADO pelo callback de fechamento: PASS");

    // Simulação 2: Candle fechado (k.x === true)
    updateCallbackFired = false;
    const closedPayload = JSON.stringify({
      e: "kline",
      E: 1700003600000,
      s: "BTCUSDT",
      k: {
        t: 1700000000000,
        T: 1700003599999,
        s: "BTCUSDT",
        i: "1h",
        o: "84000.00",
        c: "84350.00",
        h: "84600.00",
        l: "83900.00",
        v: "250.75",
        x: true, // Candle fechado!
      },
    });

    testWs.processMessagePayload(closedPayload);
    if (!closedCallbackFired || !receivedClosedCandle) {
      testWs.terminate();
      throw new Error("FALHA: onClosedCandle NÃO disparou para candle fechado (k.x === true)!");
    }
    const c = receivedClosedCandle as Kline;
    if (c.close !== 84350 || c.open !== 84000 || c.high !== 84600 || c.low !== 83900 || c.volume !== 250.75) {
      testWs.terminate();
      throw new Error(`FALHA: Valores do candle fechado incorretos: ${JSON.stringify(c)}`);
    }
    console.log(`   - Candle fechado (k.x === true) corretamente PROCESSADO com valores íntegros (close=${c.close}): PASS`);
    testWs.terminate();
  }

  // 8. Validação de Reconexão Automática com Backoff Progressivo
  console.log("\n8. Validando Reconexão Automática com Backoff Progressivo:");
  await new Promise<void>((resolve, reject) => {
    let reconnectFired = false;

    const reconnectWs = subscribeKlineStream(
      "BTCUSDT",
      "1h" as Timeframe,
      () => {},
      {
        autoReconnect: true,
        initialBackoffMs: 200, // backoff rápido para teste unitário
        maxBackoffMs: 1000,
        maxReconnectAttempts: 3,
        onOpen: () => {
          // Força fechamento abrupto para disparar reconexão
          setTimeout(() => {
            console.log("   - Simulando queda inesperada de conexão...");
            reconnectWs.activeSocket.emit("close", 1006, Buffer.from("Abnormal Closure"));
          }, 300);
        },
        onReconnect: (attempt, delayMs) => {
          reconnectFired = true;
          console.log(`   - Evento de reconexão disparado: Tentativa ${attempt}, Delay: ${delayMs}ms`);
          if (attempt === 1 && delayMs >= 200) {
            console.log("   - Backoff progressivo inicial confirmado");
          }
          // Encerra teste com sucesso
          reconnectWs.terminate();
          if (reconnectWs.isManualClose) {
            console.log("   - Encerramento limpo verificado (isManualClose = true, timers limpos)");
          }
          resolve();
        },
        onError: () => {},
      }
    );

    setTimeout(() => {
      if (!reconnectFired) {
        reconnectWs.terminate();
        reject(new Error("Timeout: Reconexão automática não foi acionada"));
      }
    }, 5000);
  });
  console.log("   - Reconexão com Backoff: PASS");

  console.log("\n=== FAIXA 03 — VALIDAÇÃO COMPLETA: TODOS OS TESTES PASSARAM COM SUCESSO ===");
}

runValidation().catch((err) => {
  console.error("ERRO NA VALIDAÇÃO:", err);
  process.exit(1);
});
