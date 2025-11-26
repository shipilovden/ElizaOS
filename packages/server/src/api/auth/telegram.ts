import crypto from 'node:crypto';
import { logger } from '@elizaos/core';
import type { TelegramAuthData, TelegramUser } from '../../types/telegram';

/**
 * Validates Telegram authentication data using the Telegram Bot API
 * 
 * According to Telegram documentation:
 * 1. Data should be checked within 24 hours (auth_date)
 * 2. Hash should be verified using bot token
 * 
 * @param data - Authentication data from Telegram widget
 * @param botToken - Telegram bot token
 * @returns true if data is valid, false otherwise
 */
export function validateTelegramAuth(
  data: TelegramAuthData,
  botToken: string
): boolean {
  try {
    // Check if auth_date is not older than 24 hours
    const authDate = data.auth_date;
    const currentTime = Math.floor(Date.now() / 1000);
    const twentyFourHours = 24 * 60 * 60;
    
    if (currentTime - authDate > twentyFourHours) {
      logger.warn(`[Telegram Auth] Auth data expired. Auth date: ${authDate}, Current: ${currentTime}`);
      return false;
    }

    // Verify hash
    // According to Telegram docs, hash is calculated as:
    // hash = HMAC_SHA256(bot_token, "auth_date={auth_date}\nfirst_name={first_name}\nid={id}\nusername={username}")
    
    // Create data check string
    const dataCheckString = createDataCheckString(data);
    
    // Calculate secret key from bot token
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();
    
    // Calculate hash
    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');
    
    // Compare hashes
    const isValid = calculatedHash === data.hash;
    
    if (!isValid) {
      logger.warn('[Telegram Auth] Hash validation failed');
    }
    
    return isValid;
  } catch (error) {
    logger.error('[Telegram Auth] Validation error:', error);
    return false;
  }
}

/**
 * Creates data check string from Telegram auth data
 * Format: "key=value\nkey2=value2\n..." sorted by key
 */
function createDataCheckString(data: TelegramAuthData): string {
  const entries: Array<[string, string]> = [];
  
  // Add all fields except hash
  if (data.id) entries.push(['id', String(data.id)]);
  if (data.first_name) entries.push(['first_name', data.first_name]);
  if (data.last_name) entries.push(['last_name', data.last_name]);
  if (data.username) entries.push(['username', data.username]);
  if (data.photo_url) entries.push(['photo_url', data.photo_url]);
  if (data.auth_date) entries.push(['auth_date', String(data.auth_date)]);
  
  // Sort by key
  entries.sort((a, b) => a[0].localeCompare(b[0]));
  
  // Join as "key=value\nkey2=value2"
  return entries.map(([key, value]) => `${key}=${value}`).join('\n');
}

/**
 * Converts Telegram auth data to TelegramUser object
 */
export function convertToTelegramUser(data: TelegramAuthData): TelegramUser {
  return {
    id: data.id,
    firstName: data.first_name,
    lastName: data.last_name,
    username: data.username,
    photoUrl: data.photo_url,
  };
}

