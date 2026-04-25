import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import {
  authenticateDemoUser,
  getDemoUserById,
  type DemoUser,
  type LoginResult,
} from './demoAccounts';

const STORAGE_KEY = 'cassini-demo-auth-user-id';

type AuthContextValue = {
  user: DemoUser | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => LoginResult;
  logout: () => void;
  canAccessRegion: (region: string) => boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function getStoredUser(): DemoUser | null {
  const storedId = window.localStorage.getItem(STORAGE_KEY);
  return storedId ? getDemoUserById(storedId) : null;
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<DemoUser | null>(() => getStoredUser());

  const login = useCallback((email: string, password: string): LoginResult => {
    const result = authenticateDemoUser(email, password);

    if (result.ok) {
      setUser(result.user);
      window.localStorage.setItem(STORAGE_KEY, result.user.id);
    }

    return result;
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    window.localStorage.removeItem(STORAGE_KEY);
  }, []);

  const canAccessRegion = useCallback(
    (region: string) => {
      if (!user) {
        return false;
      }

      return user.accessScope === 'global' || user.region === region;
    },
    [user],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isAdmin: user?.role === 'admin',
      login,
      logout,
      canAccessRegion,
    }),
    [canAccessRegion, login, logout, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return context;
}
