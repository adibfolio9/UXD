# Security Specification & Threat Model

## 1. Data Invariants
1. **Strict Ownership**: Every document under `/users/{userId}/...` belongs solely to `userId`. Cross-user reads, queries, writes, or deletes are unconditionally rejected.
2. **Verified Authentication Gate**: All workspace reads, updates, deletes, and candidate/status/project creates require `request.auth != null` and `request.auth.token.email_verified == true`.
3. **Write-Only Public Lead Intake Drop-Box**: `/users/{userId}/leadSubmissions/{submissionId}` permits unauthenticated `create` only with strict schema/size validation, `createdAt == request.time`, and an existing workspace (`exists(.../workspaces/default)`). Public reads, lists, updates, and deletes are unconditionally denied; only the verified workspace owner can read or clear incoming submissions.
4. **Referential Integrity**: Every `CandidateRecord` must reference a valid `statusId` and `projectId` existing in the same user's `/statuses` and `/projects` collections (checked via `existsAfter()` to support atomic multi-document imports).
5. **Immutable Ownership & Creation Time**: `ownerUid`, `uid`, `id`, and `createdAt` can never be reassigned on update. `createdAt` must equal `request.time` on create, and `updatedAt` must equal `request.time` on create and update.
6. **Strict Key & Size Bounds**: Every document checks `keys().hasAll(...)` and `keys().hasOnly(...)` on create, `affectedKeys().hasOnly(...)` on update, and `.size()` limits on all strings and bounded arrays (`statusHistory.size() <= 20`).

## 2. "Dirty Dozen" Adversarial Payloads (Must All Return PERMISSION_DENIED)
1. **Unauthenticated Read**: `get(/users/alice/candidates/cand-101)` with `auth = null`.
2. **Unverified Email Write**: `set(/users/alice/workspaces/default, ...)` with `auth.uid = 'alice'`, `email_verified = false`.
3. **Cross-User Read (PII Leak)**: `get(/users/alice/private/profile)` with `auth.uid = 'bob'`, `email_verified = true`.
4. **Cross-User List Query**: `list(/users/alice/candidates)` with `auth.uid = 'bob'`.
5. **Identity Spoofing on Create**: `create(/users/alice/candidates/cand-999)` with `ownerUid: 'bob'` while `auth.uid = 'alice'`.
6. **Shadow Field Injection**: `create(/users/alice/statuses/status-1)` containing extra field `isAdmin: true`.
7. **ID Poisoning Attack**: `create(/users/alice/statuses/bad$id/with..chars)` with invalid characters or length > 128.
8. **Payload Size Exhaustion**: `create(/users/alice/candidates/cand-101)` with `message` length > 4000 chars.
9. **Client Timestamp Forgery**: `create(/users/alice/workspaces/default)` with `createdAt = Timestamp.fromMillis(0)` instead of `request.time`.
10. **Immutable Field Mutation**: `update(/users/alice/candidates/cand-101)` modifying `ownerUid` or `createdAt`.
11. **Orphaned Candidate Creation**: `create(/users/alice/candidates/cand-700)` referencing non-existent `statusId: 'ghost-status'`.
12. **Unbounded Array Overflow**: `update(/users/alice/candidates/cand-101)` with `statusHistory` containing 21 entries (`> 20` max).
