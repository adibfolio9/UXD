import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Download,
  FileSpreadsheet,
  FolderKanban,
  ListTodo,
  Upload,
} from 'lucide-react';
import { Project, StatusDefinition, TaskItem, TeamMember } from '../types';
import {
  ColumnMapping,
  ParsedWorkbook,
  buildImportPayload,
  detectColumnMapping,
  downloadSampleExcelTemplate,
  parseHtmlSheetDocument,
  parseSpreadsheetFile,
  previewDeduplicationStats,
} from '../utils/excelImport';

interface ExcelImporterProps {
  initialWorkbook: ParsedWorkbook | null;
  initialError?: string | null;
  statuses: StatusDefinition[];
  projects: Project[];
  members: TeamMember[];
  nextCodeNumber: number;
  defaultTargetView?: 'board' | 'list';
  onConfirmImport: (payload: {
    targetView: 'board' | 'list';
    mode: 'append' | 'replace';
    newStatuses: StatusDefinition[];
    newProjects: Project[];
    importedTasks: TaskItem[];
    nextCodeNumber: number;
    duplicateRowsRemoved?: number;
    deduplicate?: boolean;
  }) => void;
  onCancel?: () => void;
}

const MAPPING_FIELDS: { key: keyof ColumnMapping; label: string; required?: boolean }[] = [
  { key: 'fullName', label: 'Full name', required: true },
  { key: 'timestamp', label: 'Timestamp' },
  { key: 'email', label: 'Email ID' },
  { key: 'contactNo', label: 'Contact No / Whatsapp' },
  { key: 'portfolioUrl', label: 'Share your portfolio URL' },
  { key: 'currentLocation', label: 'Current Location' },
  { key: 'yearsOfExperience', label: 'Years of Experience' },
  { key: 'designedAiProduct', label: 'AI Product Experience' },
  { key: 'noticePeriod', label: 'Notice Period' },
  { key: 'resumeUrl', label: 'Upload Resume' },
  { key: 'message', label: 'Any Message' },
  { key: 'expectedSalary', label: 'Expected Salary' },
  { key: 'readyToRelocateIn', label: 'Ready to relocate in' },
  { key: 'status', label: 'Status (Optional)' },
  { key: 'priority', label: 'Priority (Optional)' },
  { key: 'project', label: 'Role / Track (Optional)' },
];

