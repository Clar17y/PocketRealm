'use client';

import { PixelCard } from '@/components/PixelCard';
import { Slider } from '@/components/ui/Slider';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import type { ConfirmRarity } from '@/lib/rarity';
import { ScreenContainer } from '../common/ScreenContainer';

interface SettingsProps {
  username: string | undefined;

  // Combat
  combatLogSpeedMs: number;
  onCombatLogSpeedChange: (value: number) => void;
  onCombatLogSpeedCommit: (value: number) => void;
  autoSkipKnownCombat: boolean;
  onAutoSkipKnownCombatChange: (value: boolean) => void;
  autoPotionThreshold: number;
  onAutoPotionThresholdChange: (value: number) => void;
  onAutoPotionThresholdCommit: (value: number) => void;
  lowHpWarning: boolean;
  onLowHpWarningChange: (value: boolean) => void;

  // Exploration
  explorationSpeedMs: number;
  onExplorationSpeedChange: (value: number) => void;
  onExplorationSpeedCommit: (value: number) => void;
  defaultExploreTurns: number;
  onDefaultExploreTurnsChange: (value: number) => void;
  onDefaultExploreTurnsCommit: (value: number) => void;

  // Recovery
  quickRestHealPercent: number;
  onQuickRestHealPercentChange: (value: number) => void;

  // Crafting
  defaultRefiningMax: boolean;
  onDefaultRefiningMaxChange: (value: boolean) => void;

  // Inventory
  confirmRarity: ConfirmRarity;
  onConfirmRarityChange: (value: ConfirmRarity) => void;
  lootRevealRarity: ConfirmRarity;
  onLootRevealRarityChange: (value: ConfirmRarity) => void;

  // Account
  onLogout: () => void;
}

const speedLabel = (ms: number) =>
  ms <= 100 ? 'Very Fast' : ms <= 300 ? 'Fast' : ms <= 500 ? 'Normal' : ms <= 700 ? 'Slow' : 'Very Slow';

