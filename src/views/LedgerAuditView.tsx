import React, { useState } from 'react';
import { LedgerAuditResult } from '../types';
import { sampleLedgerCSV_SaaS, sampleLedgerCSV_Retail } from '../data/mockLedger';
import {
  FileSpreadsheet,
  AlertOctagon,
  ShieldAlert,
  CheckCircle2,
  Upload,
  RefreshCw,
  Loader2,
  FileCheck,
  TrendingDown,
  DollarSign,
  AlertTriangle,
  FileCode,
  Layers,
  ArrowRight
} from 'lucide-react';
import Papa from 'papaparse';
import { apiFetch } from '../utils/apiFetch';

interface LedgerAuditViewProps {
  onAuditComplete?: (result: LedgerAuditResult) => void;
}

export const LedgerAuditView: React.FC<LedgerAuditViewProps> = ({ onAuditComplete }) => {
  const [csvContent, setCsvContent] = useState<string>(sampleLedgerCSV_SaaS);
  const [loading, setLoading] = useState(false);
  const [auditResult, setAuditResult] = useState<LedgerAuditResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        setCsvContent(text);
      };
      reader.readAsText(file);
    }
  };

  const handleRunAudit = async () => {
    if (!csvContent.trim()) {
      setError('Please provide or upload CSV ledger data');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await apiFetch('/api/analyze/ledger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          csvData: csvContent,
          companyName: 'Audit Target Enterprise',
          currency: 'USD'
        })
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Audit analysis failed');
      }

      setAuditResult(data.data);
      if (onAuditComplete) {
        onAuditComplete(data.data);
      }
    } catch (err: any) {
      setError(err.message || 'Forensic ledger audit failed');
    } finally {
      setLoading(false);
    }
  };

  const severityBadge = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
      case 'HIGH':
        return 'bg-orange-500/20 text-orange-300 border-orange-500/40';
      case 'MEDIUM':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="terminal-card rounded-2xl p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <FileSpreadsheet className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white flex items-center gap-2">
                  Forensic General Ledger & Accounting Auditor
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                    Big 4 Autonomous Agent
                  </span>
                </h1>
                <p className="text-xs text-slate-400">
                  Parses raw transactions, classifies debit/credits, checks trial balances, and pinpoints forensic anomalies & split limits.
                </p>
              </div>
            </div>
          </div>

          {/* Preset Buttons */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium">Load Preset:</span>
            <button
              onClick={() => setCsvContent(sampleLedgerCSV_SaaS)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 transition-colors"
            >
              SaaS Startup (With Red Flags)
            </button>
            <button
              onClick={() => setCsvContent(sampleLedgerCSV_Retail)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 transition-colors"
            >
              Retail Business
            </button>
          </div>
        </div>
      </div>

      {/* CSV Input & Upload Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 terminal-card rounded-2xl p-6 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <FileCode className="h-4 w-4 text-blue-400" />
                Raw Ledger CSV Data
              </label>
              <label className="cursor-pointer inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors">
                <Upload className="h-3 w-3" />
                Upload CSV
                <input type="file" accept=".csv,.txt" onChange={handleFileUpload} className="hidden" />
              </label>
            </div>

            <textarea
              value={csvContent}
              onChange={(e) => setCsvContent(e.target.value)}
              rows={12}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-300 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none leading-relaxed"
              placeholder="Date,Reference,Account,Description,Debit,Credit..."
            />
          </div>

          <div className="mt-4 pt-4 border-t border-slate-800">
            <button
              onClick={handleRunAudit}
              disabled={loading}
              className="w-full py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 transition-all"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Running Forensic Audit AI...
                </>
              ) : (
                <>
                  <FileCheck className="h-4 w-4" />
                  Execute Autonomous Audit
                </>
              )}
            </button>
          </div>
        </div>

        {/* Audit Results Panel */}
        <div className="lg:col-span-2 space-y-6">
          {error && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
              {error}
            </div>
          )}

          {!auditResult && !loading && (
            <div className="terminal-card rounded-2xl p-12 text-center space-y-3">
              <div className="h-12 w-12 rounded-2xl bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center justify-center mx-auto">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-bold text-white">No Audit Executed Yet</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Click "Execute Autonomous Audit" to parse the general ledger, inspect trial balance reconciliation, calculate burn rate, and identify forensic red flags.
              </p>
            </div>
          )}

          {auditResult && (
            <div className="space-y-6 animate-in fade-in">
              {/* Financial Statement Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="terminal-card rounded-xl p-3.5">
                  <span className="text-slate-400 text-[10px] uppercase font-semibold block">Total Revenue</span>
                  <span className="text-lg font-mono font-black text-emerald-400">
                    ${auditResult.summary.totalRevenue.toLocaleString()}
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-0.5">Gross Margin: {auditResult.summary.grossMarginPct.toFixed(1)}%</span>
                </div>

                <div className="terminal-card rounded-xl p-3.5">
                  <span className="text-slate-400 text-[10px] uppercase font-semibold block">Total Expenses</span>
                  <span className="text-lg font-mono font-black text-rose-400">
                    ${auditResult.summary.totalExpenses.toLocaleString()}
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-0.5">OpEx: ${auditResult.summary.operatingExpenses.toLocaleString()}</span>
                </div>

                <div className="terminal-card rounded-xl p-3.5">
                  <span className="text-slate-400 text-[10px] uppercase font-semibold block">Net Income</span>
                  <span className={`text-lg font-mono font-black ${auditResult.summary.netIncome >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    ${auditResult.summary.netIncome.toLocaleString()}
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-0.5">Net Margin: {auditResult.summary.netMarginPct.toFixed(1)}%</span>
                </div>

                <div className="terminal-card rounded-xl p-3.5">
                  <span className="text-slate-400 text-[10px] uppercase font-semibold block">Trial Balance Status</span>
                  <span className={`text-sm font-mono font-bold ${auditResult.summary.isBalanced ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {auditResult.summary.isBalanced ? '✓ Reconciled Clean' : `⚠️ Discrepancy $${auditResult.summary.balanceDiscrepancy}`}
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-0.5">Debits vs Credits Reconciled</span>
                </div>
              </div>

              {/* Auditor Opinion Callout */}
              <div className="terminal-card rounded-2xl p-5 border-blue-500/30">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
                    <FileCheck className="h-4 w-4" />
                    Controller & Audit Partner Opinion
                  </span>
                  <span className="px-2.5 py-0.5 rounded text-[11px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                    {auditResult.controllerAuditOpinion}
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {auditResult.auditExecutiveNotes}
                </p>
              </div>

              {/* Forensic Red Flags & Anomalies Section */}
              <div className="terminal-card rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <AlertOctagon className="h-4 w-4 text-rose-400" />
                    Forensic Anomalies & Red Flags ({auditResult.forensicAnomalies.length})
                  </h3>
                </div>

                <div className="space-y-3 text-xs">
                  {auditResult.forensicAnomalies.map((anom, idx) => (
                    <div key={idx} className="p-3.5 bg-slate-950/70 rounded-xl border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${severityBadge(anom.severity)}`}>
                            {anom.severity}
                          </span>
                          <span className="font-bold text-white">{anom.issue}</span>
                        </div>
                        <span className="font-mono font-bold text-rose-400">
                          Affected: ${anom.affectedAmount.toLocaleString()}
                        </span>
                      </div>

                      <p className="text-slate-300 leading-relaxed text-[11px]">
                        <strong className="text-slate-400">Forensic Logic:</strong> {anom.forensicReasoning}
                      </p>

                      <div className="p-2 rounded bg-slate-900 border border-slate-800 text-[11px] text-emerald-300 flex items-start gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                        <span><strong>Recommended Action:</strong> {anom.recommendation}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Classified Account Breakdown */}
              <div className="terminal-card rounded-2xl p-5">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Layers className="h-4 w-4 text-cyan-400" />
                  Classified Chart of Accounts
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-500 uppercase text-[10px]">
                        <th className="pb-2">Category</th>
                        <th className="pb-2">Account Name</th>
                        <th className="pb-2 text-right">Transactions</th>
                        <th className="pb-2 text-right">Balance Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {auditResult.categorizedAccounts.map((acc, i) => (
                        <tr key={i} className="hover:bg-slate-900/40">
                          <td className="py-2.5 font-sans font-medium text-cyan-400">{acc.category}</td>
                          <td className="py-2.5 font-sans text-slate-200">{acc.accountName}</td>
                          <td className="py-2.5 text-right text-slate-400">{acc.transactionCount}</td>
                          <td className="py-2.5 text-right font-bold text-white">${acc.amount.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
