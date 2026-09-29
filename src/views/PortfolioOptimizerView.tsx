import React, { useState } from 'react';
import {
  PieChart as PieIcon,
  ShieldCheck,
  TrendingUp,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Sliders,
  DollarSign
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid
} from 'recharts';

const INITIAL_HOLDINGS = [
  { symbol: 'NVDA', name: 'NVIDIA Corp', allocation: 30, sector: 'Semiconductors', beta: 1.68, expectedReturn: 28 },
  { symbol: 'MSFT', name: 'Microsoft Corp', allocation: 25, sector: 'Enterprise SaaS', beta: 0.92, expectedReturn: 16 },
  { symbol: 'AAPL', name: 'Apple Inc', allocation: 20, sector: 'Consumer Hardware', beta: 1.08, expectedReturn: 14 },
  { symbol: 'GOOGL', name: 'Alphabet Inc', allocation: 15, sector: 'Search & Cloud', beta: 1.10, expectedReturn: 18 },
  { symbol: 'TLT', name: '20+ Year Treasury Bond ETF', allocation: 10, sector: 'Fixed Income', beta: 0.25, expectedReturn: 4.8 }
];

const COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#06b6d4', '#ec4899'];

export const PortfolioOptimizerView: React.FC = () => {
  const [holdings, setHoldings] = useState(INITIAL_HOLDINGS);
  const [stressScenario, setStressScenario] = useState<'normal' | 'recession' | 'rate_cut' | 'stagflation'>('normal');

  // Compute portfolio weighted metrics
  const portfolioBeta = holdings.reduce((acc, h) => acc + (h.allocation / 100) * h.beta, 0);
  const portfolioExpectedReturn = holdings.reduce((acc, h) => acc + (h.allocation / 100) * h.expectedReturn, 0);
  const riskFreeRate = 4.18;
  const sharpeRatio = ((portfolioExpectedReturn - riskFreeRate) / (portfolioBeta * 15)).toFixed(2);

  const scenarioImpacts: Record<string, { label: string; returnImpact: number; note: string }> = {
    normal: { label: 'Baseline Moderate Growth', returnImpact: portfolioExpectedReturn, note: 'Standard macroeconomic projection' },
    recession: { label: 'Severe Tech & Capex Contraction', returnImpact: -18.5, note: 'Equity multiples compress 25%, bonds rally' },
    rate_cut: { label: '100bps Aggressive Fed Rate Cuts', returnImpact: 22.4, note: 'High beta growth and tech equities rally' },
    stagflation: { label: 'Sticky Inflation & Margin Squeeze', returnImpact: -8.2, note: 'Energy & fixed assets outperform, high-PE tech lags' }
  };

  const handleUpdateAllocation = (symbol: string, newAlloc: number) => {
    setHoldings(prev => prev.map(h => h.symbol === symbol ? { ...h, allocation: newAlloc } : h));
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="terminal-card rounded-2xl p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <PieIcon className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                Portfolio Risk, Sharpe Optimization & Stress Testing
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Markowitz Frontier
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                Simulate macroeconomic shocks, analyze factor beta sensitivities, and rebalance asset allocations.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
        <div className="terminal-card rounded-xl p-4">
          <span className="text-slate-400 text-[10px] uppercase font-semibold block">Portfolio Beta</span>
          <span className="text-xl font-mono font-black text-white">{portfolioBeta.toFixed(2)}</span>
          <span className="text-[10px] text-slate-500 block mt-0.5">S&P 500 Market Benchmark = 1.0</span>
        </div>

        <div className="terminal-card rounded-xl p-4">
          <span className="text-slate-400 text-[10px] uppercase font-semibold block">Expected Annual Return</span>
          <span className="text-xl font-mono font-black text-emerald-400">+{portfolioExpectedReturn.toFixed(1)}%</span>
          <span className="text-[10px] text-slate-500 block mt-0.5">CapM Asset Model</span>
        </div>

        <div className="terminal-card rounded-xl p-4">
          <span className="text-slate-400 text-[10px] uppercase font-semibold block">Sharpe Ratio</span>
          <span className="text-xl font-mono font-black text-amber-400">{sharpeRatio}</span>
          <span className="text-[10px] text-slate-500 block mt-0.5">Risk-adjusted excess return</span>
        </div>

        <div className="terminal-card rounded-xl p-4">
          <span className="text-slate-400 text-[10px] uppercase font-semibold block">Diversification Score</span>
          <span className="text-xl font-mono font-black text-cyan-400">84 / 100</span>
          <span className="text-[10px] text-slate-500 block mt-0.5">Cross-sector correlation index</span>
        </div>
      </div>

      {/* 2-Column: Holdings & Allocations + Sector Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Holdings Table (2 Cols) */}
        <div className="lg:col-span-2 terminal-card rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Active Portfolio Allocation</h3>
            <span className="text-xs text-slate-400 font-mono">
              Total: {holdings.reduce((a, b) => a + b.allocation, 0)}%
            </span>
          </div>

          <div className="space-y-3 text-xs">
            {holdings.map((h, i) => (
              <div key={h.symbol} className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="font-mono font-bold text-white">${h.symbol}</span>
                    <span className="text-slate-400 font-medium">({h.name})</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-[11px] text-slate-400">Beta: <strong className="text-white font-mono">{h.beta}</strong></span>
                    <span className="font-mono font-bold text-emerald-400">{h.allocation}% Weight</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="0"
                    max="60"
                    value={h.allocation}
                    onChange={(e) => handleUpdateAllocation(h.symbol, parseInt(e.target.value))}
                    className="flex-1 accent-emerald-500 bg-slate-800 h-1.5 rounded-lg cursor-pointer"
                  />
                  <span className="font-mono text-slate-300 w-8 text-right">{h.allocation}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sector Pie Chart (1 Col) */}
        <div className="terminal-card rounded-2xl p-6 flex flex-col justify-between">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-2">Sector Concentration</h3>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={holdings}
                  dataKey="allocation"
                  nameKey="symbol"
                  cx="50%"
                  cy="50%"
                  outerRadius={75}
                  innerRadius={45}
                  paddingAngle={3}
                >
                  {holdings.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-1.5 text-[10px] text-slate-400 mt-2">
            {holdings.map((h, i) => (
              <div key={h.symbol} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                <span>${h.symbol}: {h.allocation}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Macro Stress Testing Workbench */}
      <div className="terminal-card rounded-2xl p-6">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          Macroeconomic Scenario Stress Testing
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4 text-xs">
          {(['normal', 'recession', 'rate_cut', 'stagflation'] as const).map((scen) => (
            <button
              key={scen}
              onClick={() => setStressScenario(scen)}
              className={`p-3.5 rounded-xl border text-left transition-all ${
                stressScenario === scen
                  ? 'bg-amber-500/10 border-amber-500/40 text-white font-bold'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <span className="block font-semibold capitalize">{scen.replace('_', ' ')}</span>
              <span className={`text-sm font-mono font-bold block mt-1 ${scenarioImpacts[scen].returnImpact >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {scenarioImpacts[scen].returnImpact >= 0 ? '+' : ''}{scenarioImpacts[scen].returnImpact.toFixed(1)}% Return
              </span>
            </button>
          ))}
        </div>

        <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-xs text-slate-300">
          <p className="font-semibold text-amber-300">{scenarioImpacts[stressScenario].label}:</p>
          <p className="text-slate-400 mt-0.5">{scenarioImpacts[stressScenario].note}</p>
        </div>
      </div>
    </div>
  );
};
