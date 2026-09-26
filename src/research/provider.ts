import type { AnalyzeOutput } from "../api/analyze.js";
import type { AnalystReport, ResearchEvidence, ResearchSourceStatus } from "./report.js";

export interface AnalystReportContext {
  analysis: AnalyzeOutput;
  research: {
    asOf: string;
    sentiment: number;
    evidence: ResearchEvidence[];
    sources: ResearchSourceStatus[];
  };
}

export interface AnalystReportProvider {
  generateReport(context: AnalystReportContext): Promise<AnalystReport>;
}
