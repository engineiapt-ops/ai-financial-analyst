# Cron timeframe scheduling

The Vercel Hobby scheduler remains at `0 6 * * *` as a daily fallback.

The paper JEV cycle supports BTCUSDT on `1h`, `4h` and `1d`. The hourly market-data workflow now invokes the paper cycle once per hour, so `1h` and `4h` observations can advance hourly. An external scheduler is also intended as the primary hourly trigger because GitHub scheduled workflows are not guaranteed to execute on time.

The cycle is idempotent by `dataAsOf`, and the paper decision log has a partial unique index on `(ativo, timeframe, data_as_of, origem)` for rows without `backtest_run_id`.
