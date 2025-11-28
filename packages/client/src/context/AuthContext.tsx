import { createContext, useState, useContext, ReactNode, useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiKeyDialog } from '@/components/api-key-dialog';
import TelegramAuthModal from '@/components/telegram-components/telegram-auth-modal';
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
  checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const queryClient = useQueryClient();
  const [isApiKeyDialogOpen, setIsApiKeyDialogOpen] = useState(false);
  const [telegramUser, setTelegramUser] = useState<TelegramUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Define setUser first, before using it in useEffect
  const setUser = useCallback((user: TelegramUser, sessionId: string) => {
    setUserDirectly(user, sessionId);
    setTelegramUser(user);
    clientLogger.info('User set in context', { userId: user.id });
  }, []);

  // Define checkAuth first, before using it in useEffect
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

  // Check if opened as Telegram Mini App and auto-login if already authenticated
  useEffect(() => {
    const checkTelegramMiniApp = async () => {
      // Check if running in Telegram Mini App
      // Telegram WebApp is available as window.Telegram.WebApp when opened from Telegram
      const tg = (window as any).Telegram?.WebApp;
      if (!tg) {
        // Not in Telegram Mini App, do normal check
        checkAuth();
        return;
      }

      clientLogger.info('Detected Telegram Mini App', {
        version: tg.version,
        platform: tg.platform,
      });

      try {
        // Get user data from Telegram WebApp
        // initDataUnsafe contains user info without validation (faster, but less secure)
        // For production, should validate initData using bot token
        const initData = tg.initDataUnsafe;
        const telegramId = initData?.user?.id;

        if (!telegramId) {
          clientLogger.warn('Telegram Mini App detected but no user ID found');
          checkAuth();
          return;
        }

        clientLogger.info('Telegram Mini App user detected', { 
          telegramId,
          firstName: initData?.user?.first_name,
          username: initData?.user?.username,
        });

        // Check if user has existing session (from /start command)
        const client = await import('@/lib/api-client-config').then(m => m.getElizaClient());
        const response = await fetch(
          `${client.config.baseUrl}/api/auth/telegram/bot/user-info?telegramId=${telegramId}`,
          {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          if (data.user && data.sessionId) {
            // User has existing session - auto-login
            const user: TelegramUser = {
              id: data.user.telegramId,
              firstName: data.user.firstName,
              lastName: data.user.lastName,
              username: data.user.username,
              photoUrl: data.user.photoUrl,
            };
            setUser(user, data.sessionId);
            clientLogger.info('Auto-logged in user from Telegram Mini App', { telegramId });
            setIsLoading(false); // Set loading to false since we're done
            return; // Skip normal checkAuth
          }
        }

        // No session found - user needs to authenticate
        // But since they're in Mini App, they should use /start command first
        clientLogger.info('No existing session for Telegram Mini App user', { telegramId });
        setIsLoading(false); // Set loading to false
        // Don't call checkAuth() - let modal show for authentication
      } catch (error) {
        clientLogger.error('Error checking Telegram Mini App auth:', error);
        // Fallback to normal check
        checkAuth();
      }
    };

    checkTelegramMiniApp();
  }, [checkAuth, setUser]);

  // Also check auth when window receives focus (user might have completed auth in popup)
  useEffect(() => {
    const handleFocus = () => {
      // Small delay to allow postMessage to be processed first
      setTimeout(() => {
        checkAuth();
      }, 500);
    };
    
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [checkAuth]);

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
        checkAuth,
      }}
    >
      {children}
      <ApiKeyDialog
        open={isApiKeyDialogOpen}
        onOpenChange={setIsApiKeyDialogOpen}
        onApiKeySaved={handleApiKeySaved}
      />
      <TelegramAuthModal />
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