export function ExcelImporter({
  initialWorkbook,
  initialError = null,
  statuses,
  projects,
  members,
  nextCodeNumber,
  defaultTargetView = 'list',
  onConfirmImport,
  onCancel,
}: ExcelImporterProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sortedStatuses = useMemo(
    () => [...statuses].sort((a, b) => a.order - b.order),
    [statuses]
  );

  const [workbook, setWorkbook] = useState<ParsedWorkbook | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [autoCreateStatuses, setAutoCreateStatuses] = useState(true);
  const [deduplicateOnImport, setDeduplicateOnImport] = useState(true);
  const [fallbackStatusId, setFallbackStatusId] = useState(sortedStatuses[0]?.id ?? '');
  const [importMode, setImportMode] = useState<'append' | 'replace'>('append');
  const [targetView, setTargetView] = useState<'board' | 'list'>(defaultTargetView);
  const [isOverDropzone, setIsOverDropzone] = useState(false);
  const [loadingAttachedSheet, setLoadingAttachedSheet] = useState(false);
  const [parseError, setParseError] = useState<string | null>(initialError);

  useEffect(() => {
    setParseError(initialError);
  }, [initialError]);

  useEffect(() => {
    if (initialWorkbook) {
      setWorkbook(null);
      setSelectedSheet(initialWorkbook.sheetNames[0] ?? '');
      setMapping(null);
      setParseError(null);
    }
  }, [initialWorkbook]);

  const activeWorkbook = workbook ?? initialWorkbook;

  const activeSheetName = useMemo(() => {
    if (!activeWorkbook) return '';
    if (selectedSheet && activeWorkbook.sheetNames.includes(selectedSheet)) {
      return selectedSheet;
    }
    return activeWorkbook.sheetNames[0] ?? '';
  }, [activeWorkbook, selectedSheet]);

  const activeSheet = activeWorkbook ? activeWorkbook.sheets[activeSheetName] : null;

  const activeMapping = useMemo(() => {
    if (!activeSheet) return null;
    if (mapping) return mapping;
    return detectColumnMapping(activeSheet.headers);
  }, [activeSheet, mapping]);

  const resolvedFallbackStatusId = sortedStatuses.some((s) => s.id === fallbackStatusId)
    ? fallbackStatusId
    : sortedStatuses[0]?.id ?? '';

  const detectedNewStatusNames = useMemo(() => {
    if (!activeSheet || !activeMapping?.status) return [];
    const existingLower = new Set(statuses.map((s) => s.name.toLowerCase()));
    const seen = new Set<string>();
    const missing: string[] = [];

    for (const row of activeSheet.rows) {
      const raw = (row[activeMapping.status] ?? '').trim();
      if (!raw) continue;
      const lower = raw.toLowerCase();
      if (!existingLower.has(lower) && !seen.has(lower)) {
        seen.add(lower);
        missing.push(raw);
      }
    }
    return missing;
  }, [activeSheet, activeMapping, statuses]);

  const handleFileLoad = async (file: File) => {
    setParseError(null);
    try {
      const parsed = await parseSpreadsheetFile(file);
      const firstSheet = parsed.sheetNames[0] ?? '';
      const firstHeaders = parsed.sheets[firstSheet]?.headers ?? [];
      setWorkbook(parsed);
      setSelectedSheet(firstSheet);
      setMapping(detectColumnMapping(firstHeaders));
    } catch {
      setParseError(
        'Could not read that file. Please upload a valid .xlsx, .xls, .ods, .csv, or Google Sheets .html file.'
      );
    }
  };

  const handleLoadAttachedFormSheet = async () => {
    setParseError(null);
    setLoadingAttachedSheet(true);
    try {
      const res = await fetch('/assets/aistudio/Form_Responses_1_9feed92b.html');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const htmlText = await res.text();
      const parsed = parseHtmlSheetDocument(htmlText, 'Form Responses 1.html');
      const firstSheet = parsed.sheetNames[0] ?? '';
      const firstHeaders = parsed.sheets[firstSheet]?.headers ?? [];
      setWorkbook(parsed);
      setSelectedSheet(firstSheet);
      setMapping(detectColumnMapping(firstHeaders));
    } catch {
      setParseError(
        'Could not load the Form Responses 1 sheet. Please drop the .html or .xlsx file directly above.'
      );
    } finally {
      setLoadingAttachedSheet(false);
    }
  };

  const handleSheetChange = (sheetName: string) => {
    if (!activeWorkbook) return;
    setSelectedSheet(sheetName);
    const headers = activeWorkbook.sheets[sheetName]?.headers ?? [];
    setMapping(detectColumnMapping(headers));
  };

  const handleImport = (chosenView: 'board' | 'list') => {
    if (!activeSheet || !activeMapping || !activeMapping.fullName) return;
    const result = buildImportPayload({
      rows: activeSheet.rows,
      mapping: activeMapping,
      existingStatuses: statuses,
      existingProjects: projects,
      members,
      autoCreateStatuses,
      deduplicate: deduplicateOnImport,
      fallbackStatusId: resolvedFallbackStatusId,
      fallbackProjectId: projects[0]?.id ?? 'proj-lead-staff',
      startingCodeNumber: nextCodeNumber,
    });

    onConfirmImport({
      targetView: chosenView,
      mode: importMode,
      deduplicate: deduplicateOnImport,
      ...result,
    });
    setWorkbook(null);
    setMapping(null);
  };

  const importStats = useMemo(() => {
    if (!activeSheet || !activeMapping?.fullName) {
      return { validCount: 0, uniqueCount: 0, duplicateCount: 0 };
    }
    return previewDeduplicationStats(activeSheet.rows, activeMapping);
  }, [activeSheet, activeMapping]);

  const validRowCount = importStats.validCount;
  const effectiveUploadCount = deduplicateOnImport
    ? importStats.uniqueCount
    : importStats.validCount;

  return (
    <div className="space-y-6">
      {parseError && (
        <div className="p-3.5 rounded-xl bg-[#FF3B30]/[0.08] dark:bg-[#FF453A]/[0.12] border border-[#FF3B30]/20 flex items-center gap-2 text-xs text-[#D70015] dark:text-[#FF453A]">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{parseError}</span>
        </div>
      )}

      {!activeWorkbook ? (
        <div className="space-y-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsOverDropzone(true);
            }}
            onDragLeave={() => setIsOverDropzone(false)}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsOverDropzone(false);
              const file = e.dataTransfer.files?.[0];
              if (file) void handleFileLoad(file);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`p-12 rounded-2xl border-2 border-dashed text-center cursor-pointer transition-colors duration-150 ${
              isOverDropzone
                ? 'border-[#0071E3] dark:border-[#0A84FF] bg-[#0071E3]/[0.06] dark:bg-[#0A84FF]/[0.12]'
                : 'border-black/[0.14] dark:border-white/[0.16] hover:border-[#0071E3] dark:hover:border-[#0A84FF] bg-[#FBFBFD] dark:bg-[#1C1C1E]'
            }`}
          >
            <Upload className="w-8 h-8 text-[#0071E3] dark:text-[#2997FF] mx-auto mb-3" />
            <p className="text-[15px] font-display font-semibold tracking-[-0.01em] text-[#1D1D1F] dark:text-[#F5F5F7]">
              Drop your Excel (.xlsx, .xls), CSV, or HTML Sheet here, or click to select
            </p>
            <p className="mt-1.5 text-xs text-[#6E6E73] dark:text-[#A1A1A6] max-w-lg mx-auto leading-relaxed">
              Automatically maps Timestamp, Full name, Email ID, Contact No / Whatsapp, Portfolio URL, Location, Experience, AI Product Experience, Notice Period, Resume, Message, Expected Salary, and Relocation.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv,.ods,.html,.htm"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFileLoad(file);
              }}
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl border border-[#0071E3]/20 dark:border-[#0A84FF]/25 bg-[#0071E3]/[0.04] dark:bg-[#0A84FF]/[0.08]">
            <div className="flex items-start gap-3">
              <FileSpreadsheet className="w-5 h-5 text-[#0071E3] dark:text-[#2997FF] mt-0.5 shrink-0" />
              <div>
                <div className="text-xs font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">
                  Uploaded Form Responses 1 Sheet (.html)
                </div>
                <div className="text-xs text-[#6E6E73] dark:text-[#A1A1A6]">
                  Load the latest 744 responses directly, auto-remove duplicates, and sync all 589 unique candidates.
                </div>
              </div>
            </div>
            <button
              type="button"
              disabled={loadingAttachedSheet}
              onClick={() => void handleLoadAttachedFormSheet()}
              className="h-9 px-3.5 rounded-[10px] bg-[#0071E3] hover:bg-[#0077ED] dark:bg-[#0A84FF] dark:hover:bg-[#2997FF] disabled:opacity-50 text-xs font-medium text-white inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{loadingAttachedSheet ? 'Loading Sheet...' : 'Load Candidate Name List'}</span>
            </button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl border border-black/[0.08] dark:border-white/[0.10] bg-white dark:bg-[#1C1C1E]">
            <div className="flex items-start gap-3">
              <FileSpreadsheet className="w-5 h-5 text-[#0071E3] dark:text-[#2997FF] mt-0.5 shrink-0" />
              <div>
                <div className="text-xs font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">
                  Sample Candidate Form Excel (.xlsx)
                </div>
                <div className="text-xs text-[#6E6E73] dark:text-[#A1A1A6]">
                  Download a ready-to-drop .xlsx template formatted with all 13 form columns and Status.
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={downloadSampleExcelTemplate}
              className="h-9 px-3.5 rounded-[10px] border border-black/[0.10] dark:border-white/[0.14] bg-[#F5F5F7] dark:bg-[#2C2C2E] text-xs font-medium text-[#1D1D1F] dark:text-[#F5F5F7] hover:bg-[#E8E8ED] dark:hover:bg-[#3A3A3C] inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Sample .xlsx</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* File Summary + Sheet Picker */}
          <div className="p-4 rounded-2xl border border-black/[0.08] dark:border-white/[0.10] bg-[#F5F5F7] dark:bg-[#2C2C2E]/60 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">
                {activeWorkbook.fileName}
              </div>
              <div className="text-xs text-[#6E6E73] dark:text-[#A1A1A6] font-mono tabular-nums">
                {activeSheet?.rows.length ?? 0} rows detected ·{' '}
                {importStats.duplicateCount > 0
                  ? `${importStats.uniqueCount} unique (${importStats.duplicateCount} duplicates found)`
                  : `${importStats.validCount} valid candidates`}{' '}
                · {activeSheet?.headers.length ?? 0} columns
              </div>
            </div>

            <div className="flex items-center gap-2">
              {activeWorkbook.sheetNames.length > 1 && (
                <select
                  value={activeSheetName}
                  onChange={(e) => handleSheetChange(e.target.value)}
                  aria-label="Select worksheet"
                  className="h-9 px-2.5 text-xs font-medium rounded-lg border border-black/[0.10] dark:border-white/[0.14] bg-white dark:bg-[#1C1C1E] text-[#1D1D1F] dark:text-[#F5F5F7]"
                >
                  {activeWorkbook.sheetNames.map((name) => (
                    <option key={name} value={name}>
                      Sheet: {name}
                    </option>
                  ))}
                </select>
              )}

              <button
                type="button"
                onClick={() => {
                  setWorkbook(null);
                  setMapping(null);
                }}
                className="h-9 px-3 rounded-lg border border-black/[0.10] dark:border-white/[0.14] bg-white dark:bg-[#1C1C1E] text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6] hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7]"
              >
                Choose Different File
              </button>
            </div>
          </div>

          {/* Column Mapping */}
          {activeSheet && activeMapping && (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">
                Column Mapping (Auto-Matched to Your 13 Columns)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {MAPPING_FIELDS.map((field) => (
                  <div key={field.key} className="space-y-1">
                    <label className="block text-xs text-[#6E6E73] dark:text-[#A1A1A6] truncate">
                      {field.label}
                      {field.required ? ' *' : ''}
                    </label>
                    <select
                      value={activeMapping[field.key]}
                      onChange={(e) =>
                        setMapping({
                          ...activeMapping,
                          [field.key]: e.target.value,
                        })
                      }
                      className="w-full h-9 px-2.5 text-xs rounded-lg border border-black/[0.10] dark:border-white/[0.12] bg-white dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7] focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
                    >
                      <option value="">
                        {field.required ? 'Select column...' : 'Skip / Empty'}
                      </option>
                      {activeSheet.headers.map((header) => (
                        <option key={header} value={header}>
                          {header}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Destination View + Status Options */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-black/[0.08] dark:border-white/[0.10]">
            <div className="space-y-2.5">
              <div className="text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]">
                Fetch Data Into View
              </div>
              <div
                role="group"
                aria-label="Destination view"
                className="inline-flex items-center p-0.5 rounded-[10px] bg-black/[0.05] dark:bg-white/[0.08]"
              >
                <button
                  type="button"
                  onClick={() => setTargetView('list')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg inline-flex items-center gap-1.5 transition-all whitespace-nowrap ${
                    targetView === 'list'
                      ? 'bg-white dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7] shadow-[0_1px_2px_rgba(0,0,0,0.08)]'
                      : 'text-[#6E6E73] dark:text-[#A1A1A6] hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7]'
                  }`}
                >
                  <ListTodo className="w-3.5 h-3.5" />
                  <span>List / Table View</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTargetView('board')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg inline-flex items-center gap-1.5 transition-all whitespace-nowrap ${
                    targetView === 'board'
                      ? 'bg-white dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7] shadow-[0_1px_2px_rgba(0,0,0,0.08)]'
                      : 'text-[#6E6E73] dark:text-[#A1A1A6] hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7]'
                  }`}
                >
                  <FolderKanban className="w-3.5 h-3.5" />
                  <span>Kanban Board</span>
                </button>
              </div>

              <label className="flex items-start gap-2.5 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={autoCreateStatuses}
                  onChange={(e) => setAutoCreateStatuses(e.target.checked)}
                  className="mt-0.5 rounded border-black/20 dark:border-white/25 text-[#0071E3] focus:ring-[#0071E3]"
                />
                <span className="text-xs text-[#6E6E73] dark:text-[#A1A1A6] leading-relaxed">
                  <span className="font-semibold block text-[#1D1D1F] dark:text-[#F5F5F7]">
                    Auto-create new statuses found in Excel
                  </span>
                  {detectedNewStatusNames.length > 0
                    ? `Will create ${detectedNewStatusNames.length} new status columns: ${detectedNewStatusNames.join(', ')}`
                    : 'Any unrecognized status values become new Kanban columns and List groups.'}
                </span>
              </label>
            </div>

            <div className="space-y-2.5">
              <div className="text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]">
                Import Behavior &amp; Fallback Status
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={importMode}
                  onChange={(e) => setImportMode(e.target.value as 'append' | 'replace')}
                  aria-label="Import mode"
                  className="flex-1 h-9 px-2.5 text-xs rounded-lg border border-black/[0.10] dark:border-white/[0.12] bg-white dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7]"
                >
                  <option value="append">Append to existing rows</option>
                  <option value="replace">Replace existing rows</option>
                </select>
                <select
                  value={resolvedFallbackStatusId}
                  onChange={(e) => setFallbackStatusId(e.target.value)}
                  aria-label="Fallback status"
                  className="flex-1 h-9 px-2.5 text-xs rounded-lg border border-black/[0.10] dark:border-white/[0.12] bg-white dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7]"
                >
                  {sortedStatuses.map((s) => (
                    <option key={s.id} value={s.id}>
                      Default: {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-start gap-2.5 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={deduplicateOnImport}
                  onChange={(e) => setDeduplicateOnImport(e.target.checked)}
                  className="mt-0.5 rounded border-black/20 dark:border-white/25 text-[#0071E3] focus:ring-[#0071E3]"
                />
                <span className="text-xs text-[#6E6E73] dark:text-[#A1A1A6] leading-relaxed">
                  <span className="font-semibold block text-[#1D1D1F] dark:text-[#F5F5F7]">
                    Remove duplicate candidates automatically
                  </span>
                  {importStats.duplicateCount > 0
                    ? deduplicateOnImport
                      ? `Merging ${importStats.duplicateCount} duplicate submissions so only ${importStats.uniqueCount} unique candidates are uploaded.`
                      : `Disabled: all ${importStats.validCount} raw sheet rows (including ${importStats.duplicateCount} duplicates) will be kept.`
                    : 'Matches candidates by email, phone number, or name + portfolio URL.'}
                </span>
              </label>
            </div>
          </div>

          {/* Live Row Preview */}
          {activeSheet && activeMapping && activeSheet.rows.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-[#86868B]">
                <span className="font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">
                  Preview (first {Math.min(5, activeSheet.rows.length)} rows)
                </span>
                <span className="font-mono tabular-nums">
                  {deduplicateOnImport && importStats.duplicateCount > 0
                    ? `${importStats.uniqueCount} unique of ${validRowCount} rows`
                    : `${validRowCount} rows ready`}
                </span>
              </div>
              <div className="rounded-xl border border-black/[0.08] dark:border-white/[0.10] overflow-x-auto bg-white dark:bg-[#1C1C1E]">
                <table className="w-full text-left border-collapse text-xs min-w-[720px]">
                  <thead>
                    <tr className="bg-[#FBFBFD] dark:bg-white/[0.03] border-b border-black/[0.08] dark:border-white/[0.10] text-[#6E6E73] dark:text-[#A1A1A6]">
                      <th className="px-3 py-2">Timestamp</th>
                      <th className="px-3 py-2">Full name</th>
                      <th className="px-3 py-2">Email ID</th>
                      <th className="px-3 py-2">Location</th>
                      <th className="px-3 py-2">Exp</th>
                      <th className="px-3 py-2">Expected Salary</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[0.06] dark:divide-white/[0.08]">
                    {activeSheet.rows.slice(0, 5).map((row, idx) => (
                      <tr key={idx}>
                        <td className="px-3 py-2 font-mono tabular-nums text-[#6E6E73] dark:text-[#A1A1A6] whitespace-nowrap">
                          {(activeMapping.timestamp ? row[activeMapping.timestamp] : '') || '—'}
                        </td>
                        <td className="px-3 py-2 font-medium text-[#1D1D1F] dark:text-[#F5F5F7] whitespace-nowrap">
                          {(activeMapping.fullName ? row[activeMapping.fullName] : '') || '—'}
                        </td>
                        <td className="px-3 py-2 text-[#6E6E73] dark:text-[#A1A1A6] whitespace-nowrap">
                          {(activeMapping.email ? row[activeMapping.email] : '') || '—'}
                        </td>
                        <td className="px-3 py-2 text-[#6E6E73] dark:text-[#A1A1A6] whitespace-nowrap">
                          {(activeMapping.currentLocation
                            ? row[activeMapping.currentLocation]
                            : '') || '—'}
                        </td>
                        <td className="px-3 py-2 font-mono tabular-nums text-[#6E6E73] dark:text-[#A1A1A6] whitespace-nowrap">
                          {(activeMapping.yearsOfExperience
                            ? row[activeMapping.yearsOfExperience]
                            : '') || '—'}
                        </td>
                        <td className="px-3 py-2 font-mono tabular-nums text-[#1D1D1F] dark:text-[#E5E5EA] whitespace-nowrap">
                          {(activeMapping.expectedSalary
                            ? row[activeMapping.expectedSalary]
                            : '') || '—'}
                        </td>
                        <td className="px-3 py-2 text-[#1D1D1F] dark:text-[#E5E5EA] whitespace-nowrap">
                          {(activeMapping.status ? row[activeMapping.status] : '') ||
                            sortedStatuses.find((s) => s.id === resolvedFallbackStatusId)?.name ||
                            'Default'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-4 border-t border-black/[0.08] dark:border-white/[0.10] flex flex-wrap items-center justify-end gap-2.5">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="h-10 px-4 rounded-[10px] text-sm font-medium text-[#6E6E73] dark:text-[#A1A1A6] hover:bg-black/[0.05] dark:hover:bg-white/[0.08] transition-colors"
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              disabled={effectiveUploadCount === 0}
              onClick={() => handleImport(targetView)}
              className="h-10 px-5 rounded-[10px] bg-[#0071E3] hover:bg-[#0077ED] dark:bg-[#0A84FF] dark:hover:bg-[#2997FF] disabled:opacity-40 disabled:pointer-events-none text-white text-sm font-medium transition-colors whitespace-nowrap"
            >
              {deduplicateOnImport && importStats.duplicateCount > 0
                ? `Upload ${effectiveUploadCount} Unique Candidates to `
                : `Fetch ${effectiveUploadCount} Rows into `}
              {targetView === 'board' ? 'Kanban Board' : 'List View'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
