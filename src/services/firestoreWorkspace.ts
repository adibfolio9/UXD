import { User } from 'firebase/auth';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { INITIAL_WORKSPACE_STATE } from '../data/seedData';
import { OperationType, db, handleFirestoreError } from '../firebase';
import {
  LeadNotification,
  PriorityLevel,
  Project,
  StatusCategory,
  StatusColor,
  StatusDefinition,
  StatusTransition,
  TaskItem,
  WorkspaceState,
} from '../types';
import {
  areCandidatesSamePerson,
  deduplicateTaskList,
} from '../utils/deduplicateCandidates';

const VALID_ID_RE = /^[a-zA-Z0-9_-]+$/;
const VALID_PRIORITIES = new Set<PriorityLevel>(['urgent', 'high', 'medium', 'low']);

// Firestore enforces a hard cap of 20 get()/exists()/getAfter()/existsAfter() calls per writeBatch.
// Each candidate create/update triggers 2 existsAfter() checks (statusId + projectId).
// Each lead ingest item creates 1 candidate (2 existsAfter) + 1 notification (1 existsAfter) = 3 checks.
const CANDIDATE_WRITE_BATCH_SIZE = 8;
const LEAD_INGEST_BATCH_SIZE = 5;
const DELETE_BATCH_SIZE = 350;
const BATCH_COMMIT_CONCURRENCY = 5;

const LIMITS = {
  workspaceName: 100,
  statusName: 80,
  statusDesc: 300,
  projectKey: 10,
  projectName: 120,
  projectSummary: 400,
  leadId: 128,
  targetDate: 40,
  code: 32,
  assigneeId: 128,
  timestamp: 64,
  fullName: 200,
  email: 254,
  contactNo: 120,
  url: 2000,
  location: 160,
  experience: 80,
  aiProduct: 500,
  notice: 120,
  message: 4000,
  salary: 160,
  relocate: 240,
  historyMax: 20,
} as const;

function clamp(val: string | undefined | null, max: number): string {
  return (val ?? '').slice(0, max);
}

function sanitizeId(raw: string, fallbackPrefix: string): string {
  const cleaned = (raw ?? '').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 128);
  if (cleaned && VALID_ID_RE.test(cleaned)) return cleaned;
  return `${fallbackPrefix}-${Date.now()}`;
}

function sanitizePriority(raw: unknown): PriorityLevel {
  return typeof raw === 'string' && VALID_PRIORITIES.has(raw as PriorityLevel)
    ? (raw as PriorityLevel)
    : 'medium';
}

function sanitizeOrder(raw: unknown): number {
  const num = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(100000, Math.floor(num)));
}

function sanitizeHistory(history: StatusTransition[] | undefined) {
  return (history ?? []).slice(0, LIMITS.historyMax).map((h) => ({
    id: clamp(h.id, 128),
    fromStatusName: clamp(h.fromStatusName, 80),
    toStatusName: clamp(h.toStatusName, 80),
    changedAt: clamp(h.changedAt, 64),
  }));
}

function toStatusPayload(uid: string, s: StatusDefinition, includeCreatedAt: boolean) {
  const base: Record<string, unknown> = {
    ownerUid: uid,
    id: sanitizeId(s.id, 'status'),
    name: clamp(s.name.trim() || 'Untitled Status', LIMITS.statusName),
    category: s.category,
    color: s.color,
    wipLimit:
      s.wipLimit !== null && Number.isFinite(s.wipLimit)
        ? Math.max(1, Math.min(10000, Math.floor(s.wipLimit)))
        : null,
    description: clamp(s.description, LIMITS.statusDesc),
    order: Math.max(0, Math.min(1000, Math.floor(Number.isFinite(s.order) ? s.order : 0))),
    updatedAt: serverTimestamp(),
  };
  if (includeCreatedAt) {
    base.createdAt = serverTimestamp();
  }
  return base;
}

function toProjectPayload(uid: string, p: Project, includeCreatedAt: boolean) {
  const base: Record<string, unknown> = {
    ownerUid: uid,
    id: sanitizeId(p.id, 'proj'),
    key: clamp(p.key.trim() || 'ROLE', LIMITS.projectKey),
    name: clamp(p.name.trim() || 'Untitled Track', LIMITS.projectName),
    summary: clamp(p.summary, LIMITS.projectSummary),
    leadId: clamp((p.leadId || '').trim() || 'member-priya', LIMITS.leadId),
    targetDate: clamp(p.targetDate, LIMITS.targetDate),
    updatedAt: serverTimestamp(),
  };
  if (includeCreatedAt) {
    base.createdAt = serverTimestamp();
  }
  return base;
}

function toCandidatePayload(
  uid: string,
  t: TaskItem,
  deleted: boolean,
  includeCreatedAt: boolean
) {
  const safeName = clamp(
    (t.fullName || '').trim() || (t.email || '').trim() || (t.code || '').trim() || 'Candidate',
    LIMITS.fullName
  );

  const base: Record<string, unknown> = {
    ownerUid: uid,
    id: sanitizeId(t.id, 'cand'),
    code: clamp((t.code || '').trim() || 'CND-101', LIMITS.code),
    projectId: sanitizeId(t.projectId, 'proj'),
    statusId: sanitizeId(t.statusId, 'status'),
    order: sanitizeOrder(t.order),
    priority: sanitizePriority(t.priority),
    assigneeId: clamp((t.assigneeId || '').trim() || 'member-priya', LIMITS.assigneeId),
    deleted,
    timestamp: clamp(t.timestamp, LIMITS.timestamp),
    fullName: safeName,
    email: clamp(t.email, LIMITS.email),
    contactNo: clamp(t.contactNo, LIMITS.contactNo),
    portfolioUrl: clamp(t.portfolioUrl, LIMITS.url),
    currentLocation: clamp(t.currentLocation, LIMITS.location),
    yearsOfExperience: clamp(t.yearsOfExperience, LIMITS.experience),
    designedAiProduct: clamp(t.designedAiProduct, LIMITS.aiProduct),
    noticePeriod: clamp(t.noticePeriod, LIMITS.notice),
    resumeUrl: clamp(t.resumeUrl, LIMITS.url),
    message: clamp(t.message, LIMITS.message),
    expectedSalary: clamp(t.expectedSalary, LIMITS.salary),
    readyToRelocateIn: clamp(t.readyToRelocateIn, LIMITS.relocate),
    statusHistory: sanitizeHistory(t.statusHistory),
    updatedAt: serverTimestamp(),
  };
  if (includeCreatedAt) {
    base.createdAt = serverTimestamp();
  }
  return base;
}

interface FirestoreValidRefs {
  validStatusIds: Set<string>;
  fallbackStatusId: string;
  validProjectIds: Set<string>;
  fallbackProjectId: string;
}

