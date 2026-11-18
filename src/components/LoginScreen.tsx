import { useState } from 'react';
import {
  User,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  Layers,
  Lock,
  LogOut,
  Mail,
  Moon,
  RefreshCw,
  Sun,
} from 'lucide-react';
import { FIREBASE_PROJECT_ID, auth, googleProvider } from '../firebase';

interface LoginScreenProps {
  unverifiedUser: User | null;
  isDark: boolean;
  onToggleTheme: () => void;
  onRefreshVerification: () => Promise<void>;
}

type AuthMode = 'signin' | 'signup' | 'reset';

function mapAuthError(code: string): {
  message: string;
  needsProviderConsoleSetup?: boolean;
} {
  switch (code) {
    case 'auth/operation-not-allowed':
      return {
        message:
          'Email/Password sign-in is not yet enabled in your Firebase Console. Enable it in Authentication → Sign-in method, or sign in immediately with Google above.',
        needsProviderConsoleSetup: true,
      };
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return { message: 'Incorrect email or password. Please check your credentials and try again.' };
    case 'auth/email-already-in-use':
      return { message: 'An account with this email already exists. Try signing in instead.' };
    case 'auth/weak-password':
      return { message: 'Password must be at least 6 characters long.' };
    case 'auth/invalid-email':
      return { message: 'Please enter a valid email address.' };
    case 'auth/too-many-requests':
      return { message: 'Too many attempts. Please wait a moment before trying again.' };
    case 'auth/popup-closed-by-user':
      return { message: 'Google sign-in popup was closed before completing.' };
    case 'auth/popup-blocked':
      return { message: 'Popup was blocked by your browser. Please allow popups for this site and try again.' };
    case 'auth/unauthorized-domain':
      return {
        message: 'This domain is not authorized for Firebase Auth. Add it under Authentication → Settings → Authorized domains in Firebase Console.',
        needsProviderConsoleSetup: true,
      };
    default:
      return { message: 'Authentication failed. Please verify your credentials and try again.' };
  }
}

