# JEV Cron Cadence

The current Vercel scheduler remains **daily** at `0 6 * * *`.

The controlled JEV paper cycle still evaluates the locked scope `BTCUSDT` across `1h`, `4h` and `1d` when the cron invocation runs. Because the current scheduler invokes the cycle once per day, the `1h` and `4h` observations advance at most once per day under this scheduler rather than at every individual candle close.

This is an operational scheduling limitation only. It does not alter the deterministic Decision Engine, thresholds, sizing, point-in-time rules, or paper-only execution guardrails.

Each cron invocation emits a structured `jev_cron_cadence_limitation` log event with the active schedule and affected timeframes.
