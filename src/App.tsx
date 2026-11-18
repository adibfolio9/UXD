import { useEffect, useMemo, useRef, useState } from 'react';
import { User, onAuthStateChanged, signOut } from 'firebase/auth';
import { FileSpreadsheet, Layers, X } from 'lucide-react';
import { AnalyticsView } from './components/AnalyticsView';
import { BoardView } from './components/BoardView';
import { ImportExcelView } from './components/ImportExcelView';
import { ImportSheetModal } from './components/ImportSheetModal';
import { ItemDrawer } from './components/ItemDrawer';
import { ListView } from './components/ListView';
import { LoginScreen } from './components/LoginScreen';
import { NewItemModal } from './components/NewItemModal';
import { NewStatusModal } from './components/NewStatusModal';
import { Sidebar } from './components/Sidebar';
import { StatusPipelineView } from './components/StatusPipelineView';
import { TopBar } from './components/TopBar';
import { INITIAL_WORKSPACE_STATE, TEAM_MEMBERS } from './data/seedData';
import { auth } from './firebase';
import {
  ensureUserAccountAndWorkspaceSeeded,
  resetWorkspaceInCloud,
  saveBulkMovesToCloud,
  saveImportToCloud,
  savePresetApplyToCloud,
  saveProjectCreateToCloud,
  saveStatusCreateToCloud,
  saveStatusDeleteToCloud,
  saveStatusUpdateToCloud,
  saveStatusesReorderToCloud,
  saveTaskCreateToCloud,
  saveTaskDeleteToCloud,
  saveTaskMoveToCloud,
  saveTaskUpdateToCloud,
  subscribeToUserWorkspace,
} from './services/firestoreWorkspace';
import {
  PriorityLevel,
  Project,
  StatusCategory,
  StatusColor,
  StatusDefinition,
  TaskItem,
  ViewMode,
  WorkflowPreset,
  WorkspaceState,
} from './types';
import {
  ParsedWorkbook,
  exportTasksToExcel,
  parseSpreadsheetFile,
} from './utils/excelImport';

