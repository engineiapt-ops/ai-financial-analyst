# Cron timeframe limitation

The Vercel scheduler intentionally remains at `0 6 * * *` and is not changed in this correction round.

The paper JEV cycle keeps the existing scope of BTCUSDT on `1h`, `4h` and `1d`. Because the scheduler runs once per day, the `1h` and `4h` cycles advance only once per daily cron execution. This is a scheduler limitation, not a change to the deterministic decision logic or timeframe support.

The cycle logs this condition as `paper_jev_cron_timeframe_schedule` on each execution.
