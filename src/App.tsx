import { useEffect, useMemo, useRef, useState } from 'react';
import { User, onAuthStateChanged, signOut } from 'firebase/auth';
import { FileSpreadsheet, X } from 'lucide-react';
import { AnalyticsView } from './components/AnalyticsView';
import { BoardView } from './components/BoardView';
import { DashboardView } from './components/DashboardView';
import { ImportExcelView } from './components/ImportExcelView';
import { ImportSheetModal } from './components/ImportSheetModal';
import { ItemDrawer } from './components/ItemDrawer';
import { LandingPage } from './components/LandingPage';
import {
  LeadFormView,
  inferPriorityFromLead,
  inferTrackFromExperience,
} from './components/LeadFormView';
import { ListView } from './components/ListView';
import { AuthMode, LoginScreen } from './components/LoginScreen';
import { NewItemModal } from './components/NewItemModal';
import { NewLeadToast } from './components/NewLeadToast';
import { NewStatusModal } from './components/NewStatusModal';
import { NotificationCenter } from './components/NotificationCenter';
import { Sidebar } from './components/Sidebar';
import { StatusPipelineView } from './components/StatusPipelineView';
import { TopBar } from './components/TopBar';
import { INITIAL_WORKSPACE_STATE, TEAM_MEMBERS } from './data/seedData';
import { auth } from './firebase';
import {
  PUBLIC_FORM_SLUG_ID,
  PendingLeadSubmission,
  WorkspaceSyncSnapshot,
  clearReadNotificationsInCloud,
  ensurePublicFormRouteRegistered,
  ensureUserAccountAndWorkspaceSeeded,
  ingestLeadSubmissionsToCloud,
  isPublicLeadFormPathname,
  markAllNotificationsReadInCloud,
  markNotificationReadInCloud,
  resetWorkspaceInCloud,
  resolvePublicFormOwnerUid,
  saveBulkMovesToCloud,
  saveDeduplicationToCloud,
  saveImportToCloud,
  savePresetApplyToCloud,
  saveProjectCreateToCloud,
  saveSheetSyncToCloud,
  saveStatusCreateToCloud,
  saveStatusDeleteToCloud,
  saveStatusUpdateToCloud,
  saveStatusesReorderToCloud,
  saveTaskCreateToCloud,
  saveTaskDeleteToCloud,
  saveTaskMoveToCloud,
  saveTaskUpdateToCloud,
  subscribeToIncomingLeadSubmissions,
  subscribeToUserNotifications,
  subscribeToUserWorkspace,
} from './services/firestoreWorkspace';
import {
  LeadNotification,
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
  buildSheetSyncPlan,
  deduplicateTaskList,
  mergeImportedTasksWithExisting,
} from './utils/deduplicateCandidates';
import {
  ParsedWorkbook,
  exportTasksToExcel,
  parseSpreadsheetFile,
} from './utils/excelImport';
import {
  getBrowserNotificationPermission,
  playNewLeadChime,
  requestBrowserNotificationPermission,
  showBrowserLeadNotification,
} from './utils/notificationAlerts';

