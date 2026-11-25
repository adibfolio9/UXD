import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  User,
  getAuth,
  linkWithPopup,
  onAuthStateChanged,
  reauthenticateWithPopup,
  signInWithPopup,
} from 'firebase/auth';
import {
  FirestoreSettings,
  doc,
  getDocFromServer,
  initializeFirestore,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const DEFAULT_FIRESTORE_DATABASE_ID = 'ai-studio-strata-d1fd598e-b099-4ff5-bd17-f97de483ddf8';
export const FIRESTORE_DATABASE_ID =
  (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId ||
  DEFAULT_FIRESTORE_DATABASE_ID;

const app = initializeApp(firebaseConfig);

export const db = initializeFirestore(
  app,
  {
    experimentalAutoDetectLongPolling: true,
    useFetchStreams: false,
  } as FirestoreSettings,
  FIRESTORE_DATABASE_ID
);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const GOOGLE_SHEETS_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/forms.body.readonly',
  'https://www.googleapis.com/auth/forms.responses.readonly',
] as const;

const sheetsProvider = new GoogleAuthProvider();
GOOGLE_SHEETS_SCOPES.forEach((scope) => sheetsProvider.addScope(scope));
sheetsProvider.setCustomParameters({ prompt: 'consent select_account' });

// Strict in-memory token storage (never persisted in localStorage or sessionStorage)
let cachedSheetsAccessToken: string | null = null;
let cachedSheetsTokenExpiresAt = 0;
let cachedSheetsUserUid: string | null = null;

onAuthStateChanged(auth, (user) => {
  if (!user || (cachedSheetsUserUid && cachedSheetsUserUid !== user.uid)) {
    cachedSheetsAccessToken = null;
    cachedSheetsTokenExpiresAt = 0;
    cachedSheetsUserUid = null;
  }
});

export function getSheetsAccessToken(): string | null {
  if (!cachedSheetsAccessToken) return null;
  if (cachedSheetsTokenExpiresAt > 0 && Date.now() >= cachedSheetsTokenExpiresAt) {
    cachedSheetsAccessToken = null;
    cachedSheetsTokenExpiresAt = 0;
    return null;
  }
  return cachedSheetsAccessToken;
}

export function clearSheetsAccessToken(): void {
  cachedSheetsAccessToken = null;
  cachedSheetsTokenExpiresAt = 0;
}

export async function connectGoogleSheetsAccount(): Promise<{
  user: User;
  accessToken: string;
}> {
  const currentUser = auth.currentUser;
  let result;

  if (!currentUser) {
    result = await signInWithPopup(auth, sheetsProvider);
  } else {
    const hasGoogle = currentUser.providerData.some(
      (p) => p.providerId === 'google.com'
    );
    if (hasGoogle) {
      result = await reauthenticateWithPopup(currentUser, sheetsProvider);
    } else {
      try {
        result = await linkWithPopup(currentUser, sheetsProvider);
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code ?? '';
        if (code === 'auth/provider-already-linked') {
          result = await reauthenticateWithPopup(currentUser, sheetsProvider);
        } else if (
          code === 'auth/credential-already-in-use' ||
          code === 'auth/email-already-in-use'
        ) {
          const errCred = GoogleAuthProvider.credentialFromError(
            err as Parameters<typeof GoogleAuthProvider.credentialFromError>[0]
          );
          if (errCred?.accessToken) {
            cachedSheetsAccessToken = errCred.accessToken;
            cachedSheetsTokenExpiresAt = Date.now() + 50 * 60 * 1000;
            cachedSheetsUserUid = currentUser.uid;
            return {
              user: currentUser,
              accessToken: errCred.accessToken,
            };
          }
          result = await signInWithPopup(auth, sheetsProvider);
        } else {
          throw err;
        }
      }
    }
  }

  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (!credential?.accessToken) {
    throw new Error(
      'Google Sheets permission was not granted. Please allow read access to Google Sheets and try again.'
    );
  }

  cachedSheetsAccessToken = credential.accessToken;
  cachedSheetsTokenExpiresAt = Date.now() + 50 * 60 * 1000;
  cachedSheetsUserUid = result.user.uid;

  return {
    user: result.user,
    accessToken: credential.accessToken,
  };
}

export const FIREBASE_PROJECT_ID = firebaseConfig.projectId;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();
