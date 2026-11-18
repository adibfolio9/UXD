/**
 * Phase 0 Verification Harness Specification for the "Dirty Dozen" Payloads.
 * Documents expected PERMISSION_DENIED assertions against firestore.rules.
 */
export interface DirtyDozenCase {
  id: number;
  name: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  actorUid: string | null;
  emailVerified: boolean;
  payload?: Record<string, unknown>;
  expected: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_TESTS: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Unauthenticated read on candidates',
    operation: 'get',
    path: '/users/alice/candidates/cand-101',
    actorUid: null,
    emailVerified: false,
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Unverified email write on workspace',
    operation: 'create',
    path: '/users/alice/workspaces/default',
    actorUid: 'alice',
    emailVerified: false,
    payload: { ownerUid: 'alice', workspaceName: 'Test', nextCodeNumber: 101, seedReplaced: false },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Cross-user PII read on private profile',
    operation: 'get',
    path: '/users/alice/private/profile',
    actorUid: 'bob',
    emailVerified: true,
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Cross-user list query on candidates',
    operation: 'list',
    path: '/users/alice/candidates',
    actorUid: 'bob',
    emailVerified: true,
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Identity spoofing via mismatched ownerUid',
    operation: 'create',
    path: '/users/alice/candidates/cand-999',
    actorUid: 'alice',
    emailVerified: true,
    payload: { ownerUid: 'bob', id: 'cand-999', fullName: 'Spoofed' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Shadow field injection (isAdmin)',
    operation: 'create',
    path: '/users/alice/statuses/status-custom',
    actorUid: 'alice',
    emailVerified: true,
    payload: { ownerUid: 'alice', id: 'status-custom', name: 'Custom', isAdmin: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Path variable ID poisoning',
    operation: 'create',
    path: '/users/alice/statuses/invalid$id!',
    actorUid: 'alice',
    emailVerified: true,
    payload: { ownerUid: 'alice', id: 'invalid$id!' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Denial-of-wallet string length overflow',
    operation: 'create',
    path: '/users/alice/candidates/cand-101',
    actorUid: 'alice',
    emailVerified: true,
    payload: { ownerUid: 'alice', id: 'cand-101', message: 'x'.repeat(5000) },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Forged client timestamp on create',
    operation: 'create',
    path: '/users/alice/workspaces/default',
    actorUid: 'alice',
    emailVerified: true,
    payload: { ownerUid: 'alice', createdAt: '2020-01-01T00:00:00Z' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Immutable ownerUid mutation on update',
    operation: 'update',
    path: '/users/alice/candidates/cand-101',
    actorUid: 'alice',
    emailVerified: true,
    payload: { ownerUid: 'bob' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Orphaned candidate with nonexistent statusId',
    operation: 'create',
    path: '/users/alice/candidates/cand-700',
    actorUid: 'alice',
    emailVerified: true,
    payload: { ownerUid: 'alice', id: 'cand-700', statusId: 'nonexistent-status' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Array overflow > 20 entries in statusHistory',
    operation: 'update',
    path: '/users/alice/candidates/cand-101',
    actorUid: 'alice',
    emailVerified: true,
    payload: { statusHistory: Array.from({ length: 21 }, (_, i) => ({ id: String(i) })) },
    expected: 'PERMISSION_DENIED',
  },
];
