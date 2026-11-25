import { ReactNode } from 'react';
import { FileSpreadsheet, Menu, Plus, Search, X } from 'lucide-react';
import { Project, ViewMode } from '../types';

interface TopBarProps {
  workspaceName: string;
  activeView: ViewMode;
  selectedProject: Project | null;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onNavigateDashboard: () => void;
  onOpenNewItem: () => void;
  onOpenImportSheet: () => void;
  onOpenMobileMenu: () => void;
  notificationSlot?: ReactNode;
}

const VIEW_TITLES: Record<ViewMode, string> = {
  dashboard: 'Dashboard',
  form: 'Lead Form',
  board: 'Kanban Board',
  list: 'List / Table',
  pipeline: 'Status Pipeline',
  analytics: 'Flow Analytics',
  import: 'Sheet Sync & Import',
};

export function TopBar({
  workspaceName,
  activeView,
  selectedProject,
  searchQuery,
  onSearchChange,
  onNavigateDashboard,
  onOpenNewItem,
  onOpenImportSheet,
  onOpenMobileMenu,
  notificationSlot,
}: TopBarProps) {
  const projectLabel = selectedProject ? selectedProject.name : 'All Roles';

  return (
    <header className="h-14 px-4 sm:px-6 bg-white/80 dark:bg-[#161617]/80 backdrop-blur-xl backdrop-saturate-150 border-b border-black/[0.08] dark:border-white/[0.10] flex items-center justify-between gap-6 sticky top-0 z-20 shrink-0">
      {/* Zone 1: Mobile Menu + Breadcrumb */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="Open navigation menu"
          className="lg:hidden min-h-10 min-w-10 inline-flex items-center justify-center rounded-[10px] text-[#6E6E73] dark:text-[#A1A1A6] hover:bg-black/[0.05] dark:hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3]"
        >
          <Menu className="w-5 h-5" />
        </button>

        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[13px] min-w-0">
          <button
            type="button"
            onClick={onNavigateDashboard}
            className="hidden sm:inline text-[#6E6E73] dark:text-[#A1A1A6] hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7] whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:underline"
          >
            {workspaceName}
          </button>
          <span className="hidden sm:inline text-[#D2D2D7] dark:text-[#38383A]" aria-hidden="true">
            /
          </span>
          <span className="text-[#6E6E73] dark:text-[#A1A1A6] truncate max-w-[140px] sm:max-w-[200px]">
            {projectLabel}
          </span>
          <span className="text-[#D2D2D7] dark:text-[#38383A]" aria-hidden="true">
            /
          </span>
          <span className="font-semibold tracking-[-0.01em] text-[#1D1D1F] dark:text-[#F5F5F7] whitespace-nowrap shrink-0">
            {VIEW_TITLES[activeView]}
          </span>
        </nav>
      </div>

      {/* Zone 2 + 3: Search & Primary Actions */}
      <div className="flex items-center gap-2.5 shrink-0">
        {activeView !== 'pipeline' && activeView !== 'import' && activeView !== 'form' && (
          <div className="relative hidden md:block w-56 lg:w-64">
            <Search
              className="w-4 h-4 text-[#86868B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search name, email, skill..."
              className="w-full h-9 pl-9 pr-8 text-[13px] rounded-[10px] border border-black/[0.08] dark:border-white/[0.12] bg-[#F5F5F7] dark:bg-[#2C2C2E]/80 text-[#1D1D1F] dark:text-[#F5F5F7] placeholder:text-[#86868B] focus:outline-none focus:ring-2 focus:ring-[#0071E3] focus:bg-white dark:focus:bg-[#1C1C1E] transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#86868B] hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {activeView !== 'import' && (
          <button
            type="button"
            onClick={onOpenImportSheet}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[10px] border border-black/[0.10] dark:border-white/[0.14] bg-white dark:bg-[#1C1C1E] text-[#1D1D1F] dark:text-[#F5F5F7] text-[13px] font-medium hover:bg-[#F5F5F7] dark:hover:bg-[#2C2C2E] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3]"
          >
            <FileSpreadsheet className="w-4 h-4 text-[#6E6E73] dark:text-[#A1A1A6]" />
            <span className="hidden sm:inline">Import Excel</span>
          </button>
        )}

        <button
          type="button"
          onClick={onOpenNewItem}
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-[10px] bg-[#0071E3] hover:bg-[#0077ED] dark:bg-[#0A84FF] dark:hover:bg-[#2997FF] text-white text-[13px] font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3] focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#161617]"
        >
          <Plus className="w-4 h-4" />
          <span>New Candidate</span>
        </button>

        {notificationSlot}
      </div>
    </header>
  );
}