async function resolveValidFirestoreRefs(uid: string): Promise<FirestoreValidRefs> {
  const [statusesSnap, projectsSnap] = await Promise.all([
    getDocs(query(collection(db, 'users', uid, 'statuses'), where('ownerUid', '==', uid))),
    getDocs(query(collection(db, 'users', uid, 'projects'), where('ownerUid', '==', uid))),
  ]);

  const statusIds: string[] = [];
  const projectIds: string[] = [];

  if (statusesSnap.empty || projectsSnap.empty) {
    const repairBatch = writeBatch(db);
    if (statusesSnap.empty) {
      for (const s of INITIAL_WORKSPACE_STATE.statuses) {
        const sid = sanitizeId(s.id, 'status');
        repairBatch.set(doc(db, 'users', uid, 'statuses', sid), toStatusPayload(uid, s, true));
        statusIds.push(sid);
      }
    } else {
      statusesSnap.docs
        .map((d) => ({ id: d.id, order: Number(d.data().order ?? 0) }))
        .sort((a, b) => a.order - b.order)
        .forEach((s) => statusIds.push(s.id));
    }

    if (projectsSnap.empty) {
      for (const p of INITIAL_WORKSPACE_STATE.projects) {
        const pid = sanitizeId(p.id, 'proj');
        repairBatch.set(doc(db, 'users', uid, 'projects', pid), toProjectPayload(uid, p, true));
        projectIds.push(pid);
      }
    } else {
      projectsSnap.docs.forEach((d) => projectIds.push(d.id));
    }

    try {
      await repairBatch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${uid}/statuses`);
    }
  } else {
    statusesSnap.docs
      .map((d) => ({ id: d.id, order: Number(d.data().order ?? 0) }))
      .sort((a, b) => a.order - b.order)
      .forEach((s) => statusIds.push(s.id));
    projectsSnap.docs.forEach((d) => projectIds.push(d.id));
  }

  return {
    validStatusIds: new Set(statusIds),
    fallbackStatusId: statusIds[0] ?? 'status-applied',
    validProjectIds: new Set(projectIds),
    fallbackProjectId: projectIds[0] ?? 'proj-lead-staff',
  };
}

function normalizeTaskForFirestore(task: TaskItem, refs: FirestoreValidRefs): TaskItem {
  const statusId = sanitizeId(task.statusId, 'status');
  const projectId = sanitizeId(task.projectId, 'proj');
  return {
    ...task,
    id: sanitizeId(task.id, 'cand'),
    statusId: refs.validStatusIds.has(statusId) ? statusId : refs.fallbackStatusId,
    projectId: refs.validProjectIds.has(projectId) ? projectId : refs.fallbackProjectId,
  };
}

async function commitBatchesInWaves(
  ops: Array<(batch: ReturnType<typeof writeBatch>) => void>,
  batchSize: number,
  operationType: OperationType,
  errorPath: string
): Promise<void> {
  if (ops.length === 0) return;

  const batches: Array<ReturnType<typeof writeBatch>> = [];
  for (let i = 0; i < ops.length; i += batchSize) {
    const chunk = ops.slice(i, i + batchSize);
    const batch = writeBatch(db);
    chunk.forEach((applyOp) => applyOp(batch));
    batches.push(batch);
  }

  for (let i = 0; i < batches.length; i += BATCH_COMMIT_CONCURRENCY) {
    const wave = batches.slice(i, i + BATCH_COMMIT_CONCURRENCY);
    try {
      await Promise.all(wave.map((b) => b.commit()));
    } catch (error) {
      handleFirestoreError(error, operationType, errorPath);
    }
  }
}

function formatFirestoreTimestamp(val: unknown): string {
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (typeof val === 'string') return val;
  return new Date().toISOString();
}

export async function ensureUserAccountAndWorkspaceSeeded(user: User): Promise<void> {
  const uid = user.uid;
  const profilePath = `users/${uid}/private/profile`;
  const profileRef = doc(db, 'users', uid, 'private', 'profile');

  try {
    const profileSnap = await getDoc(profileRef);
    const email = clamp(user.email || `${uid}@user.local`, LIMITS.email);
    const displayName = clamp(user.displayName || email.split('@')[0], 120);
    const photoUrl = clamp(user.photoURL || '', 500);

    if (!profileSnap.exists()) {
      await setDoc(profileRef, {
        uid,
        email,
        displayName,
        photoUrl,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(profileRef, {
        email,
        displayName,
        photoUrl,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, profilePath);
  }

  const workspacePath = `users/${uid}/workspaces/default`;
  const workspaceRef = doc(db, 'users', uid, 'workspaces', 'default');

  try {
    const wsSnap = await getDoc(workspaceRef);
    if (!wsSnap.exists()) {
      const batch = writeBatch(db);
      batch.set(workspaceRef, {
        ownerUid: uid,
        workspaceName: clamp(INITIAL_WORKSPACE_STATE.workspaceName, LIMITS.workspaceName),
        nextCodeNumber: INITIAL_WORKSPACE_STATE.nextCodeNumber,
        seedReplaced: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      for (const s of INITIAL_WORKSPACE_STATE.statuses) {
        batch.set(doc(db, 'users', uid, 'statuses', s.id), toStatusPayload(uid, s, true));
      }
      for (const p of INITIAL_WORKSPACE_STATE.projects) {
        batch.set(doc(db, 'users', uid, 'projects', p.id), toProjectPayload(uid, p, true));
      }
      await batch.commit();
    } else {
      await resolveValidFirestoreRefs(uid);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, workspacePath);
  }
}

export interface CloudCleanupPlan {
  docIdsToDelete: string[];
  tasksToSoftDelete: TaskItem[];
  tasksToUpdate: TaskItem[];
}

export interface WorkspaceSyncSnapshot {
  workspace: WorkspaceState;
  cloudCandidateIds: Set<string>;
  seedReplaced: boolean;
  cloudNextCodeNumber: number;
  rawDuplicateCount: number;
  cloudCleanupPlan: CloudCleanupPlan;
}

export function subscribeToUserWorkspace(
  uid: string,
  onSync: (snapshot: WorkspaceSyncSnapshot) => void,
  onError: (err: Error) => void
): () => void {
  let workspaceMeta: {
    workspaceName: string;
    nextCodeNumber: number;
    seedReplaced: boolean;
  } | null = null;
  let cloudStatuses: StatusDefinition[] | null = null;
  let cloudProjects: Project[] | null = null;
  let cloudCandidates: (TaskItem & { deleted: boolean })[] | null = null;

  const emitIfReady = () => {
    if (!workspaceMeta || !cloudStatuses || !cloudProjects || !cloudCandidates) return;

    const sortedStatuses =
      cloudStatuses.length > 0
        ? [...cloudStatuses].sort((a, b) => a.order - b.order)
        : INITIAL_WORKSPACE_STATE.statuses;

    const activeProjects =
      cloudProjects.length > 0 ? cloudProjects : INITIAL_WORKSPACE_STATE.projects;

    const cloudMap = new Map<string, TaskItem & { deleted: boolean }>();
    const cloudIds = new Set<string>();
    for (const c of cloudCandidates) {
      cloudMap.set(c.id, c);
      cloudIds.add(c.id);
    }

    const validStatusIds = new Set(sortedStatuses.map((s) => s.id));
    const fallbackStatusId = sortedStatuses[0]?.id ?? 'status-applied';
    const validProjectIds = new Set(activeProjects.map((p) => p.id));
    const fallbackProjectId = activeProjects[0]?.id ?? 'proj-lead-staff';

    const seedTaskIdSet = new Set(INITIAL_WORKSPACE_STATE.tasks.map((t) => t.id));
    const cleanupPlan: CloudCleanupPlan = {
      docIdsToDelete: [],
      tasksToSoftDelete: [],
      tasksToUpdate: [],
    };

    let rawTasks: TaskItem[];
    if (workspaceMeta.seedReplaced) {
      rawTasks = cloudCandidates
        .filter((c) => !c.deleted)
        .map(({ deleted: _deleted, ...rest }) => ({
          ...rest,
          statusId: validStatusIds.has(rest.statusId) ? rest.statusId : fallbackStatusId,
          projectId: validProjectIds.has(rest.projectId) ? rest.projectId : fallbackProjectId,
        }));
    } else {
      const mergedList: TaskItem[] = [];
      const consumedCloudIds = new Set<string>();

      for (const seedTask of INITIAL_WORKSPACE_STATE.tasks) {
        const directOverride = cloudMap.get(seedTask.id);
        let matchedOverride: (TaskItem & { deleted: boolean }) | undefined;

        if (directOverride && areCandidatesSamePerson(directOverride, seedTask)) {
          matchedOverride = directOverride;
        } else {
          // Index shifted from older seed snapshot: find matching override by candidate identity
          for (const candidate of cloudCandidates) {
            if (consumedCloudIds.has(candidate.id)) continue;
            if (areCandidatesSamePerson(candidate, seedTask)) {
              matchedOverride = candidate;
              if (candidate.id !== seedTask.id) {
                cleanupPlan.docIdsToDelete.push(candidate.id);
              }
              break;
            }
          }
          if (directOverride && !areCandidatesSamePerson(directOverride, seedTask)) {
            // Stale index-shifted cloud doc from prior seed; remove old doc id so new seed appears cleanly
            cleanupPlan.docIdsToDelete.push(directOverride.id);
          }
        }

        if (matchedOverride) {
          consumedCloudIds.add(matchedOverride.id);
          if (!matchedOverride.deleted) {
            const { deleted: _deleted, ...rest } = matchedOverride;
            const syncedTask: TaskItem = {
              ...seedTask,
              statusId: validStatusIds.has(rest.statusId) ? rest.statusId : fallbackStatusId,
              projectId: validProjectIds.has(rest.projectId) ? rest.projectId : fallbackProjectId,
              order: rest.order,
              priority: rest.priority,
              assigneeId: rest.assigneeId,
              statusHistory: rest.statusHistory,
              updatedAt: rest.updatedAt,
              fullName: rest.fullName || seedTask.fullName,
              email: rest.email || seedTask.email,
              contactNo: rest.contactNo || seedTask.contactNo,
              portfolioUrl: rest.portfolioUrl || seedTask.portfolioUrl,
              currentLocation: rest.currentLocation || seedTask.currentLocation,
              yearsOfExperience: rest.yearsOfExperience || seedTask.yearsOfExperience,
              designedAiProduct: rest.designedAiProduct || seedTask.designedAiProduct,
              noticePeriod: rest.noticePeriod || seedTask.noticePeriod,
              resumeUrl: rest.resumeUrl || seedTask.resumeUrl,
              message: rest.message || seedTask.message,
              expectedSalary: rest.expectedSalary || seedTask.expectedSalary,
              readyToRelocateIn: rest.readyToRelocateIn || seedTask.readyToRelocateIn,
            };
            mergedList.push(syncedTask);
            if (matchedOverride.id !== seedTask.id) {
              cleanupPlan.tasksToUpdate.push(syncedTask);
            }
          } else if (matchedOverride.id !== seedTask.id) {
            cleanupPlan.tasksToSoftDelete.push(seedTask);
          }
        } else {
          mergedList.push({
            ...seedTask,
            statusId: validStatusIds.has(seedTask.statusId)
              ? seedTask.statusId
              : fallbackStatusId,
            projectId: validProjectIds.has(seedTask.projectId)
              ? seedTask.projectId
              : fallbackProjectId,
          });
        }
      }

      for (const remaining of cloudCandidates) {
        if (consumedCloudIds.has(remaining.id)) continue;
        if (seedTaskIdSet.has(remaining.id)) continue;
        if (!remaining.deleted) {
          const { deleted: _deleted, ...rest } = remaining;
          mergedList.push({
            ...rest,
            statusId: validStatusIds.has(rest.statusId) ? rest.statusId : fallbackStatusId,
            projectId: validProjectIds.has(rest.projectId) ? rest.projectId : fallbackProjectId,
          });
        }
      }
      rawTasks = mergedList;
    }

    const dedup = deduplicateTaskList(rawTasks);
    if (dedup.removedCount > 0) {
      for (const dup of dedup.removedDuplicates) {
        if (cloudIds.has(dup.id)) {
          if (!workspaceMeta.seedReplaced && seedTaskIdSet.has(dup.id)) {
            cleanupPlan.tasksToSoftDelete.push(dup);
          } else {
            cleanupPlan.docIdsToDelete.push(dup.id);
          }
        }
      }
      for (const survivor of dedup.updatedSurvivors) {
        if (cloudIds.has(survivor.id) || workspaceMeta.seedReplaced) {
          cleanupPlan.tasksToUpdate.push(survivor);
        }
      }
    }

    onSync({
      workspace: {
        workspaceName: workspaceMeta.workspaceName,
        nextCodeNumber: Math.max(
          workspaceMeta.nextCodeNumber,
          INITIAL_WORKSPACE_STATE.nextCodeNumber
        ),
        statuses: sortedStatuses,
        projects: activeProjects,
        tasks: dedup.uniqueTasks,
      },
      cloudCandidateIds: cloudIds,
      seedReplaced: workspaceMeta.seedReplaced,
      cloudNextCodeNumber: workspaceMeta.nextCodeNumber,
      rawDuplicateCount: dedup.removedCount,
      cloudCleanupPlan: cleanupPlan,
    });
  };

  const wsPath = `users/${uid}/workspaces/default`;
  const unsubWs = onSnapshot(
    doc(db, 'users', uid, 'workspaces', 'default'),
    (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        workspaceMeta = {
          workspaceName: String(d.workspaceName || INITIAL_WORKSPACE_STATE.workspaceName),
          nextCodeNumber: Number(d.nextCodeNumber || INITIAL_WORKSPACE_STATE.nextCodeNumber),
          seedReplaced: Boolean(d.seedReplaced),
        };
      } else {
        workspaceMeta = {
          workspaceName: INITIAL_WORKSPACE_STATE.workspaceName,
          nextCodeNumber: INITIAL_WORKSPACE_STATE.nextCodeNumber,
          seedReplaced: false,
        };
      }
      emitIfReady();
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.GET, wsPath);
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );

  const statusesPath = `users/${uid}/statuses`;
  const unsubStatuses = onSnapshot(
    query(collection(db, 'users', uid, 'statuses'), where('ownerUid', '==', uid)),
    (snap) => {
      cloudStatuses = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: String(data.id ?? d.id),
          name: String(data.name ?? ''),
          category: (data.category ?? 'backlog') as StatusCategory,
          color: (data.color ?? 'slate') as StatusColor,
          wipLimit: data.wipLimit === null || data.wipLimit === undefined ? null : Number(data.wipLimit),
          description: String(data.description ?? ''),
          order: Number(data.order ?? 0),
        };
      });
      emitIfReady();
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, statusesPath);
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );

  const projectsPath = `users/${uid}/projects`;
  const unsubProjects = onSnapshot(
    query(collection(db, 'users', uid, 'projects'), where('ownerUid', '==', uid)),
    (snap) => {
      cloudProjects = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: String(data.id ?? d.id),
          key: String(data.key ?? 'ROLE'),
          name: String(data.name ?? ''),
          summary: String(data.summary ?? ''),
          leadId: String(data.leadId ?? 'member-priya'),
          targetDate: String(data.targetDate ?? ''),
        };
      });
      emitIfReady();
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, projectsPath);
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );

  const candidatesPath = `users/${uid}/candidates`;
  const unsubCandidates = onSnapshot(
    query(collection(db, 'users', uid, 'candidates'), where('ownerUid', '==', uid)),
    (snap) => {
      cloudCandidates = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: String(data.id ?? d.id),
          code: String(data.code ?? ''),
          projectId: String(data.projectId ?? ''),
          statusId: String(data.statusId ?? ''),
          order: Number(data.order ?? 0),
          priority: (data.priority ?? 'medium') as PriorityLevel,
          assigneeId: String(data.assigneeId ?? 'member-priya'),
          updatedAt: formatFirestoreTimestamp(data.updatedAt),
          statusHistory: Array.isArray(data.statusHistory)
            ? (data.statusHistory as StatusTransition[])
            : [],
          deleted: Boolean(data.deleted),
          timestamp: String(data.timestamp ?? ''),
          fullName: String(data.fullName ?? ''),
          email: String(data.email ?? ''),
          contactNo: String(data.contactNo ?? ''),
          portfolioUrl: String(data.portfolioUrl ?? ''),
          currentLocation: String(data.currentLocation ?? ''),
          yearsOfExperience: String(data.yearsOfExperience ?? ''),
          designedAiProduct: String(data.designedAiProduct ?? ''),
          noticePeriod: String(data.noticePeriod ?? ''),
          resumeUrl: String(data.resumeUrl ?? ''),
          message: String(data.message ?? ''),
          expectedSalary: String(data.expectedSalary ?? ''),
          readyToRelocateIn: String(data.readyToRelocateIn ?? ''),
        };
      });
      emitIfReady();
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, candidatesPath);
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );

  return () => {
    unsubWs();
    unsubStatuses();
    unsubProjects();
    unsubCandidates();
  };
}

export async function saveTaskMoveToCloud(
  uid: string,
  movedTask: TaskItem,
  reorderedSiblings: TaskItem[],
  cloudIds: Set<string>
): Promise<void> {
  const refs = await resolveValidFirestoreRefs(uid);
  const allToSync = [movedTask, ...reorderedSiblings.filter((t) => t.id !== movedTask.id)];
  const ops: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];

  for (const item of allToSync) {
    const normalized = normalizeTaskForFirestore(item, refs);
    const ref = doc(db, 'users', uid, 'candidates', normalized.id);
    if (cloudIds.has(normalized.id)) {
      ops.push((batch) =>
        batch.update(ref, {
          statusId: normalized.statusId,
          order: sanitizeOrder(normalized.order),
          statusHistory: sanitizeHistory(normalized.statusHistory),
          updatedAt: serverTimestamp(),
        })
      );
    } else {
      ops.push((batch) => batch.set(ref, toCandidatePayload(uid, normalized, false, true)));
    }
  }

  await commitBatchesInWaves(
    ops,
    CANDIDATE_WRITE_BATCH_SIZE,
    OperationType.WRITE,
    `users/${uid}/candidates`
  );
}

export async function saveBulkMovesToCloud(
  uid: string,
  updatedTasks: TaskItem[],
  cloudIds: Set<string>
): Promise<void> {
  const refs = await resolveValidFirestoreRefs(uid);
  const ops: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];

  for (const item of updatedTasks) {
    const normalized = normalizeTaskForFirestore(item, refs);
    const ref = doc(db, 'users', uid, 'candidates', normalized.id);
    if (cloudIds.has(normalized.id)) {
      ops.push((batch) =>
        batch.update(ref, {
          statusId: normalized.statusId,
          order: sanitizeOrder(normalized.order),
          statusHistory: sanitizeHistory(normalized.statusHistory),
          updatedAt: serverTimestamp(),
        })
      );
    } else {
      ops.push((batch) => batch.set(ref, toCandidatePayload(uid, normalized, false, true)));
    }
  }

  await commitBatchesInWaves(
    ops,
    CANDIDATE_WRITE_BATCH_SIZE,
    OperationType.WRITE,
    `users/${uid}/candidates`
  );
}

export async function saveTaskCreateToCloud(
  uid: string,
  task: TaskItem,
  nextCodeNumber: number
): Promise<void> {
  const refs = await resolveValidFirestoreRefs(uid);
  const normalized = normalizeTaskForFirestore(task, refs);
  const batch = writeBatch(db);
  batch.set(
    doc(db, 'users', uid, 'candidates', normalized.id),
    toCandidatePayload(uid, normalized, false, true)
  );
  batch.update(doc(db, 'users', uid, 'workspaces', 'default'), {
    nextCodeNumber,
    updatedAt: serverTimestamp(),
  });
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `users/${uid}/candidates/${normalized.id}`);
  }
}

export async function saveTaskUpdateToCloud(
  uid: string,
  task: TaskItem,
  existsInCloud: boolean
): Promise<void> {
  const refs = await resolveValidFirestoreRefs(uid);
  const normalized = normalizeTaskForFirestore(task, refs);
  const path = `users/${uid}/candidates/${normalized.id}`;
  const ref = doc(db, 'users', uid, 'candidates', normalized.id);
  try {
    if (existsInCloud) {
      const payload = toCandidatePayload(uid, normalized, false, false);
      delete payload.ownerUid;
      delete payload.id;
      delete payload.code;
      await updateDoc(ref, payload);
    } else {
      await setDoc(ref, toCandidatePayload(uid, normalized, false, true));
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function saveTaskDeleteToCloud(
  uid: string,
  task: TaskItem,
  isSeedTask: boolean,
  existsInCloud: boolean
): Promise<void> {
  const safeId = sanitizeId(task.id, 'cand');
  const path = `users/${uid}/candidates/${safeId}`;
  const ref = doc(db, 'users', uid, 'candidates', safeId);
  try {
    if (isSeedTask) {
      if (existsInCloud) {
        const refs = await resolveValidFirestoreRefs(uid);
        const normalized = normalizeTaskForFirestore(task, refs);
        const payload = toCandidatePayload(uid, normalized, true, false);
        delete payload.ownerUid;
        delete payload.id;
        delete payload.code;
        await updateDoc(ref, payload);
      } else {
        const refs = await resolveValidFirestoreRefs(uid);
        const normalized = normalizeTaskForFirestore(task, refs);
        await setDoc(ref, toCandidatePayload(uid, normalized, true, true));
      }
    } else if (existsInCloud) {
      await deleteDoc(ref);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveDeduplicationToCloud(
  uid: string,
  plan: CloudCleanupPlan,
  cloudIds: Set<string>
): Promise<void> {
  const protectedIds = new Set<string>([
    ...plan.tasksToUpdate.map((t) => sanitizeId(t.id, 'cand')),
    ...plan.tasksToSoftDelete.map((t) => sanitizeId(t.id, 'cand')),
  ]);
  const uniqueDeleteIds = Array.from(
    new Set(plan.docIdsToDelete.map((id) => sanitizeId(id, 'cand')))
  ).filter((id) => cloudIds.has(id) && !protectedIds.has(id));

  const deleteOps: Array<(batch: ReturnType<typeof writeBatch>) => void> = uniqueDeleteIds.map(
    (docId) => (batch) => batch.delete(doc(db, 'users', uid, 'candidates', docId))
  );

  await commitBatchesInWaves(
    deleteOps,
    DELETE_BATCH_SIZE,
    OperationType.DELETE,
    `users/${uid}/candidates`
  );

  const hasWrites = plan.tasksToUpdate.length > 0 || plan.tasksToSoftDelete.length > 0;
  if (!hasWrites) return;

  const refs = await resolveValidFirestoreRefs(uid);
  const writeOpsById = new Map<string, (batch: ReturnType<typeof writeBatch>) => void>();

  for (const survivor of plan.tasksToUpdate) {
    const normalized = normalizeTaskForFirestore(survivor, refs);
    const ref = doc(db, 'users', uid, 'candidates', normalized.id);
    if (cloudIds.has(normalized.id)) {
      const payload = toCandidatePayload(uid, normalized, false, false);
      delete payload.ownerUid;
      delete payload.id;
      delete payload.code;
      writeOpsById.set(normalized.id, (batch) => batch.update(ref, payload));
    } else {
      writeOpsById.set(normalized.id, (batch) =>
        batch.set(ref, toCandidatePayload(uid, normalized, false, true))
      );
    }
  }

  for (const softDel of plan.tasksToSoftDelete) {
    const normalized = normalizeTaskForFirestore(softDel, refs);
    const ref = doc(db, 'users', uid, 'candidates', normalized.id);
    if (cloudIds.has(normalized.id)) {
      const payload = toCandidatePayload(uid, normalized, true, false);
      delete payload.ownerUid;
      delete payload.id;
      delete payload.code;
      writeOpsById.set(normalized.id, (batch) => batch.update(ref, payload));
    } else {
      writeOpsById.set(normalized.id, (batch) =>
        batch.set(ref, toCandidatePayload(uid, normalized, true, true))
      );
    }
  }

  await commitBatchesInWaves(
    Array.from(writeOpsById.values()),
    CANDIDATE_WRITE_BATCH_SIZE,
    OperationType.WRITE,
    `users/${uid}/candidates`
  );
}

export async function saveSheetSyncToCloud(
  uid: string,
  params: {
    newStatuses?: StatusDefinition[];
    allStatuses?: StatusDefinition[];
    newProjects?: Project[];
    tasksToInsert: TaskItem[];
    tasksToUpdate: TaskItem[];
    docIdsToDelete: string[];
    tasksToSoftDelete?: TaskItem[];
    nextCodeNumber: number;
    currentCloudNextCodeNumber: number;
  },
  cloudIds: Set<string>
): Promise<void> {
  if (
    (params.newStatuses && params.newStatuses.length > 0) ||
    (params.newProjects && params.newProjects.length > 0)
  ) {
    const newStatusIds = new Set(
      (params.newStatuses ?? []).map((ns) => sanitizeId(ns.id, 'status'))
    );
    const schemaOps: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];
    for (const s of params.allStatuses ?? []) {
      const sid = sanitizeId(s.id, 'status');
      const ref = doc(db, 'users', uid, 'statuses', sid);
      if (newStatusIds.has(sid)) {
        schemaOps.push((batch) => batch.set(ref, toStatusPayload(uid, s, true)));
      } else {
        schemaOps.push((batch) =>
          batch.update(ref, {
            order: Math.max(0, Math.min(1000, Math.floor(Number.isFinite(s.order) ? s.order : 0))),
            updatedAt: serverTimestamp(),
          })
        );
      }
    }
    for (const p of params.newProjects ?? []) {
      const pid = sanitizeId(p.id, 'proj');
      schemaOps.push((batch) =>
        batch.set(doc(db, 'users', uid, 'projects', pid), toProjectPayload(uid, p, true))
      );
    }
    await commitBatchesInWaves(
      schemaOps,
      DELETE_BATCH_SIZE,
      OperationType.WRITE,
      `users/${uid}/statuses`
    );
  }

  const softDeleteList = params.tasksToSoftDelete ?? [];
  const protectedIds = new Set<string>([
    ...params.tasksToInsert.map((t) => sanitizeId(t.id, 'cand')),
    ...params.tasksToUpdate.map((t) => sanitizeId(t.id, 'cand')),
    ...softDeleteList.map((t) => sanitizeId(t.id, 'cand')),
  ]);

  const uniqueDeleteIds = Array.from(
    new Set(params.docIdsToDelete.map((id) => sanitizeId(id, 'cand')))
  ).filter((id) => cloudIds.has(id) && !protectedIds.has(id));

  const deleteOps: Array<(batch: ReturnType<typeof writeBatch>) => void> = uniqueDeleteIds.map(
    (docId) => (batch) => batch.delete(doc(db, 'users', uid, 'candidates', docId))
  );

  await commitBatchesInWaves(
    deleteOps,
    DELETE_BATCH_SIZE,
    OperationType.DELETE,
    `users/${uid}/candidates`
  );

  const hasWrites =
    softDeleteList.length > 0 ||
    params.tasksToUpdate.length > 0 ||
    params.tasksToInsert.length > 0;

  if (hasWrites) {
    const refs = await resolveValidFirestoreRefs(uid);
    const writeOpsById = new Map<string, (batch: ReturnType<typeof writeBatch>) => void>();

    for (const softDel of softDeleteList) {
      const normalized = normalizeTaskForFirestore(softDel, refs);
      const ref = doc(db, 'users', uid, 'candidates', normalized.id);
      if (cloudIds.has(normalized.id)) {
        const payload = toCandidatePayload(uid, normalized, true, false);
        delete payload.ownerUid;
        delete payload.id;
        delete payload.code;
        writeOpsById.set(normalized.id, (batch) => batch.update(ref, payload));
      } else {
        writeOpsById.set(normalized.id, (batch) =>
          batch.set(ref, toCandidatePayload(uid, normalized, true, true))
        );
      }
    }

    for (const updated of params.tasksToUpdate) {
      const normalized = normalizeTaskForFirestore(updated, refs);
      const ref = doc(db, 'users', uid, 'candidates', normalized.id);
      if (cloudIds.has(normalized.id)) {
        const payload = toCandidatePayload(uid, normalized, false, false);
        delete payload.ownerUid;
        delete payload.id;
        delete payload.code;
        writeOpsById.set(normalized.id, (batch) => batch.update(ref, payload));
      } else {
        writeOpsById.set(normalized.id, (batch) =>
          batch.set(ref, toCandidatePayload(uid, normalized, false, true))
        );
      }
    }

    for (const inserted of params.tasksToInsert) {
      const normalized = normalizeTaskForFirestore(inserted, refs);
      const ref = doc(db, 'users', uid, 'candidates', normalized.id);
      if (cloudIds.has(normalized.id)) {
        const payload = toCandidatePayload(uid, normalized, false, false);
        delete payload.ownerUid;
        delete payload.id;
        delete payload.code;
        writeOpsById.set(normalized.id, (batch) => batch.update(ref, payload));
      } else {
        writeOpsById.set(normalized.id, (batch) =>
          batch.set(ref, toCandidatePayload(uid, normalized, false, true))
        );
      }
    }

    await commitBatchesInWaves(
      Array.from(writeOpsById.values()),
      CANDIDATE_WRITE_BATCH_SIZE,
      OperationType.WRITE,
      `users/${uid}/candidates`
    );
  }

  if (params.nextCodeNumber > params.currentCloudNextCodeNumber) {
    try {
      await updateDoc(doc(db, 'users', uid, 'workspaces', 'default'), {
        nextCodeNumber: params.nextCodeNumber,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${uid}/workspaces/default`);
    }
  }
}