const THEME_KEY = 'strata-theme-v1';
const SEED_TASK_IDS = new Set(INITIAL_WORKSPACE_STATE.tasks.map((t) => t.id));

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [verificationTick, setVerificationTick] = useState(0);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [fatalSyncError, setFatalSyncError] = useState<Error | null>(null);

  const [workspace, setWorkspace] = useState<WorkspaceState>(INITIAL_WORKSPACE_STATE);
  const workspaceRef = useRef<WorkspaceState>(workspace);
  workspaceRef.current = workspace;

  const cloudCandidateIdsRef = useRef<Set<string>>(new Set());

  const [activeView, setActiveView] = useState<ViewMode>('list');
  const [selectedProjectId, setSelectedProjectId] = useState<string | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<PriorityLevel | 'all'>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string | 'all'>('all');

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [newItemOpen, setNewItemOpen] = useState(false);
  const [newStatusOpen, setNewStatusOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [droppedWorkbook, setDroppedWorkbook] = useState<ParsedWorkbook | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [importBanner, setImportBanner] = useState<string | null>(null);
  const fileDragCounter = useRef(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      return localStorage.getItem(THEME_KEY) === 'dark';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    try {
      localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
    } catch {
      // Ignore storage failures
    }
  }, [isDark]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthReady(true);
      if (!user || !user.emailVerified) {
        setWorkspaceReady(false);
        cloudCandidateIdsRef.current = new Set();
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!authReady || !currentUser || !currentUser.emailVerified) {
      return;
    }

    let cancelled = false;
    let unsubscribeSnapshot: (() => void) | null = null;

    const initCloud = async () => {
      try {
        await ensureUserAccountAndWorkspaceSeeded(currentUser);
        if (cancelled) return;
        unsubscribeSnapshot = subscribeToUserWorkspace(
          currentUser.uid,
          (snapshot) => {
            if (cancelled) return;
            cloudCandidateIdsRef.current = snapshot.cloudCandidateIds;
            setWorkspace(snapshot.workspace);
            setWorkspaceReady(true);
          },
          (err) => {
            if (!cancelled) setFatalSyncError(err);
          }
        );
      } catch (err) {
        if (!cancelled) {
          setFatalSyncError(err instanceof Error ? err : new Error(String(err)));
        }
      }
    };

    void initCloud();

    return () => {
      cancelled = true;
      if (unsubscribeSnapshot) unsubscribeSnapshot();
    };
  }, [authReady, currentUser, verificationTick]);

  const filteredTasks = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return workspace.tasks.filter((task) => {
      if (selectedProjectId !== 'all' && task.projectId !== selectedProjectId) {
        return false;
      }
      if (priorityFilter !== 'all' && task.priority !== priorityFilter) {
        return false;
      }
      if (assigneeFilter !== 'all' && task.assigneeId !== assigneeFilter) {
        return false;
      }
      if (query) {
        const hay = `${task.code} ${task.timestamp} ${task.fullName} ${task.email} ${task.contactNo} ${task.portfolioUrl} ${task.currentLocation} ${task.yearsOfExperience} ${task.designedAiProduct} ${task.noticePeriod} ${task.resumeUrl} ${task.message} ${task.expectedSalary} ${task.readyToRelocateIn}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
  }, [workspace.tasks, selectedProjectId, priorityFilter, assigneeFilter, searchQuery]);

  const selectedProject = useMemo(
    () => workspace.projects.find((p) => p.id === selectedProjectId) ?? null,
    [workspace.projects, selectedProjectId]
  );

  const selectedTask = useMemo(
    () => workspace.tasks.find((t) => t.id === selectedTaskId) ?? null,
    [workspace.tasks, selectedTaskId]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedTaskId(null);
        setNewItemOpen(false);
        setNewStatusOpen(false);
        setImportModalOpen(false);
        setDroppedWorkbook(null);
        setImportError(null);
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (fatalSyncError) {
    throw fatalSyncError;
  }

  const handleRefreshVerification = async (): Promise<boolean> => {
    if (!auth.currentUser) return false;
    await auth.currentUser.reload();
    await auth.currentUser.getIdToken(true);
    setCurrentUser(auth.currentUser);
    setVerificationTick((n) => n + 1);
    return Boolean(auth.currentUser.emailVerified);
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#F5F5F7] dark:bg-black flex items-center justify-center p-6">
        <div className="flex items-center gap-3 text-sm font-medium text-[#6E6E73] dark:text-[#A1A1A6]">
          <span className="w-7 h-7 rounded-lg bg-[#1D1D1F] dark:bg-[#0A84FF] text-white flex items-center justify-center">
            <Layers className="w-4 h-4 animate-pulse" aria-hidden="true" />
          </span>
          <span>Checking session...</span>
        </div>
      </div>
    );
  }

  if (!currentUser || !currentUser.emailVerified) {
    return (
      <LoginScreen
        unverifiedUser={currentUser && !currentUser.emailVerified ? currentUser : null}
        isDark={isDark}
        onToggleTheme={() => setIsDark((prev) => !prev)}
        onRefreshVerification={handleRefreshVerification}
      />
    );
  }

  const uid = currentUser.uid;

  const reportAsyncError = (err: unknown) => {
    setFatalSyncError(err instanceof Error ? err : new Error(String(err)));
  };

  const handleMoveTask = (taskId: string, targetStatusId: string, targetIndex?: number) => {
    const prev = workspaceRef.current;
    const task = prev.tasks.find((t) => t.id === taskId);
    if (!task) return;

    const fromStatus = prev.statuses.find((s) => s.id === task.statusId);
    const toStatus = prev.statuses.find((s) => s.id === targetStatusId);
    if (!toStatus) return;

    const statusChanged = task.statusId !== targetStatusId;
    const nowIso = new Date().toISOString();

    const updatedHistory =
      statusChanged && fromStatus
        ? [
            {
              id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              fromStatusName: fromStatus.name,
              toStatusName: toStatus.name,
              changedAt: nowIso,
            },
            ...task.statusHistory,
          ].slice(0, 20)
        : task.statusHistory;

    const remainingTargetTasks = prev.tasks
      .filter((t) => t.statusId === targetStatusId && t.id !== taskId)
      .sort((a, b) => a.order - b.order);

    const insertAt =
      targetIndex !== undefined
        ? Math.max(0, Math.min(targetIndex, remainingTargetTasks.length))
        : remainingTargetTasks.length;

    const movedTaskBase: TaskItem = {
      ...task,
      statusId: targetStatusId,
      updatedAt: nowIso,
      statusHistory: updatedHistory,
    };

    const reorderedTarget = [...remainingTargetTasks];
    reorderedTarget.splice(insertAt, 0, movedTaskBase);

    const targetOrderMap = new Map(reorderedTarget.map((item, idx) => [item.id, idx]));
    const finalMovedTask: TaskItem = {
      ...movedTaskBase,
      order: targetOrderMap.get(taskId) ?? 0,
    };
    const changedSiblings = reorderedTarget
      .map((item, idx) => ({ ...item, order: idx }))
      .filter((item) => item.id !== taskId && item.order !== task.order);

    setWorkspace({
      ...prev,
      tasks: prev.tasks.map((t) => {
        if (t.id === taskId) return finalMovedTask;
        if (targetOrderMap.has(t.id)) {
          return { ...t, order: targetOrderMap.get(t.id)! };
        }
        return t;
      }),
    });

    void saveTaskMoveToCloud(
      uid,
      finalMovedTask,
      changedSiblings,
      cloudCandidateIdsRef.current
    ).catch(reportAsyncError);
  };

  const handleBulkMoveTasks = (taskIds: string[], targetStatusId: string) => {
    const prev = workspaceRef.current;
    const toStatus = prev.statuses.find((s) => s.id === targetStatusId);
    if (!toStatus) return;

    const taskIdSet = new Set(taskIds);
    const statusMap = new Map(prev.statuses.map((s) => [s.id, s]));
    const nowIso = new Date().toISOString();
    let nextOrder = prev.tasks.filter((t) => t.statusId === targetStatusId).length;

    const updatedSubset: TaskItem[] = [];
    const nextTasks = prev.tasks.map((task) => {
      if (!taskIdSet.has(task.id) || task.statusId === targetStatusId) {
        return task;
      }
      const fromStatus = statusMap.get(task.statusId);
      const historyEntry = fromStatus
        ? [
            {
              id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              fromStatusName: fromStatus.name,
              toStatusName: toStatus.name,
              changedAt: nowIso,
            },
            ...task.statusHistory,
          ].slice(0, 20)
        : task.statusHistory;

      const updated: TaskItem = {
        ...task,
        statusId: targetStatusId,
        order: nextOrder++,
        updatedAt: nowIso,
        statusHistory: historyEntry,
      };
      updatedSubset.push(updated);
      return updated;
    });

    if (updatedSubset.length === 0) return;

    setWorkspace({ ...prev, tasks: nextTasks });
    void saveBulkMovesToCloud(uid, updatedSubset, cloudCandidateIdsRef.current).catch(
      reportAsyncError
    );
  };

  const handleReorderStatus = (sourceStatusId: string, targetIndex: number) => {
    const prev = workspaceRef.current;
    const sorted = [...prev.statuses].sort((a, b) => a.order - b.order);
    const currentIndex = sorted.findIndex((s) => s.id === sourceStatusId);
    if (currentIndex === -1 || currentIndex === targetIndex) return;

    const clampedTarget = Math.max(0, Math.min(targetIndex, sorted.length - 1));
    const [moved] = sorted.splice(currentIndex, 1);
    sorted.splice(clampedTarget, 0, moved);

    const normalized = sorted.map((s, idx) => ({ ...s, order: idx }));
    setWorkspace({ ...prev, statuses: normalized });
    void saveStatusesReorderToCloud(uid, normalized).catch(reportAsyncError);
  };

  const handleUpdateStatus = (statusId: string, patch: Partial<StatusDefinition>) => {
    const prev = workspaceRef.current;
    const target = prev.statuses.find((s) => s.id === statusId);
    if (!target) return;
    const updatedStatus = { ...target, ...patch };
    setWorkspace({
      ...prev,
      statuses: prev.statuses.map((s) => (s.id === statusId ? updatedStatus : s)),
    });
    void saveStatusUpdateToCloud(uid, updatedStatus).catch(reportAsyncError);
  };

  const handleCreateStatus = (payload: {
    name: string;
    category: StatusCategory;
    color: StatusColor;
    wipLimit: number | null;
    description: string;
    insertAtEnd: boolean;
  }) => {
    const prev = workspaceRef.current;
    const sorted = [...prev.statuses].sort((a, b) => a.order - b.order);
    const newStatus: StatusDefinition = {
      id: `status-${Date.now()}`,
      name: payload.name,
      category: payload.category,
      color: payload.color,
      wipLimit: payload.wipLimit,
      description: payload.description,
      order: sorted.length,
    };

    if (payload.insertAtEnd) {
      sorted.push(newStatus);
    } else {
      const firstDoneIndex = sorted.findIndex((s) => s.category === 'done');
      if (firstDoneIndex === -1) {
        sorted.push(newStatus);
      } else {
        sorted.splice(firstDoneIndex, 0, newStatus);
      }
    }

    const normalized = sorted.map((s, idx) => ({ ...s, order: idx }));
    const createdFinal = normalized.find((s) => s.id === newStatus.id) ?? newStatus;
    setWorkspace({ ...prev, statuses: normalized });
    void saveStatusCreateToCloud(uid, createdFinal, normalized).catch(reportAsyncError);
  };

  const handleDeleteStatus = (statusId: string, reassignToStatusId?: string) => {
    const prev = workspaceRef.current;
    if (prev.statuses.length <= 2) return;

    const remaining = prev.statuses
      .filter((s) => s.id !== statusId)
      .sort((a, b) => a.order - b.order)
      .map((s, idx) => ({ ...s, order: idx }));

    const fallbackId = reassignToStatusId ?? remaining[0]?.id;
    const toStatus = remaining.find((s) => s.id === fallbackId);
    const fromStatus = prev.statuses.find((s) => s.id === statusId);
    const nowIso = new Date().toISOString();

    let nextOrder = prev.tasks.filter((t) => t.statusId === fallbackId).length;
    const reassignedTasks: TaskItem[] = [];

    const updatedTasks = prev.tasks.map((t) => {
      if (t.statusId !== statusId || !fallbackId) return t;
      const updated: TaskItem = {
        ...t,
        statusId: fallbackId,
        order: nextOrder++,
        updatedAt: nowIso,
        statusHistory:
          fromStatus && toStatus
            ? [
                {
                  id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                  fromStatusName: fromStatus.name,
                  toStatusName: toStatus.name,
                  changedAt: nowIso,
                },
                ...t.statusHistory,
              ].slice(0, 20)
            : t.statusHistory,
      };
      reassignedTasks.push(updated);
      return updated;
    });

    setWorkspace({
      ...prev,
      statuses: remaining,
      tasks: updatedTasks,
    });
    void saveStatusDeleteToCloud(
      uid,
      statusId,
      remaining,
      reassignedTasks,
      cloudCandidateIdsRef.current
    ).catch(reportAsyncError);
  };

  const handleApplyPreset = (preset: WorkflowPreset) => {
    const prev = workspaceRef.current;
    const oldStatusIds = prev.statuses.map((s) => s.id);
    const oldStatusMap = new Map(prev.statuses.map((s) => [s.id, s]));
    const stamp = Date.now();
    const nextStatuses: StatusDefinition[] = preset.statuses.map((s, idx) => ({
      ...s,
      id: `${s.id}-${stamp}`,
      order: idx,
    }));

    const findMatchingNewStatus = (cat: StatusCategory) =>
      nextStatuses.find((s) => s.category === cat) ?? nextStatuses[0];

    const counters = new Map<string, number>();

    const remappedTasks = prev.tasks.map((task) => {
      const prevStatus = oldStatusMap.get(task.statusId);
      const target = findMatchingNewStatus(prevStatus?.category ?? 'backlog');
      const nextIdx = counters.get(target.id) ?? 0;
      counters.set(target.id, nextIdx + 1);
      return {
        ...task,
        statusId: target.id,
        order: nextIdx,
      };
    });

    setWorkspace({
      ...prev,
      statuses: nextStatuses,
      tasks: remappedTasks,
    });
    void savePresetApplyToCloud(
      uid,
      oldStatusIds,
      nextStatuses,
      remappedTasks,
      cloudCandidateIdsRef.current
    ).catch(reportAsyncError);
  };

  const handleQuickCreateTask = (statusId: string, fullName: string) => {
    const prev = workspaceRef.current;
    const projectId =
      selectedProjectId !== 'all'
        ? selectedProjectId
        : prev.projects[0]?.id ?? 'proj-lead-staff';
    const columnCount = prev.tasks.filter((t) => t.statusId === statusId).length;
    const nowFormatted = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const newTask: TaskItem = {
      id: `cand-${Date.now()}`,
      code: `CND-${prev.nextCodeNumber}`,
      projectId,
      statusId,
      order: columnCount,
      priority: 'medium',
      assigneeId: TEAM_MEMBERS[0].id,
      updatedAt: new Date().toISOString(),
      statusHistory: [],
      timestamp: nowFormatted,
      fullName,
      email: '',
      contactNo: '',
      portfolioUrl: '',
      currentLocation: '',
      yearsOfExperience: '',
      designedAiProduct: '',
      noticePeriod: '',
      resumeUrl: '',
      message: '',
      expectedSalary: '',
      readyToRelocateIn: '',
    };

    const nextCode = prev.nextCodeNumber + 1;
    setWorkspace({
      ...prev,
      nextCodeNumber: nextCode,
      tasks: [...prev.tasks, newTask],
    });
    void saveTaskCreateToCloud(uid, newTask, nextCode).catch(reportAsyncError);
  };

  const handleCreateTask = (payload: {
    projectId: string;
    statusId: string;
    priority: PriorityLevel;
    assigneeId: string;
    fullName: string;
    email: string;
    contactNo: string;
    portfolioUrl: string;
    currentLocation: string;
    yearsOfExperience: string;
    designedAiProduct: string;
    noticePeriod: string;
    resumeUrl: string;
    message: string;
    expectedSalary: string;
    readyToRelocateIn: string;
  }) => {
    const prev = workspaceRef.current;
    const columnCount = prev.tasks.filter((t) => t.statusId === payload.statusId).length;
    const nowFormatted = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const newTask: TaskItem = {
      id: `cand-${Date.now()}`,
      code: `CND-${prev.nextCodeNumber}`,
      projectId: payload.projectId,
      statusId: payload.statusId,
      order: columnCount,
      priority: payload.priority,
      assigneeId: payload.assigneeId,
      updatedAt: new Date().toISOString(),
      statusHistory: [],
      timestamp: nowFormatted,
      fullName: payload.fullName,
      email: payload.email,
      contactNo: payload.contactNo,
      portfolioUrl: payload.portfolioUrl,
      currentLocation: payload.currentLocation,
      yearsOfExperience: payload.yearsOfExperience,
      designedAiProduct: payload.designedAiProduct,
      noticePeriod: payload.noticePeriod,
      resumeUrl: payload.resumeUrl,
      message: payload.message,
      expectedSalary: payload.expectedSalary,
      readyToRelocateIn: payload.readyToRelocateIn,
    };

    const nextCode = prev.nextCodeNumber + 1;
    setWorkspace({
      ...prev,
      nextCodeNumber: nextCode,
      tasks: [...prev.tasks, newTask],
    });
    void saveTaskCreateToCloud(uid, newTask, nextCode).catch(reportAsyncError);
  };

  const handleUpdateTask = (taskId: string, patch: Partial<TaskItem>) => {
    const prev = workspaceRef.current;
    const target = prev.tasks.find((t) => t.id === taskId);
    if (!target) return;
    const updatedTask: TaskItem = {
      ...target,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    setWorkspace({
      ...prev,
      tasks: prev.tasks.map((t) => (t.id === taskId ? updatedTask : t)),
    });
    void saveTaskUpdateToCloud(
      uid,
      updatedTask,
      cloudCandidateIdsRef.current.has(taskId)
    ).catch(reportAsyncError);
  };

  const handleDeleteTask = (taskId: string) => {
    const prev = workspaceRef.current;
    const target = prev.tasks.find((t) => t.id === taskId);
    if (!target) return;
    setWorkspace({
      ...prev,
      tasks: prev.tasks.filter((t) => t.id !== taskId),
    });
    void saveTaskDeleteToCloud(
      uid,
      target,
      SEED_TASK_IDS.has(taskId),
      cloudCandidateIdsRef.current.has(taskId)
    ).catch(reportAsyncError);
  };

  const handleCreateProject = (name: string, key: string) => {
    const prev = workspaceRef.current;
    const newId = `proj-${Date.now()}`;
    const newProject: Project = {
      id: newId,
      key,
      name,
      summary: 'Custom role or track.',
      leadId: TEAM_MEMBERS[0].id,
      targetDate: '2026-12-30',
    };
    setWorkspace({
      ...prev,
      projects: [...prev.projects, newProject],
    });
    setSelectedProjectId(newId);
    void saveProjectCreateToCloud(uid, newProject).catch(reportAsyncError);
  };

  const handleResetWorkspace = () => {
    setWorkspace(INITIAL_WORKSPACE_STATE);
    setSelectedProjectId('all');
    setSearchQuery('');
    setPriorityFilter('all');
    setAssigneeFilter('all');
    setSelectedTaskId(null);
    void resetWorkspaceInCloud(uid).catch(reportAsyncError);
  };

  const handleConfirmImport = (payload: {
    targetView: 'board' | 'list';
    mode: 'append' | 'replace';
    newStatuses: StatusDefinition[];
    newProjects: Project[];
    importedTasks: TaskItem[];
    nextCodeNumber: number;
  }) => {
    const prev = workspaceRef.current;
    const mergedStatuses = [...prev.statuses].sort((a, b) => a.order - b.order);
    if (payload.newStatuses.length > 0) {
      payload.newStatuses.forEach((ns) => {
        const firstDoneIdx = mergedStatuses.findIndex((s) => s.category === 'done');
        if (ns.category !== 'done' && firstDoneIdx !== -1) {
          mergedStatuses.splice(firstDoneIdx, 0, ns);
        } else {
          mergedStatuses.push(ns);
        }
      });
    }

    const normalizedStatuses = mergedStatuses.map((s, idx) => ({ ...s, order: idx }));
    const mergedProjects = [...prev.projects, ...payload.newProjects];

    let offsetTasks: TaskItem[];
    let mergedTasks: TaskItem[];
    if (payload.mode === 'replace') {
      offsetTasks = payload.importedTasks;
      mergedTasks = offsetTasks;
    } else {
      const existingCountByStatus = new Map<string, number>();
      for (const t of prev.tasks) {
        existingCountByStatus.set(
          t.statusId,
          (existingCountByStatus.get(t.statusId) ?? 0) + 1
        );
      }
      offsetTasks = payload.importedTasks.map((t) => {
        const offset = existingCountByStatus.get(t.statusId) ?? 0;
        existingCountByStatus.set(t.statusId, offset + 1);
        return { ...t, order: offset };
      });
      mergedTasks = [...prev.tasks, ...offsetTasks];
    }

    const nextCode = Math.max(prev.nextCodeNumber, payload.nextCodeNumber);
    setWorkspace({
      ...prev,
      statuses: normalizedStatuses,
      projects: mergedProjects,
      tasks: mergedTasks,
      nextCodeNumber: nextCode,
    });

    setSelectedProjectId('all');
    setActiveView(payload.targetView);
    setDroppedWorkbook(null);
    setImportError(null);
    setImportBanner(
      `Fetched ${payload.importedTasks.length} ${
        payload.importedTasks.length === 1 ? 'item' : 'items'
      } into ${payload.targetView === 'board' ? 'Kanban Board' : 'List View'} (synced to cloud).`
    );

    void saveImportToCloud(uid, {
      mode: payload.mode,
      newStatuses: payload.newStatuses,
      allStatuses: normalizedStatuses,
      newProjects: payload.newProjects,
      importedTasks: offsetTasks,
      nextCodeNumber: nextCode,
    }).catch(reportAsyncError);
  };

  const isFileDrag = (e: React.DragEvent) =>
    Array.from(e.dataTransfer?.types ?? []).includes('Files');

  const handleRootDragEnter = (e: React.DragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    fileDragCounter.current += 1;
    setIsDraggingFile(true);
  };

  const handleRootDragOver = (e: React.DragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
  };

  const handleRootDragLeave = (e: React.DragEvent) => {
    if (!isFileDrag(e)) return;
    fileDragCounter.current = Math.max(0, fileDragCounter.current - 1);
    if (fileDragCounter.current === 0) {
      setIsDraggingFile(false);
    }
  };

  const handleRootDrop = async (e: React.DragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    fileDragCounter.current = 0;
    setIsDraggingFile(false);

    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    try {
      const parsed = await parseSpreadsheetFile(file);
      setImportError(null);
      setDroppedWorkbook(parsed);
      if (activeView !== 'import') {
        setImportModalOpen(true);
      }
    } catch {
      setDroppedWorkbook(null);
      setImportError(
        `Could not read "${file.name}". Please drop a valid .xlsx, .xls, .ods, .csv, or Google Sheets .html file.`
      );
      if (activeView !== 'import') {
        setImportModalOpen(true);
      }
    }
  };

  return (
    <div
      onDragEnter={handleRootDragEnter}
      onDragOver={handleRootDragOver}
      onDragLeave={handleRootDragLeave}
      onDrop={(e) => void handleRootDrop(e)}
      className="relative min-h-screen h-screen flex bg-[#F5F5F7] dark:bg-black text-[#1D1D1F] dark:text-[#F5F5F7] overflow-hidden"
    >
      <Sidebar
        workspaceName={workspace.workspaceName}
        activeView={activeView}
        onSelectView={setActiveView}
        projects={workspace.projects}
        tasks={workspace.tasks}
        selectedProjectId={selectedProjectId}
        onSelectProject={setSelectedProjectId}
        onCreateProject={handleCreateProject}
        onResetWorkspace={handleResetWorkspace}
        isDark={isDark}
        onToggleTheme={() => setIsDark((prev) => !prev)}
        userDisplayName={currentUser.displayName || ''}
        userEmail={currentUser.email || ''}
        onSignOut={() => void signOut(auth)}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        <TopBar
          workspaceName={workspace.workspaceName}
          activeView={activeView}
          selectedProject={selectedProject}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onOpenNewItem={() => setNewItemOpen(true)}
          onOpenImportSheet={() => {
            setDroppedWorkbook(null);
            setImportError(null);
            setImportModalOpen(true);
          }}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
        />

        {importBanner && (
          <div className="px-4 sm:px-6 py-2 bg-[#0071E3]/[0.08] dark:bg-[#0A84FF]/[0.15] border-b border-[#0071E3]/15 flex items-center justify-between gap-3 text-xs text-[#0071E3] dark:text-[#2997FF] shrink-0">
            <span className="font-medium">{importBanner}</span>
            <button
              type="button"
              onClick={() => setImportBanner(null)}
              aria-label="Dismiss import confirmation"
              className="p-1 rounded-md hover:bg-[#0071E3]/10"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <main className="flex-1 min-h-0 overflow-hidden">
          {!workspaceReady ? (
            <div className="h-full flex items-center justify-center p-6 text-sm text-[#6E6E73] dark:text-[#A1A1A6]">
              Syncing your workspace...
            </div>
          ) : (
            <>
              {activeView === 'board' && (
                <BoardView
                  statuses={workspace.statuses}
                  tasks={filteredTasks}
                  projects={workspace.projects}
                  members={TEAM_MEMBERS}
                  priorityFilter={priorityFilter}
                  onPriorityFilterChange={setPriorityFilter}
                  assigneeFilter={assigneeFilter}
                  onAssigneeFilterChange={setAssigneeFilter}
                  searchQuery={searchQuery}
                  onSearchChange={setSearchQuery}
                  onMoveTask={handleMoveTask}
                  onReorderStatus={handleReorderStatus}
                  onSelectTask={setSelectedTaskId}
                  onQuickCreateTask={handleQuickCreateTask}
                  onOpenNewStatusModal={() => setNewStatusOpen(true)}
                  onOpenImportSheet={() => {
                    setDroppedWorkbook(null);
                    setImportError(null);
                    setImportModalOpen(true);
                  }}
                  onOpenStatusPipeline={() => setActiveView('pipeline')}
                />
              )}

              {activeView === 'list' && (
                <ListView
                  statuses={workspace.statuses}
                  tasks={filteredTasks}
                  projects={workspace.projects}
                  priorityFilter={priorityFilter}
                  onPriorityFilterChange={setPriorityFilter}
                  searchQuery={searchQuery}
                  onSearchChange={setSearchQuery}
                  onMoveTask={(taskId, statusId) => handleMoveTask(taskId, statusId)}
                  onBulkMoveTasks={handleBulkMoveTasks}
                  onSelectTask={setSelectedTaskId}
                  onOpenNewItem={() => setNewItemOpen(true)}
                  onOpenImportSheet={() => {
                    setDroppedWorkbook(null);
                    setImportError(null);
                    setImportModalOpen(true);
                  }}
                  onExportExcel={() =>
                    exportTasksToExcel({
                      tasks: filteredTasks,
                      statuses: workspace.statuses,
                      projects: workspace.projects,
                    })
                  }
                />
              )}

              {activeView === 'pipeline' && (
                <StatusPipelineView
                  statuses={workspace.statuses}
                  tasks={workspace.tasks}
                  onReorderStatus={handleReorderStatus}
                  onUpdateStatus={handleUpdateStatus}
                  onCreateStatus={handleCreateStatus}
                  onDeleteStatus={handleDeleteStatus}
                  onApplyPreset={handleApplyPreset}
                />
              )}

              {activeView === 'analytics' && (
                <AnalyticsView
                  statuses={workspace.statuses}
                  tasks={filteredTasks}
                  projects={workspace.projects}
                  onOpenStatusPipeline={() => setActiveView('pipeline')}
                />
              )}

              {activeView === 'import' && (
                <ImportExcelView
                  initialWorkbook={droppedWorkbook}
                  initialError={importError}
                  statuses={workspace.statuses}
                  projects={workspace.projects}
                  members={TEAM_MEMBERS}
                  nextCodeNumber={workspace.nextCodeNumber}
                  onConfirmImport={handleConfirmImport}
                />
              )}
            </>
          )}
        </main>
      </div>

      <ItemDrawer
        task={selectedTask}
        statuses={workspace.statuses}
        projects={workspace.projects}
        members={TEAM_MEMBERS}
        onClose={() => setSelectedTaskId(null)}
        onUpdateTask={handleUpdateTask}
        onChangeStatus={(taskId, statusId) => handleMoveTask(taskId, statusId)}
        onDeleteTask={handleDeleteTask}
      />

      <NewItemModal
        open={newItemOpen}
        statuses={workspace.statuses}
        projects={workspace.projects}
        members={TEAM_MEMBERS}
        defaultProjectId={
          selectedProjectId !== 'all'
            ? selectedProjectId
            : workspace.projects[0]?.id ?? 'proj-lead-staff'
        }
        onClose={() => setNewItemOpen(false)}
        onCreate={handleCreateTask}
      />

      <NewStatusModal
        open={newStatusOpen}
        onClose={() => setNewStatusOpen(false)}
        onCreate={handleCreateStatus}
      />

      <ImportSheetModal
        open={importModalOpen}
        initialWorkbook={droppedWorkbook}
        initialError={importError}
        statuses={workspace.statuses}
        projects={workspace.projects}
        members={TEAM_MEMBERS}
        nextCodeNumber={workspace.nextCodeNumber}
        defaultTargetView={activeView === 'board' ? 'board' : 'list'}
        onClose={() => {
          setImportModalOpen(false);
          setDroppedWorkbook(null);
          setImportError(null);
        }}
        onConfirmImport={handleConfirmImport}
      />

      {isDraggingFile && (
        <div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-xs flex items-center justify-center p-6 pointer-events-none">
          <div className="max-w-md w-full rounded-2xl border-2 border-dashed border-[#0071E3] dark:border-[#0A84FF] bg-white/95 dark:bg-[#1C1C1E]/95 p-8 text-center space-y-2 shadow-2xl">
            <FileSpreadsheet className="w-10 h-10 text-[#0071E3] dark:text-[#2997FF] mx-auto" />
            <h2 className="text-base font-display font-semibold tracking-[-0.01em] text-[#1D1D1F] dark:text-[#F5F5F7]">
              Drop Excel, CSV, or Sheet HTML to Import
            </h2>
            <p className="text-xs text-[#6E6E73] dark:text-[#A1A1A6]">
              Release to map columns and sync rows directly into List View and Kanban Board.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
