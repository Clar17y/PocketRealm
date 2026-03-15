export function RefreshingIndicator({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="text-xs text-[var(--rpg-text-secondary)] animate-pulse">
      Refreshing...
    </div>
  );
}
