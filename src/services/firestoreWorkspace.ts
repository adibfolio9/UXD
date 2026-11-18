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
  PriorityLevel,
  Project,
  StatusCategory,
  StatusColor,
  StatusDefinition,
  StatusTransition,
  TaskItem,
  WorkspaceState,
} from '../types';

const VALID_ID_RE = /^[a-zA-Z0-9_-]+$/;

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
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 128);
  if (cleaned && VALID_ID_RE.test(cleaned)) return cleaned;
  return `${fallbackPrefix}-${Date.now()}`;
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
    order: Math.max(0, Math.min(1000, Math.floor(s.order))),
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
    leadId: clamp(p.leadId || 'member-priya', LIMITS.leadId),
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
    t.fullName.trim() || t.email.trim() || t.code || 'Candidate',
    LIMITS.fullName
  );
  const safeHistory = (t.statusHistory ?? []).slice(0, LIMITS.historyMax).map((h) => ({
    id: clamp(h.id, 128),
    fromStatusName: clamp(h.fromStatusName, 80),
    toStatusName: clamp(h.toStatusName, 80),
    changedAt: clamp(h.changedAt, 64),
  }));

  const base: Record<string, unknown> = {
    ownerUid: uid,
    id: sanitizeId(t.id, 'cand'),
    code: clamp(t.code || 'CND-101', LIMITS.code),
    projectId: sanitizeId(t.projectId, 'proj'),
    statusId: sanitizeId(t.statusId, 'status'),
    order: Math.max(0, Math.min(100000, Math.floor(t.order))),
    priority: t.priority,
    assigneeId: clamp(t.assigneeId || 'member-priya', LIMITS.assigneeId),
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
    statusHistory: safeHistory,
    updatedAt: serverTimestamp(),
  };
  if (includeCreatedAt) {
    base.createdAt = serverTimestamp();
  }
  return base;
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
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, workspacePath);
  }
}

export interface WorkspaceSyncSnapshot {
  workspace: WorkspaceState;
  cloudCandidateIds: Set<string>;
  seedReplaced: boolean;
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

    let mergedTasks: TaskItem[];
    if (workspaceMeta.seedReplaced) {
      mergedTasks = cloudCandidates
        .filter((c) => !c.deleted)
        .map(({ deleted: _deleted, ...rest }) => rest);
    } else {
      const mergedList: TaskItem[] = [];
      for (const seedTask of INITIAL_WORKSPACE_STATE.tasks) {
        const override = cloudMap.get(seedTask.id);
        if (override) {
          if (!override.deleted) {
            const { deleted: _deleted, ...rest } = override;
            mergedList.push(rest);
          }
          cloudMap.delete(seedTask.id);
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
      for (const remaining of cloudMap.values()) {
        if (!remaining.deleted) {
          const { deleted: _deleted, ...rest } = remaining;
          mergedList.push(rest);
        }
      }
      mergedTasks = mergedList;
    }

    onSync({
      workspace: {
        workspaceName: workspaceMeta.workspaceName,
        nextCodeNumber: workspaceMeta.nextCodeNumber,
        statuses: sortedStatuses,
        projects: activeProjects,
        tasks: mergedTasks,
      },
      cloudCandidateIds: cloudIds,
      seedReplaced: workspaceMeta.seedReplaced,
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
  const allToSync = [movedTask, ...reorderedSiblings.filter((t) => t.id !== movedTask.id)];
  const chunks: TaskItem[][] = [];
  for (let i = 0; i < allToSync.length; i += 350) {
    chunks.push(allToSync.slice(i, i + 350));
  }

  for (const chunk of chunks) {
    const batch = writeBatch(db);
    for (const item of chunk) {
      const ref = doc(db, 'users', uid, 'candidates', item.id);
      if (cloudIds.has(item.id)) {
        batch.update(ref, {
          statusId: sanitizeId(item.statusId, 'status'),
          order: Math.max(0, Math.min(100000, Math.floor(item.order))),
          statusHistory: (item.statusHistory ?? []).slice(0, LIMITS.historyMax),
          updatedAt: serverTimestamp(),
        });
      } else {
        batch.set(ref, toCandidatePayload(uid, item, false, true));
      }
    }
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${uid}/candidates`);
    }
  }
}

export async function saveBulkMovesToCloud(
  uid: string,
  updatedTasks: TaskItem[],
  cloudIds: Set<string>
): Promise<void> {
  for (let i = 0; i < updatedTasks.length; i += 350) {
    const chunk = updatedTasks.slice(i, i + 350);
    const batch = writeBatch(db);
    for (const item of chunk) {
      const ref = doc(db, 'users', uid, 'candidates', item.id);
      if (cloudIds.has(item.id)) {
        batch.update(ref, {
          statusId: sanitizeId(item.statusId, 'status'),
          order: Math.max(0, Math.min(100000, Math.floor(item.order))),
          statusHistory: (item.statusHistory ?? []).slice(0, LIMITS.historyMax),
          updatedAt: serverTimestamp(),
        });
      } else {
        batch.set(ref, toCandidatePayload(uid, item, false, true));
      }
    }
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${uid}/candidates`);
    }
  }
}

export async function saveTaskCreateToCloud(
  uid: string,
  task: TaskItem,
  nextCodeNumber: number
): Promise<void> {
  const batch = writeBatch(db);
  batch.set(doc(db, 'users', uid, 'candidates', task.id), toCandidatePayload(uid, task, false, true));
  batch.update(doc(db, 'users', uid, 'workspaces', 'default'), {
    nextCodeNumber,
    updatedAt: serverTimestamp(),
  });
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `users/${uid}/candidates/${task.id}`);
  }
}

