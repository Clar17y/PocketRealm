'use client';

export interface RoomProgressBarProps {
  currentRoom: number;
  totalRooms: number;
  label?: string;
  /** If true, currentRoom is 0-indexed and display will add 1 */
  zeroIndexed?: boolean;
}

export function RoomProgressBar({ currentRoom, totalRooms, label = 'Room', zeroIndexed }: RoomProgressBarProps) {
  const displayRoom = zeroIndexed ? currentRoom + 1 : currentRoom;
  const progressRoom = zeroIndexed ? currentRoom : currentRoom - 1;
  const pct = totalRooms > 0 ? Math.min((progressRoom / totalRooms) * 100, 100) : 0;

  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-[var(--rpg-text-secondary)]">{label} Progress</span>
        <span className="text-[var(--rpg-text-primary)]">
          {label} {displayRoom} / {totalRooms}
        </span>
      </div>
      <div className="h-2 rounded-full" style={{ backgroundColor: 'var(--rpg-bg-dark, #1a1a2e)' }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: 'var(--rpg-gold)' }}
          role="progressbar"
          aria-valuenow={progressRoom}
          aria-valuemin={0}
          aria-valuemax={totalRooms}
        />
      </div>
    </div>
  );
}