export async function createSheetSyncNotificationsInCloud(
  uid: string,
  newTasks: TaskItem[]
): Promise<void> {
  if (newTasks.length === 0 || newTasks.length > 10) return;

  const ops: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];
  for (const rawTask of newTasks) {
    const candidateId = sanitizeId(rawTask.id, 'cand');
    const notifId = sanitizeId(`notif-${candidateId}`, 'notif');
    const notifRef = doc(db, 'users', uid, 'notifications', notifId);
    const existing = await getDoc(notifRef);
    if (existing.exists()) continue;

    const safeName = clamp(rawTask.fullName.trim() || 'New Candidate', LIMITS.fullName);
    const safeExp = clamp(rawTask.yearsOfExperience, LIMITS.experience);
    const safeAi = clamp(rawTask.designedAiProduct, LIMITS.aiProduct);
    const summaryParts = [
      safeExp || null,
      rawTask.currentLocation.trim() || null,
      safeAi ? `AI: ${safeAi}` : null,
    ].filter(Boolean);

    ops.push((batch) =>
      batch.set(notifRef, {
        ownerUid: uid,
        id: notifId,
        type: 'new_lead',
        candidateId,
        candidateCode: clamp(rawTask.code || 'CND-101', LIMITS.code),
        candidateName: safeName,
        candidateEmail: clamp(rawTask.email, LIMITS.email),
        experience: safeExp,
        designedAiProduct: safeAi,
        title: clamp('Synced from Google Sheet', 140),
        message: clamp(
          summaryParts.length > 0
            ? `${safeName} (${summaryParts.join(' · ')}) synced from Google Form Sheet.`
            : `${safeName} synced automatically from Google Form Sheet.`,
          400
        ),
        read: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
  }

  await commitBatchesInWaves(
    ops,
    LEAD_INGEST_BATCH_SIZE,
    OperationType.CREATE,
    `users/${uid}/notifications`
  );
}

export async function saveStatusesReorderToCloud(
  uid: string,
  statuses: StatusDefinition[]
): Promise<void> {
  const batch = writeBatch(db);
  for (const s of statuses) {
    batch.update(doc(db, 'users', uid, 'statuses', s.id), {
      order: Math.max(0, Math.min(1000, Math.floor(s.order))),
      updatedAt: serverTimestamp(),
    });
  }
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${uid}/statuses`);
  }
}

export async function saveStatusCreateToCloud(
  uid: string,
  newStatus: StatusDefinition,
  allStatuses: StatusDefinition[]
): Promise<void> {
  const batch = writeBatch(db);
  for (const s of allStatuses) {
    const ref = doc(db, 'users', uid, 'statuses', s.id);
    if (s.id === newStatus.id) {
      batch.set(ref, toStatusPayload(uid, s, true));
    } else {
      batch.update(ref, {
        order: Math.max(0, Math.min(1000, Math.floor(s.order))),
        updatedAt: serverTimestamp(),
      });
    }
  }
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `users/${uid}/statuses/${newStatus.id}`);
  }
}

export async function saveStatusUpdateToCloud(
  uid: string,
  status: StatusDefinition
): Promise<void> {
  const path = `users/${uid}/statuses/${status.id}`;
  const payload = toStatusPayload(uid, status, false);
  delete payload.ownerUid;
  delete payload.id;
  try {
    await updateDoc(doc(db, 'users', uid, 'statuses', status.id), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function saveStatusDeleteToCloud(
  uid: string,
  deletedStatusId: string,
  remainingStatuses: StatusDefinition[],
  reassignedTasks: TaskItem[],
  cloudIds: Set<string>
): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'users', uid, 'statuses', deletedStatusId));
  for (const s of remainingStatuses) {
    batch.update(doc(db, 'users', uid, 'statuses', s.id), {
      order: Math.max(0, Math.min(1000, Math.floor(s.order))),
      updatedAt: serverTimestamp(),
    });
  }
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `users/${uid}/statuses/${deletedStatusId}`);
  }

  if (reassignedTasks.length > 0) {
    await saveBulkMovesToCloud(uid, reassignedTasks, cloudIds);
  }
}

export async function savePresetApplyToCloud(
  uid: string,
  oldStatusIds: string[],
  newStatuses: StatusDefinition[],
  remappedTasks: TaskItem[],
  cloudIds: Set<string>
): Promise<void> {
  const batch = writeBatch(db);
  for (const oldId of oldStatusIds) {
    batch.delete(doc(db, 'users', uid, 'statuses', oldId));
  }
  for (const ns of newStatuses) {
    batch.set(doc(db, 'users', uid, 'statuses', ns.id), toStatusPayload(uid, ns, true));
  }
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${uid}/statuses`);
  }

  if (remappedTasks.length > 0) {
    await saveBulkMovesToCloud(uid, remappedTasks, cloudIds);
  }
}

