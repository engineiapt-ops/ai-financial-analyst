import React from 'react';
import { TickerAnalysis } from '../types';
import {
  TrendingUp,
  ShieldCheck,
  Award,
  AlertTriangle,
  Target,
  BarChart3,
  Layers,
  CheckCircle2,
  XCircle,
  Zap,
  Info,
  ChevronRight,
  TrendingDown,
  Scale
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  LineChart,
  Line,
  CartesianGrid,
  PieChart,
  Pie,
  Cell
} from 'recharts';

interface TickerAnalysisViewProps {
  data: TickerAnalysis;
  onOpenDCFWithCurrent: () => void;
  onOpenBriefing: () => void;
  onOpenMemo: () => void;
}

const COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4'];

export const TickerAnalysisView: React.FC<TickerAnalysisViewProps> = ({
  data,
  onOpenDCFWithCurrent,
  onOpenBriefing,
  onOpenMemo
}) => {
  const verdictColors: Record<string, { bg: string; text: string; border: string }> = {
    'Strong Buy': { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/40' },
    'Buy': { bg: 'bg-teal-500/15', text: 'text-teal-400', border: 'border-teal-500/40' },
    'Hold': { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/40' },
    'Underperform': { bg: 'bg-orange-500/15', text: 'text-orange-400', border: 'border-orange-500/40' },
    'Sell': { bg: 'bg-rose-500/15', text: 'text-rose-400', border: 'border-rose-500/40' }
  };

  const vColor = verdictColors[data.valuationVerdict] || verdictColors['Buy'];

  // Calculate Upside % to Base Target
  const baseUpside = data.currentPrice > 0
    ? (((data.targetPrice12M.base - data.currentPrice) / data.currentPrice) * 100).toFixed(1)
    : '0';

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Header Card */}
      <div className="terminal-card rounded-2xl p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-3xl font-black text-white font-mono tracking-tight">${data.ticker}</span>
              <h1 className="text-xl font-bold text-slate-200">{data.companyName}</h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                {data.sector} • {data.industry}
              </span>
            </div>

            <p className="mt-2 text-xs text-slate-400 max-w-3xl leading-relaxed">
              {data.executiveSummary}
            </p>
          </div>

          <div className="flex items-center gap-4 bg-slate-950/80 p-4 rounded-xl border border-slate-800 shrink-0">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">Current Price</span>
              <span className="text-2xl font-black font-mono text-white">
                ${data.currentPrice.toFixed(2)}
              </span>
            </div>

            <div className="h-10 w-px bg-slate-800" />

            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">12M Target (Base)</span>
              <div className="flex items-center gap-1.5">
                <span className="text-2xl font-black font-mono text-emerald-400">
                  ${data.targetPrice12M.base.toFixed(2)}
                </span>
                <span className={`text-xs font-bold font-mono ${Number(baseUpside) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  ({Number(baseUpside) >= 0 ? '+' : ''}{baseUpside}%)
                </span>
              </div>
            </div>

            <div className="h-10 w-px bg-slate-800" />

            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">Recommendation</span>
              <span className={`inline-block px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wider ${vColor.bg} ${vColor.text} ${vColor.border} border`}>
                {data.valuationVerdict}
              </span>
            </div>
          </div>
        </div>

        {/* Quick KPI Ribbon */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mt-6 pt-6 border-t border-slate-800/80 text-xs">
          <div className="bg-slate-900/50 p-2.5 rounded-lg border border-slate-800">
            <span className="text-slate-500 text-[10px] font-semibold block uppercase">Market Cap</span>
            <span className="text-white font-mono font-bold text-sm">{data.marketCap}</span>
          </div>
          <div className="bg-slate-900/50 p-2.5 rounded-lg border border-slate-800">
            <span className="text-slate-500 text-[10px] font-semibold block uppercase">Trailing P/E</span>
            <span className="text-white font-mono font-bold text-sm">{data.peRatio.toFixed(1)}x</span>
          </div>
          <div className="bg-slate-900/50 p-2.5 rounded-lg border border-slate-800">
            <span className="text-slate-500 text-[10px] font-semibold block uppercase">Forward P/E</span>
            <span className="text-white font-mono font-bold text-sm">{data.forwardPE.toFixed(1)}x</span>
          </div>
          <div className="bg-slate-900/50 p-2.5 rounded-lg border border-slate-800">
            <span className="text-slate-500 text-[10px] font-semibold block uppercase">PEG Ratio</span>
            <span className="text-white font-mono font-bold text-sm">{data.pegRatio.toFixed(2)}</span>
          </div>
          <div className="bg-slate-900/50 p-2.5 rounded-lg border border-slate-800">
            <span className="text-slate-500 text-[10px] font-semibold block uppercase">EV / EBITDA</span>
            <span className="text-white font-mono font-bold text-sm">{data.evToEbitda.toFixed(1)}x</span>
          </div>
          <div className="bg-slate-900/50 p-2.5 rounded-lg border border-slate-800">
            <span className="text-slate-500 text-[10px] font-semibold block uppercase">Price / Sales</span>
            <span className="text-white font-mono font-bold text-sm">{data.priceToSales.toFixed(1)}x</span>
          </div>
          <div className="bg-slate-900/50 p-2.5 rounded-lg border border-slate-800">
            <span className="text-slate-500 text-[10px] font-semibold block uppercase">Moat Rating</span>
            <span className="text-emerald-400 font-mono font-bold text-sm">{data.moatRating} Moat</span>
          </div>
          <div className="bg-slate-900/50 p-2.5 rounded-lg border border-slate-800">
            <span className="text-slate-500 text-[10px] font-semibold block uppercase">Health Score</span>
            <span className="text-teal-400 font-mono font-bold text-sm">{data.financialHealthScore}/100</span>
          </div>
        </div>
      </div>

      {/* 2-Column Section: Historical Growth & DuPont Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Financial Trajectory Chart (2 cols) */}
        <div className="lg:col-span-2 terminal-card rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-emerald-400" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Multi-Year Financial Trajectory ($B)</h2>
            </div>
            <span className="text-[11px] text-slate-400 font-medium">Revenue, Net Income & Free Cash Flow</span>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.historicalPerformance} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="year" stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }}
                  itemStyle={{ color: '#f8fafc' }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                <Bar dataKey="revenue" name="Revenue ($B)" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="netIncome" name="Net Income ($B)" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="fcf" name="Free Cash Flow ($B)" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* DuPont ROE Decomposition (1 col) */}
        <div className="terminal-card rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Scale className="h-4 w-4 text-teal-400" />
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">DuPont ROE Analysis</h2>
              </div>
              <span className="text-[10px] uppercase font-bold text-slate-400">3-Step Model</span>
            </div>

            <div className="text-center py-4 bg-slate-950/60 rounded-xl border border-slate-800/80 mb-4">
              <span className="text-xs font-semibold text-slate-400 block uppercase">Return On Equity (ROE)</span>
              <span className="text-3xl font-black font-mono text-emerald-400">
                {data.dupontAnalysis.roe.toFixed(1)}%
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                <div className="flex justify-between items-center text-slate-400 mb-1">
                  <span>1. Net Profit Margin</span>
                  <span className="font-mono font-bold text-white">{data.dupontAnalysis.netProfitMargin.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-emerald-400 h-full rounded-full" style={{ width: `${Math.min(100, data.dupontAnalysis.netProfitMargin * 2)}%` }} />
                </div>
                <span className="text-[10px] text-slate-500 mt-1 block">Operating efficiency & pricing power</span>
              </div>

              <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                <div className="flex justify-between items-center text-slate-400 mb-1">
                  <span>2. Asset Turnover</span>
                  <span className="font-mono font-bold text-white">{data.dupontAnalysis.assetTurnover.toFixed(2)}x</span>
                </div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-blue-400 h-full rounded-full" style={{ width: `${Math.min(100, data.dupontAnalysis.assetTurnover * 50)}%` }} />
                </div>
                <span className="text-[10px] text-slate-500 mt-1 block">Asset utilization and revenue generation</span>
              </div>

              <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                <div className="flex justify-between items-center text-slate-400 mb-1">
                  <span>3. Financial Leverage</span>
                  <span className="font-mono font-bold text-white">{data.dupontAnalysis.financialLeverage.toFixed(2)}x</span>
                </div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-purple-400 h-full rounded-full" style={{ width: `${Math.min(100, data.dupontAnalysis.financialLeverage * 20)}%` }} />
                </div>
                <span className="text-[10px] text-slate-500 mt-1 block">Equity multiplier & capital structure</span>
              </div>
            </div>
          </div>

          <p className="text-[10px] text-slate-500 mt-4 border-t border-slate-800/80 pt-3">
            Formula: ROE = Net Margin × Asset Turnover × Financial Leverage Multiplier
          </p>
        </div>
      </div>

      {/* Segment Revenue Breakdown & Key Financial Ratios */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Segment Breakdown */}
        <div className="terminal-card rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-cyan-400" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Business Segment Revenue Mix</h2>
            </div>
          </div>

          <div className="space-y-3 text-xs">
            {data.segmentBreakdown.map((seg, idx) => (
              <div key={idx} className="p-3.5 bg-slate-950/60 rounded-xl border border-slate-800/80">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                    <span className="font-semibold text-white">{seg.segment}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-white">{seg.revenuePct.toFixed(1)}% Mix</span>
                    <span className={`font-mono text-[11px] font-semibold ${seg.growthRate >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {seg.growthRate >= 0 ? '+' : ''}{seg.growthRate.toFixed(1)}% YoY
                    </span>
                  </div>
                </div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mb-2">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${seg.revenuePct}%`,
                      backgroundColor: COLORS[idx % COLORS.length]
                    }}
                  />
                </div>
                <p className="text-[11px] text-slate-400">{seg.details}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Key Margins & Balance Sheet Ratios */}
        <div className="terminal-card rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Financial Health & Solvency Matrix</h2>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
              <span className="text-slate-400 block text-[10px] uppercase font-semibold">Gross Profit Margin</span>
              <span className="text-lg font-mono font-black text-white">{data.keyRatios.grossMargin.toFixed(1)}%</span>
              <span className="text-[10px] text-slate-500 block mt-0.5">Top-line pricing power</span>
            </div>

            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
              <span className="text-slate-400 block text-[10px] uppercase font-semibold">Operating Margin</span>
              <span className="text-lg font-mono font-black text-white">{data.keyRatios.operatingMargin.toFixed(1)}%</span>
              <span className="text-[10px] text-slate-500 block mt-0.5">Core business efficiency</span>
            </div>

            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
              <span className="text-slate-400 block text-[10px] uppercase font-semibold">Free Cash Flow Yield</span>
              <span className="text-lg font-mono font-black text-emerald-400">{data.keyRatios.freeCashFlowYield.toFixed(2)}%</span>
              <span className="text-[10px] text-slate-500 block mt-0.5">Cash generated per dollar of equity</span>
            </div>

            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
              <span className="text-slate-400 block text-[10px] uppercase font-semibold">Current Ratio</span>
              <span className="text-lg font-mono font-black text-cyan-400">{data.keyRatios.currentRatio.toFixed(2)}x</span>
              <span className="text-[10px] text-slate-500 block mt-0.5">Short-term liquidity buffer</span>
            </div>

            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
              <span className="text-slate-400 block text-[10px] uppercase font-semibold">Debt to Equity</span>
              <span className="text-lg font-mono font-black text-white">{data.keyRatios.debtToEquity.toFixed(2)}x</span>
              <span className="text-[10px] text-slate-500 block mt-0.5">Financial leverage profile</span>
            </div>

            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
              <span className="text-slate-400 block text-[10px] uppercase font-semibold">Interest Coverage</span>
              <span className="text-lg font-mono font-black text-teal-400">{data.keyRatios.interestCoverage.toFixed(1)}x</span>
              <span className="text-[10px] text-slate-500 block mt-0.5">EBIT over interest expense</span>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-800/80 flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Model custom DCF valuation on {data.ticker}?</span>
            <button
              onClick={onOpenDCFWithCurrent}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white shadow-sm inline-flex items-center gap-1.5 transition-colors"
            >
              Launch DCF Workbench
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* SWOT & Catalysts Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
        <div className="terminal-card rounded-xl p-4 border-emerald-500/30">
          <div className="flex items-center gap-2 mb-3 text-emerald-400 font-bold uppercase tracking-wider">
            <CheckCircle2 className="h-4 w-4" />
            Strengths & Moats
          </div>
          <ul className="space-y-2 text-slate-300">
            {data.swot.strengths.map((s, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="text-emerald-400 font-bold">•</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="terminal-card rounded-xl p-4 border-rose-500/30">
          <div className="flex items-center gap-2 mb-3 text-rose-400 font-bold uppercase tracking-wider">
            <XCircle className="h-4 w-4" />
            Weaknesses & Bottlenecks
          </div>
          <ul className="space-y-2 text-slate-300">
            {data.swot.weaknesses.map((w, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="text-rose-400 font-bold">•</span>
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="terminal-card rounded-xl p-4 border-cyan-500/30">
          <div className="flex items-center gap-2 mb-3 text-cyan-400 font-bold uppercase tracking-wider">
            <Zap className="h-4 w-4" />
            Growth Opportunities
          </div>
          <ul className="space-y-2 text-slate-300">
            {data.swot.opportunities.map((o, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="text-cyan-400 font-bold">•</span>
                <span>{o}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="terminal-card rounded-xl p-4 border-amber-500/30">
          <div className="flex items-center gap-2 mb-3 text-amber-400 font-bold uppercase tracking-wider">
            <AlertTriangle className="h-4 w-4" />
            Threats & Risks
          </div>
          <ul className="space-y-2 text-slate-300">
            {data.swot.threats.map((t, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="text-amber-400 font-bold">•</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};