export function Settings({
  username,
  combatLogSpeedMs,
  onCombatLogSpeedChange,
  onCombatLogSpeedCommit,
  autoSkipKnownCombat,
  onAutoSkipKnownCombatChange,
  autoPotionThreshold,
  onAutoPotionThresholdChange,
  onAutoPotionThresholdCommit,
  lowHpWarning,
  onLowHpWarningChange,
  explorationSpeedMs,
  onExplorationSpeedChange,
  onExplorationSpeedCommit,
  defaultExploreTurns,
  onDefaultExploreTurnsChange,
  onDefaultExploreTurnsCommit,
  quickRestHealPercent,
  onQuickRestHealPercentChange,
  defaultRefiningMax,
  onDefaultRefiningMaxChange,
  confirmRarity,
  onConfirmRarityChange,
  lootRevealRarity,
  onLootRevealRarityChange,
  onLogout,
}: SettingsProps) {
  return (
    <ScreenContainer>
      <h2 className="text-xl font-bold font-almendra text-[var(--rpg-text-primary)]">Settings</h2>
      <p className="text-[var(--rpg-text-secondary)]">Username: {username}</p>

      {/* Combat */}
      <PixelCard>
        <h3 className="text-sm font-bold text-[var(--rpg-text-primary)] mb-3">Combat</h3>

        <div className="space-y-4">
          <div>
            <p className="text-xs text-[var(--rpg-text-secondary)] mb-1">Combat Log Speed</p>
            <div className="flex items-center gap-3">
              <Slider min={100} max={1000} step={100}
                value={[combatLogSpeedMs]}
                onValueChange={(val) => onCombatLogSpeedChange(val[0])}
                onValueCommit={(val) => onCombatLogSpeedCommit(val[0])}
              />
              <span className="text-[8px] font-pixel text-[var(--rpg-text-primary)] w-20 text-right shrink-0">
                {speedLabel(combatLogSpeedMs)}
              </span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-[var(--rpg-text-secondary)]">Auto-Skip Known Combat</p>
                <p className="text-xs text-[var(--rpg-text-secondary)] opacity-60">Skip playback for mob+prefix combos you&apos;ve killed before</p>
              </div>
              <ToggleSwitch checked={autoSkipKnownCombat} onChange={onAutoSkipKnownCombatChange} />
            </div>
          </div>

          <div>
            <p className="text-xs text-[var(--rpg-text-secondary)] mb-1">Auto-Potion Threshold</p>
            <p className="text-xs text-[var(--rpg-text-secondary)] opacity-60 mb-2">
              Drink a health potion when HP drops below this threshold during combat.
            </p>
            <div className="flex items-center gap-3">
              <Slider min={0} max={100} step={5}
                value={[autoPotionThreshold]}
                onValueChange={(val) => onAutoPotionThresholdChange(val[0])}
                onValueCommit={(val) => onAutoPotionThresholdCommit(val[0])}
              />
              <span className="text-[16px] font-pixel text-[var(--rpg-text-primary)] w-16 text-right shrink-0">
                {autoPotionThreshold === 0 ? 'Off' : `${autoPotionThreshold}%`}
              </span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-[var(--rpg-text-secondary)]">Low HP Warning</p>
                <p className="text-xs text-[var(--rpg-text-secondary)] opacity-60">Show confirmation when starting actions below 25% HP</p>
              </div>
              <ToggleSwitch checked={lowHpWarning} onChange={onLowHpWarningChange} />
            </div>
          </div>
        </div>
      </PixelCard>

      {/* Exploration */}
      <PixelCard>
        <h3 className="text-sm font-bold text-[var(--rpg-text-primary)] mb-3">Exploration</h3>

        <div className="space-y-4">
          <div>
            <p className="text-xs text-[var(--rpg-text-secondary)] mb-1">Exploration Playback Speed</p>
            <div className="flex items-center gap-3">
              <Slider min={100} max={1000} step={100}
                value={[explorationSpeedMs]}
                onValueChange={(val) => onExplorationSpeedChange(val[0])}
                onValueCommit={(val) => onExplorationSpeedCommit(val[0])}
              />
              <span className="text-[8px] font-pixel text-[var(--rpg-text-primary)] w-20 text-right shrink-0">
                {speedLabel(explorationSpeedMs)}
              </span>
            </div>
          </div>

          <div>
            <p className="text-xs text-[var(--rpg-text-secondary)] mb-1">Default Explore Turns</p>
            <div className="flex items-center gap-3">
              <Slider min={10} max={10000} step={10}
                value={[defaultExploreTurns]}
                onValueChange={(val) => onDefaultExploreTurnsChange(val[0])}
                onValueCommit={(val) => onDefaultExploreTurnsCommit(val[0])}
              />
              <span className="text-[16px] font-pixel text-[var(--rpg-text-primary)] w-16 text-right shrink-0">
                {defaultExploreTurns.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </PixelCard>

      {/* Recovery */}
      <PixelCard>
        <h3 className="text-sm font-bold text-[var(--rpg-text-primary)] mb-3">Recovery</h3>
        <p className="text-xs text-[var(--rpg-text-secondary)] mb-2">Quick-Rest Heal Target</p>
        <p className="text-xs text-[var(--rpg-text-secondary)] opacity-60 mb-2">
          Used by the Quick Rest button on the dashboard.
        </p>
        <div className="flex gap-2">
          {[25, 50, 75, 100].map((pct) => (
            <button
              key={pct}
              onClick={() => onQuickRestHealPercentChange(pct)}
              className={`flex-1 py-1.5 rounded text-xs font-bold transition-colors ${
                quickRestHealPercent === pct
                  ? 'bg-[var(--rpg-green-light)] text-black'
                  : 'bg-[var(--rpg-background)] text-[var(--rpg-text-secondary)] hover:bg-[var(--rpg-border)]'
              }`}
            >
              {pct}%
            </button>
          ))}
        </div>
      </PixelCard>

      {/* Crafting */}
      <PixelCard>
        <h3 className="text-sm font-bold text-[var(--rpg-text-primary)] mb-3">Crafting</h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-[var(--rpg-text-secondary)]">Default Refining to Max</p>
            <p className="text-xs text-[var(--rpg-text-secondary)] opacity-60">Auto-set refining quantity to maximum when selecting a recipe</p>
          </div>
          <ToggleSwitch checked={defaultRefiningMax} onChange={onDefaultRefiningMaxChange} />
        </div>
      </PixelCard>

      {/* Inventory */}
      <PixelCard>
        <h3 className="text-sm font-bold text-[var(--rpg-text-primary)] mb-3">Inventory</h3>
        <div>
          <p className="text-xs text-[var(--rpg-text-secondary)] mb-1">Confirm Before Drop / Salvage / Sell</p>
          <p className="text-xs text-[var(--rpg-text-secondary)] opacity-60 mb-2">
            Show a confirmation dialog when destroying items at or above this rarity.
          </p>
          <div className="flex gap-2">
            {(['none', 'common', 'uncommon', 'rare', 'epic', 'legendary'] as const).map((r) => (
              <button
                key={r}
                onClick={() => onConfirmRarityChange(r)}
                className={`flex-1 py-1.5 rounded text-xs font-bold transition-colors capitalize ${
                  confirmRarity === r
                    ? 'bg-[var(--rpg-gold)] text-black'
                    : 'bg-[var(--rpg-background)] text-[var(--rpg-text-secondary)] hover:bg-[var(--rpg-border)]'
                }`}
              >
                {r === 'none' ? 'Off' : r}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <p className="text-xs text-[var(--rpg-text-secondary)] mb-1">Loot Reveal Popup</p>
          <p className="text-xs text-[var(--rpg-text-secondary)] opacity-60 mb-2">
            Show an animated popup when items at or above this rarity are added to your backpack.
          </p>
          <div className="flex gap-2">
            {(['none', 'common', 'uncommon', 'rare', 'epic', 'legendary'] as const).map((r) => (
              <button
                key={r}
                onClick={() => onLootRevealRarityChange(r)}
                className={`flex-1 py-1.5 rounded text-xs font-bold transition-colors capitalize ${
                  lootRevealRarity === r
                    ? 'bg-[var(--rpg-gold)] text-black'
                    : 'bg-[var(--rpg-background)] text-[var(--rpg-text-secondary)] hover:bg-[var(--rpg-border)]'
                }`}
              >
                {r === 'none' ? 'Off' : r}
              </button>
            ))}
          </div>
        </div>
      </PixelCard>

      {/* Account */}
      <button
        onClick={onLogout}
        className="w-full px-4 py-2 bg-[var(--rpg-red)] rounded text-white"
      >
        Logout
      </button>
    </ScreenContainer>
  );
}
