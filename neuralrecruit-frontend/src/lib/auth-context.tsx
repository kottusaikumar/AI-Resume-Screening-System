import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  accessShowcase,
  ApiError,
  setAccessToken,
  type AuthUser,
} from "./api";

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  ensureAccess: () => Promise<boolean>;
}

const TOKEN_KEY = "neuralrecruit.access_token";
const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearSession = useCallback(() => {
    sessionStorage.removeItem(TOKEN_KEY);
    setAccessToken(null);
    setUser(null);
  }, []);

  const startShowcase = useCallback(async (): Promise<boolean> => {
    if (user) return true;
    setLoading(true);
    setError(null);
    clearSession();

    try {
      const response = await accessShowcase();
      sessionStorage.setItem(TOKEN_KEY, response.access_token);
      setAccessToken(response.access_token);
      setUser(response.user);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The showcase is unavailable.");
      return false;
    } finally {
      setLoading(false);
    }
  }, [clearSession, user]);

  useEffect(() => {
    const renew = () => {
      clearSession();
      void startShowcase();
    };
    window.addEventListener("neuralrecruit:unauthorized", renew);
    return () => window.removeEventListener("neuralrecruit:unauthorized", renew);
  }, [clearSession, startShowcase]);

  const value = useMemo(
    () => ({ user, loading, error, ensureAccess: startShowcase }),
    [user, loading, error, startShowcase],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new ApiError("useAuth must be used inside AuthProvider");
  return context;
}
