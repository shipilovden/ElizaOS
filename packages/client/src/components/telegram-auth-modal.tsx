import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import clientLogger from '@/lib/logger';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { LogIn } from 'lucide-react';

/**
 * Telegram Authentication Modal
 * 
 * Shows a modal dialog requiring Telegram authentication before accessing the site
 */
export default function TelegramAuthModal() {
  const { isAuthenticated, isLoading, setUser } = useAuth();
  const widgetContainerRef = useRef<HTMLDivElement>(null);
  const scriptLoadedRef = useRef(false);
  const [botUsername, setBotUsername] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [widgetReady, setWidgetReady] = useState(false);
  const [showFallback, setShowFallback] = useState(false);

  // Modal should be open if not authenticated and not loading
  const isOpen = !isLoading && !isAuthenticated;

  useEffect(() => {
    if (!isOpen) return;

    // Get bot username or bot_id from environment
    // Telegram widget can use either username or bot_id
    // bot_id is the numeric part before ':' in the bot token
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
    // bot_id is the numeric ID from the token (part before ':')
    const botIdentifier = botId || username;
    
    if (!botIdentifier || botIdentifier === 'your_bot_username') {
      setShowFallback(true);
      setError('Telegram authentication is not configured. Please set VITE_TELEGRAM_BOT_ID (preferred) or VITE_TELEGRAM_BOT_USERNAME.');
      clientLogger.error('VITE_TELEGRAM_BOT_ID or VITE_TELEGRAM_BOT_USERNAME not configured');
      return;
    }
    
    // bot_id is numeric, username is string - both work with data-telegram-login
    setBotUsername(botIdentifier);
    // Remove trailing slash from origin if present
    const origin = window.location.origin.replace(/\/$/, '');
    const authUrl = `${origin}/api/auth/telegram/callback`;
    
    clientLogger.info('Telegram auth modal: configured', { botIdentifier, authUrl, usingBotId: !!botId });

    // Handle message from callback window
    const handleMessage = async (event: MessageEvent) => {
      // Filter out noise messages (setImmediate, etc.)
      if (event.data && typeof event.data === 'object' && 'type' in event.data) {
        clientLogger.info('Message received in modal', { 
          origin: event.origin, 
          expectedOrigin: window.location.origin,
          type: event.data.type,
          hasUser: !!event.data.user
        });
      } else {
        // Ignore non-auth messages
        return;
      }
      
      // Verify origin for security
      if (event.origin !== window.location.origin) {
        clientLogger.warn('Message origin mismatch', { 
          received: event.origin, 
          expected: window.location.origin 
        });
        return;
      }

      if (event.data?.type === 'telegram-auth-success') {
        try {
          const { user, sessionId } = event.data;
          clientLogger.info('Telegram auth success received', { userId: user.id, sessionId });
          
          // Update auth context directly with user and session
          setUser(user, sessionId);
          setError(null);
          
          // Force check auth to update state
          // The modal will close automatically when isAuthenticated becomes true
          clientLogger.info('User authenticated, modal should close');
        } catch (error) {
          clientLogger.error('Telegram login error:', error);
          setError('Authentication failed. Please try again.');
        }
      } else if (event.data?.error) {
        clientLogger.error('Telegram auth error:', event.data.error);
        setError('Authentication failed: ' + event.data.error);
      }
    };

    window.addEventListener('message', handleMessage);
    
    // Also check localStorage for auth success (fallback if postMessage fails)
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

    // Load Telegram Widget script if not already loaded
    if (!scriptLoadedRef.current) {
      const existingScript = document.querySelector('script[src*="telegram-widget.js"]');
      
      if (!existingScript) {
        const script = document.createElement('script');
        script.src = 'https://telegram.org/js/telegram-widget.js?22';
        script.async = true;
        script.onload = () => {
          clientLogger.info('Telegram widget script loaded');
        };
        script.onerror = () => {
          clientLogger.error('Failed to load Telegram widget script');
          setError('Failed to load Telegram authentication. Please refresh the page.');
        };
        document.body.appendChild(script);
      }
      
      scriptLoadedRef.current = true;
    }

    // Create widget in container
    if (widgetContainerRef.current && botUsername) {
      const container = widgetContainerRef.current;
      container.innerHTML = '';
      
      // Wait for script to load, then create widget
      // According to Telegram docs: https://core.telegram.org/widgets/login
      // Widget should be created as a script tag with data attributes
      const createWidget = () => {
        if (!container.querySelector('script[data-telegram-login]')) {
          clientLogger.info('Creating Telegram widget', { botUsername, authUrl });
          
          // Create script tag exactly as per Telegram documentation
          const widgetScript = document.createElement('script');
          widgetScript.async = true;
          widgetScript.src = 'https://telegram.org/js/telegram-widget.js?22';
          
          // Set attributes as per Telegram docs
          widgetScript.setAttribute('data-telegram-login', botUsername);
          widgetScript.setAttribute('data-size', 'large');
          widgetScript.setAttribute('data-auth-url', authUrl);
          widgetScript.setAttribute('data-request-access', 'write');
          widgetScript.setAttribute('data-userpic', 'true');
          
          widgetScript.onload = () => {
            clientLogger.info('Telegram widget script loaded successfully');
            // Widget script should automatically create iframe/button
            // Give it a moment to render
            setTimeout(() => {
              const iframe = container.querySelector('iframe');
              const link = container.querySelector('a');
              const button = container.querySelector('button');
              clientLogger.info('Widget elements after load', { 
                hasIframe: !!iframe, 
                hasLink: !!link, 
                hasButton: !!button 
              });
            }, 1000);
          };
          
          widgetScript.onerror = (error) => {
            clientLogger.error('Failed to load Telegram widget script', error);
            setError('Failed to load Telegram authentication script. Please check your internet connection and try again.');
            setShowFallback(true);
          };
          
          container.appendChild(widgetScript);
          
          clientLogger.info('Telegram widget script appended to container', {
            containerId: container.id,
            scriptSrc: widgetScript.src,
            attributes: {
              'data-telegram-login': botUsername,
              'data-size': 'large',
              'data-auth-url': authUrl,
            }
          });
          
          // Check if widget was created after a delay
          const checkWidget = setInterval(() => {
            const iframe = container.querySelector('iframe');
            const link = container.querySelector('a');
            const button = container.querySelector('button');
            
            if (iframe || link || button) {
              clientLogger.info('Telegram widget rendered successfully', { 
                hasIframe: !!iframe, 
                hasLink: !!link, 
                hasButton: !!button 
              });
              setWidgetReady(true);
              setShowFallback(false);
              clearInterval(checkWidget);
            }
          }, 200);
          
          // Timeout after 3 seconds
          setTimeout(() => {
            clearInterval(checkWidget);
            if (!container.querySelector('iframe') && !container.querySelector('a')) {
              clientLogger.warn('Telegram widget did not render');
              setShowFallback(true);
            }
          }, 3000);
        }
      };

      // Try to create widget immediately, or wait for script to load
      const checkAndCreate = () => {
        if (document.querySelector('script[src*="telegram-widget.js"]')) {
          createWidget();
        } else {
          const checkScript = setInterval(() => {
            if (document.querySelector('script[src*="telegram-widget.js"]')) {
              clearInterval(checkScript);
              createWidget();
            }
          }, 100);
          
          // Cleanup after 5 seconds
          setTimeout(() => {
            clearInterval(checkScript);
            if (!container.querySelector('iframe') && !container.querySelector('a')) {
              setShowFallback(true);
            }
          }, 5000);
        }
      };

      checkAndCreate();
    }

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [isOpen, botUsername, setUser]);

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
          
          {/* Always show button if bot is configured, even while widget loads */}
          {botUsername && (
            <div className="w-full flex flex-col gap-2">
              {!widgetReady && !showFallback && (
                <p className="text-sm text-muted-foreground text-center mb-2">
                  Loading Telegram authentication widget...
                </p>
              )}
              
              {/* Show button immediately - widget will appear above it if it loads */}
              <Button
                variant="default"
                size="lg"
                className="w-full bg-[#0088cc] hover:bg-[#0077b3] text-white"
                onClick={() => {
                  clientLogger.info('Login button clicked', { botUsername, widgetReady });
                  
                  // Try to click widget if it exists
                  const container = widgetContainerRef.current;
                  if (container) {
                    const iframe = container.querySelector('iframe');
                    const link = container.querySelector('a');
                    const button = container.querySelector('button');
                    
                    clientLogger.info('Widget elements found', { hasIframe: !!iframe, hasLink: !!link, hasButton: !!button });
                    
                    if (link) {
                      // Widget created a link, click it
                      clientLogger.info('Clicking widget link');
                      (link as HTMLAnchorElement).click();
                      return;
                    } else if (button) {
                      // Widget created a button, click it
                      clientLogger.info('Clicking widget button');
                      (button as HTMLButtonElement).click();
                      return;
                    } else if (iframe) {
                      // Widget loaded as iframe, try to interact with it
                      clientLogger.info('Widget is iframe, trying to trigger');
                      try {
                        // Try to find and click the button inside iframe
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
                  
                  // Widget not loaded or not accessible
                  // Check if we have bot_id (numeric) to open OAuth manually
                  const isNumericBotId = /^\d+$/.test(botUsername);
                  
                  if (isNumericBotId) {
                    // We have numeric bot_id, can open OAuth directly
                    const authUrl = `${window.location.origin.replace(/\/$/, '')}/api/auth/telegram/callback`;
                    const oauthUrl = `https://oauth.telegram.org/auth?bot_id=${botUsername}&origin=${encodeURIComponent(window.location.origin)}&request_access=write&return_to=${encodeURIComponent(authUrl)}`;
                    
                    clientLogger.info('Opening Telegram OAuth manually', { oauthUrl });
                    
                    // Open in popup window so we can receive postMessage
                    const popup = window.open(
                      oauthUrl, 
                      'telegram-auth',
                      'width=500,height=600,scrollbars=yes,resizable=yes'
                    );
                    
                    // Listen for popup to close (user completed auth)
                    const checkPopup = setInterval(() => {
                      if (popup?.closed) {
                        clearInterval(checkPopup);
                        clientLogger.info('OAuth popup closed, checking auth status');
                        
                        // Wait a bit for callback to complete and store session
                        setTimeout(() => {
                          // Check localStorage for auth success (fallback)
                          try {
                            const stored = localStorage.getItem('telegram-auth-success');
                            if (stored) {
                              const message = JSON.parse(stored);
                              if (message.type === 'telegram-auth-success') {
                                clientLogger.info('Found auth success in localStorage after popup close', message);
                                localStorage.removeItem('telegram-auth-success');
                                handleMessage({ 
                                  origin: window.location.origin, 
                                  data: message 
                                } as MessageEvent);
                                return;
                              }
                            }
                          } catch (e) {
                            clientLogger.warn('Error checking localStorage', e);
                          }
                          
                          // If no message found, try to get session from server
                          // The focus listener in AuthContext will also check
                          clientLogger.info('No localStorage message, checking server for session');
                          // Trigger focus event to check auth
                          window.dispatchEvent(new Event('focus'));
                        }, 1500);
                      }
                    }, 500);
                    
                    // Cleanup after 5 minutes
                    setTimeout(() => clearInterval(checkPopup), 300000);
                  } else {
                    // Only username, can't open OAuth manually
                    clientLogger.warn('Widget not accessible and no bot_id available', { botUsername });
                    setError('Telegram widget is not ready. Please wait a moment and try again, or refresh the page. If the problem persists, please set VITE_TELEGRAM_BOT_ID (numeric) instead of VITE_TELEGRAM_BOT_USERNAME.');
                  }
                }}
              >
                <LogIn className="h-4 w-4 mr-2" />
                Login with Telegram
              </Button>
            </div>
          )}
          
          {/* Show error and retry button if widget failed to load */}
          {showFallback && botUsername && (
            <div className="w-full flex flex-col gap-2">
              <p className="text-sm text-destructive text-center">
                Failed to load Telegram widget. Please try again.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  setShowFallback(false);
                  setWidgetReady(false);
                  // Force widget reload
                  const container = widgetContainerRef.current;
                  if (container && botUsername) {
                    container.innerHTML = '';
                    const authUrl = `${window.location.origin}/api/auth/telegram/callback`;
                    const widgetScript = document.createElement('script');
                    widgetScript.async = true;
                    widgetScript.src = 'https://telegram.org/js/telegram-widget.js?22';
                    widgetScript.setAttribute('data-telegram-login', botUsername);
                    widgetScript.setAttribute('data-size', 'large');
                    widgetScript.setAttribute('data-auth-url', authUrl);
                    widgetScript.setAttribute('data-request-access', 'write');
                    widgetScript.setAttribute('data-userpic', 'true');
                    container.appendChild(widgetScript);
                    
                    // Check again after delay
                    setTimeout(() => {
                      const checkWidget = setInterval(() => {
                        const iframe = container.querySelector('iframe');
                        const link = container.querySelector('a');
                        if (iframe || link) {
                          setWidgetReady(true);
                          setShowFallback(false);
                          clearInterval(checkWidget);
                        }
                      }, 200);
                      
                      setTimeout(() => {
                        clearInterval(checkWidget);
                        if (!container.querySelector('iframe') && !container.querySelector('a')) {
                          setShowFallback(true);
                        }
                      }, 3000);
                    }, 500);
                  }
                }}
              >
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

