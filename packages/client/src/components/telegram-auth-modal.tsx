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

  // Modal should be open if not authenticated and not loading
  const isOpen = !isLoading && !isAuthenticated;

  useEffect(() => {
    if (!isOpen) return;

    // Get bot username from environment
    const username = import.meta.env.VITE_TELEGRAM_BOT_USERNAME;
    
    if (!username || username === 'your_bot_username') {
      setError('Telegram authentication is not configured. Please contact the administrator.');
      return;
    }
    
    setBotUsername(username);
    const authUrl = `${window.location.origin}/api/auth/telegram/callback`;

    // Handle message from callback window
    const handleMessage = async (event: MessageEvent) => {
      // Verify origin for security
      if (event.origin !== window.location.origin) {
        return;
      }

      if (event.data?.type === 'telegram-auth-success') {
        try {
          const { user, sessionId } = event.data;
          clientLogger.info('Telegram auth success received', { userId: user.id });
          
          // Update auth context directly with user and session
          setUser(user, sessionId);
          setError(null);
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
      const createWidget = () => {
        if (!container.querySelector('script[data-telegram-login]')) {
          const widgetScript = document.createElement('script');
          widgetScript.async = true;
          widgetScript.src = 'https://telegram.org/js/telegram-widget.js?22';
          widgetScript.setAttribute('data-telegram-login', botUsername);
          widgetScript.setAttribute('data-size', 'large');
          widgetScript.setAttribute('data-auth-url', authUrl);
          widgetScript.setAttribute('data-request-access', 'write');
          widgetScript.setAttribute('data-userpic', 'true');
          
          widgetScript.onerror = () => {
            clientLogger.error('Failed to create Telegram widget');
            setError('Failed to initialize Telegram authentication. Please refresh the page.');
          };
          
          container.appendChild(widgetScript);
          
          // Check if widget was created after a delay
          setTimeout(() => {
            if (!container.querySelector('iframe') && !container.querySelector('a')) {
              clientLogger.warn('Telegram widget did not render');
              setError('Telegram authentication widget failed to load. Please refresh the page.');
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
              setError('Telegram authentication widget failed to load. Please refresh the page.');
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
          {error ? (
            <div className="w-full p-3 bg-destructive/10 border border-destructive/20 rounded-md">
              <p className="text-sm text-destructive text-center">{error}</p>
              <Button
                variant="outline"
                size="sm"
                className="w-full mt-2"
                onClick={() => window.location.reload()}
              >
                Refresh Page
              </Button>
            </div>
          ) : (
            <>
              <div 
                ref={widgetContainerRef} 
                className="telegram-login-container flex justify-center w-full"
                style={{ minHeight: '60px' }}
              />
              {!botUsername && (
                <p className="text-sm text-muted-foreground text-center">
                  Loading authentication...
                </p>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

