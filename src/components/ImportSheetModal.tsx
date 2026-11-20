import { FileSpreadsheet, X } from 'lucide-react';
import { Project, StatusDefinition, TaskItem, TeamMember } from '../types';
import { ParsedWorkbook } from '../utils/excelImport';
import { ExcelImporter } from './ExcelImporter';

interface ImportSheetModalProps {
  open: boolean;
  initialWorkbook: ParsedWorkbook | null;
  initialError?: string | null;
  statuses: StatusDefinition[];
  projects: Project[];
  members: TeamMember[];
  nextCodeNumber: number;
  defaultTargetView: 'board' | 'list';
  onClose: () => void;
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
}

export function ImportSheetModal({
  open,
  initialWorkbook,
  initialError = null,
  statuses,
  projects,
  members,
  nextCodeNumber,
  defaultTargetView,
  onClose,
  onConfirmImport,
}: ImportSheetModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Import Excel or CSV spreadsheet"
    >
      <div
        className="fixed inset-0 bg-black/35 backdrop-blur-xs"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-3xl max-h-[90vh] rounded-2xl border border-black/[0.10] dark:border-white/[0.12] bg-white dark:bg-[#1C1C1E] shadow-2xl flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-black/[0.08] dark:border-white/[0.10] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <FileSpreadsheet className="w-5 h-5 text-[#0071E3] dark:text-[#2997FF]" />
            <h2 className="text-[15px] font-display font-semibold tracking-[-0.01em] text-[#1D1D1F] dark:text-[#F5F5F7]">
              Import Excel Sheet to Kanban or List View
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close import modal"
            className="p-1.5 rounded-lg text-[#86868B] hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7] hover:bg-black/[0.05] dark:hover:bg-white/[0.08] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <ExcelImporter
            initialWorkbook={initialWorkbook}
            initialError={initialError}
            statuses={statuses}
            projects={projects}
            members={members}
            nextCodeNumber={nextCodeNumber}
            defaultTargetView={defaultTargetView}
            onCancel={onClose}
            onConfirmImport={(payload) => {
              onConfirmImport(payload);
              onClose();
            }}
          />
        </div>
      </div>
    </div>
  );
}
