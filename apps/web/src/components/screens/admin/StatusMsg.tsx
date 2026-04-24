import type { StatusMessage } from './useAdminAction';

export function StatusMsg({ msg }: { msg: StatusMessage | null }) {
  if (!msg) return null;

  return (
    <div className={`text-sm mt-2 ${msg.ok ? 'text-[var(--rpg-green-light)]' : 'text-[var(--rpg-red)]'}`}>
      {msg.text}
    </div>
  );
}
