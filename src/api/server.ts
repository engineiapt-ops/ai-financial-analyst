import "dotenv/config";
import express from "express";
import { z } from "zod";
import {
  fetchKlines,
  getExchangeInfo,
  getServerTime,
  ping as pingBinance,
} from "../marketdata/binanceClient.js";
import { analyzeMarket } from "./analyze.js";
import type { Timeframe } from "../types.js";
import { getMetricsByOrigem } from "../db/repository.js";


export const app = express();
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({
    status: "ok",
    service: "ai-financial-analyst-api",
    endpoints: [
      "/health",
      "/api/analyze",
      "/api/metrics",
      "/api/market/ping",
      "/api/market/time",
      "/api/market/info",
      "/api/market/klines",
    ],
  });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "ai-financial-analyst-api" });
});

app.get("/api/market/ping", async (_req, res) => {
  try {
    const isAlive = await pingBinance();
    res.json({ status: "ok", ping: isAlive });
  } catch (err: any) {
    res.status(502).json({ status: "error", error: err.message });
  }
});

app.get("/api/market/time", async (_req, res) => {
  try {
    const serverTime = await getServerTime();
    res.json({ status: "ok", serverTime, serverTimeUTC: new Date(serverTime).toISOString() });
  } catch (err: any) {
    res.status(502).json({ status: "error", error: err.message });
  }
});

app.get("/api/market/info", async (req, res) => {
  try {
    const symbol = String(req.query.symbol ?? "BTCUSDT");
    const info = await getExchangeInfo(symbol);
    res.json({ status: "ok", info });
  } catch (err: any) {
    res.status(400).json({ status: "error", error: err.message });
  }
});

const KlinesQuerySchema = z.object({
  symbol: z.string().default("BTCUSDT"),
  timeframe: z.enum(["1h", "4h", "1d"]).default("1h"),
  limit: z.coerce.number().min(1).max(1000).default(10),
});

app.get("/api/market/klines", async (req, res) => {
  try {
    const query = KlinesQuerySchema.parse(req.query);
    const klines = await fetchKlines(query.symbol, query.timeframe as Timeframe, query.limit);
    res.json({
      status: "ok",
      symbol: query.symbol.toUpperCase(),
      timeframe: query.timeframe,
      count: klines.length,
      klines,
    });
  } catch (err: any) {
    res.status(400).json({ status: "error", error: err.message });
  }
});

export const AnalyzeSchema = z.object({
  ativo: z.string().min(1).default("BTCUSDT"),
  timeframe: z.enum(["1h", "4h", "1d"]).default("1h"),
  valorInvestimento: z.coerce.number().positive().default(100),
  engine: z.enum(["baseline", "jev"]).default("baseline"),
  news: z.boolean().default(true),
});


app.get("/api/metrics", async (_req, res) => {
  try {
    const metrics = await getMetricsByOrigem();
    res.json({ status: "ok", metrics });
  } catch (err: any) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("DATABASE_URL") ? 503 : 500;
    res.status(status).json({ status: "error", error: message });
  }
});

app.post("/api/analyze", async (req, res) => {
  try {
    const parsed = AnalyzeSchema.parse(req.body);
    const result = await analyzeMarket(parsed);
    res.json({ status: "ok", ...result });
  } catch (err: any) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("DATABASE_URL") ? 503 : 400;
    res.status(status).json({ status: "error", error: message });
  }
});

const port = Number(process.env.PORT ?? 3000);

if (process.env.NODE_ENV !== "test") {
  app.listen(port, "0.0.0.0", () =>
    console.log(`AI Financial Analyst API rodando na porta ${port}`),
  );
}
