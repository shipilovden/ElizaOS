import clientLogger from '@/lib/logger';
import type { TelegramUser } from '@/types/telegram';

/**
 * Creates the global onTelegramAuth callback function for Telegram widget
 * This is called by the Telegram widget when user authorizes
 * 
 * According to Telegram docs, widget calls this function with user data
 * This is called TWICE: 
 * 1. First time when user authorizes in Telegram (we create session)
 * 2. Second time when user clicks button with their name (we close modal)
 */
export function createTelegramAuthCallback(
  callbacks: {
    onAuthSuccess: (user: TelegramUser, sessionId: string) => void;
    onAuthError: (error: string) => void;
    isAuthCompleted: () => boolean;
    getTelegramUser: () => TelegramUser | null;
  }
): (user: any) => Promise<void> {
  return async (user: any) => {
    clientLogger.info('Telegram widget callback received', {
      userId: user.id,
      firstName: user.first_name,
      authCompleted: callbacks.isAuthCompleted(),
    });

    // If auth already completed, this is second call - user clicked button with name
    if (callbacks.isAuthCompleted() && callbacks.getTelegramUser()) {
      clientLogger.info('User clicked widget button with name - closing modal');
      // Modal will close because isAuthenticated is true
      return;
    }

    try {
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

      // Call success callback
      callbacks.onAuthSuccess(data.user, data.sessionId);
    } catch (error) {
      clientLogger.error('Telegram login error:', error);
      callbacks.onAuthError('Authentication failed. Please try again.');
    }
  };
}

