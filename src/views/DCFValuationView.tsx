import { apiFetch } from '../utils/apiFetch.js';
import React, { useState, useEffect } from 'react';
import { DCFModelResult } from '../types';
import {
  Calculator,
  Sliders,
  DollarSign,
  TrendingUp,
  Percent,
  Layers,
  Sparkles,
  Loader2,
  HelpCircle,
  BarChart3,
  CheckCircle2,
  Info
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend
} from 'recharts';

interface DCFValuationViewProps {
  ticker: string;
  defaultPrice?: number;
}

export const DCFValuationView: React.FC<DCFValuationViewProps> = ({ ticker, defaultPrice = 128.5 }) => {
  const [currentPrice, setCurrentPrice] = useState<number>(defaultPrice);
  const [sharesOutstanding, setSharesOutstanding] = useState<number>(24500); // M
  const [currentRevenue, setCurrentRevenue] = useState<number>(120800); // $M
  const [currentFCF, setCurrentFCF] = useState<number>(58200); // $M
  const [wacc, setWacc] = useState<number>(9.5); // %
  const [terminalGrowth, setTerminalGrowth] = useState<number>(2.5); // %
  const [exitMultiple, setExitMultiple] = useState<number>(22.0); // x
  const [growthRate1, setGrowthRate1] = useState<number>(25); // %
  const [growthRate2, setGrowthRate2] = useState<number>(20); // %
  const [growthRate3, setGrowthRate3] = useState<number>(16); // %
  const [growthRate4, setGrowthRate4] = useState<number>(12); // %
  const [growthRate5, setGrowthRate5] = useState<number>(10); // %
  const [loading, setLoading] = useState<boolean>(false);
  const [dcfResult, setDcfResult] = useState<DCFModelResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    handleRunDCF();
  }, [ticker]);

  const handleRunDCF = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/valuation/dcf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker,
          currentPrice,
          sharesOutstanding,
          currentRevenue,
          currentFCF,
          wacc: wacc / 100,
          terminalGrowthRate: terminalGrowth / 100,
          exitMultiple,
          forecastYears: 5,
          revenueGrowthRates: [
            growthRate1 / 100,
            growthRate2 / 100,
            growthRate3 / 100,
            growthRate4 / 100,
            growthRate5 / 100
          ],
          fcfMargins: [0.48, 0.49, 0.49, 0.50, 0.50],
          netDebt: -15000 // Net cash
        })
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'DCF Valuation failed');
      }

      setDcfResult(data.data);
    } catch (err: any) {
      setError(err.message || 'DCF calculation error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Banner */}
      <div className="terminal-card rounded-2xl p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <Calculator className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                Discounted Cash Flow (DCF) Valuation Workbench
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  Dual-Terminal Method
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                Institutional 5-Year Unlevered Free Cash Flow Model with Gordon Growth & Exit Multiple Sensitivity Matrix
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleRunDCF}
              disabled={loading}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white shadow-lg shadow-purple-500/20 flex items-center gap-2 transition-all"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Recalculate DCF Model
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid: Parameters & Sliders (Left) + DCF Output & Chart (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Controls Column */}
        <div className="terminal-card rounded-2xl p-6 space-y-5 text-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <Sliders className="h-4 w-4 text-purple-400" />
              Valuation Assumptions
            </h3>
            <span className="text-slate-500 font-mono">${ticker}</span>
          </div>

          {/* WACC Slider */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-slate-300">
              <span className="font-semibold">Discount Rate (WACC):</span>
              <span className="font-mono font-bold text-purple-400">{wacc.toFixed(1)}%</span>
            </div>
            <input
              type="range"
              min="5"
              max="16"
              step="0.1"
              value={wacc}
              onChange={(e) => setWacc(parseFloat(e.target.value))}
              className="w-full accent-purple-500 bg-slate-800 h-1.5 rounded-lg cursor-pointer"
            />
            <span className="text-[10px] text-slate-500 block">Weighted average cost of capital</span>
          </div>

          {/* Perpetual Terminal Growth */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-slate-300">
              <span className="font-semibold">Terminal Growth Rate (g):</span>
              <span className="font-mono font-bold text-purple-400">{terminalGrowth.toFixed(1)}%</span>
            </div>
            <input
              type="range"
              min="1.0"
              max="4.5"
              step="0.1"
              value={terminalGrowth}
              onChange={(e) => setTerminalGrowth(parseFloat(e.target.value))}
              className="w-full accent-purple-500 bg-slate-800 h-1.5 rounded-lg cursor-pointer"
            />
            <span className="text-[10px] text-slate-500 block">Long-term GDP perpetual growth proxy</span>
          </div>

          {/* Exit Multiple */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-slate-300">
              <span className="font-semibold">Exit FCF/EBITDA Multiple:</span>
              <span className="font-mono font-bold text-purple-400">{exitMultiple.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min="8"
              max="40"
              step="0.5"
              value={exitMultiple}
              onChange={(e) => setExitMultiple(parseFloat(e.target.value))}
              className="w-full accent-purple-500 bg-slate-800 h-1.5 rounded-lg cursor-pointer"
            />
          </div>

          {/* Forecast Growth Rates */}
          <div className="pt-3 border-t border-slate-800 space-y-3">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              5-Year Revenue Growth Step-Down:
            </span>
            <div className="grid grid-cols-5 gap-2 text-center font-mono">
              <div>
                <span className="text-[10px] text-slate-500 block">Y1</span>
                <input
                  type="number"
                  value={growthRate1}
                  onChange={(e) => setGrowthRate1(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-1 text-center font-bold text-white text-xs"
                />
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block">Y2</span>
                <input
                  type="number"
                  value={growthRate2}
                  onChange={(e) => setGrowthRate2(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-1 text-center font-bold text-white text-xs"
                />
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block">Y3</span>
                <input
                  type="number"
                  value={growthRate3}
                  onChange={(e) => setGrowthRate3(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-1 text-center font-bold text-white text-xs"
                />
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block">Y4</span>
                <input
                  type="number"
                  value={growthRate4}
                  onChange={(e) => setGrowthRate4(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-1 text-center font-bold text-white text-xs"
                />
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block">Y5</span>
                <input
                  type="number"
                  value={growthRate5}
                  onChange={(e) => setGrowthRate5(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-1 text-center font-bold text-white text-xs"
                />
              </div>
            </div>
          </div>

          {/* Base Numbers */}
          <div className="pt-3 border-t border-slate-800 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Current Base Revenue:</span>
              <span className="font-mono font-bold text-white">${currentRevenue.toLocaleString()}M</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Current Base FCF:</span>
              <span className="font-mono font-bold text-white">${currentFCF.toLocaleString()}M</span>
            </div>
          </div>
        </div>

        {/* Results & Fair Value Comparison (Right 2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          {error && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
              {error}
            </div>
          )}

          {dcfResult && (
            <>
              {/* Fair Value Scorecard */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="terminal-card rounded-2xl p-5 border-emerald-500/30">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                    Blended DCF Fair Value
                  </span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-3xl font-black font-mono text-emerald-400">
                      ${dcfResult.blendedFairValue.toFixed(2)}
                    </span>
                    <span className="text-xs text-slate-400">/ share</span>
                  </div>
                  <div className="mt-2 text-xs">
                    <span className={`font-mono font-bold ${dcfResult.upsideDownsidePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {dcfResult.upsideDownsidePct >= 0 ? '+' : ''}{dcfResult.upsideDownsidePct.toFixed(1)}% Implied Upside
                    </span>
                  </div>
                </div>

                <div className="terminal-card rounded-2xl p-5">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                    Gordon Growth Method
                  </span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-2xl font-black font-mono text-white">
                      ${dcfResult.fairValuePerShareGordon.toFixed(2)}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 block mt-1">Perpetual growth rate: {terminalGrowth}%</span>
                </div>

                <div className="terminal-card rounded-2xl p-5">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                    Exit Multiple Method
                  </span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-2xl font-black font-mono text-white">
                      ${dcfResult.fairValuePerShareMultiple.toFixed(2)}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 block mt-1">Exit Multiple: {exitMultiple}x FCF</span>
                </div>
              </div>

              {/* 5-Year Projected Cash Flow Bar Chart */}
              <div className="terminal-card rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-purple-400" />
                    Projected Free Cash Flow & Present Value ($M)
                  </h3>
                </div>

                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dcfResult.forecast} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis dataKey="year" stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                      <YAxis stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }}
                        itemStyle={{ color: '#f8fafc' }}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                      <Bar dataKey="projectedFCF" name="Nominal FCF ($M)" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="pvOfFCF" name="Discounted PV of FCF ($M)" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Valuation Sensitivity Matrix Table */}
              <div className="terminal-card rounded-2xl p-6">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-3">
                  WACC vs Perpetual Growth Sensitivity Table ($/share)
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-center text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                        <th className="py-2 text-left">WACC \ g</th>
                        <th className="py-2">2.0% Growth</th>
                        <th className="py-2">2.5% Growth (Base)</th>
                        <th className="py-2">3.0% Growth</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {dcfResult.sensitivityMatrix.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-900/40">
                          <td className="py-2.5 text-left font-bold text-purple-400">{row.wacc}</td>
                          <td className="py-2.5 text-slate-300">${typeof row['g2.0'] === 'number' ? row['g2.0'].toFixed(2) : row['g2.0']}</td>
                          <td className="py-2.5 font-bold text-emerald-400 bg-emerald-500/5">
                            ${typeof row['g2.5'] === 'number' ? row['g2.5'].toFixed(2) : row['g2.5']}
                          </td>
                          <td className="py-2.5 text-slate-300">${typeof row['g3.0'] === 'number' ? row['g3.0'].toFixed(2) : row['g3.0']}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* AI Valuation Commentary */}
              <div className="terminal-card rounded-2xl p-6 border-purple-500/30">
                <h3 className="text-xs font-bold uppercase tracking-wider text-purple-400 mb-2">
                  Valuation Commentary & Verdict
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
                  {dcfResult.commentary}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
