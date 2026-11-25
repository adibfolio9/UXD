import { Fragment, ReactNode } from 'react';
import { ExternalLink, Globe, Loader2, Search } from 'lucide-react';
import { SearchGroundingResult } from '../services/searchGrounding';

interface SearchGroundingResultPanelProps {
  result: SearchGroundingResult | null;
  loading: boolean;
  error: string | null;
  emptyHint?: string;
}

function renderInlineBold(text: string): ReactNode[] {
  const segments = text.split(/(\*\*[^*]+\*\*)/g);
  return segments.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={idx} className="font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <Fragment key={idx}>{part}</Fragment>;
  });
}

function FormattedGroundingText({ text }: { text: string }) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    <div className="space-y-2 text-[13px] leading-relaxed text-[#3A3A3C] dark:text-[#D1D1D6]">
      {lines.map((line, index) => {
        if (/^#{1,3}\s+/.test(line)) {
          const heading = line.replace(/^#{1,3}\s+/, '');
          return (
            <div
              key={index}
              className="pt-1 font-display font-semibold text-[13px] text-[#1D1D1F] dark:text-[#F5F5F7]"
            >
              {renderInlineBold(heading)}
            </div>
          );
        }

        if (/^[-*•]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
          const clean = line.replace(/^([-*•]|\d+\.)\s+/, '');
          return (
            <div key={index} className="flex items-start gap-2">
              <span
                aria-hidden="true"
                className="w-1.5 h-1.5 rounded-full bg-[#0071E3] dark:bg-[#2997FF] mt-2 shrink-0"
              />
              <p className="flex-1 min-w-0">{renderInlineBold(clean)}</p>
            </div>
          );
        }

        return <p key={index}>{renderInlineBold(line)}</p>;
      })}
    </div>
  );
}

export function SearchGroundingResultPanel({
  result,
  loading,
  error,
  emptyHint,
}: SearchGroundingResultPanelProps) {
  if (loading) {
    return (
      <div className="p-4 rounded-xl border border-[#0071E3]/20 dark:border-[#0A84FF]/25 bg-[#0071E3]/[0.04] dark:bg-[#0A84FF]/[0.08] flex items-center gap-2.5 text-xs text-[#0071E3] dark:text-[#2997FF]">
        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
        <span>Searching live Google Search data via Gemini 4 Hydrogen...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="p-3.5 rounded-xl bg-[#FF3B30]/[0.08] dark:bg-[#FF453A]/[0.12] border border-[#FF3B30]/20 text-xs text-[#D70015] dark:text-[#FF453A]"
      >
        {error}
      </div>
    );
  }

  if (!result) {
    return emptyHint ? (
      <p className="text-xs text-[#86868B] leading-relaxed">{emptyHint}</p>
    ) : null;
  }

  return (
    <div className="rounded-xl border border-black/[0.08] dark:border-white/[0.10] bg-[#FBFBFD] dark:bg-[#2C2C2E]/45 p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-black/[0.06] dark:border-white/[0.08]">
        <div className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#0071E3] dark:text-[#2997FF]">
          <Globe className="w-3.5 h-3.5" />
          <span>Google Search Grounded</span>
        </div>
        <span className="font-mono text-[11px] text-[#86868B]">
          {result.model} · {new Date(result.groundedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      <FormattedGroundingText text={result.answer} />

      {result.searchQueries.length > 0 && (
        <div className="pt-2 border-t border-black/[0.06] dark:border-white/[0.08] space-y-1.5">
          <div className="text-[11px] font-medium text-[#86868B] flex items-center gap-1.5">
            <Search className="w-3 h-3" />
            <span>Search queries</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {result.searchQueries.map((q) => (
              <span
                key={q}
                className="px-2 py-0.5 rounded-md bg-black/[0.04] dark:bg-white/[0.07] text-[11px] text-[#6E6E73] dark:text-[#A1A1A6]"
              >
                {q}
              </span>
            ))}
          </div>
        </div>
      )}

      {result.sources.length > 0 && (
        <div className="pt-2 border-t border-black/[0.06] dark:border-white/[0.08] space-y-2">
          <div className="text-[11px] font-medium text-[#6E6E73] dark:text-[#A1A1A6]">
            Web Sources ({result.sources.length})
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {result.sources.map((src) => (
              <a
                key={src.uri}
                href={src.uri}
                target="_blank"
                rel="noopener noreferrer"
                className="group p-2.5 rounded-lg border border-black/[0.07] dark:border-white/[0.09] bg-white dark:bg-[#1C1C1E] hover:border-[#0071E3] dark:hover:border-[#0A84FF] transition-colors flex items-start justify-between gap-2 min-w-0"
              >
                <div className="min-w-0">
                  <div className="text-xs font-medium text-[#1D1D1F] dark:text-[#F5F5F7] group-hover:text-[#0071E3] dark:group-hover:text-[#2997FF] truncate">
                    {src.title}
                  </div>
                  <div className="text-[11px] font-mono text-[#86868B] truncate mt-0.5">
                    {src.domain}
                  </div>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-[#86868B] group-hover:text-[#0071E3] dark:group-hover:text-[#2997FF] shrink-0 mt-0.5" />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
