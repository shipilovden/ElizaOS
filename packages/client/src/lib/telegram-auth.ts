import type { TelegramAuthData, TelegramLoginResponse, TelegramUser } from '@/types/telegram';
import { getElizaClient } from './api-client-config';
import clientLogger from './logger';

const SESSION_STORAGE_KEY = 'telegram-session-id';

/**
 * Stores session ID in localStorage
 */
export function storeSessionId(sessionId: string): void {
  localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
}

/**
 * Gets session ID from localStorage
 */
export function getSessionId(): string | null {
  return localStorage.getItem(SESSION_STORAGE_KEY);
}

/**
 * Removes session ID from localStorage
 */
export function clearSessionId(): void {
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

/**
 * Sends Telegram auth data to server for validation and creates session
 */
export async function loginWithTelegram(authData: TelegramAuthData): Promise<TelegramLoginResponse> {
  try {
    const client = getElizaClient();
    const response = await fetch(`${client.config.baseUrl}/api/auth/telegram/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(authData),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Authentication failed' }));
      throw new Error(error.error || 'Authentication failed');
    }

    const data: TelegramLoginResponse = await response.json();
    
    // Store session ID
    storeSessionId(data.sessionId);
    
    clientLogger.info('Telegram login successful', { userId: data.user.id });
    
    return data;
  } catch (error) {
    clientLogger.error('Telegram login error:', error);
    throw error;
  }
}

/**
 * Gets current authenticated user from server
 */
export async function getCurrentUser(): Promise<TelegramUser | null> {
  try {
    const sessionId = getSessionId();
    if (!sessionId) {
      return null;
    }

    const client = getElizaClient();
    const response = await fetch(`${client.config.baseUrl}/api/auth/me?sessionId=${sessionId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        // Session expired or invalid
        clearSessionId();
        return null;
      }
      throw new Error('Failed to get current user');
    }

    const data = await response.json();
    return data.user;
  } catch (error) {
    clientLogger.error('Get current user error:', error);
    return null;
  }
}

/**
 * Sets user directly (used when receiving user from callback)
 */
export function setUserDirectly(user: TelegramUser, sessionId: string): void {
  storeSessionId(sessionId);
  clientLogger.info('User set directly from callback', { userId: user.id });
}

/**
 * Logs out the current user
 */
export async function logout(): Promise<void> {
  try {
    const sessionId = getSessionId();
    if (!sessionId) {
      return;
    }

    const client = getElizaClient();
    await fetch(`${client.config.baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId }),
    });

    clearSessionId();
    clientLogger.info('Telegram logout successful');
  } catch (error) {
    clientLogger.error('Telegram logout error:', error);
    // Clear session even if request fails
    clearSessionId();
  }
}