const THEME_KEY = 'strata-theme-v1';
const NOTIF_SOUND_KEY = 'uxd-vault-notif-sound-v1';
const SHEET_SYNC_VERSION_KEY_PREFIX = 'uxd-vault-sheet-sync-v20261120-r2-';
const BASE_DOC_TITLE = 'UXD Vault — Candidate & Lead Tracking';
const SEED_TASK_IDS = new Set(INITIAL_WORKSPACE_STATE.tasks.map((t) => t.id));

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [verificationTick, setVerificationTick] = useState(0);
  const [showAuthScreen, setShowAuthScreen] = useState(false);
  const [authInitialMode, setAuthInitialMode] = useState<AuthMode>('signup');
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [fatalSyncError, setFatalSyncError] = useState<Error | null>(null);

  const [workspace, setWorkspace] = useState<WorkspaceState>(INITIAL_WORKSPACE_STATE);
  const workspaceRef = useRef<WorkspaceState>(workspace);
  workspaceRef.current = workspace;

  const cloudCandidateIdsRef = useRef<Set<string>>(new Set());
  const seedReplacedRef = useRef<boolean>(false);
  const cloudNextCodeRef = useRef<number>(INITIAL_WORKSPACE_STATE.nextCodeNumber);
  const cleaningCloudDupesRef = useRef<boolean>(false);
  const syncingUpdatedSheetRef = useRef<boolean>(false);
  const importingToCloudRef = useRef<boolean>(false);
  const pendingWorkspaceSnapshotRef = useRef<WorkspaceSyncSnapshot | null>(null);

  const [isVanityFormPath, setIsVanityFormPath] = useState<boolean>(() => {
    try {
      const hashPath = '/' + window.location.hash.replace(/^#\/?/, '');
      return (
        isPublicLeadFormPathname(window.location.pathname) ||
        isPublicLeadFormPathname(hashPath)
      );
    } catch {
      return false;
    }
  });
  const [publicFormResolveError, setPublicFormResolveError] = useState(false);

  const [publicLeadFormOwnerUid, setPublicLeadFormOwnerUid] = useState<string | null>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const queryParam = params.get('lead-form') || params.get('form');
      if (queryParam && queryParam.trim()) return queryParam.trim();

      const hash = window.location.hash.replace(/^#/, '');
      if (hash) {
        const hashParams = new URLSearchParams(hash.startsWith('?') ? hash.slice(1) : hash);
        const hashParam = hashParams.get('lead-form') || hashParams.get('form');
        if (hashParam && hashParam.trim()) return hashParam.trim();
        const hashPathMatch = hash.match(/^\/?lead-form\/([^/?#]+)/i);
        if (hashPathMatch?.[1]) return decodeURIComponent(hashPathMatch[1]).trim();
      }

      const pathMatch = window.location.pathname.match(/^\/lead-form\/([^/?#]+)/i);
      if (pathMatch?.[1]) return decodeURIComponent(pathMatch[1]).trim();

      return null;
    } catch {
      return null;
    }
  });
  const [pendingLeadQueue, setPendingLeadQueue] = useState<PendingLeadSubmission[]>([]);
  const ingestingLeadsRef = useRef(false);
  const processedSubmissionIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isVanityFormPath || publicLeadFormOwnerUid) return;
    let cancelled = false;
    setPublicFormResolveError(false);

    void resolvePublicFormOwnerUid(PUBLIC_FORM_SLUG_ID).then((ownerUid) => {
      if (cancelled) return;
      if (ownerUid) {
        setPublicLeadFormOwnerUid(ownerUid);
      } else {
        setPublicFormResolveError(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isVanityFormPath, publicLeadFormOwnerUid]);

  const [activeView, setActiveView] = useState<ViewMode>('dashboard');
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

  const [notifications, setNotifications] = useState<LeadNotification[]>([]);
  const [toastQueue, setToastQueue] = useState<LeadNotification[]>([]);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(NOTIF_SOUND_KEY);
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });
  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;
  const [browserPermission, setBrowserPermission] = useState<
    NotificationPermission | 'unsupported'
  >(() => getBrowserNotificationPermission());
  const initialNotifLoadDoneRef = useRef(false);
  const seenNotificationIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    try {
      localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
    } catch {
      // Ignore storage failures
    }
  }, [isDark]);

  useEffect(() => {
    if (!currentUser || !currentUser.emailVerified || publicLeadFormOwnerUid) {
      document.title = BASE_DOC_TITLE;
      return;
    }
    const unread = notifications.filter((n) => !n.read).length;
    document.title = unread > 0 ? `(${unread}) ${BASE_DOC_TITLE}` : BASE_DOC_TITLE;
  }, [notifications, currentUser, publicLeadFormOwnerUid]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthReady(true);
      if (!user || !user.emailVerified) {
        setWorkspaceReady(false);
        cloudCandidateIdsRef.current = new Set();
        seedReplacedRef.current = false;
        cleaningCloudDupesRef.current = false;
        syncingUpdatedSheetRef.current = false;
        importingToCloudRef.current = false;
        pendingWorkspaceSnapshotRef.current = null;
        setNotifications([]);
        setToastQueue([]);
        initialNotifLoadDoneRef.current = false;
        seenNotificationIdsRef.current = new Set();
        setActiveView('dashboard');
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
    let unsubscribeLeadInbox: (() => void) | null = null;
    let unsubscribeNotifications: (() => void) | null = null;

    const initCloud = async () => {
      try {
        await ensureUserAccountAndWorkspaceSeeded(currentUser);
        if (cancelled) return;
        void ensurePublicFormRouteRegistered(currentUser.uid);
        unsubscribeSnapshot = subscribeToUserWorkspace(
          currentUser.uid,
          (snapshot) => {
            if (cancelled) return;
            if (importingToCloudRef.current || syncingUpdatedSheetRef.current) {
              pendingWorkspaceSnapshotRef.current = snapshot;
              return;
            }
            pendingWorkspaceSnapshotRef.current = null;
            cloudCandidateIdsRef.current = snapshot.cloudCandidateIds;
            seedReplacedRef.current = snapshot.seedReplaced;
            cloudNextCodeRef.current = snapshot.cloudNextCodeNumber;
            setWorkspace(snapshot.workspace);
            setWorkspaceReady(true);

            const { docIdsToDelete, tasksToSoftDelete, tasksToUpdate } =
              snapshot.cloudCleanupPlan;
            const hasCloudCleanup =
              docIdsToDelete.length > 0 ||
              tasksToSoftDelete.length > 0 ||
              tasksToUpdate.length > 0;

            if (hasCloudCleanup && !cleaningCloudDupesRef.current) {
              cleaningCloudDupesRef.current = true;
              if (snapshot.rawDuplicateCount > 0) {
                setImportBanner(
                  `Removed ${snapshot.rawDuplicateCount} duplicate candidate ${
                    snapshot.rawDuplicateCount === 1 ? 'row' : 'rows'
                  } and synced to cloud.`
                );
              }
              void saveDeduplicationToCloud(
                currentUser.uid,
                snapshot.cloudCleanupPlan,
                snapshot.cloudCandidateIds
              )
                .catch((err) => {
                  if (!cancelled) {
                    setFatalSyncError(
                      err instanceof Error ? err : new Error(String(err))
                    );
                  }
                })
                .finally(() => {
                  cleaningCloudDupesRef.current = false;
                });
              return;
            }

            if (
              snapshot.seedReplaced &&
              !hasCloudCleanup &&
              !cleaningCloudDupesRef.current &&
              !syncingUpdatedSheetRef.current
            ) {
              const syncKey = `${SHEET_SYNC_VERSION_KEY_PREFIX}${currentUser.uid}`;
              let alreadySynced = false;
              try {
                alreadySynced = localStorage.getItem(syncKey) === 'done';
              } catch {
                alreadySynced = false;
              }

              if (!alreadySynced) {
                const plan = buildSheetSyncPlan(
                  snapshot.workspace.tasks,
                  INITIAL_WORKSPACE_STATE.tasks,
                  snapshot.workspace.statuses,
                  snapshot.workspace.projects,
                  snapshot.workspace.nextCodeNumber
                );
                const hasDiff =
                  plan.tasksToInsert.length > 0 ||
                  plan.tasksToUpdate.length > 0 ||
                  plan.duplicateIdsRemoved.length > 0;

                if (hasDiff) {
                  syncingUpdatedSheetRef.current = true;
                  setWorkspace({
                    ...snapshot.workspace,
                    tasks: plan.mergedTasks,
                    nextCodeNumber: Math.max(
                      snapshot.workspace.nextCodeNumber,
                      plan.nextCodeNumber
                    ),
                  });
                  const parts: string[] = [];
                  if (plan.tasksToInsert.length > 0) {
                    parts.push(`${plan.tasksToInsert.length} added`);
                  }
                  if (plan.tasksToUpdate.length > 0) {
                    parts.push(`${plan.tasksToUpdate.length} updated`);
                  }
                  if (plan.duplicateIdsRemoved.length > 0) {
                    parts.push(`${plan.duplicateIdsRemoved.length} duplicates removed`);
                  }
                  setImportBanner(
                    `Updated candidate list (${parts.join(', ')}) — synced to cloud.`
                  );

                  void saveSheetSyncToCloud(
                    currentUser.uid,
                    {
                      tasksToInsert: plan.tasksToInsert,
                      tasksToUpdate: plan.tasksToUpdate,
                      docIdsToDelete: plan.duplicateIdsRemoved,
                      nextCodeNumber: plan.nextCodeNumber,
                      currentCloudNextCodeNumber: snapshot.cloudNextCodeNumber,
                    },
                    snapshot.cloudCandidateIds
                  )
                    .then(() => {
                      try {
                        localStorage.setItem(syncKey, 'done');
                      } catch {
                        // Ignore storage failures
                      }
                    })
                    .catch((err) => {
                      if (!cancelled) {
                        setFatalSyncError(
                          err instanceof Error ? err : new Error(String(err))
                        );
                      }
                    })
                    .finally(() => {
                      syncingUpdatedSheetRef.current = false;
                      const pending = pendingWorkspaceSnapshotRef.current;
                      pendingWorkspaceSnapshotRef.current = null;
                      if (!cancelled && pending) {
                        cloudCandidateIdsRef.current = pending.cloudCandidateIds;
                        seedReplacedRef.current = pending.seedReplaced;
                        cloudNextCodeRef.current = pending.cloudNextCodeNumber;
                        setWorkspace(pending.workspace);
                      }
                    });
                } else {
                  try {
                    localStorage.setItem(syncKey, 'done');
                  } catch {
                    // Ignore storage failures
                  }
                }
              }
            }
          },
          (err) => {
            if (!cancelled) setFatalSyncError(err);
          }
        );
        unsubscribeLeadInbox = subscribeToIncomingLeadSubmissions(
          currentUser.uid,
          (submissions) => {
            if (cancelled) return;
            setPendingLeadQueue(submissions);
          },
          (err) => {
            if (!cancelled) setFatalSyncError(err);
          }
        );
        unsubscribeNotifications = subscribeToUserNotifications(
          currentUser.uid,
          (items) => {
            if (cancelled) return;
            setNotifications(items);

            if (!initialNotifLoadDoneRef.current) {
              items.forEach((n) => seenNotificationIdsRef.current.add(n.id));
              initialNotifLoadDoneRef.current = true;
              return;
            }

            const freshUnread = items.filter(
              (n) => !n.read && !seenNotificationIdsRef.current.has(n.id)
            );
            items.forEach((n) => seenNotificationIdsRef.current.add(n.id));

            if (freshUnread.length > 0) {
              setToastQueue((prev) => [...freshUnread, ...prev].slice(0, 10));
              if (soundEnabledRef.current) {
                playNewLeadChime();
              }
              freshUnread.slice(0, 3).forEach((n) => {
                showBrowserLeadNotification(n, (candidateId) => {
                  setSelectedTaskId(candidateId);
                  void markNotificationReadInCloud(currentUser.uid, n.id, true);
                });
              });
            }
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
      if (unsubscribeLeadInbox) unsubscribeLeadInbox();
      if (unsubscribeNotifications) unsubscribeNotifications();
    };
  }, [authReady, currentUser, verificationTick]);

  // Automatically ingest incoming submissions from the shareable Lead Intake Form
  useEffect(() => {
    if (
      !workspaceReady ||
      !currentUser ||
      !currentUser.emailVerified ||
      pendingLeadQueue.length === 0 ||
      ingestingLeadsRef.current
    ) {
      return;
    }

    const unqueued = pendingLeadQueue.filter(
      (sub) => !processedSubmissionIdsRef.current.has(sub.id)
    );
    if (unqueued.length === 0) {
      setPendingLeadQueue([]);
      return;
    }

    ingestingLeadsRef.current = true;
    unqueued.forEach((sub) => processedSubmissionIdsRef.current.add(sub.id));

    const prev = workspaceRef.current;
    const sortedStatuses = [...prev.statuses].sort((a, b) => a.order - b.order);
    const defaultStatusId = sortedStatuses[0]?.id ?? 'status-applied';
    const baseOrder = prev.tasks.filter((t) => t.statusId === defaultStatusId).length;
    let nextCode = prev.nextCodeNumber;

    const newTasks: TaskItem[] = unqueued.map((sub, idx) => {
      const d = new Date(sub.createdAtIso || Date.now());
      const nowFormatted = Number.isNaN(d.getTime())
        ? new Date().toISOString().slice(0, 16).replace('T', ' ')
        : `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()} ${String(
            d.getHours()
          ).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(
            d.getSeconds()
          ).padStart(2, '0')}`;

      return {
        id: `cand-form-${sub.id}`,
        code: `CND-${nextCode++}`,
        projectId: inferTrackFromExperience(sub.yearsOfExperience, prev.projects),
        statusId: defaultStatusId,
        order: baseOrder + idx,
        priority: inferPriorityFromLead(
          sub.yearsOfExperience,
          sub.designedAiProduct,
          sub.noticePeriod
        ),
        assigneeId: TEAM_MEMBERS[0]?.id ?? 'member-priya',
        updatedAt: new Date().toISOString(),
        statusHistory: [],
        timestamp: nowFormatted,
        fullName: sub.fullName,
        email: sub.email,
        contactNo: sub.contactNo,
        portfolioUrl: sub.portfolioUrl,
        currentLocation: sub.currentLocation,
        yearsOfExperience: sub.yearsOfExperience,
        designedAiProduct: sub.designedAiProduct,
        noticePeriod: sub.noticePeriod,
        resumeUrl: sub.resumeUrl,
        message: sub.message,
        expectedSalary: sub.expectedSalary,
        readyToRelocateIn: sub.readyToRelocateIn,
      };
    });

    const submissionIds = unqueued.map((s) => s.id);
    setPendingLeadQueue([]);

    void ingestLeadSubmissionsToCloud(
      currentUser.uid,
      newTasks,
      submissionIds,
      nextCode
    )
      .then(() => {
        setImportBanner(
          `Received ${newTasks.length} new ${
            newTasks.length === 1 ? 'submission' : 'submissions'
          } from your Lead Intake Form.`
        );
      })
      .catch((err) => {
        setFatalSyncError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        ingestingLeadsRef.current = false;
      });
  }, [workspaceReady, currentUser, pendingLeadQueue]);

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

  const exitPublicFormToWorkspace = () => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('lead-form');
      url.searchParams.delete('form');
      if (
        url.pathname.toLowerCase().startsWith('/lead-form/') ||
        isPublicLeadFormPathname(url.pathname)
      ) {
        url.pathname = '/';
      }
      if (
        url.hash.toLowerCase().includes('lead-form') ||
        url.hash.toLowerCase().includes('form=') ||
        url.hash.toLowerCase().includes('uxdvault')
      ) {
        url.hash = '';
      }
      window.history.replaceState({}, '', url.toString());
    } catch {
      // Ignore URL history errors
    }
    setIsVanityFormPath(false);
    setPublicFormResolveError(false);
    setPublicLeadFormOwnerUid(null);
  };

  if (isVanityFormPath && !publicLeadFormOwnerUid) {
    return (
      <div className="min-h-screen bg-[#F5F5F7] dark:bg-black flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-black/[0.08] dark:border-white/[0.12] bg-white dark:bg-[#1C1C1E] p-7 text-center space-y-4 shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
          <img
            src="/assets/aistudio/image_9e6b3606.png"
            alt="UXD Vault official logo"
            referrerPolicy="no-referrer"
            className="w-10 h-10 rounded-xl object-cover bg-black mx-auto shadow-[0_1px_2px_rgba(0,0,0,0.18)]"
          />
          {publicFormResolveError ? (
            <>
              <h1 className="text-lg font-display font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">
                Application Form Not Activated Yet
              </h1>
              <p className="text-xs text-[#6E6E73] dark:text-[#A1A1A6] leading-relaxed">
                Sign in to your UXD Vault workspace once to activate the <span className="font-mono">UXDVault/Submit your Application</span> intake route.
              </p>
              <button
                type="button"
                onClick={exitPublicFormToWorkspace}
                className="h-10 px-4 rounded-[10px] bg-[#0071E3] hover:bg-[#0077ED] dark:bg-[#0A84FF] text-white text-xs font-medium transition-colors"
              >
                Workspace Sign In
              </button>
            </>
          ) : (
            <p className="text-sm font-medium text-[#6E6E73] dark:text-[#A1A1A6]">
              Loading application form...
            </p>
          )}
        </div>
      </div>
    );
  }

  if (publicLeadFormOwnerUid) {
    return (
      <LeadFormView
        mode="public"
        targetUid={publicLeadFormOwnerUid}
        isDark={isDark}
        onToggleTheme={() => setIsDark((prev) => !prev)}
        onExitPublicMode={exitPublicFormToWorkspace}
      />
    );
  }

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#F5F5F7] dark:bg-black flex items-center justify-center p-6">
        <div className="flex items-center gap-3 text-sm font-medium text-[#6E6E73] dark:text-[#A1A1A6]">
          <img
            src="/assets/aistudio/image_9e6b3606.png"
            alt="UXD Vault official logo"
            referrerPolicy="no-referrer"
            className="w-8 h-8 rounded-lg object-cover bg-black animate-pulse shadow-[0_1px_2px_rgba(0,0,0,0.18)]"
          />
          <span>Checking session...</span>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    if (!showAuthScreen) {
      return (
        <LandingPage
          isDark={isDark}
          onToggleTheme={() => setIsDark((prev) => !prev)}
          onOpenSignUp={() => {
            setAuthInitialMode('signup');
            setShowAuthScreen(true);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onOpenSignIn={() => {
            setAuthInitialMode('signin');
            setShowAuthScreen(true);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
      );
    }

    return (
      <LoginScreen
        unverifiedUser={null}
        isDark={isDark}
        initialMode={authInitialMode}
        onBackToLanding={() => setShowAuthScreen(false)}
        onToggleTheme={() => setIsDark((prev) => !prev)}
        onRefreshVerification={handleRefreshVerification}
      />
    );
  }

  if (!currentUser.emailVerified) {
    return (
      <LoginScreen
        unverifiedUser={currentUser}
        isDark={isDark}
        initialMode={authInitialMode}
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
    setActiveView('dashboard');
    try {
      localStorage.removeItem(`${SHEET_SYNC_VERSION_KEY_PREFIX}${uid}`);
    } catch {
      // Ignore storage failures
    }
    importingToCloudRef.current = true;
    pendingWorkspaceSnapshotRef.current = null;
    void resetWorkspaceInCloud(uid)
      .catch(reportAsyncError)
      .finally(() => {
        importingToCloudRef.current = false;
        flushPendingSnapshot();
      });
  };

  const handleRemoveDuplicates = () => {
    const prev = workspaceRef.current;
    const result = deduplicateTaskList(prev.tasks);
    if (result.removedCount === 0) {
      setImportBanner(
        `No duplicates found — all ${prev.tasks.length} candidate ${
          prev.tasks.length === 1 ? 'row is' : 'rows are'
        } unique.`
      );
      return;
    }

    setWorkspace({
      ...prev,
      tasks: result.uniqueTasks,
    });

    const docIdsToDelete: string[] = [];
    const tasksToSoftDelete: TaskItem[] = [];
    for (const dup of result.removedDuplicates) {
      if (!seedReplacedRef.current && SEED_TASK_IDS.has(dup.id)) {
        tasksToSoftDelete.push(dup);
      } else if (cloudCandidateIdsRef.current.has(dup.id)) {
        docIdsToDelete.push(dup.id);
      }
    }

    setImportBanner(
      `Removed ${result.removedCount} duplicate candidate ${
        result.removedCount === 1 ? 'row' : 'rows'
      } and synced to cloud.`
    );

    void saveDeduplicationToCloud(
      uid,
      {
        docIdsToDelete,
        tasksToSoftDelete,
        tasksToUpdate: result.updatedSurvivors,
      },
      cloudCandidateIdsRef.current
    ).catch(reportAsyncError);
  };

  const flushPendingSnapshot = () => {
    const pending = pendingWorkspaceSnapshotRef.current;
    pendingWorkspaceSnapshotRef.current = null;
    if (!pending) return;
    cloudCandidateIdsRef.current = pending.cloudCandidateIds;
    seedReplacedRef.current = pending.seedReplaced;
    cloudNextCodeRef.current = pending.cloudNextCodeNumber;
    setWorkspace(pending.workspace);
  };

  const handleSyncLatestSheet = () => {
    const prev = workspaceRef.current;
    const plan = buildSheetSyncPlan(
      prev.tasks,
      INITIAL_WORKSPACE_STATE.tasks,
      prev.statuses,
      prev.projects,
      prev.nextCodeNumber
    );

    const insertIdSet = new Set(plan.tasksToInsert.map((t) => t.id));
    const updateIdSet = new Set(plan.tasksToUpdate.map((t) => t.id));
    const missingFromCloudTasks = plan.mergedTasks.filter(
      (t) =>
        !cloudCandidateIdsRef.current.has(t.id) &&
        !insertIdSet.has(t.id) &&
        !updateIdSet.has(t.id)
    );
    const allTasksToInsert = [...plan.tasksToInsert, ...missingFromCloudTasks];

    const hasDiff =
      plan.tasksToInsert.length > 0 ||
      plan.tasksToUpdate.length > 0 ||
      plan.duplicateIdsRemoved.length > 0;

    if (!hasDiff && missingFromCloudTasks.length === 0) {
      setImportBanner(
        `All ${prev.tasks.length} unique candidate rows are already uploaded and synced to cloud.`
      );
      return;
    }

    const removedIdSet = new Set(plan.duplicateIdsRemoved);
    const docIdsToDelete: string[] = [];
    const tasksToSoftDelete: TaskItem[] = [];
    for (const t of prev.tasks) {
      if (!removedIdSet.has(t.id)) continue;
      if (!seedReplacedRef.current && SEED_TASK_IDS.has(t.id)) {
        tasksToSoftDelete.push(t);
      } else if (cloudCandidateIdsRef.current.has(t.id)) {
        docIdsToDelete.push(t.id);
      }
    }

    setWorkspace({
      ...prev,
      tasks: plan.mergedTasks,
      nextCodeNumber: Math.max(prev.nextCodeNumber, plan.nextCodeNumber),
    });

    const parts: string[] = [];
    if (plan.tasksToInsert.length > 0) parts.push(`${plan.tasksToInsert.length} added`);
    if (plan.tasksToUpdate.length > 0) parts.push(`${plan.tasksToUpdate.length} updated`);
    if (plan.duplicateIdsRemoved.length > 0) {
      parts.push(`${plan.duplicateIdsRemoved.length} duplicates removed`);
    }
    if (parts.length > 0) {
      setImportBanner(
        `Synced Form Responses list (${parts.join(', ')}) — ${plan.mergedTasks.length} unique candidates saved to cloud.`
      );
    } else {
      setImportBanner(
        `Uploaded all ${plan.mergedTasks.length} unique candidates (${missingFromCloudTasks.length} synced to cloud).`
      );
    }

    importingToCloudRef.current = true;
    pendingWorkspaceSnapshotRef.current = null;
    void saveSheetSyncToCloud(
      uid,
      {
        tasksToInsert: allTasksToInsert,
        tasksToUpdate: plan.tasksToUpdate,
        docIdsToDelete,
        tasksToSoftDelete,
        nextCodeNumber: plan.nextCodeNumber,
        currentCloudNextCodeNumber: cloudNextCodeRef.current,
      },
      cloudCandidateIdsRef.current
    )
      .then(() => {
        try {
          localStorage.setItem(`${SHEET_SYNC_VERSION_KEY_PREFIX}${uid}`, 'done');
        } catch {
          // Ignore storage failures
        }
      })
      .catch(reportAsyncError)
      .finally(() => {
        importingToCloudRef.current = false;
        flushPendingSnapshot();
      });
  };

  const handleConfirmImport = (payload: {
    targetView: 'board' | 'list';
    mode: 'append' | 'replace';
    newStatuses: StatusDefinition[];
    newProjects: Project[];
    importedTasks: TaskItem[];
    nextCodeNumber: number;
    duplicateRowsRemoved?: number;
    deduplicate?: boolean;
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
    let updatedExistingTasks: TaskItem[] = [];
    let totalDupesSkipped = payload.duplicateRowsRemoved ?? 0;
    const shouldDeduplicate = payload.deduplicate !== false;

    if (payload.mode === 'replace') {
      offsetTasks = payload.importedTasks;
      mergedTasks = offsetTasks;
    } else if (!shouldDeduplicate) {
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
    } else {
      const mergeResult = mergeImportedTasksWithExisting(
        prev.tasks,
        payload.importedTasks
      );
      totalDupesSkipped += mergeResult.skippedAsDuplicateCount;
      updatedExistingTasks = mergeResult.updatedExistingTasks;

      const updatedMap = new Map(updatedExistingTasks.map((t) => [t.id, t]));
      const baseExistingTasks = prev.tasks.map((t) => updatedMap.get(t.id) ?? t);

      const existingCountByStatus = new Map<string, number>();
      for (const t of baseExistingTasks) {
        existingCountByStatus.set(
          t.statusId,
          (existingCountByStatus.get(t.statusId) ?? 0) + 1
        );
      }
      offsetTasks = mergeResult.newTasksToInsert.map((t) => {
        const offset = existingCountByStatus.get(t.statusId) ?? 0;
        existingCountByStatus.set(t.statusId, offset + 1);
        return { ...t, order: offset };
      });
      mergedTasks = [...baseExistingTasks, ...offsetTasks];
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

    const targetLabel = payload.targetView === 'board' ? 'Kanban Board' : 'List View';
    const dupeNote =
      totalDupesSkipped > 0
        ? ` (${totalDupesSkipped} ${totalDupesSkipped === 1 ? 'duplicate' : 'duplicates'} removed)`
        : '';

    const missingFromCloudInAppend =
      payload.mode === 'append'
        ? mergedTasks.filter((t) => !cloudCandidateIdsRef.current.has(t.id))
        : [];

    if (
      payload.mode === 'append' &&
      offsetTasks.length === 0 &&
      updatedExistingTasks.length === 0 &&
      payload.newStatuses.length === 0 &&
      payload.newProjects.length === 0
    ) {
      setImportBanner(
        `Uploaded & verified ${mergedTasks.length} unique candidates in ${targetLabel}${dupeNote} — synced to cloud.`
      );
      if (missingFromCloudInAppend.length === 0) {
        return;
      }
      importingToCloudRef.current = true;
      pendingWorkspaceSnapshotRef.current = null;
      void saveSheetSyncToCloud(
        uid,
        {
          tasksToInsert: missingFromCloudInAppend,
          tasksToUpdate: [],
          docIdsToDelete: [],
          nextCodeNumber: nextCode,
          currentCloudNextCodeNumber: cloudNextCodeRef.current,
        },
        cloudCandidateIdsRef.current
      )
        .catch(reportAsyncError)
        .finally(() => {
          importingToCloudRef.current = false;
          flushPendingSnapshot();
        });
      return;
    }

    setImportBanner(
      `Fetched ${offsetTasks.length} ${
        offsetTasks.length === 1 ? 'item' : 'items'
      } into ${targetLabel}${dupeNote} — synced to cloud.`
    );

    importingToCloudRef.current = true;
    pendingWorkspaceSnapshotRef.current = null;
    void saveImportToCloud(uid, {
      mode: payload.mode,
      newStatuses: payload.newStatuses,
      allStatuses: normalizedStatuses,
      newProjects: payload.newProjects,
      importedTasks: offsetTasks,
      nextCodeNumber: nextCode,
    })
      .then(() => {
        if (payload.mode === 'replace') {
          try {
            localStorage.setItem(`${SHEET_SYNC_VERSION_KEY_PREFIX}${uid}`, 'done');
          } catch {
            // Ignore storage failures
          }
        }
        if (updatedExistingTasks.length > 0) {
          return saveDeduplicationToCloud(
            uid,
            {
              docIdsToDelete: [],
              tasksToSoftDelete: [],
              tasksToUpdate: updatedExistingTasks,
            },
            cloudCandidateIdsRef.current
          );
        }
        return undefined;
      })
      .catch(reportAsyncError)
      .finally(() => {
        importingToCloudRef.current = false;
        flushPendingSnapshot();
      });
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

  const handleToggleSound = () => {
    setSoundEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(NOTIF_SOUND_KEY, String(next));
      } catch {
        // Ignore storage failures
      }
      if (next) {
        playNewLeadChime();
      }
      return next;
    });
  };

  const handleRequestBrowserNotifications = async () => {
    const result = await requestBrowserNotificationPermission();
    setBrowserPermission(result);
  };

  const handleOpenCandidateFromNotification = (
    candidateId: string,
    notificationId: string
  ) => {
    setSelectedTaskId(candidateId);
    setToastQueue((prev) => prev.filter((item) => item.id !== notificationId));
    const target = notifications.find((n) => n.id === notificationId);
    if (target && !target.read) {
      void markNotificationReadInCloud(uid, notificationId, true).catch(reportAsyncError);
    }
  };

  const handleToggleNotificationRead = (notificationId: string, nextRead: boolean) => {
    void markNotificationReadInCloud(uid, notificationId, nextRead).catch(reportAsyncError);
  };

  const handleMarkAllNotificationsRead = () => {
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    setToastQueue([]);
    void markAllNotificationsReadInCloud(uid, unreadIds).catch(reportAsyncError);
  };

  const handleClearReadNotifications = () => {
    const readIds = notifications.filter((n) => n.read).map((n) => n.id);
    if (readIds.length === 0) return;
    void clearReadNotificationsInCloud(uid, readIds).catch(reportAsyncError);
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
        onSignOut={() => {
          setShowAuthScreen(false);
          void signOut(auth);
        }}
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
          onNavigateDashboard={() => setActiveView('dashboard')}
          onOpenNewItem={() => setNewItemOpen(true)}
          onOpenImportSheet={() => {
            setDroppedWorkbook(null);
            setImportError(null);
            setImportModalOpen(true);
          }}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          notificationSlot={
            <NotificationCenter
              notifications={notifications}
              soundEnabled={soundEnabled}
              onToggleSound={handleToggleSound}
              browserPermission={browserPermission}
              onRequestBrowserPermission={() => void handleRequestBrowserNotifications()}
              onOpenCandidate={handleOpenCandidateFromNotification}
              onToggleRead={handleToggleNotificationRead}
              onMarkAllRead={handleMarkAllNotificationsRead}
              onClearRead={handleClearReadNotifications}
              onOpenLeadForm={() => setActiveView('form')}
            />
          }
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
              {activeView === 'dashboard' && (
                <DashboardView
                  statuses={workspace.statuses}
                  tasks={filteredTasks}
                  projects={workspace.projects}
                  onMoveTask={(taskId, statusId) => handleMoveTask(taskId, statusId)}
                  onSelectTask={setSelectedTaskId}
                  onNavigateView={setActiveView}
                  onExportExcel={() =>
                    exportTasksToExcel({
                      tasks: filteredTasks,
                      statuses: workspace.statuses,
                      projects: workspace.projects,
                    })
                  }
                />
              )}

              {activeView === 'form' && (
                <LeadFormView
                  mode="workspace"
                  userUid={uid}
                  statuses={workspace.statuses}
                  projects={workspace.projects}
                  members={TEAM_MEMBERS}
                  nextCodeNumber={workspace.nextCodeNumber}
                  defaultProjectId={
                    selectedProjectId !== 'all'
                      ? selectedProjectId
                      : workspace.projects[0]?.id ?? 'proj-lead-staff'
                  }
                  onCreateLead={handleCreateTask}
                  onNavigateView={setActiveView}
                />
              )}

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
                  onSyncLatestSheet={handleSyncLatestSheet}
                  onExportExcel={() =>
                    exportTasksToExcel({
                      tasks: filteredTasks,
                      statuses: workspace.statuses,
                      projects: workspace.projects,
                    })
                  }
                  onRemoveDuplicates={handleRemoveDuplicates}
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
        onOpenFullForm={() => setActiveView('form')}
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

      <NewLeadToast
        notification={toastQueue[0] ?? null}
        queueCount={toastQueue.length}
        onViewLead={handleOpenCandidateFromNotification}
        onDismiss={() => setToastQueue((prev) => prev.slice(1))}
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