export async function saveProjectCreateToCloud(uid: string, project: Project): Promise<void> {
  const path = `users/${uid}/projects/${project.id}`;
  try {
    await setDoc(doc(db, 'users', uid, 'projects', project.id), toProjectPayload(uid, project, true));
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function saveImportToCloud(
  uid: string,
  params: {
    mode: 'append' | 'replace';
    newStatuses: StatusDefinition[];
    allStatuses: StatusDefinition[];
    newProjects: Project[];
    importedTasks: TaskItem[];
    nextCodeNumber: number;
  }
): Promise<void> {
  // Commit new/reordered statuses and new projects first so existsAfter/exists checks on candidates succeed
  const hasStatusOrProjectWrites =
    params.allStatuses.length > 0 || params.newProjects.length > 0;
  if (hasStatusOrProjectWrites) {
    const newStatusIds = new Set(params.newStatuses.map((ns) => sanitizeId(ns.id, 'status')));
    const schemaOps: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];
    for (const s of params.allStatuses) {
      const sid = sanitizeId(s.id, 'status');
      const ref = doc(db, 'users', uid, 'statuses', sid);
      if (newStatusIds.has(sid)) {
        schemaOps.push((batch) => batch.set(ref, toStatusPayload(uid, s, true)));
      } else {
        schemaOps.push((batch) =>
          batch.update(ref, {
            order: Math.max(0, Math.min(1000, Math.floor(Number.isFinite(s.order) ? s.order : 0))),
            updatedAt: serverTimestamp(),
          })
        );
      }
    }
    for (const p of params.newProjects) {
      const pid = sanitizeId(p.id, 'proj');
      schemaOps.push((batch) =>
        batch.set(doc(db, 'users', uid, 'projects', pid), toProjectPayload(uid, p, true))
      );
    }
    await commitBatchesInWaves(
      schemaOps,
      DELETE_BATCH_SIZE,
      OperationType.WRITE,
      `users/${uid}/statuses`
    );
  }

  let existingCandidateIds = new Set<string>();
  if (params.mode === 'replace') {
    const existingSnap = await getDocs(
      query(collection(db, 'users', uid, 'candidates'), where('ownerUid', '==', uid))
    );
    const deleteOps: Array<(batch: ReturnType<typeof writeBatch>) => void> =
      existingSnap.docs.map((d) => (batch) => batch.delete(d.ref));
    await commitBatchesInWaves(
      deleteOps,
      DELETE_BATCH_SIZE,
      OperationType.DELETE,
      `users/${uid}/candidates`
    );
  } else if (params.importedTasks.length > 0) {
    const existingSnap = await getDocs(
      query(collection(db, 'users', uid, 'candidates'), where('ownerUid', '==', uid))
    );
    existingCandidateIds = new Set(existingSnap.docs.map((d) => d.id));
  }

  if (params.importedTasks.length > 0) {
    const refs = await resolveValidFirestoreRefs(uid);
    const writeOpsById = new Map<string, (batch: ReturnType<typeof writeBatch>) => void>();
    for (const t of params.importedTasks) {
      const normalized = normalizeTaskForFirestore(t, refs);
      const ref = doc(db, 'users', uid, 'candidates', normalized.id);
      if (existingCandidateIds.has(normalized.id)) {
        const payload = toCandidatePayload(uid, normalized, false, false);
        delete payload.ownerUid;
        delete payload.id;
        delete payload.code;
        writeOpsById.set(normalized.id, (batch) => batch.update(ref, payload));
      } else {
        writeOpsById.set(normalized.id, (batch) =>
          batch.set(ref, toCandidatePayload(uid, normalized, false, true))
        );
      }
    }
    await commitBatchesInWaves(
      Array.from(writeOpsById.values()),
      CANDIDATE_WRITE_BATCH_SIZE,
      OperationType.CREATE,
      `users/${uid}/candidates`
    );
  }

  // Update workspace metadata after all candidate documents are committed
  try {
    await updateDoc(doc(db, 'users', uid, 'workspaces', 'default'), {
      nextCodeNumber: params.nextCodeNumber,
      seedReplaced: params.mode === 'replace',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${uid}/workspaces/default`);
  }
}

export async function resetWorkspaceInCloud(uid: string): Promise<void> {
  const collectionsToClear = ['candidates', 'statuses', 'projects', 'notifications'] as const;
  for (const colName of collectionsToClear) {
    try {
      const snap = await getDocs(
        query(collection(db, 'users', uid, colName), where('ownerUid', '==', uid))
      );
      const deleteOps: Array<(batch: ReturnType<typeof writeBatch>) => void> = snap.docs.map(
        (d) => (batch) => batch.delete(d.ref)
      );
      await commitBatchesInWaves(
        deleteOps,
        DELETE_BATCH_SIZE,
        OperationType.DELETE,
        `users/${uid}/${colName}`
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${uid}/${colName}`);
    }
  }

  const workspaceRef = doc(db, 'users', uid, 'workspaces', 'default');
  try {
    const wsSnap = await getDoc(workspaceRef);
    const batch = writeBatch(db);
    if (wsSnap.exists()) {
      batch.update(workspaceRef, {
        workspaceName: clamp(INITIAL_WORKSPACE_STATE.workspaceName, LIMITS.workspaceName),
        nextCodeNumber: INITIAL_WORKSPACE_STATE.nextCodeNumber,
        seedReplaced: false,
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.set(workspaceRef, {
        ownerUid: uid,
        workspaceName: clamp(INITIAL_WORKSPACE_STATE.workspaceName, LIMITS.workspaceName),
        nextCodeNumber: INITIAL_WORKSPACE_STATE.nextCodeNumber,
        seedReplaced: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    for (const s of INITIAL_WORKSPACE_STATE.statuses) {
      batch.set(doc(db, 'users', uid, 'statuses', s.id), toStatusPayload(uid, s, true));
    }
    for (const p of INITIAL_WORKSPACE_STATE.projects) {
      batch.set(doc(db, 'users', uid, 'projects', p.id), toProjectPayload(uid, p, true));
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${uid}/workspaces/default`);
  }
}

export interface PublicLeadSubmissionInput {
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
}

export interface PendingLeadSubmission extends PublicLeadSubmissionInput {
  id: string;
  createdAtIso: string;
}

export async function submitPublicLeadForm(
  targetUid: string,
  input: PublicLeadSubmissionInput
): Promise<void> {
  const cleanTargetUid = targetUid.trim();
  if (!cleanTargetUid || !VALID_ID_RE.test(cleanTargetUid)) {
    throw new Error('Invalid form workspace link.');
  }
  const safeName = clamp(input.fullName.trim(), LIMITS.fullName);
  if (!safeName) {
    throw new Error('Full Name is required.');
  }

  const submissionId = sanitizeId(
    `lead-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    'lead'
  );

  try {
    await setDoc(doc(db, 'users', cleanTargetUid, 'leadSubmissions', submissionId), {
      targetUid: cleanTargetUid,
      id: submissionId,
      fullName: safeName,
      email: clamp(input.email.trim(), LIMITS.email),
      contactNo: clamp(input.contactNo.trim(), LIMITS.contactNo),
      portfolioUrl: clamp(input.portfolioUrl.trim(), LIMITS.url),
      currentLocation: clamp(input.currentLocation.trim(), LIMITS.location),
      yearsOfExperience: clamp(input.yearsOfExperience.trim(), LIMITS.experience),
      designedAiProduct: clamp(input.designedAiProduct.trim(), LIMITS.aiProduct),
      noticePeriod: clamp(input.noticePeriod.trim(), LIMITS.notice),
      resumeUrl: clamp(input.resumeUrl.trim(), LIMITS.url),
      message: clamp(input.message.trim(), LIMITS.message),
      expectedSalary: clamp(input.expectedSalary.trim(), LIMITS.salary),
      readyToRelocateIn: clamp(input.readyToRelocateIn.trim(), LIMITS.relocate),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code)
        : '';
    if (code === 'permission-denied') {
      throw new Error(
        'This form link is inactive or no longer accepting submissions. Please verify the link with the recruiter.'
      );
    }
    throw new Error(
      error instanceof Error
        ? error.message
        : 'Unable to submit your details right now. Please try again.'
    );
  }
}

export function subscribeToIncomingLeadSubmissions(
  uid: string,
  onIncoming: (submissions: PendingLeadSubmission[]) => void,
  onError: (err: Error) => void
): () => void {
  const path = `users/${uid}/leadSubmissions`;
  return onSnapshot(
    query(collection(db, 'users', uid, 'leadSubmissions'), where('targetUid', '==', uid)),
    (snap) => {
      if (snap.empty) return;
      const items: PendingLeadSubmission[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          fullName: String(data.fullName ?? ''),
          email: String(data.email ?? ''),
          contactNo: String(data.contactNo ?? ''),
          portfolioUrl: String(data.portfolioUrl ?? ''),
          currentLocation: String(data.currentLocation ?? ''),
          yearsOfExperience: String(data.yearsOfExperience ?? ''),
          designedAiProduct: String(data.designedAiProduct ?? ''),
          noticePeriod: String(data.noticePeriod ?? ''),
          resumeUrl: String(data.resumeUrl ?? ''),
          message: String(data.message ?? ''),
          expectedSalary: String(data.expectedSalary ?? ''),
          readyToRelocateIn: String(data.readyToRelocateIn ?? ''),
          createdAtIso: formatFirestoreTimestamp(data.createdAt),
        };
      });
      onIncoming(items);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export async function ingestLeadSubmissionsToCloud(
  uid: string,
  tasks: TaskItem[],
  submissionIds: string[],
  nextCodeNumber: number
): Promise<void> {
  if (tasks.length === 0) return;
  const refs = await resolveValidFirestoreRefs(uid);
  const normalizedTasks = tasks.map((rawTask) => normalizeTaskForFirestore(rawTask, refs));

  const candidateOps: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];
  const notifAndDeleteOps: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];

  for (let i = 0; i < normalizedTasks.length; i += 1) {
    const t = normalizedTasks[i];
    const subId = submissionIds[i];
    const candidateId = t.id;
    const candRef = doc(db, 'users', uid, 'candidates', candidateId);
    const notifId = sanitizeId(`notif-${candidateId}`, 'notif');
    const notifRef = doc(db, 'users', uid, 'notifications', notifId);

    const [candSnap, notifSnap] = await Promise.all([getDoc(candRef), getDoc(notifRef)]);

    if (candSnap.exists()) {
      const payload = toCandidatePayload(uid, t, false, false);
      delete payload.ownerUid;
      delete payload.id;
      delete payload.code;
      candidateOps.push((batch) => batch.update(candRef, payload));
    } else {
      candidateOps.push((batch) => batch.set(candRef, toCandidatePayload(uid, t, false, true)));
    }

    if (notifSnap.exists()) {
      notifAndDeleteOps.push((batch) =>
        batch.update(notifRef, {
          read: false,
          updatedAt: serverTimestamp(),
        })
      );
    } else {
      const safeName = clamp(t.fullName.trim() || 'New Candidate', LIMITS.fullName);
      const safeExp = clamp(t.yearsOfExperience, LIMITS.experience);
      const safeAi = clamp(t.designedAiProduct, LIMITS.aiProduct);
      const summaryParts = [
        safeExp || null,
        t.currentLocation.trim() || null,
        safeAi ? `AI: ${safeAi}` : null,
      ].filter(Boolean);

      notifAndDeleteOps.push((batch) =>
        batch.set(notifRef, {
          ownerUid: uid,
          id: notifId,
          type: 'new_lead',
          candidateId,
          candidateCode: clamp(t.code || 'CND-101', LIMITS.code),
          candidateName: safeName,
          candidateEmail: clamp(t.email, LIMITS.email),
          experience: safeExp,
          designedAiProduct: safeAi,
          title: clamp('New Lead Application', 140),
          message: clamp(
            summaryParts.length > 0
              ? `${safeName} (${summaryParts.join(' · ')}) submitted via Lead Intake Form.`
              : `${safeName} submitted an application via Lead Intake Form.`,
            400
          ),
          read: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );
    }

    if (subId && VALID_ID_RE.test(subId)) {
      notifAndDeleteOps.push((batch) =>
        batch.delete(doc(db, 'users', uid, 'leadSubmissions', subId))
      );
    }
  }

  // Phase 1: Commit candidate docs first so notifications' existsAfter(candidates/...) is unconditionally satisfied
  await commitBatchesInWaves(
    candidateOps,
    CANDIDATE_WRITE_BATCH_SIZE,
    OperationType.WRITE,
    `users/${uid}/candidates`
  );

  // Phase 2: Commit notifications and delete consumed leadSubmissions
  await commitBatchesInWaves(
    notifAndDeleteOps,
    LEAD_INGEST_BATCH_SIZE * 2,
    OperationType.WRITE,
    `users/${uid}/notifications`
  );

  // Phase 3: Advance workspace nextCodeNumber
  const safeNextCode = Math.max(
    1,
    Math.min(
      10000000,
      Math.floor(
        Number.isFinite(nextCodeNumber) ? nextCodeNumber : INITIAL_WORKSPACE_STATE.nextCodeNumber
      )
    )
  );
  try {
    await updateDoc(doc(db, 'users', uid, 'workspaces', 'default'), {
      nextCodeNumber: safeNextCode,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${uid}/workspaces/default`);
  }
}

export function subscribeToUserNotifications(
  uid: string,
  onSync: (notifications: LeadNotification[]) => void,
  onError: (err: Error) => void
): () => void {
  const path = `users/${uid}/notifications`;
  return onSnapshot(
    query(collection(db, 'users', uid, 'notifications'), where('ownerUid', '==', uid)),
    (snap) => {
      const items: LeadNotification[] = snap.docs
        .map((d) => {
          const data = d.data();
          return {
            id: String(data.id ?? d.id),
            type: 'new_lead' as const,
            candidateId: String(data.candidateId ?? ''),
            candidateCode: String(data.candidateCode ?? ''),
            candidateName: String(data.candidateName ?? ''),
            candidateEmail: String(data.candidateEmail ?? ''),
            experience: String(data.experience ?? ''),
            designedAiProduct: String(data.designedAiProduct ?? ''),
            title: String(data.title ?? 'New Lead Application'),
            message: String(data.message ?? ''),
            read: Boolean(data.read),
            createdAt: formatFirestoreTimestamp(data.createdAt),
          };
        })
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      onSync(items);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export async function markNotificationReadInCloud(
  uid: string,
  notificationId: string,
  read: boolean
): Promise<void> {
  const path = `users/${uid}/notifications/${notificationId}`;
  try {
    await updateDoc(doc(db, 'users', uid, 'notifications', notificationId), {
      read,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function markAllNotificationsReadInCloud(
  uid: string,
  notificationIds: string[]
): Promise<void> {
  for (let i = 0; i < notificationIds.length; i += 350) {
    const chunk = notificationIds.slice(i, i + 350);
    const batch = writeBatch(db);
    for (const id of chunk) {
      batch.update(doc(db, 'users', uid, 'notifications', id), {
        read: true,
        updatedAt: serverTimestamp(),
      });
    }
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${uid}/notifications`);
    }
  }
}

export async function clearReadNotificationsInCloud(
  uid: string,
  notificationIds: string[]
): Promise<void> {
  for (let i = 0; i < notificationIds.length; i += 350) {
    const chunk = notificationIds.slice(i, i + 350);
    const batch = writeBatch(db);
    for (const id of chunk) {
      batch.delete(doc(db, 'users', uid, 'notifications', id));
    }
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${uid}/notifications`);
    }
  }
}

export const PUBLIC_FORM_SLUG_ID = 'uxdvault-submit-your-application';
export const PUBLIC_FORM_PATH = '/UXDVault/Submit%20your%20Application';
export const PUBLIC_FORM_DISPLAY_PATH = '/UXDVault/Submit your Application';

export function isPublicLeadFormPathname(pathname: string): boolean {
  let decoded = pathname;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    decoded = pathname;
  }
  const normalized = decoded
    .replace(/\/index\.html$/i, '')
    .replace(/\/+$/, '')
    .toLowerCase();
  return (
    normalized === '/uxdvault/submit your application' ||
    normalized === '/uxdvault/submit-your-application'
  );
}

export async function ensurePublicFormRouteRegistered(uid: string): Promise<void> {
  const ref = doc(db, 'publicForms', PUBLIC_FORM_SLUG_ID);
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        formId: PUBLIC_FORM_SLUG_ID,
        ownerUid: uid,
        routePath: 'UXDVault/Submit your Application',
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const data = snap.data();
      if (data.ownerUid === uid && (!data.active || data.routePath !== 'UXDVault/Submit your Application')) {
        await updateDoc(ref, {
          routePath: 'UXDVault/Submit your Application',
          active: true,
          updatedAt: serverTimestamp(),
        });
      }
    }
  } catch {
    // Non-fatal if another owner registered the slug or network is offline
  }
}

export async function resolvePublicFormOwnerUid(
  formId: string = PUBLIC_FORM_SLUG_ID
): Promise<string | null> {
  try {
    const snap = await getDoc(doc(db, 'publicForms', formId));
    if (!snap.exists()) return null;
    const data = snap.data();
    if (data.active === false) return null;
    return typeof data.ownerUid === 'string' && data.ownerUid.trim()
      ? data.ownerUid.trim()
      : null;
  } catch {
    return null;
  }
}
