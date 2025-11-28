import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import clientLogger from '@/lib/logger';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { LogIn, RefreshCcw } from 'lucide-react';
import type { TelegramUser } from '@/types/telegram';
import { createTelegramAuthCallback } from './telegram-auth-callback';
import { loadTelegramWidgetScript, createTelegramWidgetAsync } from './telegram-widget';
import { handleOAuthMessage } from './telegram-oauth-handler';
import { getCurrentUser } from '@/lib/telegram-auth';

/**
 * Telegram Authentication Modal
 * 
 * Shows a modal dialog requiring Telegram authentication before accessing the site
 */
export default function TelegramAuthModal() {
  const { isAuthenticated, isLoading, setUser, checkAuth, telegramUser } = useAuth();
  const widgetContainerRef = useRef<HTMLDivElement>(null);
  const scriptLoadedRef = useRef(false);
  const [botUsername, setBotUsername] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [widgetReady, setWidgetReady] = useState(false);
  const [showFallback, setShowFallback] = useState(false);
  const [isProcessingAuth, setIsProcessingAuth] = useState(false);
  const [authCompleted, setAuthCompleted] = useState(false);

  // Check if opened in Telegram Mini App
  const isTelegramMiniApp = typeof window !== 'undefined' && !!(window as any).Telegram?.WebApp;

  // Modal should be open ONLY in regular browser (not in Telegram Mini App)
  // In Mini App, auto-login is handled in AuthContext
  const isOpen = !isLoading && !isAuthenticated && !isTelegramMiniApp;

  useEffect(() => {
    if (!isOpen) {
      // Cleanup on close
      delete (window as any).onTelegramAuth;
      return;
    }

    // Get bot username or bot_id from environment
    const username = import.meta.env.VITE_TELEGRAM_BOT_USERNAME;
    const botId = import.meta.env.VITE_TELEGRAM_BOT_ID;

    clientLogger.info('Telegram auth modal: checking configuration', {
      username,
      botId,
      hasUsername: !!username,
      hasBotId: !!botId,
      origin: window.location.origin
    });

    // Prefer bot_id over username (more reliable)
    const botIdentifier = botId || username;

    if (!botIdentifier || botIdentifier === 'your_bot_username') {
      setShowFallback(true);
      setError('Telegram authentication is not configured. Please set VITE_TELEGRAM_BOT_ID (preferred) or VITE_TELEGRAM_BOT_USERNAME.');
      clientLogger.error('VITE_TELEGRAM_BOT_ID or VITE_TELEGRAM_BOT_USERNAME not configured');
      return;
    }

    setBotUsername(botIdentifier);
    clientLogger.info('Telegram auth modal: configured', { botIdentifier, usingBotId: !!botId });

    // Setup OAuth message handler
    const handleMessage = async (event: MessageEvent) => {
      clientLogger.info('Received postMessage', { origin: event.origin, data: event.data });

      // Allow our origin and oauth.telegram.org (popup may post from there)
      const allowedOrigins = [window.location.origin, 'https://oauth.telegram.org'];
      if (!allowedOrigins.includes(event.origin)) {
        clientLogger.warn('Ignoring postMessage from unexpected origin', { origin: event.origin });
        return;
      }

      // If message comes from oauth.telegram.org, forward payload to server for validation
      if (event.origin === 'https://oauth.telegram.org') {
        clientLogger.info('PostMessage from oauth.telegram.org — forwarding to server for validation');
        try {
          setIsProcessingAuth(true);
          setError(null);

          // Use window.location.origin as fallback if client.config is not available
          const baseUrl = (await import('@/lib/api-client-config').then(m => m.getElizaClient()).catch(() => null))?.config?.baseUrl || window.location.origin;
          const resp = await fetch(`${baseUrl}/api/auth/telegram/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(event.data),
            credentials: 'include'
          });

          const body = await resp.json();
          if (resp.ok && body?.user && body?.sessionId) {
            clientLogger.info('Server validated oauth popup payload, updating client auth state', { user: body.user });

            setUser(body.user, body.sessionId);
            await checkAuth();
            setAuthCompleted(true);
            clientLogger.info('Server session confirmed, recreating widget to show user name/avatar');

            // Recreate widget - it will now show button with user name
            setTimeout(() => {
              const container = widgetContainerRef.current;
              if (container && botIdentifier) {
                container.innerHTML = '';
                createTelegramWidgetAsync(container, {
                  botUsername: botIdentifier,
                  onReady: () => {
                    setWidgetReady(true);
                    setShowFallback(false);
                    clientLogger.info('Widget recreated after OAuth, should show button with user name');
                  },
                  onError: (err) => {
                    clientLogger.error('Failed to recreate widget after OAuth', err);
                    setShowFallback(true);
                  },
                });
              }
            }, 300);
          } else {
            clientLogger.warn('Server rejected oauth payload', { status: resp.status, body });
            setError('Authentication failed (oauth callback).');
          }
        } catch (e) {
          clientLogger.error('Failed to forward oauth popup message to server', e);
          setError('Network error validating Telegram auth.');
        } finally {
          setIsProcessingAuth(false);
        }
        return;
      }

      // Messages from our origin -> existing handler
      await handleOAuthMessage(event, {
        onAuthSuccess: async (user: TelegramUser, sessionId: string): Promise<void> => {
          try {
            setIsProcessingAuth(true);
            clientLogger.info('OAuth message indicates success, setting user and verifying with server', { user });

            setUser(user, sessionId);
            setError(null);

            // wait for server-side session to be created/validated
            await checkAuth();
            setAuthCompleted(true);
            clientLogger.info('Server session confirmed, recreating widget to show user name/avatar');

            // Recreate widget - it will now show button with user name
            setTimeout(() => {
              const container = widgetContainerRef.current;
              if (container && botIdentifier) {
                container.innerHTML = '';
                createTelegramWidgetAsync(container, {
                  botUsername: botIdentifier,
                  onReady: () => {
                    setWidgetReady(true);
                    setShowFallback(false);
                    clientLogger.info('Widget recreated after OAuth, should show button with user name');
                  },
                  onError: (err) => {
                    clientLogger.error('Failed to recreate widget after OAuth', err);
                    setShowFallback(true);
                  },
                });
              }
            }, 300);
          } catch (e) {
            clientLogger.error('checkAuth failed after postMessage auth', e);
            setError('Authentication verification failed. Please try again.');
          } finally {
            setIsProcessingAuth(false);
          }
        },
        onAuthError: (errorMsg: string) => {
          setError(errorMsg);
          setIsProcessingAuth(false);
        },
        checkAuth,
      });
    };

    window.addEventListener('message', handleMessage);

    // Check localStorage for auth success (fallback)
    const checkLocalStorage = setInterval(() => {
      try {
        const stored = localStorage.getItem('telegram-auth-success');
        if (stored) {
          const message = JSON.parse(stored);
          if (message.type === 'telegram-auth-success') {
            clientLogger.info('Found auth success in localStorage', message);
            localStorage.removeItem('telegram-auth-success');
            handleMessage({
              origin: window.location.origin,
              data: message
            } as MessageEvent);
            clearInterval(checkLocalStorage);
          }
        }
      } catch (e) {
        // Ignore errors
      }
    }, 500);

    // Load Telegram Widget script
    if (!scriptLoadedRef.current) {
      loadTelegramWidgetScript()
        .then(() => {
          scriptLoadedRef.current = true;
        })
        .catch((err) => {
          clientLogger.error('Failed to load Telegram widget script', err);
          setError('Failed to load Telegram authentication. Please refresh the page.');
        });
    }

    // Create global callback function
    const authCallback = createTelegramAuthCallback({
      onAuthSuccess: async (user: TelegramUser, sessionId: string): Promise<void> => {
        setUser(user, sessionId);
        setError(null);
        setIsProcessingAuth(true);
        clientLogger.info('Widget callback: user received, validating session on server', { user });

        try {
          // wait for server-side validation / session creation
          await checkAuth();
          setAuthCompleted(true);
          clientLogger.info('Server confirmed session; recreating widget to show user name/avatar');

          // Recreate widget - it will now show button with user name
          setTimeout(() => {
            const container = widgetContainerRef.current;
            if (container && botIdentifier) {
              container.innerHTML = '';
              createTelegramWidgetAsync(container, {
                botUsername: botIdentifier,
                onReady: () => {
                  setWidgetReady(true);
                  setShowFallback(false);
                },
                onError: (err) => {
                  clientLogger.error('Failed to recreate widget', err);
                  setShowFallback(true);
                },
              });
            }
          }, 300);
        } catch (e) {
          clientLogger.error('checkAuth failed in widget callback', e);
          setError('Authentication verification failed. Please try again.');
        } finally {
          setIsProcessingAuth(false);
        }
      },
      onAuthError: (errorMsg: string) => {
        setError(errorMsg);
        setIsProcessingAuth(false);
      },
      isAuthCompleted: () => authCompleted,
      getTelegramUser: () => telegramUser,
    });

    (window as any).onTelegramAuth = authCallback;

    // Create widget in container
    if (widgetContainerRef.current && botIdentifier) {
      createTelegramWidgetAsync(widgetContainerRef.current, {
        botUsername: botIdentifier,
        onLoad: () => {
          clientLogger.info('Telegram widget loaded');
        },
        onReady: () => {
          setWidgetReady(true);
          setShowFallback(false);
        },
        onError: (err) => {
          clientLogger.error('Failed to create widget', err);
          setError('Failed to load Telegram authentication widget. Please try again.');
          setShowFallback(true);
        },
      });
    }

    return () => {
      window.removeEventListener('message', handleMessage);
      clearInterval(checkLocalStorage);
      delete (window as any).onTelegramAuth;
    };
  }, [isOpen, botUsername, setUser, checkAuth, telegramUser, authCompleted]);

  const handleLoginButtonClick = () => {
    clientLogger.info('Login button clicked', { botUsername, widgetReady });

    if (!botUsername) {
      setError('Telegram bot is not configured.');
      return;
    }

    // Generate unique auth token for this login attempt
    const authToken = `auth_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Store token in localStorage for polling
    localStorage.setItem('telegram-auth-token', authToken);

    // Build bot URL - use bot username if available, otherwise use bot ID
    // For tg:// protocol: use username for domain, or bot ID for bot parameter
    const botName = botUsername.includes('@') 
      ? botUsername.replace('@', '') 
      : botUsername;
    
    // Check if botName is numeric (bot ID) or username
    const isNumericId = /^\d+$/.test(botName);
    
    // Build tg:// URL - different format for username vs ID
    const tgProtocolUrl = isNumericId
      ? `tg://resolve?start=${authToken}&bot=${botName}` // For bot ID
      : `tg://resolve?domain=${botName}&start=${authToken}`; // For username
    
    const webUrl = `https://t.me/${botName}?start=${authToken}`;

    clientLogger.info('Opening Telegram bot for authentication', { 
      tgProtocolUrl, 
      webUrl, 
      authToken,
      isNumericId,
      botName 
    });

    // Try to open in Telegram app first using tg:// protocol
    // This will open Telegram desktop/mobile app if installed
    const link = document.createElement('a');
    link.href = tgProtocolUrl;
    link.style.display = 'none';
    document.body.appendChild(link);
    
    // Try clicking the tg:// link
    link.click();
    
    // Remove link immediately
    setTimeout(() => {
      document.body.removeChild(link);
    }, 100);
    
    // Fallback: if tg:// doesn't work (user doesn't have Telegram app),
    // open web version after a short delay
    // Note: This will open in browser, but user can still interact with bot
    setTimeout(() => {
      // Only open web version if we're still processing (tg:// might have failed)
      if (isProcessingAuth) {
        clientLogger.info('Opening web fallback for Telegram bot');
        window.open(webUrl, '_blank');
      }
    }, 1000);

    // Start polling for session
    setIsProcessingAuth(true);
    setError(null);

    // Show instruction message
    setError('Откройте бота в Telegram и нажмите /start для авторизации. Ожидание...');

    // Poll for session creation
    const pollInterval = setInterval(async () => {
      try {
        // Check if session was created by checking auth token
        const storedToken = localStorage.getItem('telegram-auth-token');
        if (!storedToken || storedToken !== authToken) {
          // Token was cleared, auth might be complete
          clearInterval(pollInterval);
          await checkAuth();
          const currentUser = await getCurrentUser();
          if (currentUser) {
            setUser(currentUser, '');
            setAuthCompleted(true);
            setIsProcessingAuth(false);
            setError(null);
            localStorage.removeItem('telegram-auth-token');
            clientLogger.info('Authentication successful via bot');
          }
          return;
        }

        // Check server for session by polling auth status endpoint
        // Use window.location.origin as fallback if client.config is not available
        const baseUrl = (await import('@/lib/api-client-config').then(m => m.getElizaClient()).catch(() => null))?.config?.baseUrl || window.location.origin;
        const response = await fetch(`${baseUrl}/api/auth/telegram/check?token=${authToken}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });

        if (response.ok) {
          const data = await response.json();
          if (data.authenticated && data.user) {
            clearInterval(pollInterval);
            setUser(data.user, data.sessionId);
            setAuthCompleted(true);
            setIsProcessingAuth(false);
            setError(null);
            localStorage.removeItem('telegram-auth-token');
            await checkAuth();
            clientLogger.info('Authentication successful via bot polling');
          }
        }
      } catch (error) {
        clientLogger.error('Error polling for authentication:', error);
      }
    }, 2000); // Poll every 2 seconds

    // Stop polling after 5 minutes
    setTimeout(() => {
      clearInterval(pollInterval);
      if (isProcessingAuth) {
        setIsProcessingAuth(false);
        setError('Время ожидания истекло. Пожалуйста, попробуйте снова.');
        localStorage.removeItem('telegram-auth-token');
      }
    }, 5 * 60 * 1000); // 5 minutes

    // Try to click widget if it exists (fallback)
    const container = widgetContainerRef.current;
    if (container) {
      const iframe = container.querySelector('iframe');
      const link = container.querySelector('a');
      const button = container.querySelector('button');

      if (link) {
        (link as HTMLAnchorElement).click();
        return;
      } else if (button) {
        (button as HTMLButtonElement).click();
        return;
      }
    }

    // Widget not loaded - but handleLoginButtonClick will handle opening the bot
    // No need for OAuth popup fallback - always use bot-based authentication
    clientLogger.info('Widget not accessible, but bot-based auth will be used via handleLoginButtonClick');
  };

  const handleRetry = () => {
    setShowFallback(false);
    setWidgetReady(false);
    setError(null);

    const container = widgetContainerRef.current;
    if (container && botUsername) {
      container.innerHTML = '';
      createTelegramWidgetAsync(container, {
        botUsername,
        onReady: () => {
          setWidgetReady(true);
          setShowFallback(false);
        },
        onError: () => {
          setShowFallback(true);
        },
      });
    }
  };

  return (
    <Dialog open={isOpen} modal={true}>
      <DialogContent
        className="sm:max-w-md z-[100]"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Authentication Required</DialogTitle>
          <DialogDescription>
            Please sign in with Telegram to access this application.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-4">
          {error && error.includes('not configured') ? (
            <div className="w-full p-3 bg-destructive/10 border border-destructive/20 rounded-md">
              <p className="text-sm text-destructive text-center">{error}</p>
            </div>
          ) : null}

          {/* Telegram Widget Container */}
          <div
            ref={widgetContainerRef}
            className="telegram-login-container flex justify-center w-full"
            style={{ minHeight: '60px', minWidth: '200px' }}
          />

          {/* Always show button if bot is configured */}
          {botUsername && (
            <div className="w-full flex flex-col gap-2">
              {!widgetReady && !showFallback && (
                <p className="text-sm text-muted-foreground text-center mb-2">
                  Loading Telegram authentication widget...
                </p>
              )}

              <Button
                variant="default"
                size="lg"
                className="w-full bg-[#0088cc] hover:bg-[#0077b3] text-white"
                onClick={handleLoginButtonClick}
              >
                <LogIn className="h-4 w-4 mr-2" />
                Login with Telegram
              </Button>
            </div>
          )}

          {/* Show error and retry button if widget failed to load */}
          {showFallback && botUsername && (
            <div className="w-full flex flex-col gap-2 mt-2">
              <p className="text-sm text-destructive text-center">
                Failed to load Telegram widget. Please try again.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={handleRetry}
              >
                <RefreshCcw className="h-3 w-3 mr-2" />
                Retry
              </Button>
            </div>
          )}

          {!botUsername && !error && (
            <p className="text-sm text-muted-foreground text-center">
              Loading authentication...
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
