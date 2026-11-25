import { useMemo, useState } from 'react';
import { Globe, Search } from 'lucide-react';
import { Project, StatusDefinition, TaskItem } from '../types';
import {
  SearchGroundingResult,
  searchMarketGrounding,
} from '../services/searchGrounding';
import {
  STATUS_CATEGORY_LABELS,
  formatShortDate,
  getStatusColorMeta,
} from '../utils/statusStyles';
import { SearchGroundingResultPanel } from './SearchGroundingBlock';
import { StatusIcon } from './StatusIcon';

interface AnalyticsViewProps {
  statuses: StatusDefinition[];
  tasks: TaskItem[];
  projects: Project[];
  onOpenStatusPipeline: () => void;
}

export function AnalyticsView({
  statuses,
  tasks,
  projects,
  onOpenStatusPipeline,
}: AnalyticsViewProps) {
  const sortedStatuses = [...statuses].sort((a, b) => a.order - b.order);
  const statusMap = new Map(sortedStatuses.map((s) => [s.id, s]));

  const totalItems = tasks.length;
  const doneItems = tasks.filter(
    (t) => statusMap.get(t.statusId)?.category === 'done'
  ).length;
  const inFlightItems = tasks.filter((t) => {
    const cat = statusMap.get(t.statusId)?.category;
    return cat === 'active' || cat === 'review';
  }).length;
  const aiExperiencedCount = tasks.filter((t) =>
    /^yes/i.test(t.designedAiProduct.trim())
  ).length;
  const completionPct = totalItems === 0 ? 0 : Math.round((doneItems / totalItems) * 100);

  const [marketQuery, setMarketQuery] = useState('');
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [marketResult, setMarketResult] = useState<SearchGroundingResult | null>(null);

  const poolContext = useMemo(() => {
    const locationCounts = new Map<string, number>();
    let gulfReady = 0;
    let immediateCount = 0;

    for (const t of tasks) {
      const loc = t.currentLocation.trim() || 'Unspecified';
      locationCounts.set(loc, (locationCounts.get(loc) ?? 0) + 1);
      if (/(dubai|gulf)/i.test(t.readyToRelocateIn)) gulfReady += 1;
      if (/^immediate$/i.test(t.noticePeriod.trim())) immediateCount += 1;
    }

    const topLocations = Array.from(locationCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([loc, cnt]) => `${loc}: ${cnt}`)
      .join(', ');

    return `Total candidates: ${totalItems}; AI product experienced: ${aiExperiencedCount}; Immediate joiners: ${immediateCount}; Dubai/Gulf relocation open: ${gulfReady}; Top locations: ${topLocations}`;
  }, [tasks, totalItems, aiExperiencedCount]);

  const runMarketSearch = async (queryText: string) => {
    const clean = queryText.trim();
    if (!clean || marketLoading) return;
    setMarketQuery(clean);
    setMarketError(null);
    setMarketLoading(true);
    try {
      const res = await searchMarketGrounding({
        query: clean,
        poolContext,
      });
      setMarketResult(res);
    } catch (err) {
      setMarketError(
        err instanceof Error ? err.message : 'Unable to fetch grounded market research.'
      );
    } finally {
      setMarketLoading(false);
    }
  };

  const marketPresets = [
    '2026 UX & AI Product Designer salary ranges in Bengaluru and Delhi NCR by years of experience',
    'Current Dubai & UAE hiring demand, relocation packages, and compensation benchmarks for Senior Product Designers in 2026',
    'Top portfolio evaluation criteria and interview trends for AI-native Product Designers in 2026',
  ];

  return (
    <div className="h-full overflow-y-auto px-4 sm:px-8 py-8">
      <div className="max-w-5xl mx-auto space-y-8 pb-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-black/[0.08] dark:border-white/[0.10] pb-6">
          <div>
            <h1 className="text-2xl sm:text-[28px] font-display font-bold tracking-[-0.025em] text-[#1D1D1F] dark:text-[#F5F5F7]">
              Status Flow Analytics
            </h1>
            <p className="mt-1.5 text-sm text-[#6E6E73] dark:text-[#A1A1A6]">
              Live stage distribution and candidate readiness computed from your arranged status pipeline.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenStatusPipeline}
            className="h-9 px-4 rounded-[10px] border border-black/[0.10] dark:border-white/[0.14] bg-white dark:bg-[#1C1C1E] text-xs font-medium text-[#1D1D1F] dark:text-[#F5F5F7] hover:bg-[#F5F5F7] dark:hover:bg-[#2C2C2E] transition-colors whitespace-nowrap shrink-0"
          >
            Adjust Status Pipeline
          </button>
        </div>

        {/* 4-Column Summary Strip */}
        <section aria-label="Workspace totals" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl border border-black/[0.08] dark:border-white/[0.10] bg-white dark:bg-[#1C1C1E] shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
            <div className="text-xs text-[#6E6E73] dark:text-[#A1A1A6]">Total Candidates</div>
            <div className="mt-2 text-3xl font-display font-bold font-mono tabular-nums tracking-[-0.02em] text-[#1D1D1F] dark:text-[#F5F5F7]">
              {totalItems}
            </div>
            <div className="mt-1 text-xs text-[#86868B] font-mono tabular-nums">
              {projects.length} active roles
            </div>
          </div>

          <div className="p-5 rounded-2xl border border-black/[0.08] dark:border-white/[0.10] bg-white dark:bg-[#1C1C1E] shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
            <div className="text-xs text-[#6E6E73] dark:text-[#A1A1A6]">In Active Review</div>
            <div className="mt-2 text-3xl font-display font-bold font-mono tabular-nums tracking-[-0.02em] text-[#0071E3] dark:text-[#2997FF]">
              {inFlightItems}
            </div>
            <div className="mt-1 text-xs text-[#86868B]">
              Interviews &amp; assessments
            </div>
          </div>

          <div className="p-5 rounded-2xl border border-black/[0.08] dark:border-white/[0.10] bg-white dark:bg-[#1C1C1E] shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
            <div className="text-xs text-[#6E6E73] dark:text-[#A1A1A6]">AI Product Experience</div>
            <div className="mt-2 text-3xl font-display font-bold font-mono tabular-nums tracking-[-0.02em] text-[#8944AB] dark:text-[#BF5AF2]">
              {aiExperiencedCount}
            </div>
            <div className="mt-1 text-xs text-[#86868B] font-mono tabular-nums">
              {totalItems === 0 ? 0 : Math.round((aiExperiencedCount / totalItems) * 100)}% of pool
            </div>
          </div>

          <div className="p-5 rounded-2xl border border-black/[0.08] dark:border-white/[0.10] bg-white dark:bg-[#1C1C1E] shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
            <div className="text-xs text-[#6E6E73] dark:text-[#A1A1A6]">Selected / Offer Rate</div>
            <div className="mt-2 text-3xl font-display font-bold font-mono tabular-nums tracking-[-0.02em] text-[#1E7F34] dark:text-[#30D158]">
              {completionPct}%
            </div>
            <div className="mt-1 text-xs text-[#86868B] font-mono tabular-nums">
              {doneItems} of {totalItems} completed
            </div>
          </div>
        </section>

        {/* Distribution Across Arranged Statuses */}
        <section aria-label="Distribution by arranged status" className="space-y-3">
          <h2 className="text-[15px] font-display font-semibold tracking-[-0.01em] text-[#1D1D1F] dark:text-[#F5F5F7]">
            Distribution by Arranged Status Order
          </h2>

          <div className="rounded-2xl border border-black/[0.08] dark:border-white/[0.10] bg-white dark:bg-[#1C1C1E] divide-y divide-black/[0.06] dark:divide-white/[0.08] shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
            {sortedStatuses.map((status, idx) => {
              const statusTasks = tasks.filter((t) => t.statusId === status.id);
              const count = statusTasks.length;
              const sharePct = totalItems === 0 ? 0 : Math.round((count / totalItems) * 100);
              const isOverWip = status.wipLimit !== null && count > status.wipLimit;
              const { barClass } = getStatusColorMeta(status.color);

              return (
                <div key={status.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="sm:w-64 flex items-center gap-2.5 shrink-0">
                    <span className="text-xs font-mono tabular-nums text-[#86868B] w-5">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <StatusIcon category={status.category} color={status.color} className="w-4 h-4" />
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-[#1D1D1F] dark:text-[#F5F5F7] truncate">
                        {status.name}
                      </div>
                      <div className="text-xs text-[#86868B]">
                        {STATUS_CATEGORY_LABELS[status.category]}
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 flex items-center gap-3">
                    <div className="flex-1 h-2 rounded-full bg-black/[0.06] dark:bg-white/[0.10] overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${barClass}`}
                        style={{ width: `${sharePct}%` }}
                      />
                    </div>
                    <span className="w-10 text-right text-xs font-mono tabular-nums text-[#6E6E73] dark:text-[#A1A1A6]">
                      {sharePct}%
                    </span>
                  </div>

                  <div className="sm:w-44 flex items-center justify-end gap-4 text-xs font-mono tabular-nums shrink-0">
                    <span
                      className={
                        isOverWip
                          ? 'text-[#D70015] dark:text-[#FF453A] font-semibold'
                          : 'text-[#1D1D1F] dark:text-[#E5E5EA]'
                      }
                    >
                      {count} {count === 1 ? 'row' : 'rows'}
                      {status.wipLimit !== null ? ` / ${status.wipLimit} cap` : ''}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Role Breakdown Table */}
        <section aria-label="Role status matrix" className="space-y-3">
          <h2 className="text-[15px] font-display font-semibold tracking-[-0.01em] text-[#1D1D1F] dark:text-[#F5F5F7]">
            Role / Track Breakdown Matrix
          </h2>

          <div className="rounded-2xl border border-black/[0.08] dark:border-white/[0.10] bg-white dark:bg-[#1C1C1E] overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[680px]">
                <thead>
                  <tr className="border-b border-black/[0.08] dark:border-white/[0.10] bg-[#FBFBFD] dark:bg-white/[0.03] text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]">
                    <th className="px-4 py-3">Role / Track</th>
                    <th className="px-3 py-3 text-right">Target Date</th>
                    <th className="px-3 py-3 text-right">Backlog</th>
                    <th className="px-3 py-3 text-right">In-Flight</th>
                    <th className="px-3 py-3 text-right">On Hold</th>
                    <th className="px-3 py-3 text-right">Completed</th>
                    <th className="px-4 py-3 text-right">Completion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.06] dark:divide-white/[0.08] text-sm">
                  {projects.map((project) => {
                    const projTasks = tasks.filter((t) => t.projectId === project.id);
                    const backlog = projTasks.filter(
                      (t) => statusMap.get(t.statusId)?.category === 'backlog'
                    ).length;
                    const active = projTasks.filter((t) => {
                      const cat = statusMap.get(t.statusId)?.category;
                      return cat === 'active' || cat === 'review';
                    }).length;
                    const blocked = projTasks.filter(
                      (t) => statusMap.get(t.statusId)?.category === 'blocked'
                    ).length;
                    const done = projTasks.filter(
                      (t) => statusMap.get(t.statusId)?.category === 'done'
                    ).length;
                    const pct =
                      projTasks.length === 0
                        ? 0
                        : Math.round((done / projTasks.length) * 100);

                    return (
                      <tr key={project.id} className="h-12">
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-[#1D1D1F] dark:text-[#F5F5F7]">
                            {project.name}
                          </div>
                          <div className="text-xs text-[#86868B]">
                            {project.key} · {projTasks.length} candidates
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs tabular-nums text-[#6E6E73] dark:text-[#A1A1A6]">
                          {formatShortDate(project.targetDate)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs tabular-nums text-[#1D1D1F] dark:text-[#E5E5EA]">
                          {backlog}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs tabular-nums text-[#0071E3] dark:text-[#2997FF] font-medium">
                          {active}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs tabular-nums text-[#D70015] dark:text-[#FF453A] font-medium">
                          {blocked}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs tabular-nums text-[#1E7F34] dark:text-[#30D158] font-medium">
                          {done}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-[#1D1D1F] dark:text-[#F5F5F7] font-semibold">
                          {pct}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Live Google Search Market Research */}
        <section aria-label="Live Google Search Market Research" className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-[15px] font-display font-semibold tracking-[-0.01em] text-[#1D1D1F] dark:text-[#F5F5F7] flex items-center gap-2">
                <Globe className="w-4 h-4 text-[#0071E3] dark:text-[#2997FF]" />
                <span>Live Recruiting Market Grounding</span>
              </h2>
              <p className="text-xs text-[#6E6E73] dark:text-[#A1A1A6] mt-0.5">
                Query up-to-date salary bands, relocation demand, and AI design hiring trends grounded with Google Search.
              </p>
            </div>
            <span className="text-[11px] font-mono text-[#86868B] shrink-0">
              Gemini 4 Hydrogen · Google Search
            </span>
          </div>

          <div className="rounded-2xl border border-black/[0.08] dark:border-white/[0.10] bg-white dark:bg-[#1C1C1E] p-5 space-y-4 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
            <div className="flex flex-wrap gap-2">
              {marketPresets.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  disabled={marketLoading}
                  onClick={() => void runMarketSearch(preset)}
                  className="px-3 py-1.5 rounded-lg border border-black/[0.08] dark:border-white/[0.10] bg-[#F5F5F7] dark:bg-[#2C2C2E] hover:border-[#0071E3] dark:hover:border-[#0A84FF] text-xs text-[#1D1D1F] dark:text-[#E5E5EA] text-left transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  <Search className="w-3 h-3 text-[#0071E3] dark:text-[#2997FF] shrink-0" />
                  <span>{preset}</span>
                </button>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void runMarketSearch(marketQuery);
              }}
              className="flex flex-col sm:flex-row gap-2"
            >
              <input
                type="text"
                value={marketQuery}
                onChange={(e) => setMarketQuery(e.target.value)}
                placeholder="Ask a live recruiting market question (e.g., notice period buyout norms in India for senior UX designers)..."
                aria-label="Live recruiting market query"
                className="flex-1 h-10 px-3.5 text-sm rounded-[10px] border border-black/[0.10] dark:border-white/[0.12] bg-[#F5F5F7] dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7] placeholder:text-[#86868B] focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
              />
              <button
                type="submit"
                disabled={marketLoading || !marketQuery.trim()}
                className="h-10 px-4 rounded-[10px] bg-[#0071E3] hover:bg-[#0077ED] dark:bg-[#0A84FF] dark:hover:bg-[#2997FF] disabled:opacity-45 text-xs font-medium text-white inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
              >
                <Globe className="w-3.5 h-3.5" />
                <span>Search Web Data</span>
              </button>
            </form>

            <SearchGroundingResultPanel
              result={marketResult}
              loading={marketLoading}
              error={marketError}
              emptyHint="Select a benchmark prompt above or enter a query to fetch cited Google Search market data tailored to your candidate pool."
            />
          </div>
        </section>
      </div>
    </div>
  );
}
