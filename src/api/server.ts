import "dotenv/config";
import express from "express";
import { z } from "zod";

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "ai-financial-analyst-api" });
});

const AnalyzeSchema = z.object({
  ativo: z.string().default("BTCUSDT"),
  timeframe: z.enum(["1h", "4h", "1d"]).default("1h"),
});

app.post("/api/analyze", async (_req, res) => {
  try {
    const parsed = AnalyzeSchema.parse(_req.body);
    res.json({ status: "foundation-ready", input: parsed });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`AI Financial Analyst API rodando na porta ${port}`));
