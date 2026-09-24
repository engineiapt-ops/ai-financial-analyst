CREATE TABLE IF NOT EXISTS market_data (
  id BIGSERIAL PRIMARY KEY,
  ativo TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  open_time TIMESTAMPTZ NOT NULL,
  open NUMERIC NOT NULL,
  high NUMERIC NOT NULL,
  low NUMERIC NOT NULL,
  close NUMERIC NOT NULL,
  volume NUMERIC NOT NULL,
  vwap NUMERIC, ema9 NUMERIC, ema21 NUMERIC, rsi NUMERIC, atr NUMERIC,
  UNIQUE (ativo, timeframe, open_time)
);

CREATE TABLE IF NOT EXISTS signals (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  ativo TEXT NOT NULL, timeframe TEXT NOT NULL,
  entrada NUMERIC, stop NUMERIC, alvo NUMERIC,
  origem TEXT NOT NULL CHECK (origem IN ('jev', 'baseline')),
  jev_choice TEXT, jev_probs JSONB, jev_model_version TEXT,
  quality_score NUMERIC, risco_elevado BOOLEAN,
  recomendacao TEXT NOT NULL CHECK (recomendacao IN ('BUY', 'WAIT', 'SELL')),
  tamanho_posicao_pct NUMERIC NOT NULL, observacao TEXT
);

CREATE TABLE IF NOT EXISTS paper_trades (
  id BIGSERIAL PRIMARY KEY,
  signal_id BIGINT NOT NULL REFERENCES signals(id),
  entry_price NUMERIC NOT NULL, exit_price NUMERIC,
  outcome TEXT CHECK (outcome IN ('win', 'loss', 'open')),
  profit_percent NUMERIC, drawdown NUMERIC,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(), closed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS config (
  user_id TEXT PRIMARY KEY,
  ativo_pref TEXT NOT NULL DEFAULT 'BTCUSD',
  valor_invest NUMERIC NOT NULL DEFAULT 100,
  horizon_default TEXT NOT NULL DEFAULT '1h',
  fixed_position_pct NUMERIC NOT NULL DEFAULT 2.0,
  thresholds_congelados_em TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS logs (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  componente TEXT NOT NULL,
  nivel TEXT NOT NULL CHECK (nivel IN ('info', 'warn', 'error')),
  mensagem TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_signals_origem ON signals(origem);
CREATE INDEX IF NOT EXISTS idx_signals_ts ON signals(ts);
CREATE INDEX IF NOT EXISTS idx_market_data_lookup ON market_data(ativo, timeframe, open_time);
