/**
 * Types for Telegram Web Login authentication
 */

export interface TelegramAuthData {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

export interface TelegramUser {
  id: number;
  firstName: string;
  lastName?: string;
  username?: string;
  photoUrl?: string;
}

export interface TelegramAuthResponse {
  user: TelegramUser;
  sessionId: string;
}

export interface SessionUser {
  telegramId: number;
  firstName: string;
  lastName?: string;
  username?: string;
  photoUrl?: string;
  sessionId: string;
  createdAt: Date;
  lastActivity: Date;
}

