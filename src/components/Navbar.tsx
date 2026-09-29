import React, { useState } from 'react';
import {
  TrendingUp,
  FileSpreadsheet,
  Calculator,
  PieChart,
  Globe,
  Search,
  Volume2,
  FileText,
  Sparkles,
  Bot,
  Layers,
  ArrowUpRight
} from 'lucide-react';

interface NavbarProps {
  activeTab: 'ticker' | 'ledger' | 'dcf' | 'portfolio' | 'market';
  setActiveTab: (tab: 'ticker' | 'ledger' | 'dcf' | 'portfolio' | 'market') => void;
  selectedTicker: string;
  onSearchTicker: (ticker: string) => void;
  isLoading: boolean;
  onOpenAudioBriefing: () => void;
  onOpenResearchMemo: () => void;
  onToggleCopilot: () => void;
  isCopilotOpen: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  selectedTicker,
  onSearchTicker,
  isLoading,
  onOpenAudioBriefing,
  onOpenResearchMemo,
  onToggleCopilot,
  isCopilotOpen
}) => {
  const [searchInput, setSearchInput] = useState('');

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      onSearchTicker(searchInput.trim().toUpperCase());
      setSearchInput('');
    }
  };

  const popularTickers = ['NVDA', 'AAPL', 'MSFT', 'TSLA', 'GOOGL', 'AMZN'];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Logo & Platform Name */}
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-emerald-500 via-teal-400 to-cyan-500 p-0.5 shadow-lg shadow-emerald-500/20">
              <div className="h-full w-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-emerald-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold tracking-tight text-white text-lg">AI Financial Analyst</span>
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  INSTITUTIONAL v2.5
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium hidden md:block">Autonomous Financial Intelligence & Valuation Terminal</p>
            </div>
          </div>

          {/* Search Ticker Bar */}
          <form onSubmit={handleSearchSubmit} className="relative hidden md:flex items-center max-w-xs w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search ticker (e.g., NVDA, AAPL, AMZN)..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              disabled={isLoading}
              className="w-full bg-slate-900/90 border border-slate-800 rounded-lg pl-9 pr-12 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-all mono-num uppercase"
            />
            <button
              type="submit"
              disabled={isLoading || !searchInput.trim()}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white transition-colors"
            >
              Analyze
            </button>
          </form>

          {/* Action CTAs: Audio Briefing, Research Memo, Copilot */}
          <div className="flex items-center gap-2">
            <button
              onClick={onOpenAudioBriefing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 border border-slate-700/80 hover:border-emerald-500/50 hover:bg-slate-800 text-slate-200 hover:text-emerald-300 transition-all shadow-sm"
              title="Generate Executive Voice Briefing (TTS)"
            >
              <Volume2 className="h-3.5 w-3.5 text-emerald-400 animate-pulse" />
              <span className="hidden sm:inline">Audio Briefing</span>
            </button>

            <button
              onClick={onOpenResearchMemo}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 border border-slate-700/80 hover:border-cyan-500/50 hover:bg-slate-800 text-slate-200 hover:text-cyan-300 transition-all shadow-sm"
              title="Generate Institutional Research Memo & PDF"
            >
              <FileText className="h-3.5 w-3.5 text-cyan-400" />
              <span className="hidden sm:inline">Research Memo</span>
            </button>

            <button
              onClick={onToggleCopilot}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-sm ${
                isCopilotOpen
                  ? 'bg-emerald-500 text-slate-950 font-bold shadow-emerald-500/20'
                  : 'bg-gradient-to-r from-emerald-600/20 to-teal-600/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30'
              }`}
            >
              <Bot className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">AI Co-Pilot</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs & Quick Stock Pills */}
        <div className="flex items-center justify-between overflow-x-auto py-2 border-t border-slate-800/40 gap-4 no-scrollbar text-xs">
          <nav className="flex items-center space-x-1 sm:space-x-2 shrink-0">
            <button
              onClick={() => setActiveTab('ticker')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                activeTab === 'ticker'
                  ? 'bg-slate-800 text-white font-semibold border border-slate-700 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
              <span>Equity Research ({selectedTicker})</span>
            </button>

            <button
              onClick={() => setActiveTab('ledger')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                activeTab === 'ledger'
                  ? 'bg-slate-800 text-white font-semibold border border-slate-700 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-blue-400" />
              <span>Forensic Ledger Auditor</span>
            </button>

            <button
              onClick={() => setActiveTab('dcf')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                activeTab === 'dcf'
                  ? 'bg-slate-800 text-white font-semibold border border-slate-700 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <Calculator className="h-3.5 w-3.5 text-purple-400" />
              <span>DCF Valuation Workbench</span>
            </button>

            <button
              onClick={() => setActiveTab('portfolio')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                activeTab === 'portfolio'
                  ? 'bg-slate-800 text-white font-semibold border border-slate-700 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <PieChart className="h-3.5 w-3.5 text-amber-400" />
              <span>Portfolio Stress Testing</span>
            </button>

            <button
              onClick={() => setActiveTab('market')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                activeTab === 'market'
                  ? 'bg-slate-800 text-white font-semibold border border-slate-700 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <Globe className="h-3.5 w-3.5 text-teal-400" />
              <span>Macro Pulse</span>
            </button>
          </nav>

          {/* Quick Stock Selector Pills */}
          <div className="flex items-center gap-1 shrink-0 text-slate-400">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider hidden lg:inline mr-1">Quick Analyze:</span>
            {popularTickers.map((t) => (
              <button
                key={t}
                onClick={() => {
                  onSearchTicker(t);
                  setActiveTab('ticker');
                }}
                className={`px-2 py-1 rounded text-[11px] font-mono font-medium transition-all ${
                  selectedTicker === t
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
                }`}
              >
                ${t}
              </button>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
};
