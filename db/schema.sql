CREATE TABLE IF NOT EXISTS market_data (
  id BIGSERIAL PRIMARY KEY,
  ativo TEXT NOT NULL,
  timeframe TEXT NOT NULL CHECK (timeframe IN ('1h', '4h', '1d')),
  open_time TIMESTAMPTZ NOT NULL,
  open NUMERIC NOT NULL,
  high NUMERIC NOT NULL,
  low NUMERIC NOT NULL,
  close NUMERIC NOT NULL,
  volume NUMERIC NOT NULL,
  vwap NUMERIC, ema9 NUMERIC, ema21 NUMERIC, rsi NUMERIC, atr NUMERIC,
  UNIQUE (ativo, timeframe, open_time)
);

CREATE TABLE IF NOT EXISTS backtest_runs (
  id BIGSERIAL PRIMARY KEY,
  engine TEXT NOT NULL CHECK (engine IN ('both', 'baseline', 'jev')),
  mode TEXT NOT NULL CHECK (mode IN ('dev', 'oos')),
  ativo TEXT NOT NULL,
  timeframe TEXT NOT NULL CHECK (timeframe IN ('1h', '4h', '1d')),
  periodo_inicio TIMESTAMPTZ NOT NULL,
  periodo_fim TIMESTAMPTZ NOT NULL,
  oos_start_ratio NUMERIC,
  thresholds_congelados_em TIMESTAMPTZ,
  candles_total INT,
  dataset_hash TEXT,
  execution_model_version TEXT,
  target_pct NUMERIC,
  stop_pct NUMERIC,
  lookahead_candles INT,
  slippage_pct NUMERIC,
  fee_pct NUMERIC,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS signals (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  backtest_run_id BIGINT REFERENCES backtest_runs(id) ON DELETE SET NULL,
  ativo TEXT NOT NULL,
  timeframe TEXT NOT NULL CHECK (timeframe IN ('1h', '4h', '1d')),
  entrada NUMERIC,
  stop NUMERIC,
  alvo NUMERIC,
  origem TEXT NOT NULL CHECK (origem IN ('jev', 'baseline')),
  jev_choice TEXT,
  jev_probs JSONB,
  jev_model_version TEXT,
  quality_score NUMERIC,
  risco_elevado BOOLEAN,
  recomendacao TEXT NOT NULL CHECK (recomendacao IN ('BUY', 'WAIT', 'SELL')),
  tamanho_posicao_pct NUMERIC NOT NULL CHECK (tamanho_posicao_pct >= 0 AND tamanho_posicao_pct <= 100),
  observacao TEXT
);

CREATE TABLE IF NOT EXISTS paper_trades (
  id BIGSERIAL PRIMARY KEY,
  signal_id BIGINT NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  entry_price NUMERIC NOT NULL,
  exit_price NUMERIC,
  outcome TEXT NOT NULL CHECK (outcome IN ('win', 'loss', 'open')),
  profit_percent NUMERIC NOT NULL,
  gross_profit_percent NUMERIC,
  fee_percent NUMERIC,
  slippage_percent NUMERIC,
  candles_held INT,
  execution_model_version TEXT,
  exit_reason TEXT CHECK (exit_reason IN ('target', 'stop', 'end')),
  max_favorable_excursion_percent NUMERIC,
  max_adverse_excursion_percent NUMERIC,
  drawdown NUMERIC,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS config (
  user_id TEXT PRIMARY KEY,
  ativo_pref TEXT NOT NULL DEFAULT 'BTCUSDT',
  valor_invest NUMERIC NOT NULL DEFAULT 100,
  horizon_default TEXT NOT NULL DEFAULT '1h' CHECK (horizon_default IN ('1h', '4h', '1d')),
  fixed_position_pct NUMERIC NOT NULL DEFAULT 2.0 CHECK (fixed_position_pct >= 0 AND fixed_position_pct <= 100),
  thresholds_congelados_em TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS logs (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  componente TEXT NOT NULL,
  nivel TEXT NOT NULL CHECK (nivel IN ('info', 'warn', 'error')),
  mensagem TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_backtest_runs_created ON backtest_runs(criado_em);
CREATE INDEX IF NOT EXISTS idx_signals_backtest_run ON signals(backtest_run_id);
CREATE INDEX IF NOT EXISTS idx_signals_origem ON signals(origem);
CREATE INDEX IF NOT EXISTS idx_signals_ts ON signals(ts);
CREATE INDEX IF NOT EXISTS idx_signals_ativo_tf ON signals(ativo, timeframe);
CREATE INDEX IF NOT EXISTS idx_market_data_lookup ON market_data(ativo, timeframe, open_time);
CREATE INDEX IF NOT EXISTS idx_paper_trades_signal_id ON paper_trades(signal_id);
CREATE INDEX IF NOT EXISTS idx_paper_trades_outcome ON paper_trades(outcome);
CREATE INDEX IF NOT EXISTS idx_logs_ts ON logs(ts);


CREATE TABLE IF NOT EXISTS decision_log (
  id BIGSERIAL PRIMARY KEY,
  backtest_run_id BIGINT REFERENCES backtest_runs(id) ON DELETE SET NULL,
  ativo TEXT NOT NULL,
  timeframe TEXT NOT NULL CHECK (timeframe IN ('1h', '4h', '1d')),
  decision_at TIMESTAMPTZ NOT NULL,
  data_as_of TIMESTAMPTZ NOT NULL,
  origem TEXT NOT NULL CHECK (origem IN ('jev', 'baseline')),
  recomendacao TEXT NOT NULL CHECK (recomendacao IN ('BUY', 'WAIT', 'SELL')),
  jev_model_version TEXT,
  jev_choice TEXT,
  jev_probs JSONB,
  confidence NUMERIC,
  quality_score NUMERIC,
  risco_elevado BOOLEAN,
  tamanho_posicao_pct NUMERIC NOT NULL,
  observacao TEXT,
  reference_price NUMERIC NOT NULL,
  target_pct NUMERIC,
  stop_pct NUMERIC,
  lookahead_candles INT,
  execution_model_version TEXT,
  outcome_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (outcome_status IN ('pending', 'settled', 'not_applicable')),
  outcome_direction TEXT CHECK (outcome_direction IN ('up', 'down', 'flat')),
  forward_return_percent NUMERIC,
  trade_profit_percent NUMERIC,
  exit_reason TEXT CHECK (exit_reason IN ('target', 'stop', 'end')),
  evaluated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_decision_log_run ON decision_log(backtest_run_id);
CREATE INDEX IF NOT EXISTS idx_decision_log_time ON decision_log(ativo, timeframe, decision_at);
CREATE INDEX IF NOT EXISTS idx_decision_log_outcome ON decision_log(outcome_status);

CREATE TABLE IF NOT EXISTS benchmark_runs (
  id BIGSERIAL PRIMARY KEY,
  source_run_id BIGINT REFERENCES backtest_runs(id) ON DELETE SET NULL,
  ativo TEXT NOT NULL,
  timeframe TEXT NOT NULL CHECK (timeframe IN ('1h', '4h', '1d')),
  periodo_inicio TIMESTAMPTZ NOT NULL,
  periodo_fim TIMESTAMPTZ NOT NULL,
  oos_start_ratio NUMERIC,
  candles_total INT,
  dataset_hash TEXT,
  execution_model_version TEXT,
  target_pct NUMERIC,
  stop_pct NUMERIC,
  lookahead_candles INT,
  slippage_pct NUMERIC,
  fee_pct NUMERIC,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS benchmark_results (
  id BIGSERIAL PRIMARY KEY,
  benchmark_run_id BIGINT NOT NULL REFERENCES benchmark_runs(id) ON DELETE CASCADE,
  estrategia TEXT NOT NULL CHECK (estrategia IN ('baseline', 'buyhold', 'jev')),
  status TEXT NOT NULL CHECK (status IN ('ok', 'unavailable', 'error')),
  total_trades INT NOT NULL DEFAULT 0,
  closed_trades INT NOT NULL DEFAULT 0,
  open_trades INT NOT NULL DEFAULT 0,
  win_rate NUMERIC,
  profit_factor NUMERIC,
  total_profit_percent NUMERIC NOT NULL DEFAULT 0,
  avg_profit_percent NUMERIC NOT NULL DEFAULT 0,
  expectancy_percent NUMERIC NOT NULL DEFAULT 0,
  max_drawdown_percent NUMERIC NOT NULL DEFAULT 0,
  gross_total_profit_percent NUMERIC NOT NULL DEFAULT 0,
  total_fee_percent NUMERIC NOT NULL DEFAULT 0,
  total_slippage_percent NUMERIC NOT NULL DEFAULT 0,
  avg_candles_held NUMERIC,
  notas TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (benchmark_run_id, estrategia)
);

CREATE INDEX IF NOT EXISTS idx_benchmark_results_run ON benchmark_results(benchmark_run_id);