export async function saveTaskUpdateToCloud(
  uid: string,
  task: TaskItem,
  existsInCloud: boolean
): Promise<void> {
  const path = `users/${uid}/candidates/${task.id}`;
  const ref = doc(db, 'users', uid, 'candidates', task.id);
  try {
    if (existsInCloud) {
      const payload = toCandidatePayload(uid, task, false, false);
      delete payload.ownerUid;
      delete payload.id;
      delete payload.code;
      await updateDoc(ref, payload);
    } else {
      await setDoc(ref, toCandidatePayload(uid, task, false, true));
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
  const path = `users/${uid}/candidates/${task.id}`;
  const ref = doc(db, 'users', uid, 'candidates', task.id);
  try {
    if (isSeedTask) {
      if (existsInCloud) {
        await updateDoc(ref, {
          deleted: true,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(ref, toCandidatePayload(uid, task, true, true));
      }
    } else if (existsInCloud) {
      await deleteDoc(ref);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
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
  // Commit statuses, projects, and workspace metadata first so existsAfter/exists checks succeed
  const metaBatch = writeBatch(db);
  for (const s of params.allStatuses) {
    const ref = doc(db, 'users', uid, 'statuses', s.id);
    if (params.newStatuses.some((ns) => ns.id === s.id)) {
      metaBatch.set(ref, toStatusPayload(uid, s, true));
    } else {
      metaBatch.update(ref, {
        order: Math.max(0, Math.min(1000, Math.floor(s.order))),
        updatedAt: serverTimestamp(),
      });
    }
  }
  for (const p of params.newProjects) {
    metaBatch.set(doc(db, 'users', uid, 'projects', p.id), toProjectPayload(uid, p, true));
  }
  metaBatch.update(doc(db, 'users', uid, 'workspaces', 'default'), {
    nextCodeNumber: params.nextCodeNumber,
    seedReplaced: params.mode === 'replace',
    updatedAt: serverTimestamp(),
  });

  try {
    await metaBatch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${uid}/workspaces/default`);
  }

  if (params.mode === 'replace') {
    const existingSnap = await getDocs(
      query(collection(db, 'users', uid, 'candidates'), where('ownerUid', '==', uid))
    );
    for (let i = 0; i < existingSnap.docs.length; i += 350) {
      const delBatch = writeBatch(db);
      existingSnap.docs.slice(i, i + 350).forEach((d) => delBatch.delete(d.ref));
      try {
        await delBatch.commit();
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `users/${uid}/candidates`);
      }
    }
  }

  for (let i = 0; i < params.importedTasks.length; i += 350) {
    const chunk = params.importedTasks.slice(i, i + 350);
    const batch = writeBatch(db);
    for (const t of chunk) {
      batch.set(doc(db, 'users', uid, 'candidates', t.id), toCandidatePayload(uid, t, false, true));
    }
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `users/${uid}/candidates`);
    }
  }
}

export async function resetWorkspaceInCloud(uid: string): Promise<void> {
  const collectionsToClear = ['candidates', 'statuses', 'projects'] as const;
  for (const colName of collectionsToClear) {
    try {
      const snap = await getDocs(
        query(collection(db, 'users', uid, colName), where('ownerUid', '==', uid))
      );
      for (let i = 0; i < snap.docs.length; i += 350) {
        const batch = writeBatch(db);
        snap.docs.slice(i, i + 350).forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${uid}/${colName}`);
    }
  }

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'users', uid, 'workspaces', 'default'), {
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
  const path = `users/${cleanTargetUid}/leadSubmissions/${submissionId}`;

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
    handleFirestoreError(error, OperationType.CREATE, path);
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
          id: String(data.id ?? d.id),
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
  const batch = writeBatch(db);
  for (const t of tasks) {
    batch.set(doc(db, 'users', uid, 'candidates', t.id), toCandidatePayload(uid, t, false, true));
  }
  for (const subId of submissionIds) {
    batch.delete(doc(db, 'users', uid, 'leadSubmissions', subId));
  }
  batch.update(doc(db, 'users', uid, 'workspaces', 'default'), {
    nextCodeNumber,
    updatedAt: serverTimestamp(),
  });
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${uid}/leadSubmissions`);
  }
}

