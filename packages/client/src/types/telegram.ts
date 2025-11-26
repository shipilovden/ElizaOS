/**
 * Types for Telegram Web Login on client side
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

export interface TelegramLoginResponse {
  user: TelegramUser;
  sessionId: string;
}

