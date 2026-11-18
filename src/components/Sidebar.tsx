import { useState } from 'react';
import {
  BarChart3,
  FileSpreadsheet,
  FolderKanban,
  Layers,
  ListTodo,
  LogOut,
  Moon,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Sun,
  X,
} from 'lucide-react';
import { Project, TaskItem, ViewMode } from '../types';

interface SidebarProps {
  workspaceName: string;
  activeView: ViewMode;
  onSelectView: (view: ViewMode) => void;
  projects: Project[];
  tasks: TaskItem[];
  selectedProjectId: string | 'all';
  onSelectProject: (projectId: string | 'all') => void;
  onCreateProject: (name: string, key: string) => void;
  onResetWorkspace: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
  userDisplayName: string;
  userEmail: string;
  onSignOut: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: { id: ViewMode; label: string; icon: typeof FolderKanban }[] = [
  { id: 'list', label: 'List / Table', icon: ListTodo },
  { id: 'board', label: 'Kanban Board', icon: FolderKanban },
  { id: 'pipeline', label: 'Status Pipeline', icon: SlidersHorizontal },
  { id: 'analytics', label: 'Flow Analytics', icon: BarChart3 },
  { id: 'import', label: 'Import Excel', icon: FileSpreadsheet },
];

export function Sidebar({
  workspaceName,
  activeView,
  onSelectView,
  projects,
  tasks,
  selectedProjectId,
  onSelectProject,
  onCreateProject,
  onResetWorkspace,
  isDark,
  onToggleTheme,
  userDisplayName,
  userEmail,
  onSignOut,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const [addingProject, setAddingProject] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectKey, setProjectKey] = useState('');
  const [confirmingReset, setConfirmingReset] = useState(false);

  const handleAddProject = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = projectName.trim();
    if (!trimmedName) return;
    const derivedKey =
      projectKey.trim().toUpperCase().slice(0, 5) ||
      trimmedName
        .replace(/[^A-Za-z0-9]/g, '')
        .toUpperCase()
        .slice(0, 4) ||
      'PROJ';
    onCreateProject(trimmedName, derivedKey);
    setProjectName('');
    setProjectKey('');
    setAddingProject(false);
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#FBFBFD]/95 dark:bg-[#161617]/95 backdrop-blur-xl border-r border-black/[0.08] dark:border-white/[0.10] select-none">
      {/* Brand Header */}
      <div className="h-14 px-5 flex items-center justify-between border-b border-black/[0.06] dark:border-white/[0.08] shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-7 h-7 rounded-lg bg-[#1D1D1F] dark:bg-[#0A84FF] text-white flex items-center justify-center shrink-0 shadow-[0_1px_2px_rgba(0,0,0,0.12)]">
            <Layers className="w-4 h-4" aria-hidden="true" />
          </span>
          <span className="font-display font-semibold text-[15px] tracking-[-0.02em] text-[#1D1D1F] dark:text-[#F5F5F7] truncate">
            Strata
          </span>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation menu"
          className="lg:hidden p-2 -mr-2 text-[#6E6E73] hover:text-[#1D1D1F] dark:text-[#A1A1A6] dark:hover:text-[#F5F5F7] rounded-lg transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Workspace Identifier */}
      <div className="px-5 py-3.5 border-b border-black/[0.06] dark:border-white/[0.08]">
        <div className="text-[11px] font-medium text-[#86868B]">Workspace</div>
        <div className="text-[13px] font-semibold tracking-[-0.01em] text-[#1D1D1F] dark:text-[#F5F5F7] truncate mt-0.5">
          {workspaceName}
        </div>
      </div>

      {/* Primary Views */}
      <div className="px-3 py-3.5 space-y-0.5">
        <div className="px-2.5 pb-1.5 text-[11px] font-medium text-[#86868B]">
          Views
        </div>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelectView(item.id);
                onCloseMobile();
              }}
              className={`w-full min-h-10 px-3 py-2 rounded-[10px] flex items-center gap-2.5 text-[13px] font-medium transition-colors duration-150 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3] dark:focus-visible:ring-[#0A84FF] ${
                isActive
                  ? 'bg-black/[0.06] dark:bg-white/[0.11] text-[#1D1D1F] dark:text-[#F5F5F7]'
                  : 'text-[#6E6E73] dark:text-[#A1A1A6] hover:bg-black/[0.035] dark:hover:bg-white/[0.06] hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7]'
              }`}
            >
              <Icon
                className={`w-4 h-4 shrink-0 ${
                  isActive
                    ? 'text-[#0071E3] dark:text-[#2997FF]'
                    : 'text-[#86868B] dark:text-[#8E8E93]'
                }`}
                aria-hidden="true"
              />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Projects / Roles Filter */}
      <div className="px-3 py-2 flex-1 overflow-y-auto border-t border-black/[0.06] dark:border-white/[0.08]">
        <div className="px-2.5 py-2 flex items-center justify-between">
          <span className="text-[11px] font-medium text-[#86868B]">
            Roles &amp; Tracks
          </span>
          <button
            type="button"
            onClick={() => setAddingProject((prev) => !prev)}
            aria-label="Add role or track"
            className="p-1.5 rounded-lg text-[#6E6E73] hover:text-[#1D1D1F] dark:text-[#A1A1A6] dark:hover:text-[#F5F5F7] hover:bg-black/[0.05] dark:hover:bg-white/[0.08] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3]"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {addingProject && (
          <form
            onSubmit={handleAddProject}
            className="mb-2 p-2.5 rounded-xl border border-black/[0.08] dark:border-white/[0.10] bg-white dark:bg-[#1C1C1E] space-y-2"
          >
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Role or track name"
              autoFocus
              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-black/[0.12] dark:border-white/[0.14] bg-[#F5F5F7] dark:bg-black text-[#1D1D1F] dark:text-[#F5F5F7] focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
            />
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={projectKey}
                onChange={(e) => setProjectKey(e.target.value.toUpperCase())}
                placeholder="Key (e.g. AUTH)"
                maxLength={5}
                className="w-24 px-2.5 py-1.5 text-xs font-mono uppercase rounded-lg border border-black/[0.12] dark:border-white/[0.14] bg-[#F5F5F7] dark:bg-black text-[#1D1D1F] dark:text-[#F5F5F7] focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
              />
              <button
                type="submit"
                className="flex-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-[#0071E3] hover:bg-[#0077ED] dark:bg-[#0A84FF] dark:hover:bg-[#2997FF] text-white transition-colors"
              >
                Create
              </button>
            </div>
          </form>
        )}

        <div className="space-y-0.5">
          <button
            type="button"
            onClick={() => {
              onSelectProject('all');
              onCloseMobile();
            }}
            className={`w-full min-h-10 px-3 py-2 rounded-[10px] flex items-center justify-between text-[13px] transition-colors duration-150 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3] ${
              selectedProjectId === 'all'
                ? 'bg-black/[0.06] dark:bg-white/[0.11] text-[#1D1D1F] dark:text-[#F5F5F7] font-medium'
                : 'text-[#6E6E73] dark:text-[#A1A1A6] hover:bg-black/[0.035] dark:hover:bg-white/[0.06] hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7]'
            }`}
          >
            <span className="truncate">All Roles</span>
            <span className="text-xs font-mono tabular-nums text-[#86868B]">
              {tasks.length}
            </span>
          </button>

          {projects.map((project) => {
            const count = tasks.filter((t) => t.projectId === project.id).length;
            const isSelected = selectedProjectId === project.id;
            return (
              <button
                key={project.id}
                type="button"
                onClick={() => {
                  onSelectProject(project.id);
                  onCloseMobile();
                }}
                className={`w-full min-h-10 px-3 py-2 rounded-[10px] flex items-center justify-between gap-2 text-[13px] transition-colors duration-150 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3] ${
                  isSelected
                    ? 'bg-black/[0.06] dark:bg-white/[0.11] text-[#1D1D1F] dark:text-[#F5F5F7] font-medium'
                    : 'text-[#6E6E73] dark:text-[#A1A1A6] hover:bg-black/[0.035] dark:hover:bg-white/[0.06] hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7]'
                }`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className="text-[11px] font-mono text-[#86868B] shrink-0">
                    {project.key}
                  </span>
                  <span className="truncate">{project.name}</span>
                </span>
                <span className="text-xs font-mono tabular-nums text-[#86868B] shrink-0">
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Footer Actions */}
      <div className="p-3 border-t border-black/[0.06] dark:border-white/[0.08] space-y-1 shrink-0">
        <button
          type="button"
          onClick={onToggleTheme}
          className="w-full min-h-10 px-3 py-2 rounded-[10px] flex items-center justify-between text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6] hover:bg-black/[0.035] dark:hover:bg-white/[0.06] hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3]"
        >
          <span className="flex items-center gap-2">
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            <span>{isDark ? 'Light Appearance' : 'Dark Appearance'}</span>
          </span>
        </button>

        {confirmingReset ? (
          <div className="p-2 rounded-[10px] bg-black/[0.04] dark:bg-white/[0.06] flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                onResetWorkspace();
                setConfirmingReset(false);
              }}
              className="flex-1 h-8 px-2.5 rounded-lg bg-[#D70015] dark:bg-[#FF453A] text-white text-xs font-medium hover:opacity-90 transition-opacity"
            >
              Confirm Reset
            </button>
            <button
              type="button"
              onClick={() => setConfirmingReset(false)}
              className="h-8 px-2.5 rounded-lg text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6] hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7]"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingReset(true)}
            className="w-full min-h-10 px-3 py-2 rounded-[10px] flex items-center gap-2 text-xs font-medium text-[#86868B] hover:bg-black/[0.035] dark:hover:bg-white/[0.06] hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3]"
          >
            <RotateCcw className="w-3.5 h-3.5 shrink-0" />
            <span>Reset Sheet Data</span>
          </button>
        )}
        {/* Account Info + Sign Out */}
        <div className="pt-2 mt-1 border-t border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between gap-2 px-2 py-1.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-7 h-7 rounded-full bg-[#0071E3]/12 dark:bg-[#0A84FF]/20 text-[#0071E3] dark:text-[#2997FF] text-[11px] font-semibold flex items-center justify-center shrink-0">
              {(userDisplayName || userEmail || 'U').slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0">
              <div className="text-xs font-medium text-[#1D1D1F] dark:text-[#F5F5F7] truncate">
                {userDisplayName || 'Signed In'}
              </div>
              <div className="text-[11px] text-[#86868B] truncate">
                {userEmail}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            title="Sign out"
            aria-label="Sign out"
            className="p-2 rounded-lg text-[#6E6E73] dark:text-[#A1A1A6] hover:text-[#D70015] dark:hover:text-[#FF453A] hover:bg-[#FF3B30]/10 transition-colors shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 h-screen sticky top-0">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/35 backdrop-blur-xs"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative w-72 max-w-[85vw] h-full z-10">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}
