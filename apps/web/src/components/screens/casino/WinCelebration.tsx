const COIN_POSITIONS = Array.from({ length: 20 }, () => ({
  left: Math.random() * 100,
  delay: Math.random() * 0.8,
  duration: 1.5 + Math.random(),
}));

export function WinCelebration({ payout, isBigWin }: { payout: number; isBigWin: boolean }) {
  const coinCount = isBigWin ? 20 : 8;

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      <div
        className="absolute inset-0 bg-[var(--rpg-gold)]/10"
        style={{ animation: 'gold-shimmer 1.5s ease-out forwards' }}
      />
      {COIN_POSITIONS.slice(0, coinCount).map((position, index) => (
        <div
          key={index}
          className="absolute text-lg"
          style={{
            left: `${position.left}%`,
            animationDelay: `${position.delay}s`,
            animation: `coin-fall ${position.duration}s ease-in forwards`,
          }}
        >
          {'🪙'}
        </div>
      ))}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-[24px] font-pixel text-[var(--rpg-gold)] animate-bounce">
          +{payout.toLocaleString()}g
        </div>
      </div>
    </div>
  );
}
