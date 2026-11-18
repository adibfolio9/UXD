import { Fragment, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Plus,
  Search,
} from 'lucide-react';
import {
  PriorityLevel,
  Project,
  StatusDefinition,
  TaskItem,
} from '../types';
import {
  PRIORITY_LABELS,
  isExternalUrlValue,
  sanitizeExternalUrl,
} from '../utils/statusStyles';
import { StatusIcon } from './StatusIcon';

interface ListViewProps {
  statuses: StatusDefinition[];
  tasks: TaskItem[];
  projects: Project[];
  priorityFilter: PriorityLevel | 'all';
  onPriorityFilterChange: (priority: PriorityLevel | 'all') => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onMoveTask: (taskId: string, targetStatusId: string) => void;
  onBulkMoveTasks: (taskIds: string[], targetStatusId: string) => void;
  onSelectTask: (taskId: string) => void;
  onOpenNewItem: () => void;
  onOpenImportSheet: () => void;
  onExportExcel: () => void;
}

type SortKey = 'timestamp' | 'fullName' | 'yearsOfExperience' | 'expectedSalary' | 'status';

export function ListView({
  statuses,
  tasks,
  projects,
  priorityFilter,
  onPriorityFilterChange,
  searchQuery,
  onSearchChange,
  onMoveTask,
  onBulkMoveTasks,
  onSelectTask,
  onOpenNewItem,
  onOpenImportSheet,
  onExportExcel,
}: ListViewProps) {
  const sortedStatuses = useMemo(
    () => [...statuses].sort((a, b) => a.order - b.order),
    [statuses]
  );
  const statusOrderMap = useMemo(
    () => new Map(sortedStatuses.map((s, idx) => [s.id, idx])),
    [sortedStatuses]
  );
  const projectMap = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects]
  );

  const [groupByStatus, setGroupByStatus] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkTargetStatusId, setBulkTargetStatusId] = useState<string>(
    sortedStatuses[0]?.id ?? ''
  );
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [pageSize, setPageSize] = useState<number>(50);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const resolvedBulkStatusId = sortedStatuses.some((s) => s.id === bulkTargetStatusId)
    ? bulkTargetStatusId
    : sortedStatuses[0]?.id ?? '';

  const taskIdSet = useMemo(() => new Set(tasks.map((t) => t.id)), [tasks]);
  const validSelectedIds = useMemo(
    () => selectedIds.filter((id) => taskIdSet.has(id)),
    [selectedIds, taskIdSet]
  );
  const selectedIdSet = useMemo(() => new Set(validSelectedIds), [validSelectedIds]);

  const handleSort = (key: SortKey) => {
    setCurrentPage(1);
    if (sortKey === key) {
      if (sortDir === 'asc') {
        setSortDir('desc');
      } else {
        setSortKey(null);
      }
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const compareTasks = (a: TaskItem, b: TaskItem, key: SortKey, dir: 'asc' | 'desc') => {
    let cmp = 0;
    if (key === 'status') {
      cmp = (statusOrderMap.get(a.statusId) ?? 0) - (statusOrderMap.get(b.statusId) ?? 0);
    } else if (key === 'yearsOfExperience') {
      const numA = parseFloat(a.yearsOfExperience) || 0;
      const numB = parseFloat(b.yearsOfExperience) || 0;
      cmp = numA - numB || a.yearsOfExperience.localeCompare(b.yearsOfExperience);
    } else {
      cmp = (a[key] || '').localeCompare(b[key] || '', undefined, {
        numeric: true,
        sensitivity: 'base',
      });
    }
    return dir === 'asc' ? cmp : -cmp;
  };

  const orderedTasks = useMemo(() => {
    const copy = [...tasks];
    if (groupByStatus) {
      copy.sort((a, b) => {
        const statusDiff =
          (statusOrderMap.get(a.statusId) ?? 0) - (statusOrderMap.get(b.statusId) ?? 0);
        if (statusDiff !== 0) return statusDiff;
        if (sortKey) return compareTasks(a, b, sortKey, sortDir);
        return a.order - b.order;
      });
      return copy;
    }

    if (sortKey) {
      copy.sort((a, b) => compareTasks(a, b, sortKey, sortDir));
    }
    return copy;
  }, [tasks, groupByStatus, sortKey, sortDir, statusOrderMap]);

  const statusCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of orderedTasks) {
      counts.set(t.statusId, (counts.get(t.statusId) ?? 0) + 1);
    }
    return counts;
  }, [orderedTasks]);

  const effectivePageSize = pageSize === 0 ? Math.max(orderedTasks.length, 1) : pageSize;
  const totalPages = Math.max(1, Math.ceil(orderedTasks.length / effectivePageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * effectivePageSize;
  const endIndex = Math.min(startIndex + effectivePageSize, orderedTasks.length);

  const pageTasks = useMemo(
    () => orderedTasks.slice(startIndex, endIndex),
    [orderedTasks, startIndex, endIndex]
  );

  const allPageSelected =
    pageTasks.length > 0 && pageTasks.every((t) => selectedIdSet.has(t.id));

  const toggleSelectPage = () => {
    if (allPageSelected) {
      const pageSet = new Set(pageTasks.map((t) => t.id));
      setSelectedIds((prev) => prev.filter((id) => !pageSet.has(id)));
    } else {
      const merged = new Set(validSelectedIds);
      pageTasks.forEach((t) => merged.add(t.id));
      setSelectedIds(Array.from(merged));
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleBulkApply = () => {
    if (!resolvedBulkStatusId || validSelectedIds.length === 0) return;
    onBulkMoveTasks(validSelectedIds, resolvedBulkStatusId);
    setSelectedIds([]);
  };

  const priorities: (PriorityLevel | 'all')[] = ['all', 'urgent', 'high', 'medium', 'low'];

  const renderSortIcon = (key: SortKey) => {
    if (sortKey !== key) {
      return <ArrowUpDown className="w-3 h-3 text-[#86868B] opacity-60" aria-hidden="true" />;
    }
    return sortDir === 'asc' ? (
      <ArrowUp className="w-3 h-3 text-[#0071E3] dark:text-[#2997FF]" aria-hidden="true" />
    ) : (
      <ArrowDown className="w-3 h-3 text-[#0071E3] dark:text-[#2997FF]" aria-hidden="true" />
    );
  };

  const renderRow = (task: TaskItem) => {
    const project = projectMap.get(task.projectId);
    const isChecked = selectedIdSet.has(task.id);
    const portfolioIsUrl = isExternalUrlValue(task.portfolioUrl);

    return (
      <tr
        key={task.id}
        className={`h-12 transition-colors duration-150 ${
          isChecked
            ? 'bg-[#0071E3]/[0.06] dark:bg-[#0A84FF]/[0.12]'
            : 'hover:bg-[#F5F5F7]/80 dark:hover:bg-white/[0.04]'
        }`}
      >
        <td className="px-3.5 py-2 align-middle">
          <input
            type="checkbox"
            checked={isChecked}
            onChange={() => toggleOne(task.id)}
            aria-label={`Select ${task.fullName}`}
            className="rounded border-black/20 dark:border-white/25 text-[#0071E3] focus:ring-[#0071E3]"
          />
        </td>
        <td className="px-3 py-2 align-middle">
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
        <td className="px-3 py-2 align-middle font-mono text-xs tabular-nums text-[#6E6E73] dark:text-[#A1A1A6] whitespace-nowrap">
          {task.timestamp || '—'}
        </td>
        <td className="px-3 py-2 align-middle whitespace-nowrap">
          <button
            type="button"
            onClick={() => onSelectTask(task.id)}
            className="text-left group focus-visible:outline-none focus-visible:underline"
          >
            <div className="text-[13px] font-semibold text-[#1D1D1F] dark:text-[#F5F5F7] group-hover:text-[#0071E3] dark:group-hover:text-[#2997FF] transition-colors">
              {task.fullName}
            </div>
            {project && (
              <div className="text-[11px] text-[#86868B]">
                {project.name}
              </div>
            )}
          </button>
        </td>
        <td className="px-3 py-2 align-middle text-xs whitespace-nowrap">
          {task.email ? (
            <a
              href={`mailto:${task.email}`}
              className="text-[#1D1D1F] dark:text-[#E5E5EA] hover:text-[#0071E3] dark:hover:text-[#2997FF] hover:underline"
            >
              {task.email}
            </a>
          ) : (
            <span className="text-[#86868B]">—</span>
          )}
        </td>
        <td className="px-3 py-2 align-middle font-mono text-xs tabular-nums text-[#1D1D1F] dark:text-[#E5E5EA] whitespace-nowrap">
          {task.contactNo || '—'}
        </td>
        <td className="px-3 py-2 align-middle text-xs whitespace-nowrap">
          {portfolioIsUrl ? (
            <a
              href={sanitizeExternalUrl(task.portfolioUrl)}
              target="_blank"
              rel="noopener noreferrer"
              title={task.portfolioUrl}
              className="inline-flex items-center gap-1 text-[#0071E3] dark:text-[#2997FF] hover:underline max-w-[190px]"
            >
              <span className="truncate">
                {sanitizeExternalUrl(task.portfolioUrl).replace(/^https?:\/\//i, '')}
              </span>
              <ExternalLink className="w-3 h-3 shrink-0" aria-hidden="true" />
            </a>
          ) : (
            <span className="text-[#6E6E73] dark:text-[#A1A1A6] max-w-[180px] inline-block truncate" title={task.portfolioUrl}>
              {task.portfolioUrl && task.portfolioUrl !== '-' ? task.portfolioUrl : '—'}
            </span>
          )}
        </td>
        <td className="px-3 py-2 align-middle text-xs text-[#1D1D1F] dark:text-[#E5E5EA] whitespace-nowrap">
          {task.currentLocation || '—'}
        </td>
        <td className="px-3 py-2 align-middle font-mono text-xs tabular-nums text-[#1D1D1F] dark:text-[#E5E5EA] whitespace-nowrap">
          {task.yearsOfExperience || '—'}
        </td>
        <td className="px-3 py-2 align-middle text-xs text-[#1D1D1F] dark:text-[#E5E5EA] max-w-[240px]">
          <div className="truncate" title={task.designedAiProduct}>
            {task.designedAiProduct || '—'}
          </div>
        </td>
        <td className="px-3 py-2 align-middle text-xs text-[#1D1D1F] dark:text-[#E5E5EA] whitespace-nowrap">
          {task.noticePeriod || '—'}
        </td>
        <td className="px-3 py-2 align-middle text-xs whitespace-nowrap">
          {task.resumeUrl ? (
            isExternalUrlValue(task.resumeUrl) ? (
              <a
                href={sanitizeExternalUrl(task.resumeUrl)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[#0071E3] dark:text-[#2997FF] hover:underline max-w-[160px]"
              >
                <FileText className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">View Resume</span>
              </a>
            ) : (
              <button
                type="button"
                onClick={() => onSelectTask(task.id)}
                className="inline-flex items-center gap-1 text-[#1D1D1F] dark:text-[#E5E5EA] hover:text-[#0071E3] dark:hover:text-[#2997FF] max-w-[160px]"
              >
                <FileText className="w-3.5 h-3.5 shrink-0 text-[#86868B]" aria-hidden="true" />
                <span className="truncate">{task.resumeUrl}</span>
              </button>
            )
          ) : (
            <span className="text-[#86868B]">—</span>
          )}
        </td>
        <td className="px-3 py-2 align-middle text-xs text-[#6E6E73] dark:text-[#A1A1A6] max-w-[220px]">
          <div className="truncate" title={task.message}>
            {task.message || '—'}
          </div>
        </td>
        <td className="px-3 py-2 align-middle font-mono text-xs tabular-nums text-[#1D1D1F] dark:text-[#F5F5F7] font-medium whitespace-nowrap">
          {task.expectedSalary || '—'}
        </td>
        <td className="px-4 py-2 align-middle text-xs text-[#1D1D1F] dark:text-[#E5E5EA] whitespace-nowrap">
          {task.readyToRelocateIn || '—'}
        </td>
      </tr>
    );
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Toolbar */}
      <div className="px-4 sm:px-6 py-3 bg-[#FBFBFD]/90 dark:bg-[#161617]/90 border-b border-black/[0.06] dark:border-white/[0.08] flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative md:hidden w-full sm:w-56">
            <Search
              className="w-4 h-4 text-[#86868B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => {
                onSearchChange(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Filter rows..."
              className="w-full h-9 pl-9 pr-3 text-sm rounded-[10px] border border-black/[0.08] dark:border-white/[0.12] bg-[#F5F5F7] dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7] focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
            />
          </div>

          <div
            role="group"
            aria-label="Table layout mode"
            className="inline-flex items-center p-0.5 rounded-[10px] bg-black/[0.05] dark:bg-white/[0.08]"
          >
            <button
              type="button"
              onClick={() => {
                setGroupByStatus(true);
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-150 whitespace-nowrap ${
                groupByStatus
                  ? 'bg-white dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7] shadow-[0_1px_2px_rgba(0,0,0,0.08)]'
                  : 'text-[#6E6E73] dark:text-[#A1A1A6] hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7]'
              }`}
            >
              Grouped by Status
            </button>
            <button
              type="button"
              onClick={() => {
                setGroupByStatus(false);
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-150 whitespace-nowrap ${
                !groupByStatus
                  ? 'bg-white dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7] shadow-[0_1px_2px_rgba(0,0,0,0.08)]'
                  : 'text-[#6E6E73] dark:text-[#A1A1A6] hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7]'
              }`}
            >
              Flat Table
            </button>
          </div>

          <div
            role="group"
            aria-label="Filter by priority"
            className="inline-flex items-center p-0.5 rounded-[10px] bg-black/[0.05] dark:bg-white/[0.08] overflow-x-auto max-w-full"
          >
            {priorities.map((p) => {
              const active = priorityFilter === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    onPriorityFilterChange(p);
                    setCurrentPage(1);
                  }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-150 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3] ${
                    active
                      ? 'bg-white dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7] shadow-[0_1px_2px_rgba(0,0,0,0.08)]'
                      : 'text-[#6E6E73] dark:text-[#A1A1A6] hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7]'
                  }`}
                >
                  {p === 'all' ? 'All' : PRIORITY_LABELS[p]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Bulk Status Arrangement Bar or Quick Excel Actions */}
        {validSelectedIds.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-[#1D1D1F] dark:text-[#F5F5F7] font-mono tabular-nums">
              {validSelectedIds.length} selected
            </span>
            {validSelectedIds.length < tasks.length && (
              <button
                type="button"
                onClick={() => setSelectedIds(tasks.map((t) => t.id))}
                className="text-xs font-medium text-[#0071E3] dark:text-[#2997FF] hover:underline whitespace-nowrap"
              >
                Select all {tasks.length}
              </button>
            )}
            <select
              value={resolvedBulkStatusId}
              onChange={(e) => setBulkTargetStatusId(e.target.value)}
              aria-label="Bulk target status"
              className="h-9 px-2.5 text-xs font-medium rounded-[10px] border border-black/[0.10] dark:border-white/[0.14] bg-white dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7] focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
            >
              {sortedStatuses.map((s) => (
                <option key={s.id} value={s.id}>
                  Move to {s.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleBulkApply}
              className="h-9 px-3.5 rounded-[10px] bg-[#0071E3] hover:bg-[#0077ED] dark:bg-[#0A84FF] text-white text-xs font-medium inline-flex items-center gap-1 transition-colors whitespace-nowrap"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Apply</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="h-9 px-2.5 text-xs font-medium text-[#6E6E73] hover:text-[#1D1D1F] dark:text-[#A1A1A6] dark:hover:text-[#F5F5F7]"
            >
              Clear
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={onOpenImportSheet}
              className="text-xs font-medium text-[#0071E3] dark:text-[#2997FF] hover:underline inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Drop or Import Excel</span>
            </button>
            <button
              type="button"
              onClick={onExportExcel}
              disabled={tasks.length === 0}
              className="text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6] hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7] disabled:opacity-40 inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export .xlsx</span>
            </button>
            <span className="text-xs font-mono tabular-nums text-[#86868B] whitespace-nowrap">
              {tasks.length} {tasks.length === 1 ? 'row' : 'rows'}
            </span>
          </div>
        )}
      </div>

      {/* Table Container */}
      <div className="flex-1 overflow-auto px-4 sm:px-6 py-5 flex flex-col min-h-0">
        {tasks.length === 0 ? (
          <div className="max-w-md mx-auto my-14 p-8 rounded-2xl border border-black/[0.08] dark:border-white/[0.10] bg-white dark:bg-[#1C1C1E] text-center space-y-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <h2 className="text-base font-display font-semibold tracking-[-0.01em] text-[#1D1D1F] dark:text-[#F5F5F7]">
              No matching table rows
            </h2>
            <p className="text-sm text-[#6E6E73] dark:text-[#A1A1A6] leading-relaxed">
              Drop an Excel, CSV, or HTML sheet directly onto this window or add a new candidate record manually.
            </p>
            <div className="flex items-center justify-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={onOpenImportSheet}
                className="inline-flex items-center gap-1.5 h-10 px-4 rounded-[10px] border border-black/[0.10] dark:border-white/[0.14] bg-white dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7] text-[13px] font-medium hover:bg-[#F5F5F7] dark:hover:bg-[#3A3A3C] transition-colors"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Import Excel</span>
              </button>
              <button
                type="button"
                onClick={onOpenNewItem}
                className="inline-flex items-center gap-1.5 h-10 px-4 rounded-[10px] bg-[#0071E3] hover:bg-[#0077ED] dark:bg-[#0A84FF] text-white text-[13px] font-medium transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Add Row</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-black/[0.08] dark:border-white/[0.10] bg-white dark:bg-[#1C1C1E] overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex flex-col min-h-0 flex-1">
            <div className="overflow-auto flex-1">
              <table className="w-full text-left border-collapse min-w-[1920px]">
                <thead className="sticky top-0 z-10 bg-[#FBFBFD]/95 dark:bg-[#1C1C1E]/95 backdrop-blur-md border-b border-black/[0.08] dark:border-white/[0.10]">
                  <tr className="text-[12px] font-semibold text-[#6E6E73] dark:text-[#A1A1A6]">
                    <th className="w-10 px-3.5 py-3">
                      <input
                        type="checkbox"
                        checked={allPageSelected}
                        onChange={toggleSelectPage}
                        aria-label="Select visible rows"
                        className="rounded border-black/20 dark:border-white/25 text-[#0071E3] focus:ring-[#0071E3]"
                      />
                    </th>
                    <th className="px-3 py-3 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleSort('status')}
                        className="inline-flex items-center gap-1 hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7]"
                      >
                        <span>Status</span>
                        {renderSortIcon('status')}
                      </button>
                    </th>
                    <th className="px-3 py-3 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleSort('timestamp')}
                        className="inline-flex items-center gap-1 hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7]"
                      >
                        <span>Timestamp</span>
                        {renderSortIcon('timestamp')}
                      </button>
                    </th>
                    <th className="px-3 py-3 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleSort('fullName')}
                        className="inline-flex items-center gap-1 hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7]"
                      >
                        <span>Full name</span>
                        {renderSortIcon('fullName')}
                      </button>
                    </th>
                    <th className="px-3 py-3 whitespace-nowrap">Email ID</th>
                    <th className="px-3 py-3 whitespace-nowrap">Contact No / Whatsapp</th>
                    <th className="px-3 py-3 whitespace-nowrap">Share your portfolio URL</th>
                    <th className="px-3 py-3 whitespace-nowrap">Current Location</th>
                    <th className="px-3 py-3 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleSort('yearsOfExperience')}
                        className="inline-flex items-center gap-1 hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7]"
                      >
                        <span>Years of Experience do you have?</span>
                        {renderSortIcon('yearsOfExperience')}
                      </button>
                    </th>
                    <th className="px-3 py-3 whitespace-nowrap">
                      Have you designed an AI-powered product or feature?
                    </th>
                    <th className="px-3 py-3 whitespace-nowrap">What is your notice period?</th>
                    <th className="px-3 py-3 whitespace-nowrap">Upload Resume</th>
                    <th className="px-3 py-3 whitespace-nowrap">Any Message</th>
                    <th className="px-3 py-3 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleSort('expectedSalary')}
                        className="inline-flex items-center gap-1 hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7]"
                      >
                        <span>Expected Salary</span>
                        {renderSortIcon('expectedSalary')}
                      </button>
                    </th>
                    <th className="px-4 py-3 whitespace-nowrap">Ready to relocate in</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.06] dark:divide-white/[0.08] text-sm">
                  {groupByStatus
                    ? sortedStatuses.map((status) => {
                        const groupTasks = pageTasks.filter((t) => t.statusId === status.id);
                        if (groupTasks.length === 0) return null;
                        const totalInStatus = statusCounts.get(status.id) ?? groupTasks.length;

                        return (
                          <Fragment key={`group-${status.id}`}>
                            <tr className="bg-[#F5F5F7]/75 dark:bg-white/[0.03]">
                              <td colSpan={15} className="px-4 py-2">
                                <div className="flex items-center gap-2 text-xs font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">
                                  <StatusIcon
                                    category={status.category}
                                    color={status.color}
                                    className="w-3.5 h-3.5"
                                  />
                                  <span>{status.name}</span>
                                  <span className="font-mono tabular-nums text-[#86868B] font-normal">
                                    {totalInStatus}
                                    {status.wipLimit !== null ? ` / ${status.wipLimit} max` : ''}
                                  </span>
                                </div>
                              </td>
                            </tr>
                            {groupTasks.map(renderRow)}
                          </Fragment>
                        );
                      })
                    : pageTasks.map(renderRow)}
                </tbody>
              </table>
            </div>

            {/* Pagination Bar */}
            <div className="px-4 py-2.5 border-t border-black/[0.08] dark:border-white/[0.10] bg-[#FBFBFD] dark:bg-[#161617] flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
              <div className="font-mono tabular-nums text-[#6E6E73] dark:text-[#A1A1A6]">
                Showing {startIndex + 1}–{endIndex} of {orderedTasks.length} rows
              </div>

              <div className="flex items-center gap-3">
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  aria-label="Rows per page"
                  className="h-8 px-2.5 text-xs font-medium rounded-lg border border-black/[0.10] dark:border-white/[0.12] bg-white dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7]"
                >
                  <option value={50}>50 / page</option>
                  <option value={100}>100 / page</option>
                  <option value={0}>All ({orderedTasks.length})</option>
                </select>

                {totalPages > 1 && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={safePage <= 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      aria-label="Previous page"
                      className="h-8 px-2.5 rounded-lg border border-black/[0.10] dark:border-white/[0.12] bg-white dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7] hover:bg-[#F5F5F7] dark:hover:bg-[#3A3A3C] disabled:opacity-35 disabled:pointer-events-none inline-flex items-center gap-1"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>Prev</span>
                    </button>
                    <span className="px-2 font-mono tabular-nums text-[#6E6E73] dark:text-[#A1A1A6]">
                      {safePage} / {totalPages}
                    </span>
                    <button
                      type="button"
                      disabled={safePage >= totalPages}
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      aria-label="Next page"
                      className="h-8 px-2.5 rounded-lg border border-black/[0.10] dark:border-white/[0.12] bg-white dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7] hover:bg-[#F5F5F7] dark:hover:bg-[#3A3A3C] disabled:opacity-35 disabled:pointer-events-none inline-flex items-center gap-1"
                    >
                      <span>Next</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

