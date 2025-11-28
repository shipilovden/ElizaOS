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
import { openTelegramOAuthPopup, handleOAuthMessage } from './telegram-oauth-handler';

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

  // Modal should be open if not authenticated
  const isOpen = !isLoading && !isAuthenticated;

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
            clientLogger.info('Server session confirmed, modal should close');
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
      onAuthSuccess: async (user, sessionId) => {
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

    // Try to click widget if it exists
    const container = widgetContainerRef.current;
    if (container) {
      const iframe = container.querySelector('iframe');
      const link = container.querySelector('a');
      const button = container.querySelector('button');

      clientLogger.info('Widget elements found', { hasIframe: !!iframe, hasLink: !!link, hasButton: !!button });

      if (link) {
        clientLogger.info('Clicking widget link');
        (link as HTMLAnchorElement).click();
        return;
      } else if (button) {
        clientLogger.info('Clicking widget button');
        (button as HTMLButtonElement).click();
        return;
      } else if (iframe) {
        clientLogger.info('Widget is iframe, trying to trigger');
        try {
          const iframeDoc = (iframe as HTMLIFrameElement).contentDocument ||
            (iframe as HTMLIFrameElement).contentWindow?.document;
          if (iframeDoc) {
            const iframeButton = iframeDoc.querySelector('button, a');
            if (iframeButton) {
              (iframeButton as HTMLElement).click();
              return;
            }
          }
        } catch (e) {
          clientLogger.warn('Cannot access iframe content (CORS)', e);
        }
      }
    }

    // Widget not loaded or not accessible - use OAuth popup fallback
    const isNumericBotId = /^\d+$/.test(botUsername);

    if (isNumericBotId) {
      setIsProcessingAuth(true);
      setError(null);
      openTelegramOAuthPopup(botUsername, {
        onAuthSuccess: async (user: TelegramUser, sessionId: string): Promise<void> => {
          setUser(user, sessionId);
          setError(null);
          setIsProcessingAuth(true);
          clientLogger.info('OAuth popup: user received, validating session on server', { user });

          try {
            // wait for server-side validation / session creation
            await checkAuth();
            setAuthCompleted(true);
            clientLogger.info('Server confirmed session after OAuth popup; recreating widget to show user name/avatar');

            // Recreate widget - it will now show button with user name
            setTimeout(() => {
              const container = widgetContainerRef.current;
              if (container && botUsername) {
                container.innerHTML = '';
                createTelegramWidgetAsync(container, {
                  botUsername,
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
            clientLogger.error('checkAuth failed after OAuth popup', e);
            setError('Authentication verification failed. Please try again.');
          } finally {
            setIsProcessingAuth(false);
          }
        },
        onAuthError: (errorMsg: string) => {
          setError(errorMsg);
          setIsProcessingAuth(false);
        },
        checkAuth: async () => {
          await checkAuth();
          setIsProcessingAuth(false);
        },
      });
    } else {
      clientLogger.warn('Widget not accessible and no bot_id available', { botUsername });
      setError('Telegram widget is not ready. Please wait a moment and try again, or refresh the page. If the problem persists, please set VITE_TELEGRAM_BOT_ID (numeric) instead of VITE_TELEGRAM_BOT_USERNAME.');
    }
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
