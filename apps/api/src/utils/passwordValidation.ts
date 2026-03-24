import { COMMON_PASSWORDS } from '../constants/commonPasswords';
import { AUTH_CONSTANTS } from '@pocketrealm/shared';

export interface PasswordValidationResult {
  valid: boolean;
  reason?: string;
}

export function validatePassword(password: string): PasswordValidationResult {
  if (password.length < AUTH_CONSTANTS.PASSWORD_MIN_LENGTH) {
    return { valid: false, reason: `Password must be at least ${AUTH_CONSTANTS.PASSWORD_MIN_LENGTH} characters` };
  }

  if (password.length > AUTH_CONSTANTS.PASSWORD_MAX_LENGTH) {
    return { valid: false, reason: `Password must be at most ${AUTH_CONSTANTS.PASSWORD_MAX_LENGTH} characters` };
  }

  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return { valid: false, reason: 'That password is too common — please choose something less guessable' };
  }

  return { valid: true };
}
