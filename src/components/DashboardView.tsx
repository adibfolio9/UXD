import { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Download,
  ExternalLink,
  FileText,
  FolderKanban,
  ListTodo,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { PriorityLevel, Project, StatusDefinition, TaskItem, ViewMode } from '../types';
import {
  PRIORITY_LABELS,
  PRIORITY_TEXT_CLASSES,
  extractExternalUrl,
  getStatusColorMeta,
} from '../utils/statusStyles';
import { CandidateAvatar } from './CandidateAvatar';
import { ResumePreviewModal } from './ResumePreviewModal';
import { StatusIcon } from './StatusIcon';

interface DashboardViewProps {
  statuses: StatusDefinition[];
  tasks: TaskItem[];
  projects: Project[];
  onMoveTask: (taskId: string, targetStatusId: string) => void;
  onSelectTask: (taskId: string) => void;
  onNavigateView: (view: ViewMode) => void;
  onExportExcel: () => void;
}

type SegmentKey =
  | 'all'
  | 'immediate_ai'
  | 'senior_plus'
  | 'gulf_ready'
  | 'complete_docs';

type DrillFilter =
  | { type: 'experience'; value: string; label: string }
  | { type: 'ai'; value: string; label: string }
  | { type: 'notice'; value: string; label: string }
  | { type: 'priority'; value: PriorityLevel; label: string }
  | { type: 'location'; value: string; label: string }
  | { type: 'status'; value: string; label: string }
  | { type: 'relocation'; value: string; label: string }
  | null;

const SEGMENTS: { id: SegmentKey; label: string }[] = [
  { id: 'all', label: 'All Pool' },
  { id: 'immediate_ai', label: 'Immediate + AI Launched' },
  { id: 'senior_plus', label: 'Senior (6+ Yrs)' },
  { id: 'gulf_ready', label: 'Dubai / Gulf Ready' },
  { id: 'complete_docs', label: 'Portfolio & Resume' },
];

const EXPERIENCE_ORDER = [
  '0-2 years',
  '3–5 years',
  '6–8 years',
  '9–10 years',
  '11+ years',
];

const AI_ORDER = [
  'Yes, launched',
  'Yes, designed but not launched',
  'Only prototypes or concepts',
  'No',
];

const NOTICE_ORDER = [
  'Immediate',
  '15 days',
  '30 days',
  '60 days',
  '90 days or more',
];

function normalizeLocation(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return 'Not specified';
  if (/^delhi ncr/i.test(trimmed)) return 'Delhi NCR (Gurugram, Noida)';
  return trimmed;
}

function normalizeExperience(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return 'Unspecified';
  return trimmed.replace('-', '–').replace('0–2', '0-2');
}

function isSeniorExperience(exp: string): boolean {
  const trimmed = exp.trim();
  return trimmed.startsWith('6') || trimmed.startsWith('9') || trimmed.startsWith('11+');
}

function parseTimestampToDayKey(raw: string): { key: string; label: string; sortMs: number } | null {
  const match = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return null;
  const [, m, d, y] = match;
  const monthNum = Number(m);
  const dayNum = Number(d);
  const yearNum = Number(y);
  const dateObj = new Date(yearNum, monthNum - 1, dayNum);
  if (Number.isNaN(dateObj.getTime())) return null;
  const key = `${yearNum}-${String(monthNum).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
  const label = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return { key, label, sortMs: dateObj.getTime() };
}

export function DashboardView({
  statuses,
  tasks,
  projects,
  onMoveTask,
  onSelectTask,
  onNavigateView,
  onExportExcel,
}: DashboardViewProps) {
  const [segment, setSegment] = useState<SegmentKey>('all');
  const [drillFilter, setDrillFilter] = useState<DrillFilter>(null);
  const [hoveredDayKey, setHoveredDayKey] = useState<string | null>(null);
  const [resumePreviewTask, setResumePreviewTask] = useState<TaskItem | null>(null);

  const sortedStatuses = useMemo(
    () => [...statuses].sort((a, b) => a.order - b.order),
    [statuses]
  );
  const statusMap = useMemo(
    () => new Map(sortedStatuses.map((s) => [s.id, s])),
    [sortedStatuses]
  );
  const projectMap = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects]
  );

  // Step 1: Segment slice
  const segmentedTasks = useMemo(() => {
    if (segment === 'all') return tasks;
    return tasks.filter((t) => {
      switch (segment) {
        case 'immediate_ai':
          return (
            t.noticePeriod.trim().toLowerCase() === 'immediate' &&
            t.designedAiProduct.trim().toLowerCase().startsWith('yes, launched')
          );
        case 'senior_plus':
          return isSeniorExperience(t.yearsOfExperience);
        case 'gulf_ready':
          return /(dubai|gulf)/i.test(t.readyToRelocateIn);
        case 'complete_docs':
          return (
            extractExternalUrl(t.portfolioUrl) !== null &&
            extractExternalUrl(t.resumeUrl) !== null
          );
        default:
          return true;
      }
    });
  }, [tasks, segment]);

  // Step 2: Optional click-to-drill filter
  const activeTasks = useMemo(() => {
    if (!drillFilter) return segmentedTasks;
    return segmentedTasks.filter((t) => {
      switch (drillFilter.type) {
        case 'experience':
          return normalizeExperience(t.yearsOfExperience) === drillFilter.value;
        case 'ai':
          return (t.designedAiProduct.trim() || 'Unspecified') === drillFilter.value;
        case 'notice':
          return (t.noticePeriod.trim() || 'Unspecified') === drillFilter.value;
        case 'priority':
          return t.priority === drillFilter.value;
        case 'location':
          return normalizeLocation(t.currentLocation) === drillFilter.value;
        case 'status':
          return t.statusId === drillFilter.value;
        case 'relocation': {
          const val = t.readyToRelocateIn.trim();
          if (drillFilter.value === 'Not specified') return val.length === 0;
          return val.toLowerCase().includes(drillFilter.value.toLowerCase());
        }
        default:
          return true;
      }
    });
  }, [segmentedTasks, drillFilter]);

  const metrics = useMemo(() => {
    const total = segmentedTasks.length;
    const immediateCount = segmentedTasks.filter(
      (t) => t.noticePeriod.trim().toLowerCase() === 'immediate'
    ).length;
    const launchedAiCount = segmentedTasks.filter((t) =>
      t.designedAiProduct.trim().toLowerCase().startsWith('yes, launched')
    ).length;
    const anyAiCount = segmentedTasks.filter((t) =>
      /^yes/i.test(t.designedAiProduct.trim())
    ).length;
    const inReviewOrDone = segmentedTasks.filter((t) => {
      const cat = statusMap.get(t.statusId)?.category;
      return cat === 'active' || cat === 'review' || cat === 'done';
    }).length;
    const doneCount = segmentedTasks.filter(
      (t) => statusMap.get(t.statusId)?.category === 'done'
    ).length;
    const portfolioCount = segmentedTasks.filter(
      (t) => extractExternalUrl(t.portfolioUrl) !== null
    ).length;
    const resumeCount = segmentedTasks.filter(
      (t) => extractExternalUrl(t.resumeUrl) !== null
    ).length;
    const messageCount = segmentedTasks.filter((t) => {
      const msg = t.message.trim();
      return msg.length > 0 && msg !== '-' && !/^n\/?a$/i.test(msg);
    }).length;

    // Experience counts
    const expMap = new Map<string, number>();
    for (const t of segmentedTasks) {
      const k = normalizeExperience(t.yearsOfExperience);
      expMap.set(k, (expMap.get(k) ?? 0) + 1);
    }
    const experienceRows = [
      ...EXPERIENCE_ORDER.map((label) => ({ label, count: expMap.get(label) ?? 0 })),
      ...[...expMap.entries()]
        .filter(([label]) => !EXPERIENCE_ORDER.includes(label))
        .map(([label, count]) => ({ label, count })),
    ];

    // AI readiness counts
    const aiMap = new Map<string, number>();
    for (const t of segmentedTasks) {
      const k = t.designedAiProduct.trim() || 'Unspecified';
      aiMap.set(k, (aiMap.get(k) ?? 0) + 1);
    }
    const aiRows = [
      ...AI_ORDER.map((label) => ({ label, count: aiMap.get(label) ?? 0 })),
      ...[...aiMap.entries()]
        .filter(([label]) => !AI_ORDER.includes(label))
        .map(([label, count]) => ({ label, count })),
    ];

    // Notice period counts
    const noticeMap = new Map<string, number>();
    for (const t of segmentedTasks) {
      const k = t.noticePeriod.trim() || 'Unspecified';
      noticeMap.set(k, (noticeMap.get(k) ?? 0) + 1);
    }
    const noticeRows = [
      ...NOTICE_ORDER.map((label) => ({ label, count: noticeMap.get(label) ?? 0 })),
      ...[...noticeMap.entries()]
        .filter(([label]) => !NOTICE_ORDER.includes(label))
        .map(([label, count]) => ({ label, count })),
    ];

    // Priority counts
    const priorityOrder: PriorityLevel[] = ['urgent', 'high', 'medium', 'low'];
    const priorityRows = priorityOrder.map((level) => ({
      level,
      label: PRIORITY_LABELS[level],
      count: segmentedTasks.filter((t) => t.priority === level).length,
    }));

    // Location counts
    const locMap = new Map<string, number>();
    for (const t of segmentedTasks) {
      const k = normalizeLocation(t.currentLocation);
      locMap.set(k, (locMap.get(k) ?? 0) + 1);
    }
    const locationRows = [...locMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 7)
      .map(([label, count]) => ({ label, count }));

    // Relocation destinations (candidates may select multiple)
    const relocationRows = [
      {
        label: 'Any Indian Cities',
        count: segmentedTasks.filter((t) =>
          t.readyToRelocateIn.toLowerCase().includes('indian cities')
        ).length,
      },
      {
        label: 'Dubai',
        count: segmentedTasks.filter((t) =>
          t.readyToRelocateIn.toLowerCase().includes('dubai')
        ).length,
      },
      {
        label: 'Other Gulf Countries',
        count: segmentedTasks.filter((t) =>
          t.readyToRelocateIn.toLowerCase().includes('gulf')
        ).length,
      },
      {
        label: 'Not specified',
        count: segmentedTasks.filter((t) => t.readyToRelocateIn.trim().length === 0).length,
      },
    ];

    // Daily submission timeline
    const dayMap = new Map<string, { key: string; label: string; sortMs: number; count: number }>();
    for (const t of segmentedTasks) {
      const parsed = parseTimestampToDayKey(t.timestamp);
      if (!parsed) continue;
      const existing = dayMap.get(parsed.key);
      if (existing) {
        existing.count += 1;
      } else {
        dayMap.set(parsed.key, { ...parsed, count: 1 });
      }
    }
    const timelineDays = [...dayMap.values()].sort((a, b) => a.sortMs - b.sortMs);
    const maxDayCount = Math.max(1, ...timelineDays.map((d) => d.count));
    const peakDay = timelineDays.reduce<(typeof timelineDays)[number] | null>(
      (best, cur) => (!best || cur.count > best.count ? cur : best),
      null
    );

    return {
      total,
      immediateCount,
      launchedAiCount,
      anyAiCount,
      inReviewOrDone,
      doneCount,
      portfolioCount,
      resumeCount,
      messageCount,
      experienceRows,
      aiRows,
      noticeRows,
      priorityRows,
      locationRows,
      relocationRows,
      timelineDays,
      maxDayCount,
      peakDay,
    };
  }, [segmentedTasks, statusMap]);

  const pct = (part: number, whole: number) =>
    whole === 0 ? 0 : Math.round((part / whole) * 100);

  const toggleDrill = (next: NonNullable<DrillFilter>) => {
    setDrillFilter((prev) =>
      prev && prev.type === next.type && prev.value === next.value ? null : next
    );
  };

  const previewTasks = useMemo(() => activeTasks.slice(0, 15), [activeTasks]);

  const activeHoveredDay =
    metrics.timelineDays.find((d) => d.key === hoveredDayKey) ?? metrics.peakDay;

  return (
    <div className="h-full overflow-y-auto px-4 sm:px-8 py-7">
      <div className="max-w-6xl mx-auto space-y-6 pb-10">
        {/* Page Header & Primary Actions */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-black/[0.08] dark:border-white/[0.10] pb-5">
          <div>
            <h1 className="text-2xl sm:text-[28px] font-display font-bold tracking-[-0.025em] text-[#1D1D1F] dark:text-[#F5F5F7]">
              Candidate Metrics Dashboard
            </h1>
            <p className="mt-1 text-sm text-[#6E6E73] dark:text-[#A1A1A6]">
              Live overview across{' '}
              <span className="font-mono tabular-nums font-medium text-[#1D1D1F] dark:text-[#F5F5F7]">
                {tasks.length}
              </span>{' '}
              candidate records · click any metric bar to filter the snapshot below.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onNavigateView('list')}
              className="h-9 px-3.5 rounded-[10px] border border-black/[0.10] dark:border-white/[0.14] bg-white dark:bg-[#1C1C1E] text-xs font-medium text-[#1D1D1F] dark:text-[#F5F5F7] hover:bg-[#F5F5F7] dark:hover:bg-[#2C2C2E] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <ListTodo className="w-3.5 h-3.5 text-[#6E6E73] dark:text-[#A1A1A6]" />
              <span>Open Table</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigateView('board')}
              className="h-9 px-3.5 rounded-[10px] border border-black/[0.10] dark:border-white/[0.14] bg-white dark:bg-[#1C1C1E] text-xs font-medium text-[#1D1D1F] dark:text-[#F5F5F7] hover:bg-[#F5F5F7] dark:hover:bg-[#2C2C2E] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <FolderKanban className="w-3.5 h-3.5 text-[#6E6E73] dark:text-[#A1A1A6]" />
              <span>Open Board</span>
            </button>

            <button
              type="button"
              onClick={onExportExcel}
              className="h-9 px-3.5 rounded-[10px] border border-black/[0.10] dark:border-white/[0.14] bg-white dark:bg-[#1C1C1E] text-xs font-medium text-[#1D1D1F] dark:text-[#F5F5F7] hover:bg-[#F5F5F7] dark:hover:bg-[#2C2C2E] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5 text-[#6E6E73] dark:text-[#A1A1A6]" />
              <span>Export Excel</span>
            </button>
          </div>
        </div>

        {/* Segment Filter Tabs + Active Drill Chip */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            role="tablist"
            aria-label="Candidate segments"
            className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl border border-black/[0.08] dark:border-white/[0.10] bg-[#E8E8ED]/60 dark:bg-[#1C1C1E]"
          >
            {SEGMENTS.map((seg) => {
              const isActive = segment === seg.id;
              return (
                <button
                  key={seg.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => {
                    setSegment(seg.id);
                    setDrillFilter(null);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-white dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7] shadow-[0_1px_2px_rgba(0,0,0,0.08)]'
                      : 'text-[#6E6E73] dark:text-[#A1A1A6] hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7]'
                  }`}
                >
                  {seg.label}
                </button>
              );
            })}
          </div>

          {drillFilter && (
            <button
              type="button"
              onClick={() => setDrillFilter(null)}
              className="h-8 px-3 rounded-lg bg-[#0071E3]/10 dark:bg-[#0A84FF]/15 text-[#0071E3] dark:text-[#2997FF] text-xs font-medium inline-flex items-center gap-1.5 hover:bg-[#0071E3]/15 transition-colors"
            >
              <span>Filter: {drillFilter.label}</span>
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* 4-Column Primary KPI Strip */}
        <section aria-label="Primary candidate metrics" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl border border-black/[0.08] dark:border-white/[0.10] bg-white dark:bg-[#1C1C1E] shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
            <div className="text-xs text-[#6E6E73] dark:text-[#A1A1A6]">Candidates in Segment</div>
            <div className="mt-2 text-3xl font-display font-bold font-mono tabular-nums tracking-[-0.02em] text-[#1D1D1F] dark:text-[#F5F5F7]">
              {metrics.total}
            </div>
            <div className="mt-1 text-xs text-[#86868B] font-mono tabular-nums">
              {pct(metrics.total, tasks.length)}% of total · {projects.length} tracks
            </div>
          </div>

          <div className="p-5 rounded-2xl border border-black/[0.08] dark:border-white/[0.10] bg-white dark:bg-[#1C1C1E] shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
            <div className="text-xs text-[#6E6E73] dark:text-[#A1A1A6]">Immediate Joiners</div>
            <div className="mt-2 text-3xl font-display font-bold font-mono tabular-nums tracking-[-0.02em] text-[#1E7F34] dark:text-[#30D158]">
              {metrics.immediateCount}
            </div>
            <div className="mt-1 text-xs text-[#86868B] font-mono tabular-nums">
              {pct(metrics.immediateCount, metrics.total)}% ready immediately
            </div>
          </div>

          <div className="p-5 rounded-2xl border border-black/[0.08] dark:border-white/[0.10] bg-white dark:bg-[#1C1C1E] shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
            <div className="text-xs text-[#6E6E73] dark:text-[#A1A1A6]">Launched AI Products</div>
            <div className="mt-2 text-3xl font-display font-bold font-mono tabular-nums tracking-[-0.02em] text-[#0071E3] dark:text-[#2997FF]">
              {metrics.launchedAiCount}
            </div>
            <div className="mt-1 text-xs text-[#86868B] font-mono tabular-nums">
              {pct(metrics.launchedAiCount, metrics.total)}% launched · {metrics.anyAiCount} total AI
            </div>
          </div>

          <div className="p-5 rounded-2xl border border-black/[0.08] dark:border-white/[0.10] bg-white dark:bg-[#1C1C1E] shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
            <div className="text-xs text-[#6E6E73] dark:text-[#A1A1A6]">Active Pipeline Progress</div>
            <div className="mt-2 text-3xl font-display font-bold font-mono tabular-nums tracking-[-0.02em] text-[#8944AB] dark:text-[#BF5AF2]">
              {metrics.inReviewOrDone}
            </div>
            <div className="mt-1 text-xs text-[#86868B] font-mono tabular-nums">
              {metrics.doneCount} selected · {pct(metrics.doneCount, metrics.total)}% completion
            </div>
          </div>
        </section>

        {/* 2-Column Section 1: Experience & AI Readiness + Notice Period & Priority */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Left: Experience & AI Product Readiness */}
          <section className="p-6 rounded-2xl border border-black/[0.08] dark:border-white/[0.10] bg-white dark:bg-[#1C1C1E] shadow-[0_1px_3px_rgba(0,0,0,0.03)] space-y-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-[15px] font-display font-semibold tracking-[-0.01em] text-[#1D1D1F] dark:text-[#F5F5F7]">
                  Experience Breakdown
                </h2>
                <span className="text-xs font-mono tabular-nums text-[#86868B]">
                  {metrics.total} total
                </span>
              </div>
              <div className="space-y-2">
                {metrics.experienceRows.map((row) => {
                  const share = pct(row.count, metrics.total);
                  const selected =
                    drillFilter?.type === 'experience' && drillFilter.value === row.label;
                  return (
                    <button
                      key={row.label}
                      type="button"
                      onClick={() =>
                        toggleDrill({
                          type: 'experience',
                          value: row.label,
                          label: `Experience: ${row.label}`,
                        })
                      }
                      className={`w-full text-left px-2.5 py-1.5 -mx-2.5 rounded-xl transition-colors ${
                        selected
                          ? 'bg-[#0071E3]/[0.08] dark:bg-[#0A84FF]/[0.14]'
                          : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-medium text-[#1D1D1F] dark:text-[#F5F5F7]">
                          {row.label}
                        </span>
                        <span className="font-mono tabular-nums text-[#6E6E73] dark:text-[#A1A1A6]">
                          {row.count} ({share}%)
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-black/[0.06] dark:bg-white/[0.09] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[#0071E3] dark:bg-[#0A84FF] transition-all duration-300"
                          style={{ width: `${share}%` }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-5 border-t border-black/[0.06] dark:border-white/[0.08] space-y-3">
              <h2 className="text-[15px] font-display font-semibold tracking-[-0.01em] text-[#1D1D1F] dark:text-[#F5F5F7]">
                AI-Powered Product Experience
              </h2>
              <div className="space-y-2">
                {metrics.aiRows.map((row) => {
                  const share = pct(row.count, metrics.total);
                  const selected = drillFilter?.type === 'ai' && drillFilter.value === row.label;
                  return (
                    <button
                      key={row.label}
                      type="button"
                      onClick={() =>
                        toggleDrill({
                          type: 'ai',
                          value: row.label,
                          label: `AI: ${row.label}`,
                        })
                      }
                      className={`w-full text-left px-2.5 py-1.5 -mx-2.5 rounded-xl transition-colors ${
                        selected
                          ? 'bg-[#AF52DE]/[0.10] dark:bg-[#BF5AF2]/[0.15]'
                          : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs mb-1 gap-3">
                        <span className="font-medium text-[#1D1D1F] dark:text-[#F5F5F7] truncate">
                          {row.label}
                        </span>
                        <span className="font-mono tabular-nums text-[#6E6E73] dark:text-[#A1A1A6] shrink-0">
                          {row.count} ({share}%)
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-black/[0.06] dark:bg-white/[0.09] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[#AF52DE] dark:bg-[#BF5AF2] transition-all duration-300"
                          style={{ width: `${share}%` }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Right: Notice Period & Priority Triage */}
          <section className="p-6 rounded-2xl border border-black/[0.08] dark:border-white/[0.10] bg-white dark:bg-[#1C1C1E] shadow-[0_1px_3px_rgba(0,0,0,0.03)] space-y-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-[15px] font-display font-semibold tracking-[-0.01em] text-[#1D1D1F] dark:text-[#F5F5F7]">
                  Notice Period &amp; Availability
                </h2>
                <span className="text-xs text-[#86868B]">Click to filter</span>
              </div>
              <div className="space-y-2">
                {metrics.noticeRows.map((row) => {
                  const share = pct(row.count, metrics.total);
                  const selected =
                    drillFilter?.type === 'notice' && drillFilter.value === row.label;
                  const isImmediate = row.label.toLowerCase() === 'immediate';
                  return (
                    <button
                      key={row.label}
                      type="button"
                      onClick={() =>
                        toggleDrill({
                          type: 'notice',
                          value: row.label,
                          label: `Notice: ${row.label}`,
                        })
                      }
                      className={`w-full text-left px-2.5 py-1.5 -mx-2.5 rounded-xl transition-colors ${
                        selected
                          ? 'bg-[#28CD41]/[0.10] dark:bg-[#30D158]/[0.15]'
                          : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-medium text-[#1D1D1F] dark:text-[#F5F5F7]">
                          {row.label}
                        </span>
                        <span className="font-mono tabular-nums text-[#6E6E73] dark:text-[#A1A1A6]">
                          {row.count} ({share}%)
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-black/[0.06] dark:bg-white/[0.09] overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            isImmediate
                              ? 'bg-[#28CD41] dark:bg-[#30D158]'
                              : 'bg-[#8E8E93]'
                          }`}
                          style={{ width: `${share}%` }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-5 border-t border-black/[0.06] dark:border-white/[0.08] space-y-3">
              <h2 className="text-[15px] font-display font-semibold tracking-[-0.01em] text-[#1D1D1F] dark:text-[#F5F5F7]">
                Triage Priority Tiers
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {metrics.priorityRows.map((row) => {
                  const selected =
                    drillFilter?.type === 'priority' && drillFilter.value === row.level;
                  return (
                    <button
                      key={row.level}
                      type="button"
                      onClick={() =>
                        toggleDrill({
                          type: 'priority',
                          value: row.level,
                          label: `Priority: ${row.label}`,
                        })
                      }
                      className={`p-3 rounded-xl border text-left transition-colors ${
                        selected
                          ? 'border-[#0071E3] dark:border-[#0A84FF] bg-[#0071E3]/[0.06] dark:bg-[#0A84FF]/[0.12]'
                          : 'border-black/[0.07] dark:border-white/[0.09] bg-[#FBFBFD] dark:bg-white/[0.02] hover:bg-[#F5F5F7] dark:hover:bg-white/[0.05]'
                      }`}
                    >
                      <div className={`text-xs ${PRIORITY_TEXT_CLASSES[row.level]}`}>
                        {row.label}
                      </div>
                      <div className="mt-1 text-xl font-display font-bold font-mono tabular-nums text-[#1D1D1F] dark:text-[#F5F5F7]">
                        {row.count}
                      </div>
                      <div className="text-[11px] font-mono tabular-nums text-[#86868B]">
                        {pct(row.count, metrics.total)}%
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        </div>

        {/* 2-Column Section 2: Location & Relocation + Daily Intake & Pipeline */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Left: Top Locations, Relocation Destinations & Profile Completeness */}
          <section className="p-6 rounded-2xl border border-black/[0.08] dark:border-white/[0.10] bg-white dark:bg-[#1C1C1E] shadow-[0_1px_3px_rgba(0,0,0,0.03)] space-y-6">
            <div className="space-y-3">
              <h2 className="text-[15px] font-display font-semibold tracking-[-0.01em] text-[#1D1D1F] dark:text-[#F5F5F7]">
                Top Current Locations
              </h2>
              <div className="divide-y divide-black/[0.05] dark:divide-white/[0.07]">
                {metrics.locationRows.map((row) => {
                  const share = pct(row.count, metrics.total);
                  const selected =
                    drillFilter?.type === 'location' && drillFilter.value === row.label;
                  return (
                    <button
                      key={row.label}
                      type="button"
                      onClick={() =>
                        toggleDrill({
                          type: 'location',
                          value: row.label,
                          label: `Location: ${row.label}`,
                        })
                      }
                      className={`w-full py-2.5 px-2 -mx-2 rounded-lg flex items-center justify-between gap-3 text-left transition-colors ${
                        selected
                          ? 'bg-[#0071E3]/[0.08] dark:bg-[#0A84FF]/[0.14]'
                          : 'hover:bg-black/[0.025] dark:hover:bg-white/[0.04]'
                      }`}
                    >
                      <span className="text-[13px] font-medium text-[#1D1D1F] dark:text-[#F5F5F7] truncate">
                        {row.label}
                      </span>
                      <span className="text-xs font-mono tabular-nums text-[#6E6E73] dark:text-[#A1A1A6] shrink-0">
                        {row.count} · {share}%
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-5 border-t border-black/[0.06] dark:border-white/[0.08] space-y-3">
              <h2 className="text-[15px] font-display font-semibold tracking-[-0.01em] text-[#1D1D1F] dark:text-[#F5F5F7]">
                Relocation Readiness &amp; Profile Links
              </h2>
              <div className="grid grid-cols-2 gap-2.5">
                {metrics.relocationRows.map((row) => {
                  const selected =
                    drillFilter?.type === 'relocation' && drillFilter.value === row.label;
                  return (
                    <button
                      key={row.label}
                      type="button"
                      onClick={() =>
                        toggleDrill({
                          type: 'relocation',
                          value: row.label,
                          label: `Relocate: ${row.label}`,
                        })
                      }
                      className={`p-3 rounded-xl border text-left transition-colors ${
                        selected
                          ? 'border-[#0071E3] dark:border-[#0A84FF] bg-[#0071E3]/[0.06] dark:bg-[#0A84FF]/[0.12]'
                          : 'border-black/[0.07] dark:border-white/[0.09] bg-[#FBFBFD] dark:bg-white/[0.02] hover:bg-[#F5F5F7] dark:hover:bg-white/[0.05]'
                      }`}
                    >
                      <div className="text-xs text-[#6E6E73] dark:text-[#A1A1A6] truncate">
                        {row.label}
                      </div>
                      <div className="mt-1 text-lg font-display font-bold font-mono tabular-nums text-[#1D1D1F] dark:text-[#F5F5F7]">
                        {row.count}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="pt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#6E6E73] dark:text-[#A1A1A6] font-mono tabular-nums">
                <span>Portfolio URLs: {metrics.portfolioCount}</span>
                <span aria-hidden="true">·</span>
                <span>Resumes: {metrics.resumeCount}</span>
                <span aria-hidden="true">·</span>
                <span>Notes / Messages: {metrics.messageCount}</span>
              </div>
            </div>
          </section>

          {/* Right: Daily Application Timeline & Workflow Stages */}
          <section className="p-6 rounded-2xl border border-black/[0.08] dark:border-white/[0.10] bg-white dark:bg-[#1C1C1E] shadow-[0_1px_3px_rgba(0,0,0,0.03)] space-y-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-[15px] font-display font-semibold tracking-[-0.01em] text-[#1D1D1F] dark:text-[#F5F5F7]">
                  Application Intake Over Time
                </h2>
                {activeHoveredDay && (
                  <span className="text-xs font-mono tabular-nums text-[#0071E3] dark:text-[#2997FF]">
                    {activeHoveredDay.label}: {activeHoveredDay.count}{' '}
                    {activeHoveredDay.count === 1 ? 'entry' : 'entries'}
                  </span>
                )}
              </div>

              {metrics.timelineDays.length === 0 ? (
                <div className="h-32 flex items-center justify-center text-xs text-[#86868B] rounded-xl border border-dashed border-black/[0.08] dark:border-white/[0.10]">
                  No dated submissions in this segment.
                </div>
              ) : (
                <div className="space-y-2">
                  <div
                    className="h-32 flex items-end gap-1 pt-2 px-1 rounded-xl bg-[#FBFBFD] dark:bg-white/[0.02] border border-black/[0.05] dark:border-white/[0.06]"
                    role="img"
                    aria-label="Daily candidate submissions bar chart"
                  >
                    {metrics.timelineDays.map((day) => {
                      const heightPct = Math.max(
                        6,
                        Math.round((day.count / metrics.maxDayCount) * 100)
                      );
                      const isPeak = metrics.peakDay?.key === day.key;
                      return (
                        <button
                          key={day.key}
                          type="button"
                          onMouseEnter={() => setHoveredDayKey(day.key)}
                          onFocus={() => setHoveredDayKey(day.key)}
                          title={`${day.label}: ${day.count} submissions`}
                          aria-label={`${day.label}: ${day.count} submissions`}
                          className="flex-1 h-full flex items-end justify-center pb-1.5 group focus:outline-none"
                        >
                          <span
                            className={`w-full max-w-[14px] rounded-t-sm transition-colors ${
                              isPeak || hoveredDayKey === day.key
                                ? 'bg-[#0071E3] dark:bg-[#0A84FF]'
                                : 'bg-[#8E8E93]/45 dark:bg-[#8E8E93]/50 group-hover:bg-[#0071E3]/70 dark:group-hover:bg-[#0A84FF]/70'
                            }`}
                            style={{ height: `${heightPct}%` }}
                          />
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-[#86868B]">
                    <span>{metrics.timelineDays[0]?.label}</span>
                    <span>
                      {metrics.timelineDays.length} active intake days · peak{' '}
                      {metrics.peakDay?.count ?? 0}
                    </span>
                    <span>
                      {metrics.timelineDays[metrics.timelineDays.length - 1]?.label}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-5 border-t border-black/[0.06] dark:border-white/[0.08] space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-[15px] font-display font-semibold tracking-[-0.01em] text-[#1D1D1F] dark:text-[#F5F5F7]">
                  Pipeline Stage Distribution
                </h2>
                <button
                  type="button"
                  onClick={() => onNavigateView('pipeline')}
                  className="text-xs font-medium text-[#0071E3] dark:text-[#2997FF] hover:underline inline-flex items-center gap-1"
                >
                  <SlidersHorizontal className="w-3 h-3" />
                  <span>Arrange</span>
                </button>
              </div>
              <div className="space-y-2">
                {sortedStatuses.map((status) => {
                  const count = segmentedTasks.filter((t) => t.statusId === status.id).length;
                  const share = pct(count, metrics.total);
                  const { barClass } = getStatusColorMeta(status.color);
                  const selected =
                    drillFilter?.type === 'status' && drillFilter.value === status.id;
                  return (
                    <button
                      key={status.id}
                      type="button"
                      onClick={() =>
                        toggleDrill({
                          type: 'status',
                          value: status.id,
                          label: `Stage: ${status.name}`,
                        })
                      }
                      className={`w-full text-left px-2.5 py-1.5 -mx-2.5 rounded-xl transition-colors ${
                        selected
                          ? 'bg-[#0071E3]/[0.08] dark:bg-[#0A84FF]/[0.14]'
                          : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="flex items-center gap-2 font-medium text-[#1D1D1F] dark:text-[#F5F5F7]">
                          <StatusIcon
                            category={status.category}
                            color={status.color}
                            className="w-3.5 h-3.5"
                          />
                          <span>{status.name}</span>
                        </span>
                        <span className="font-mono tabular-nums text-[#6E6E73] dark:text-[#A1A1A6]">
                          {count} ({share}%)
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-black/[0.06] dark:bg-white/[0.09] overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${barClass}`}
                          style={{ width: `${share}%` }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        </div>

        {/* Section 3: Matching Candidates Snapshot Table */}
        <section
          aria-label="Matching candidates snapshot"
          className="rounded-2xl border border-black/[0.08] dark:border-white/[0.10] bg-white dark:bg-[#1C1C1E] overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.03)]"
        >
          <div className="px-5 py-4 border-b border-black/[0.06] dark:border-white/[0.08] flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-display font-semibold tracking-[-0.01em] text-[#1D1D1F] dark:text-[#F5F5F7]">
                Matching Candidates
              </h2>
              <p className="text-xs text-[#86868B] font-mono tabular-nums mt-0.5">
                Showing {previewTasks.length} of {activeTasks.length} matching records · click a row to inspect
              </p>
            </div>

            <button
              type="button"
              onClick={() => onNavigateView('list')}
              className="text-xs font-medium text-[#0071E3] dark:text-[#2997FF] hover:underline inline-flex items-center gap-1"
            >
              <span>View all in List / Table</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {activeTasks.length === 0 ? (
            <div className="p-10 text-center space-y-3">
              <p className="text-sm font-medium text-[#1D1D1F] dark:text-[#F5F5F7]">
                No candidates match this combination of metrics.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSegment('all');
                  setDrillFilter(null);
                }}
                className="h-9 px-4 rounded-[10px] bg-[#0071E3] hover:bg-[#0077ED] dark:bg-[#0A84FF] text-white text-xs font-medium transition-colors"
              >
                Reset Dashboard Filters
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[1180px]">
                <thead>
                  <tr className="border-b border-black/[0.07] dark:border-white/[0.09] bg-[#FBFBFD] dark:bg-white/[0.03] text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]">
                    <th className="px-4 py-2.5 whitespace-nowrap">Status</th>
                    <th className="px-3 py-2.5 whitespace-nowrap">Full Name</th>
                    <th className="px-3 py-2.5 whitespace-nowrap">Portfolio Links</th>
                    <th className="px-3 py-2.5 whitespace-nowrap">Resume View</th>
                    <th className="px-3 py-2.5 whitespace-nowrap">Experience</th>
                    <th className="px-3 py-2.5 whitespace-nowrap">AI Product</th>
                    <th className="px-3 py-2.5 whitespace-nowrap">Notice Period</th>
                    <th className="px-3 py-2.5 whitespace-nowrap">Expected Salary</th>
                    <th className="px-3 py-2.5 whitespace-nowrap">Location</th>
                    <th className="px-4 py-2.5 whitespace-nowrap">Relocate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.05] dark:divide-white/[0.07] text-[13px]">
                  {previewTasks.map((task) => {
                    const proj = projectMap.get(task.projectId);
                    const portfolioHref = extractExternalUrl(task.portfolioUrl);
                    const resumeHref = extractExternalUrl(task.resumeUrl);

                    return (
                      <tr
                        key={task.id}
                        onClick={() => onSelectTask(task.id)}
                        className="h-12 hover:bg-black/[0.025] dark:hover:bg-white/[0.04] cursor-pointer transition-colors"
                      >
                        <td
                          className="px-4 py-2 whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <select
                            value={task.statusId}
                            onChange={(e) => onMoveTask(task.id, e.target.value)}
                            aria-label={`Status for ${task.fullName}`}
                            className="w-40 h-8 px-2.5 text-xs font-medium rounded-lg border border-black/[0.10] dark:border-white/[0.12] bg-white dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7] focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
                          >
                            {sortedStatuses.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <div className="flex items-center gap-2.5">
                            <CandidateAvatar name={task.fullName} size="md" />
                            <div className="min-w-0">
                              <div className="font-semibold text-[#1D1D1F] dark:text-[#F5F5F7] truncate max-w-[190px]">
                                {task.fullName || 'Unnamed Candidate'}
                              </div>
                              <div className="text-[11px] text-[#86868B] font-mono tabular-nums truncate max-w-[190px]">
                                {task.code} · {proj?.key ?? 'ROLE'}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td
                          className="px-3 py-2 text-xs whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {portfolioHref ? (
                            <a
                              href={portfolioHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={task.portfolioUrl}
                              className="text-[#0071E3] dark:text-[#2997FF] hover:underline inline-flex items-center gap-1 max-w-[190px]"
                            >
                              <span className="truncate">
                                {portfolioHref.replace(/^https?:\/\//i, '')}
                              </span>
                              <ExternalLink className="w-3 h-3 shrink-0" />
                            </a>
                          ) : (
                            <span className="text-[#6E6E73] dark:text-[#A1A1A6] truncate max-w-[170px] inline-block">
                              {task.portfolioUrl && task.portfolioUrl !== '-' ? task.portfolioUrl : '—'}
                            </span>
                          )}
                        </td>
                        <td
                          className="px-3 py-2 text-xs whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {resumeHref ? (
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setResumePreviewTask(task)}
                                className="h-7 px-2.5 rounded-lg border border-black/[0.10] dark:border-white/[0.12] bg-[#F5F5F7] dark:bg-[#2C2C2E] hover:bg-[#E8E8ED] dark:hover:bg-[#3A3A3C] text-[#1D1D1F] dark:text-[#F5F5F7] text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                              >
                                <FileText className="w-3.5 h-3.5 text-[#0071E3] dark:text-[#2997FF] shrink-0" />
                                <span>View Resume</span>
                              </button>
                              <a
                                href={resumeHref}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={`Open ${task.fullName} resume in new tab`}
                                title="Open resume in new tab"
                                className="p-1 text-[#6E6E73] dark:text-[#A1A1A6] hover:text-[#0071E3] dark:hover:text-[#2997FF] transition-colors"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            </div>
                          ) : (
                            <span className="text-[#86868B]">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs font-mono tabular-nums text-[#1D1D1F] dark:text-[#E5E5EA] whitespace-nowrap">
                          {task.yearsOfExperience || '—'}
                        </td>
                        <td className="px-3 py-2 text-xs text-[#6E6E73] dark:text-[#A1A1A6] truncate max-w-[160px]">
                          {task.designedAiProduct || '—'}
                        </td>
                        <td className="px-3 py-2 text-xs font-mono tabular-nums text-[#1D1D1F] dark:text-[#E5E5EA] whitespace-nowrap">
                          {task.noticePeriod || '—'}
                        </td>
                        <td className="px-3 py-2 text-xs font-mono tabular-nums text-[#1D1D1F] dark:text-[#F5F5F7] font-medium whitespace-nowrap">
                          {task.expectedSalary || '—'}
                        </td>
                        <td className="px-3 py-2 text-xs text-[#6E6E73] dark:text-[#A1A1A6] truncate max-w-[150px]">
                          {normalizeLocation(task.currentLocation)}
                        </td>
                        <td className="px-4 py-2 text-xs text-[#6E6E73] dark:text-[#A1A1A6] truncate max-w-[170px]">
                          {task.readyToRelocateIn || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <ResumePreviewModal
        task={resumePreviewTask}
        onClose={() => setResumePreviewTask(null)}
      />
    </div>
  );
}
