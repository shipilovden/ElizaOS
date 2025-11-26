import { useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import clientLogger from '@/lib/logger';

/**
 * Telegram Login Widget Component
 * 
 * This component integrates the Telegram Login Widget script
 * and handles the authentication callback
 */
export default function TelegramLoginWidget() {
  const { setUser } = useAuth();
  const widgetContainerRef = useRef<HTMLDivElement>(null);
  const scriptLoadedRef = useRef(false);

  useEffect(() => {
    // Get bot username from environment
    // You can set this via VITE_TELEGRAM_BOT_USERNAME env variable
    const botUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME || 'your_bot_username';
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
        } catch (error) {
          clientLogger.error('Telegram login error:', error);
        }
      } else if (event.data?.error) {
        clientLogger.error('Telegram auth error:', event.data.error);
        alert('Login failed: ' + event.data.error);
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
        document.body.appendChild(script);
      }
      
      scriptLoadedRef.current = true;
    }

    // Create widget in container
    if (widgetContainerRef.current) {
      const container = widgetContainerRef.current;
      container.innerHTML = '';
      
      // Wait for script to load, then create widget
      const createWidget = () => {
        if (!container.querySelector('script[data-telegram-login]')) {
          const widgetScript = document.createElement('script');
          widgetScript.async = true;
          widgetScript.src = 'https://telegram.org/js/telegram-widget.js?22';
          widgetScript.setAttribute('data-telegram-login', botUsername);
          widgetScript.setAttribute('data-size', 'medium');
          widgetScript.setAttribute('data-auth-url', authUrl);
          widgetScript.setAttribute('data-request-access', 'write');
          widgetScript.setAttribute('data-userpic', 'true');
          
          container.appendChild(widgetScript);
        }
      };

      // Try to create widget immediately, or wait for script to load
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
        setTimeout(() => clearInterval(checkScript), 5000);
      }
    }

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [setUser]);

  return (
    <div 
      ref={widgetContainerRef} 
      className="telegram-login-container flex justify-center"
      style={{ minHeight: '40px' }}
    />
  );
}

