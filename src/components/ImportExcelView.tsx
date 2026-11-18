import { Project, StatusDefinition, TaskItem, TeamMember } from '../types';
import { ParsedWorkbook } from '../utils/excelImport';
import { ExcelImporter } from './ExcelImporter';

interface ImportExcelViewProps {
  initialWorkbook: ParsedWorkbook | null;
  initialError?: string | null;
  statuses: StatusDefinition[];
  projects: Project[];
  members: TeamMember[];
  nextCodeNumber: number;
  onConfirmImport: (payload: {
    targetView: 'board' | 'list';
    mode: 'append' | 'replace';
    newStatuses: StatusDefinition[];
    newProjects: Project[];
    importedTasks: TaskItem[];
    nextCodeNumber: number;
  }) => void;
}

export function ImportExcelView({
  initialWorkbook,
  initialError = null,
  statuses,
  projects,
  members,
  nextCodeNumber,
  onConfirmImport,
}: ImportExcelViewProps) {
  return (
    <div className="h-full overflow-y-auto px-4 sm:px-8 py-8">
      <div className="max-w-4xl mx-auto space-y-6 pb-8">
        <div className="border-b border-black/[0.08] dark:border-white/[0.10] pb-6">
          <h1 className="text-2xl sm:text-[28px] font-display font-bold tracking-[-0.025em] text-[#1D1D1F] dark:text-[#F5F5F7]">
            Import Excel Sheet
          </h1>
          <p className="mt-1.5 text-sm text-[#6E6E73] dark:text-[#A1A1A6] max-w-2xl">
            Drop any Excel (.xlsx, .xls), CSV, or Google Sheets (.html) file below to map columns and fetch your candidate rows directly into Kanban Board or List View.
          </p>
        </div>

        <ExcelImporter
          initialWorkbook={initialWorkbook}
          initialError={initialError}
          statuses={statuses}
          projects={projects}
          members={members}
          nextCodeNumber={nextCodeNumber}
          defaultTargetView="list"
          onConfirmImport={onConfirmImport}
        />
      </div>
    </div>
  );
}
