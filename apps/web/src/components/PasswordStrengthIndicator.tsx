'use client';

const COMMON_LONG_PASSWORDS = new Set([
  'password123', 'password1234', 'qwerty12345', '1234567890', 'letmein1234',
  'iloveyou123', 'trustno1234', 'welcome1234', 'monkey12345', 'dragon12345',
]);

interface Props {
  password: string;
}

export function PasswordStrengthIndicator({ password }: Props) {
  if (password.length === 0) return null;

  let message: string;
  let color: string;

  if (password.length < 10) {
    message = `Too short (${password.length}/10)`;
    color = 'var(--rpg-red)';
  } else if (COMMON_LONG_PASSWORDS.has(password.toLowerCase())) {
    message = 'Too common — try something more creative';
    color = 'var(--rpg-red)';
  } else {
    message = 'Looks good';
    color = 'var(--rpg-green-light)';
  }

  return (
    <p className="text-xs mt-1" style={{ color }}>
      {message}
    </p>
  );
}
