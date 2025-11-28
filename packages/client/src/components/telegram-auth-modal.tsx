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
  const { isAuthenticated, isLoading, setUser, checkAuth, telegramUser } = useAuth();
  const widgetContainerRef = useRef<HTMLDivElement>(null);
  const scriptLoadedRef = useRef(false);
  const [botUsername, setBotUsername] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [widgetReady, setWidgetReady] = useState(false);
  const [showFallback, setShowFallback] = useState(false);
  const [isProcessingAuth, setIsProcessingAuth] = useState(false);
  const [authCompleted, setAuthCompleted] = useState(false); // Track if first auth completed

  // Modal should be open if:
  // 1. Not loading
  // 2. Not authenticated (widget will show button with name after first auth, user clicks to close)
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
          // Already processing, just ensure state is set
          setIsProcessingAuth(true);
          const { user, sessionId } = event.data;
          clientLogger.info('Telegram auth success received via postMessage', { userId: user.id, sessionId });
          
          // Update auth context directly with user and session
          setUser(user, sessionId);
          setError(null);
          
          // Give time for state to update before allowing modal to close
          // Wait longer to ensure AuthContext has updated isAuthenticated
          setTimeout(() => {
            setIsProcessingAuth(false);
            clientLogger.info('User authenticated, modal should close');
          }, 1000);
        } catch (error) {
          clientLogger.error('Telegram login error:', error);
          setError('Authentication failed. Please try again.');
          setIsProcessingAuth(false);
        }
      } else if (event.data?.error) {
        clientLogger.error('Telegram auth error:', event.data.error);
        setError('Authentication failed: ' + event.data.error);
        setIsProcessingAuth(false);
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

      // Create global callback function for Telegram widget
      // According to Telegram docs, widget calls this function with user data
      // This is called TWICE: 
      // 1. First time when user authorizes in Telegram (we create session)
      // 2. Second time when user clicks button with their name (we close modal)
      (window as any).onTelegramAuth = async (user: any) => {
        clientLogger.info('Telegram widget callback received', { 
          userId: user.id, 
          firstName: user.first_name,
          authCompleted,
          isAuthenticated 
        });
        
        // If auth already completed, this is second call - user clicked button with name
        if (authCompleted && telegramUser) {
          clientLogger.info('User clicked widget button with name - closing modal');
          // Modal will close because isAuthenticated is true
          return;
        }
        
        try {
          setIsProcessingAuth(true);
          
          // Convert Telegram widget format to our format
          const authData = {
            id: user.id,
            first_name: user.first_name,
            last_name: user.last_name,
            username: user.username,
            photo_url: user.photo_url,
            auth_date: user.auth_date,
            hash: user.hash,
          };
          
          // Send to server for validation and session creation
          const client = await import('@/lib/api-client-config').then(m => m.getElizaClient());
          const response = await fetch(`${client.config.baseUrl}/api/auth/telegram/login`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(authData),
          });
          
          if (!response.ok) {
            throw new Error('Authentication failed');
          }
          
          const data = await response.json();
          clientLogger.info('Telegram login successful', { userId: data.user.id });
          
          // Update auth context
          setUser(data.user, data.sessionId);
          setError(null);
          setAuthCompleted(true); // Mark first auth as completed
          
          // Widget will automatically change button to "Login as [Name]" 
          // User needs to click that button to close modal
          setIsProcessingAuth(false);
          clientLogger.info('User authorized, widget will show button with name. Waiting for user to click it.');
        } catch (error) {
          clientLogger.error('Telegram login error:', error);
          setError('Authentication failed. Please try again.');
          setIsProcessingAuth(false);
        }
      };
      
      // Create widget in container
      if (widgetContainerRef.current && botUsername) {
        const container = widgetContainerRef.current;
        container.innerHTML = '';
        
        // Wait for script to load, then create widget
        // According to Telegram docs: https://core.telegram.org/widgets/login
        // Widget should be created as a script tag with data attributes
        const createWidget = () => {
          if (!container.querySelector('script[data-telegram-login]')) {
            clientLogger.info('Creating Telegram widget with onauth callback', { botUsername });
            
            // Create script tag exactly as per Telegram documentation
            const widgetScript = document.createElement('script');
            widgetScript.async = true;
            widgetScript.src = 'https://telegram.org/js/telegram-widget.js?22';
            
            // Set attributes as per Telegram docs - use onauth callback instead of auth-url
            widgetScript.setAttribute('data-telegram-login', botUsername);
            widgetScript.setAttribute('data-size', 'large');
            widgetScript.setAttribute('data-onauth', 'onTelegramAuth(user)');
            widgetScript.setAttribute('data-request-access', 'write');
          
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
              'data-onauth': 'onTelegramAuth(user)',
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
      clearInterval(checkLocalStorage);
      // Cleanup global callback
      delete (window as any).onTelegramAuth;
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
                    
                    // Mark as processing auth BEFORE opening popup
                    // This prevents modal from closing prematurely
                    setIsProcessingAuth(true);
                    setError(null);
                    
                    // Open in popup window so we can receive postMessage
                    // Use specific window name to prevent opening in same window
                    const popup = window.open(
                      oauthUrl, 
                      'telegram-oauth-popup',
                      'width=500,height=600,scrollbars=yes,resizable=yes,menubar=no,toolbar=no,location=no'
                    );
                    
                    if (!popup) {
                      setError('Popup blocked. Please allow popups for this site and try again.');
                      setIsProcessingAuth(false);
                      return;
                    }
                    
                    // Focus popup
                    popup.focus();
                    
                    // Check if popup was immediately closed (blocked by browser)
                    setTimeout(() => {
                      if (popup.closed) {
                        clientLogger.warn('OAuth popup was closed immediately - likely blocked by browser');
                        setError('Popup was blocked. Please allow popups for this site and try again.');
                        setIsProcessingAuth(false);
                        return;
                      }
                    }, 500);
                    
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
                                // Process the message
                                if (message.user && message.sessionId) {
                                  setIsProcessingAuth(true);
                                  setUser(message.user, message.sessionId);
                                  setError(null);
                                  // Give time for state to update
                                  setTimeout(() => {
                                    setIsProcessingAuth(false);
                                    clientLogger.info('User authenticated via localStorage, modal should close');
                                  }, 500);
                                }
                                return;
                              }
                            }
                          } catch (e) {
                            clientLogger.warn('Error checking localStorage', e);
                          }
                          
                          // If no message found, try to get session from server
                          clientLogger.info('No localStorage message, checking server for session');
                          // Check auth status from server
                          checkAuth().then(() => {
                            // Give time for state to update
                            setTimeout(() => {
                              setIsProcessingAuth(false);
                              clientLogger.info('Auth check completed after popup close');
                            }, 500);
                          }).catch(() => {
                            setIsProcessingAuth(false);
                          });
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
                    widgetScript.setAttribute('data-onauth', 'onTelegramAuth(user)');
                    widgetScript.setAttribute('data-request-access', 'write');
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