export function LoginScreen({
  unverifiedUser,
  isDark,
  onToggleTheme,
  onRefreshVerification,
}: LoginScreenProps) {
  const [mode, setMode] = useState<AuthMode>('signin');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showConsoleGuide, setShowConsoleGuide] = useState(false);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  const firebaseProvidersUrl = `https://console.firebase.google.com/project/${FIREBASE_PROJECT_ID}/authentication/providers`;

  const handleGoogleSignIn = async () => {
    setErrorMsg(null);
    setInfoMsg(null);
    setShowConsoleGuide(false);
    setSubmitting(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? '';
      const mapped = mapAuthError(code);
      setErrorMsg(mapped.message);
      setShowConsoleGuide(Boolean(mapped.needsProviderConsoleSetup));
    } finally {
      setSubmitting(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);
    setShowConsoleGuide(false);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMsg('Please enter your email address.');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'reset') {
        await sendPasswordResetEmail(auth, trimmedEmail);
        setInfoMsg(`Password reset email sent to ${trimmedEmail}. Check your inbox.`);
        setMode('signin');
      } else if (mode === 'signup') {
        if (password.length < 6) {
          setErrorMsg('Password must be at least 6 characters long.');
          setSubmitting(false);
          return;
        }
        const cred = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
        if (fullName.trim()) {
          await updateProfile(cred.user, { displayName: fullName.trim() });
        }
        await sendEmailVerification(cred.user);
        setInfoMsg('Verification email sent. Please check your inbox to activate your workspace.');
      } else {
        await signInWithEmailAndPassword(auth, trimmedEmail, password);
      }
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? '';
      const mapped = mapAuthError(code);
      setErrorMsg(mapped.message);
      setShowConsoleGuide(Boolean(mapped.needsProviderConsoleSetup));
    } finally {
      setSubmitting(false);
    }
  };

  const handleResendVerification = async () => {
    if (!unverifiedUser) return;
    setErrorMsg(null);
    setInfoMsg(null);
    setSubmitting(true);
    try {
      await sendEmailVerification(unverifiedUser);
      setInfoMsg(`Verification link resent to ${unverifiedUser.email}.`);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? '';
      setErrorMsg(mapAuthError(code).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F7] dark:bg-black text-[#1D1D1F] dark:text-[#F5F5F7] flex flex-col justify-between p-6 relative">
      {/* Top Bar */}
      <div className="flex items-center justify-between max-w-5xl w-full mx-auto">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-lg bg-[#1D1D1F] dark:bg-[#0A84FF] text-white flex items-center justify-center shadow-[0_1px_2px_rgba(0,0,0,0.12)]">
            <Layers className="w-4 h-4" aria-hidden="true" />
          </span>
          <span className="font-display font-semibold text-base tracking-[-0.02em]">
            Strata
          </span>
        </div>

        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          className="h-9 px-3 rounded-[10px] border border-black/[0.08] dark:border-white/[0.12] bg-white/80 dark:bg-[#1C1C1E]/80 text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6] hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7] inline-flex items-center gap-1.5 transition-colors"
        >
          {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          <span>{isDark ? 'Light' : 'Dark'}</span>
        </button>
      </div>

      {/* Main Credential Card */}
      <div className="w-full max-w-[420px] mx-auto my-8">
        <div className="rounded-2xl border border-black/[0.08] dark:border-white/[0.12] bg-white/95 dark:bg-[#1C1C1E]/95 backdrop-blur-xl p-7 sm:p-8 shadow-[0_8px_30px_rgba(0,0,0,0.06)] space-y-6">
          {unverifiedUser ? (
            <div className="space-y-5">
              <div className="space-y-1.5 text-center">
                <div className="w-11 h-11 rounded-2xl bg-[#0071E3]/10 dark:bg-[#0A84FF]/15 text-[#0071E3] dark:text-[#2997FF] flex items-center justify-center mx-auto mb-3">
                  <Mail className="w-5 h-5" />
                </div>
                <h1 className="text-xl font-display font-bold tracking-[-0.02em]">
                  Verify Your Email
                </h1>
                <p className="text-xs text-[#6E6E73] dark:text-[#A1A1A6] leading-relaxed">
                  We sent a verification link to{' '}
                  <span className="font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">
                    {unverifiedUser.email}
                  </span>
                  . Verify your email before accessing workspace records.
                </p>
              </div>

              {errorMsg && (
                <div className="p-3 rounded-xl bg-[#FF3B30]/[0.08] dark:bg-[#FF453A]/[0.12] border border-[#FF3B30]/20 flex items-start gap-2 text-xs text-[#D70015] dark:text-[#FF453A]">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {infoMsg && (
                <div className="p-3 rounded-xl bg-[#28CD41]/10 dark:bg-[#30D158]/15 border border-[#28CD41]/25 flex items-start gap-2 text-xs text-[#1E7F34] dark:text-[#30D158]">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{infoMsg}</span>
                </div>
              )}

              <div className="space-y-2.5">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={async () => {
                    setSubmitting(true);
                    setErrorMsg(null);
                    try {
                      await onRefreshVerification();
                    } finally {
                      setSubmitting(false);
                    }
                  }}
                  className="w-full h-10 px-4 rounded-[10px] bg-[#0071E3] hover:bg-[#0077ED] dark:bg-[#0A84FF] dark:hover:bg-[#2997FF] text-white text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>I&apos;ve Verified — Continue</span>
                </button>

                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void handleResendVerification()}
                  className="w-full h-10 px-4 rounded-[10px] border border-black/[0.10] dark:border-white/[0.14] bg-[#F5F5F7] dark:bg-[#2C2C2E] text-xs font-medium hover:bg-[#E8E8ED] dark:hover:bg-[#3A3A3C] transition-colors disabled:opacity-50"
                >
                  Resend Verification Email
                </button>

                <button
                  type="button"
                  onClick={() => void signOut(auth)}
                  className="w-full h-9 px-3 rounded-[10px] text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6] hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7] inline-flex items-center justify-center gap-1.5"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Use a Different Account</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-1.5 text-center">
                <h1 className="text-[22px] font-display font-bold tracking-[-0.02em]">
                  {mode === 'signin'
                    ? 'Sign in to Strata'
                    : mode === 'signup'
                      ? 'Create Workspace Account'
                      : 'Reset Password'}
                </h1>
                <p className="text-xs text-[#6E6E73] dark:text-[#A1A1A6]">
                  {mode === 'signin'
                    ? 'Access your 571 candidate records, Kanban board, and workflow statuses.'
                    : mode === 'signup'
                      ? 'Set up your credentials to manage candidates and Excel imports.'
                      : 'Enter your email address to receive a password reset link.'}
                </p>
              </div>

              {/* Google Sign-In (Primary - Ready Out of the Box) */}
              <div className="space-y-1.5">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void handleGoogleSignIn()}
                  className="w-full h-11 px-4 rounded-[10px] bg-[#0071E3] hover:bg-[#0077ED] dark:bg-[#0A84FF] dark:hover:bg-[#2997FF] text-white text-sm font-medium inline-flex items-center justify-center gap-2.5 transition-colors disabled:opacity-50 shadow-[0_1px_2px_rgba(0,0,0,0.12)]"
                >
                  <span className="w-5 h-5 rounded-full bg-white flex items-center justify-center shrink-0">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        fill="#4285F4"
                        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                      />
                    </svg>
                  </span>
                  <span>Continue with Google</span>
                </button>
                <p className="text-[11px] text-center text-[#86868B]">
                  Recommended · Instant sign-in with zero setup
                </p>
              </div>

              <div className="space-y-1">
                <div className="relative flex items-center py-0.5">
                  <div className="flex-1 border-t border-black/[0.08] dark:border-white/[0.10]" />
                  <span className="px-3 text-[11px] font-medium text-[#86868B]">
                    or use email &amp; password
                  </span>
                  <div className="flex-1 border-t border-black/[0.08] dark:border-white/[0.10]" />
                </div>
                <p className="text-[11px] text-center text-[#86868B]">
                  Requires Email/Password enabled in Firebase Console
                </p>
              </div>

              {errorMsg && (
                <div className="p-3 rounded-xl bg-[#FF3B30]/[0.08] dark:bg-[#FF453A]/[0.12] border border-[#FF3B30]/20 space-y-2 text-xs text-[#D70015] dark:text-[#FF453A]">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{errorMsg}</span>
                  </div>
                  {showConsoleGuide && (
                    <div className="pl-6 space-y-1.5 text-[11px] text-[#1D1D1F] dark:text-[#E5E5EA]">
                      <p>1. Open Firebase Authentication Providers:</p>
                      <a
                        href={firebaseProvidersUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-medium text-[#0071E3] dark:text-[#2997FF] hover:underline"
                      >
                        <span>Open Firebase Console</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                      <p>2. Select Email/Password → toggle Enable → Save.</p>
                    </div>
                  )}
                </div>
              )}

              {infoMsg && (
                <div className="p-3 rounded-xl bg-[#28CD41]/10 dark:bg-[#30D158]/15 border border-[#28CD41]/25 flex items-start gap-2 text-xs text-[#1E7F34] dark:text-[#30D158]">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{infoMsg}</span>
                </div>
              )}

              <form onSubmit={(e) => void handleEmailSubmit(e)} className="space-y-3.5">
                {mode === 'signup' && (
                  <div className="space-y-1.5">
                    <label
                      htmlFor="login-fullname"
                      className="block text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]"
                    >
                      Full Name
                    </label>
                    <input
                      id="login-fullname"
                      type="text"
                      autoComplete="name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Alex Rivera"
                      className="w-full h-10 px-3 text-sm rounded-[10px] border border-black/[0.10] dark:border-white/[0.14] bg-[#F5F5F7] dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7] focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <label
                    htmlFor="login-email"
                    className="block text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]"
                  >
                    Email Address
                  </label>
                  <input
                    id="login-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="w-full h-10 px-3 text-sm rounded-[10px] border border-black/[0.10] dark:border-white/[0.14] bg-[#F5F5F7] dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7] focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
                  />
                </div>

                {mode !== 'reset' && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="login-password"
                        className="block text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]"
                      >
                        Password
                      </label>
                      {mode === 'signin' && (
                        <button
                          type="button"
                          onClick={() => {
                            setMode('reset');
                            setErrorMsg(null);
                            setInfoMsg(null);
                            setShowConsoleGuide(false);
                          }}
                          className="text-[11px] font-medium text-[#0071E3] dark:text-[#2997FF] hover:underline"
                        >
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <input
                        id="login-password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        minLength={6}
                        autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full h-10 pl-3 pr-10 text-sm rounded-[10px] border border-black/[0.10] dark:border-white/[0.14] bg-[#F5F5F7] dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7] focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[#86868B] hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7]"
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full h-10 px-4 rounded-[10px] bg-[#1D1D1F] hover:bg-black dark:bg-[#2C2C2E] dark:hover:bg-[#3A3A3C] text-white text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>
                    {submitting
                      ? 'Please wait...'
                      : mode === 'signin'
                        ? 'Sign In'
                        : mode === 'signup'
                          ? 'Create Account'
                          : 'Send Reset Link'}
                  </span>
                </button>
              </form>

              <div className="pt-2 border-t border-black/[0.06] dark:border-white/[0.08] text-center text-xs text-[#6E6E73] dark:text-[#A1A1A6]">
                {mode === 'signin' ? (
                  <>
                    Don&apos;t have credentials?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setMode('signup');
                        setErrorMsg(null);
                        setInfoMsg(null);
                        setShowConsoleGuide(false);
                      }}
                      className="font-medium text-[#0071E3] dark:text-[#2997FF] hover:underline"
                    >
                      Create account
                    </button>
                  </>
                ) : (
                  <>
                    Already have an account?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setMode('signin');
                        setErrorMsg(null);
                        setInfoMsg(null);
                        setShowConsoleGuide(false);
                      }}
                      className="font-medium text-[#0071E3] dark:text-[#2997FF] hover:underline"
                    >
                      Sign in
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="text-center text-[11px] text-[#86868B]">
        Protected by Firebase Authentication &amp; private user-scoped rules
      </div>
    </div>
  );
}
