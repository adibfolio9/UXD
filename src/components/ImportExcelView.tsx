import {
  GoogleSheetSyncConfig,
  Project,
  StatusDefinition,
  TaskItem,
  TeamMember,
} from '../types';
import { ParsedWorkbook } from '../utils/excelImport';
import { ExcelImporter } from './ExcelImporter';
import { GoogleSheetAutoSyncPanel } from './GoogleSheetAutoSyncPanel';

interface ImportExcelViewProps {
  initialWorkbook: ParsedWorkbook | null;
  initialError?: string | null;
  statuses: StatusDefinition[];
  projects: Project[];
  members: TeamMember[];
  nextCodeNumber: number;
  userEmail: string;
  sheetSyncConfig: GoogleSheetSyncConfig | null;
  sheetsConnected: boolean;
  isSyncingGoogleSheet: boolean;
  sheetSyncError: string | null;
  onConnectGoogleSheets: () => Promise<string | null>;
  onDisconnectGoogleSheets: () => void;
  onSaveSheetSyncConfig: (next: GoogleSheetSyncConfig | null) => void;
  onSyncGoogleSheetNow: (overrideConfig?: GoogleSheetSyncConfig) => Promise<void>;
  onOpenShareResumes: () => void;
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

export function ImportExcelView({
  initialWorkbook,
  initialError = null,
  statuses,
  projects,
  members,
  nextCodeNumber,
  userEmail,
  sheetSyncConfig,
  sheetsConnected,
  isSyncingGoogleSheet,
  sheetSyncError,
  onConnectGoogleSheets,
  onDisconnectGoogleSheets,
  onSaveSheetSyncConfig,
  onSyncGoogleSheetNow,
  onOpenShareResumes,
  onConfirmImport,
}: ImportExcelViewProps) {
  return (
    <div className="h-full overflow-y-auto px-4 sm:px-8 py-8">
      <div className="max-w-4xl mx-auto space-y-6 pb-8">
        <div className="border-b border-black/[0.08] dark:border-white/[0.10] pb-6">
          <h1 className="text-2xl sm:text-[28px] font-display font-bold tracking-[-0.025em] text-[#1D1D1F] dark:text-[#F5F5F7]">
            Sheet Auto-Sync &amp; Import
          </h1>
          <p className="mt-1.5 text-sm text-[#6E6E73] dark:text-[#A1A1A6] max-w-2xl">
            Connect your live Google Form Sheet for automatic background syncing, or drop any Excel (.xlsx, .xls), CSV, or Google Sheets (.html) file below.
          </p>
        </div>

        <GoogleSheetAutoSyncPanel
          config={sheetSyncConfig}
          sheetsConnected={sheetsConnected}
          isSyncing={isSyncingGoogleSheet}
          syncError={sheetSyncError}
          userEmail={userEmail}
          onConnectGoogleSheets={onConnectGoogleSheets}
          onDisconnectGoogleSheets={onDisconnectGoogleSheets}
          onSaveConfig={onSaveSheetSyncConfig}
          onSyncNow={onSyncGoogleSheetNow}
          onOpenShareResumes={onOpenShareResumes}
        />

        <div className="pt-2 space-y-3">
          <h2 className="text-sm font-display font-semibold tracking-[-0.01em] text-[#1D1D1F] dark:text-[#F5F5F7]">
            Manual File Upload (.xlsx, .csv, .html)
          </h2>
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
    </div>
  );
}
