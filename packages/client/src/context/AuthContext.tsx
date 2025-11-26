import { createContext, useState, useContext, ReactNode, useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiKeyDialog } from '@/components/api-key-dialog';
import clientLogger from '@/lib/logger';
import type { TelegramUser } from '@/types/telegram';
import { getCurrentUser, loginWithTelegram, logout as logoutApi, clearSessionId, setUserDirectly } from '@/lib/telegram-auth';
import type { TelegramAuthData } from '@/types/telegram';

interface AuthContextType {
  openApiKeyDialog: () => void;
  telegramUser: TelegramUser | null;
  isAuthenticated: boolean;
  login: (authData: TelegramAuthData) => Promise<void>;
  setUser: (user: TelegramUser, sessionId: string) => void;
  logout: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const queryClient = useQueryClient();
  const [isApiKeyDialogOpen, setIsApiKeyDialogOpen] = useState(false);
  const [telegramUser, setTelegramUser] = useState<TelegramUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check authentication on mount
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = useCallback(async () => {
    try {
      setIsLoading(true);
      const user = await getCurrentUser();
      setTelegramUser(user);
    } catch (error) {
      clientLogger.error('Auth check error:', error);
      setTelegramUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const openApiKeyDialog = useCallback(() => {
    setIsApiKeyDialogOpen(true);
  }, []);

  const handleApiKeySaved = useCallback(() => {
    setIsApiKeyDialogOpen(false);
    clientLogger.info('API key saved via dialog, invalidating ping query.');
    queryClient.invalidateQueries({ queryKey: ['ping'] });
  }, [queryClient]);

  const login = useCallback(async (authData: TelegramAuthData) => {
    try {
      const response = await loginWithTelegram(authData);
      setTelegramUser(response.user);
      clientLogger.info('User logged in via Telegram', { userId: response.user.id });
    } catch (error) {
      clientLogger.error('Login error:', error);
      throw error;
    }
  }, []);

  const setUser = useCallback((user: TelegramUser, sessionId: string) => {
    setUserDirectly(user, sessionId);
    setTelegramUser(user);
    clientLogger.info('User set in context', { userId: user.id });
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutApi();
      setTelegramUser(null);
      clientLogger.info('User logged out');
    } catch (error) {
      clientLogger.error('Logout error:', error);
      // Clear user state even if request fails
      clearSessionId();
      setTelegramUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        openApiKeyDialog,
        telegramUser,
        isAuthenticated: telegramUser !== null,
        login,
        setUser,
        logout,
        isLoading,
      }}
    >
      {children}
      <ApiKeyDialog
        open={isApiKeyDialogOpen}
        onOpenChange={setIsApiKeyDialogOpen}
        onApiKeySaved={handleApiKeySaved}
      />
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
