import { apiFetch } from '../utils/apiFetch.js';
import React, { useState } from 'react';
import { X, FileText, Download, Loader2, Sparkles, CheckCircle2, Copy } from 'lucide-react';
import jsPDF from 'jspdf';

interface ResearchMemoModalProps {
  isOpen: boolean;
  onClose: () => void;
  ticker: string;
  companyName: string;
}

export const ResearchMemoModal: React.FC<ResearchMemoModalProps> = ({
  isOpen,
  onClose,
  ticker,
  companyName
}) => {
  const [loading, setLoading] = useState(false);
  const [memoText, setMemoText] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerateMemo = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/research/memo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker,
          companyName,
          focusAreas: ['Competitive Moat', 'Valuation & Multiples', 'Segment Acceleration', 'Risk Matrix']
        })
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to generate institutional memo');
      }

      setMemoText(data.memoMarkdown);
    } catch (err: any) {
      setError(err.message || 'Generation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(memoText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportPDF = () => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(15, 23, 42);
    doc.text(`INSTITUTIONAL EQUITY RESEARCH: ${ticker.toUpperCase()}`, 14, 20);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`Company: ${companyName} | Date: ${new Date().toLocaleDateString()} | Rating: Overweight`, 14, 28);
    doc.line(14, 32, 196, 32);

    doc.setFontSize(9);
    doc.setTextColor(30, 41, 59);
    
    // Split text into printable lines
    const splitLines = doc.splitTextToSize(memoText.replace(/[#*`_]/g, ''), 180);
    let cursorY = 40;

    for (let i = 0; i < splitLines.length; i++) {
      if (cursorY > 280) {
        doc.addPage();
        cursorY = 20;
      }
      doc.text(splitLines[i], 14, cursorY);
      cursorY += 5;
    }

    doc.save(`${ticker}_Equity_Research_Memo.pdf`);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/80">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Institutional Equity Research Memorandum
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  Search Grounded
                </span>
              </h3>
              <p className="text-xs text-slate-400">Wall Street Tier-1 Initiating Coverage for {companyName} (${ticker})</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 overflow-y-auto space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
              {error}
            </div>
          )}

          {!memoText && !loading && (
            <div className="py-16 text-center space-y-4">
              <div className="h-14 w-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center mx-auto">
                <FileText className="h-7 w-7" />
              </div>
              <div className="max-w-md mx-auto">
                <h4 className="text-sm font-bold text-white">Generate Full Institutional Research Report</h4>
                <p className="text-xs text-slate-400 mt-1">
                  Drafts an exhaustive 5-page Wall Street style equity research report covering Moats, Segment Financials, Catalysts, Risks, and Price Targets.
                </p>
              </div>
              <button
                onClick={handleGenerateMemo}
                className="px-6 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-slate-950 shadow-lg shadow-cyan-500/20 transition-all inline-flex items-center gap-2"
              >
                <Sparkles className="h-4 w-4" />
                Draft Research Memo Now
              </button>
            </div>
          )}

          {loading && (
            <div className="py-20 text-center space-y-3">
              <Loader2 className="h-8 w-8 text-cyan-400 animate-spin mx-auto" />
              <p className="text-sm font-semibold text-white">Compiling Wall Street Initiating Coverage Report...</p>
              <p className="text-xs text-slate-400">Grounding with live 10-K filings, consensus estimates, and macroeconomic data.</p>
            </div>
          )}

          {memoText && !loading && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400">Drafted Research Note:</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                  >
                    {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? 'Copied' : 'Copy Markdown'}
                  </button>
                  <button
                    onClick={handleExportPDF}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white shadow-sm transition-colors"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download PDF
                  </button>
                </div>
              </div>

              <div className="p-5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 font-sans leading-relaxed whitespace-pre-wrap select-text selection:bg-cyan-500/30">
                {memoText}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/40 flex items-center justify-between text-xs text-slate-500">
          <span>AI Equity Research Engine</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
