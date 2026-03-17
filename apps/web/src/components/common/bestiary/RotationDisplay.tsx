interface RotationAction {
  round: number;
  actionName: string;
  targetMode: string;
  isTelegraphed?: boolean;
}

interface RotationDisplayProps {
  rotation: RotationAction[];
  title?: string;
}

export function RotationDisplay({ rotation, title = 'Rotation' }: RotationDisplayProps) {
  return (
    <div className="mb-3">
      <h4 className="text-sm font-semibold text-[var(--rpg-text-primary)] mb-1">{title}</h4>
      <div className="space-y-1">
        {rotation.map(a => (
          <div key={a.round} className="flex items-center gap-2 text-xs">
            <span className="text-[var(--rpg-text-secondary)] w-8">R{a.round}</span>
            <span className={a.isTelegraphed ? 'text-[var(--rpg-red)] font-bold' : 'text-[var(--rpg-text-primary)]'}>
              {a.actionName}
            </span>
            <span className="text-[var(--rpg-text-secondary)]">
              ({a.targetMode === 'aoe' ? 'AoE' : 'Single'})
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
