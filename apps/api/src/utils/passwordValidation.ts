import { COMMON_PASSWORDS } from '../constants/commonPasswords';

export interface PasswordValidationResult {
  valid: boolean;
  reason?: string;
}

const MIN_LENGTH = 10;
const MAX_LENGTH = 100;

export function validatePassword(password: string): PasswordValidationResult {
  if (password.length < MIN_LENGTH) {
    return { valid: false, reason: `Password must be at least ${MIN_LENGTH} characters` };
  }

  if (password.length > MAX_LENGTH) {
    return { valid: false, reason: `Password must be at most ${MAX_LENGTH} characters` };
  }

  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return { valid: false, reason: 'That password is too common — please choose something less guessable' };
  }

  return { valid: true };
}
