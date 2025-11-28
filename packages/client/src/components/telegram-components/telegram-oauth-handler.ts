import clientLogger from '@/lib/logger';
import type { TelegramUser } from '@/types/telegram';

export interface TelegramOAuthCallbacks {
  onAuthSuccess: (user: TelegramUser, sessionId: string) => Promise<void>;
  onAuthError: (error: string) => void;
  checkAuth: () => Promise<void>;
}

/**
 * Opens Telegram OAuth in a popup window (fallback when widget doesn't work)
 */
export function openTelegramOAuthPopup(
  botId: string,
  callbacks: TelegramOAuthCallbacks
): void {
  const authUrl = `${window.location.origin.replace(/\/$/, '')}/api/auth/telegram/callback`;
  const oauthUrl = `https://oauth.telegram.org/auth?bot_id=${botId}&origin=${encodeURIComponent(window.location.origin)}&request_access=write&return_to=${encodeURIComponent(authUrl)}`;

  clientLogger.info('Opening Telegram OAuth manually', { oauthUrl });

  // Open in popup window so we can receive postMessage
  const popup = window.open(
    oauthUrl,
    'telegram-oauth-popup',
    'width=500,height=600,scrollbars=yes,resizable=yes,menubar=no,toolbar=no,location=no'
  );

  if (!popup) {
    callbacks.onAuthError('Popup blocked. Please allow popups for this site and try again.');
    return;
  }

  // Focus popup
  popup.focus();

  // Check if popup was immediately closed (blocked by browser)
  setTimeout(() => {
    if (popup.closed) {
      clientLogger.warn('OAuth popup was closed immediately - likely blocked by browser');
      callbacks.onAuthError('Popup was blocked. Please allow popups for this site and try again.');
      return;
    }
  }, 500);

  // Listen for popup to close (user completed auth)
  const checkPopup = setInterval(() => {
    if (popup?.closed) {
      clearInterval(checkPopup);
      clientLogger.info('OAuth popup closed, checking auth status');

      // Wait a bit for callback to complete and store session
      setTimeout(async () => {
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
                await callbacks.onAuthSuccess(message.user, message.sessionId);
                return;
              }
            }
          }
        } catch (e) {
          clientLogger.warn('Error checking localStorage', e);
        }

        // If no message found, try to get session from server
        clientLogger.info('No localStorage message, checking server for session');
        callbacks.checkAuth().catch(() => {
          callbacks.onAuthError('Failed to verify authentication');
        });
      }, 1500);
    }
  }, 500);

  // Cleanup after 5 minutes
  setTimeout(() => clearInterval(checkPopup), 300000);
}

/**
 * Handles postMessage from OAuth callback window
 */
export async function handleOAuthMessage(
  event: MessageEvent,
  callbacks: TelegramOAuthCallbacks
): Promise<void> {
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
      clientLogger.info('Telegram auth success received via postMessage', { userId: user.id, sessionId });
      await callbacks.onAuthSuccess(user, sessionId);
    } catch (error) {
      clientLogger.error('Telegram login error:', error);
      callbacks.onAuthError('Authentication failed. Please try again.');
    }
  } else if (event.data?.error) {
    clientLogger.error('Telegram auth error:', event.data.error);
    callbacks.onAuthError('Authentication failed: ' + event.data.error);
  }
}

