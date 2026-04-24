import { useState } from 'react';
import type { StateUpdates } from '@pocketrealm/shared';
import { PixelCard } from '@/components/PixelCard';
import { PixelButton } from '@/components/PixelButton';
import {
  adminGrantTurns,
  adminSetLevel,
  adminGrantXp,
  adminSetAttributes,
  adminSetSkillLevel,
  adminSetSkillLevels,
  adminGrantTokens,
} from '@/lib/api';
import { StatusMsg } from './StatusMsg';
import { useAdminAction } from './useAdminAction';

const ADMIN_SKILLS = [
  'melee',
  'ranged',
  'magic',
  'mining',
  'foraging',
  'woodcutting',
  'refining',
  'tanning',
  'weaving',
  'weaponsmithing',
  'armorsmithing',
  'leatherworking',
  'tailoring',
  'alchemy',
  'jewelcrafting',
] as const;

export function PlayerTab({
  onStateUpdates,
  setTurns: setGameTurns,
}: {
  onStateUpdates: (updates: StateUpdates) => void;
  setTurns: (turns: number) => void;
}) {
  const [turns, setTurns] = useState(10000);
  const [tokens, setTokens] = useState(500);
  const [level, setLevel] = useState(10);
  const [xp, setXp] = useState(10000);
  const [attrPoints, setAttrPoints] = useState(10);
  const [attrs, setAttrs] = useState({
    vitality: 0,
    strength: 0,
    dexterity: 0,
    intelligence: 0,
    luck: 0,
    evasion: 0,
  });
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set());
  const [skillLevel, setSkillLevel] = useState(10);
  const { busy, msg, act } = useAdminAction();

  return (
    <div className="space-y-4">
      <PixelCard>
        <h3 className="text-sm font-semibold text-[var(--rpg-gold)] mb-3">Turns</h3>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={turns}
            onChange={(e) => setTurns(Number(e.target.value))}
            className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded px-2 py-1 text-sm w-32 text-[var(--rpg-text-primary)]"
          />
          <PixelButton
            size="sm"
            disabled={busy}
            onClick={async () => {
              const data = await act('Grant turns', () => adminGrantTurns(turns));
              if (data) setGameTurns(data.currentTurns);
            }}
          >
            Grant
          </PixelButton>
        </div>
      </PixelCard>

      <PixelCard>
        <h3 className="text-sm font-semibold text-[var(--rpg-gold)] mb-3">Quest Tokens</h3>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={tokens}
            onChange={(e) => setTokens(Number(e.target.value))}
            className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded px-2 py-1 text-sm w-32 text-[var(--rpg-text-primary)]"
          />
          <PixelButton size="sm" disabled={busy} onClick={() => act('Grant tokens', () => adminGrantTokens(tokens))}>
            Grant
          </PixelButton>
        </div>
      </PixelCard>

      <PixelCard>
        <h3 className="text-sm font-semibold text-[var(--rpg-gold)] mb-3">Character Level</h3>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={level}
            onChange={(e) => setLevel(Number(e.target.value))}
            min={1}
            max={100}
            className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded px-2 py-1 text-sm w-24 text-[var(--rpg-text-primary)]"
          />
          <PixelButton
            size="sm"
            disabled={busy}
            onClick={async () => {
              const data = await act('Set level', () => adminSetLevel(level), `Set character level to ${level}?`);
              if (data?.stateUpdates) onStateUpdates(data.stateUpdates);
            }}
          >
            Set Level
          </PixelButton>
        </div>
      </PixelCard>

      <PixelCard>
        <h3 className="text-sm font-semibold text-[var(--rpg-gold)] mb-3">Character XP</h3>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={xp}
            onChange={(e) => setXp(Number(e.target.value))}
            className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded px-2 py-1 text-sm w-32 text-[var(--rpg-text-primary)]"
          />
          <PixelButton
            size="sm"
            disabled={busy}
            onClick={async () => {
              const data = await act('Grant XP', () => adminGrantXp(xp));
              if (data?.stateUpdates) onStateUpdates(data.stateUpdates);
            }}
          >
            Grant XP
          </PixelButton>
        </div>
      </PixelCard>

      <PixelCard>
        <h3 className="text-sm font-semibold text-[var(--rpg-gold)] mb-3">Attribute Points</h3>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={attrPoints}
            onChange={(e) => setAttrPoints(Number(e.target.value))}
            min={0}
            className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded px-2 py-1 text-sm w-24 text-[var(--rpg-text-primary)]"
          />
          <PixelButton
            size="sm"
            disabled={busy}
            onClick={async () => {
              const data = await act('Set points', () => adminSetAttributes({ attributePoints: attrPoints }));
              if (data?.stateUpdates) onStateUpdates(data.stateUpdates);
            }}
          >
            Set Points
          </PixelButton>
        </div>
      </PixelCard>

      <PixelCard>
        <h3 className="text-sm font-semibold text-[var(--rpg-gold)] mb-3">Set Attributes</h3>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(attrs) as Array<keyof typeof attrs>).map((key) => (
            <div key={key} className="flex items-center gap-2">
              <label className="text-xs text-[var(--rpg-text-secondary)] w-20 capitalize">{key}</label>
              <input
                type="number"
                value={attrs[key]}
                min={0}
                onChange={(e) => setAttrs((prev) => ({ ...prev, [key]: Number(e.target.value) }))}
                className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded px-2 py-1 text-sm w-20 text-[var(--rpg-text-primary)]"
              />
            </div>
          ))}
        </div>
        <PixelButton
          size="sm"
          className="mt-3"
          disabled={busy}
          onClick={async () => {
            const data = await act(
              'Set attributes',
              () => adminSetAttributes({ attributes: attrs }),
              'Overwrite all attribute values?',
            );
            if (data?.stateUpdates) onStateUpdates(data.stateUpdates);
          }}
        >
          Set Attributes
        </PixelButton>
      </PixelCard>

      <PixelCard>
        <h3 className="text-sm font-semibold text-[var(--rpg-gold)] mb-3">Set Skill Levels</h3>
        <div className="grid grid-cols-3 gap-1 mb-3">
          {ADMIN_SKILLS.map((skill) => (
            <label key={skill} className="flex items-center gap-1.5 text-xs text-[var(--rpg-text-primary)] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={selectedSkills.has(skill)}
                onChange={(e) => setSelectedSkills((prev) => {
                  const next = new Set(prev);
                  if (e.target.checked) next.add(skill);
                  else next.delete(skill);
                  return next;
                })}
                className="accent-[var(--rpg-gold)]"
              />
              <span className="capitalize">{skill}</span>
            </label>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <PixelButton
            size="sm"
            variant="gold"
            onClick={() => {
              setSelectedSkills((prev) =>
                prev.size === ADMIN_SKILLS.length ? new Set() : new Set(ADMIN_SKILLS),
              );
            }}
          >
            {selectedSkills.size === ADMIN_SKILLS.length ? 'Deselect All' : 'Select All'}
          </PixelButton>
          <input
            type="number"
            value={skillLevel}
            min={1}
            max={100}
            onChange={(e) => setSkillLevel(Number(e.target.value))}
            className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded px-2 py-1 text-sm w-20 text-[var(--rpg-text-primary)]"
          />
          <PixelButton
            size="sm"
            disabled={busy || selectedSkills.size === 0}
            onClick={async () => {
              const skills = [...selectedSkills];
              const data = skills.length === 1
                ? await act(
                    `Set ${skills[0]} to ${skillLevel}`,
                    () => adminSetSkillLevel(skills[0], skillLevel),
                    `Set ${skills[0]} to level ${skillLevel}?`,
                  )
                : await act(
                    `Set ${skills.length} skills to ${skillLevel}`,
                    () => adminSetSkillLevels(skills, skillLevel),
                    `Set ${skills.length} skills to level ${skillLevel}?`,
                  );
              if (data?.stateUpdates) onStateUpdates(data.stateUpdates);
            }}
          >
            Set Level
          </PixelButton>
        </div>
      </PixelCard>

      <StatusMsg msg={msg} />
    </div>
  );
}
