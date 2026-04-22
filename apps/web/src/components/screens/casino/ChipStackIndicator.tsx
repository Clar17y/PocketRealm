import type { ChipStack } from './casinoUtils';

export function ChipStackIndicator({ myCount, otherCount }: ChipStack) {
  const total = Math.min(myCount + otherCount, 3);
  if (total === 0) return null;

  const overflow = myCount + otherCount > 3 ? myCount + otherCount : 0;

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div className="relative w-5 h-5">
        {Array.from({ length: total }, (_, index) => {
          const isMine = index < myCount;

          return (
            <img
              key={index}
              src={isMine ? '/assets/ui/chip-gold.svg' : '/assets/ui/chip-silver.svg'}
              alt=""
              className="absolute w-5 h-5 drop-shadow-sm"
              style={{ top: `${-index * 2}px` }}
            />
          );
        })}
        {overflow > 0 && (
          <span className="absolute -top-2 -right-1.5 text-[7px] text-white font-bold bg-black/60 rounded-full px-0.5 leading-tight">
            x{overflow}
          </span>
        )}
      </div>
    </div>
  );
}
