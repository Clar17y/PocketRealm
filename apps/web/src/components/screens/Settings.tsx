'use client';

import { useEffect, useState } from 'react';
import { PixelCard } from '@/components/PixelCard';
import { Slider } from '@/components/ui/Slider';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { changeEmail, changePassword, resendVerification, type CharacterSummary, type SeasonArchiveSummary } from '@/lib/api';
import type { ConfirmRarity } from '@/lib/rarity';
import { PRESEASON_REALM_LABEL } from '@/lib/realmLabels';
import { DISCORD_INVITE_URL, KNOWN_ISSUES_URL } from '@/lib/supportLinks';
import { EXPLORATION_CONSTANTS } from '@pocketrealm/shared';
import { RaritySelector } from '../common/RaritySelector';
import { ScreenContainer } from '../common/ScreenContainer';
import { HelpSupportCard } from '@/components/support/HelpSupportCard';
import { SupportPocketrealmCard } from './SupportPocketrealmCard';

export interface NotificationPrefs {
  notifyPvpAttack: boolean;
  notifyPvpScout: boolean;
  notifyBossAppeared: boolean;
  notifyBossKilled: boolean;
  notifyTurnBankFull: boolean;
  notifyExpeditionStarted: boolean;
  notifyExpeditionFinished: boolean;
}

const NOTIFICATION_LABELS: { key: keyof NotificationPrefs; label: string }[] = [
  { key: 'notifyPvpAttack', label: 'PvP attacks' },
  { key: 'notifyPvpScout', label: 'PvP scouts' },
  { key: 'notifyBossAppeared', label: 'Boss appeared' },
  { key: 'notifyBossKilled', label: 'Boss defeated' },
  { key: 'notifyTurnBankFull', label: 'Turn bank full' },
  { key: 'notifyExpeditionStarted', label: 'Expedition recruiting' },
  { key: 'notifyExpeditionFinished', label: 'Expedition finished' },
];

interface SettingsProps {
  username: string | undefined;
  email: string;
  emailVerified: boolean;
  isPremium: boolean;
  premiumExpiresAt: string | null;
  seasonArchives: SeasonArchiveSummary[];
  realmLabel: string;
  realmEndsAt: string | Date | null;
  activePlayerId: string | null;
  characters: CharacterSummary[];
  switchingPlayerId: string | null;
  onSwitchPlayer?: (playerId: string) => void;
  onAccountRefresh: () => Promise<void>;
  onForceRelogin: () => void;

  // Combat
  combatLogSpeedMs: number;
  onCombatLogSpeedChange: (value: number) => void;
  onCombatLogSpeedCommit: (value: number) => void;
  autoSkipKnownCombat: boolean;
  onAutoSkipKnownCombatChange: (value: boolean) => void;
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
  forgeConfirmRarity: ConfirmRarity;
  onForgeConfirmRarityChange: (value: ConfirmRarity) => void;

  // Inventory
  confirmRarity: ConfirmRarity;
  onConfirmRarityChange: (value: ConfirmRarity) => void;
  lootRevealRarity: ConfirmRarity;
  onLootRevealRarityChange: (value: ConfirmRarity) => void;

  // Lore & Flavour
  showNpcDialogue: boolean;
  onShowNpcDialogueChange: (value: boolean) => void;
  showItemFlavourText: boolean;
  onShowItemFlavourTextChange: (value: boolean) => void;
  showBestiaryLore: boolean;
  onShowBestiaryLoreChange: (value: boolean) => void;

  // Notifications
  pushState: 'loading' | 'unsupported' | 'denied' | 'subscribed' | 'unsubscribed';
  onPushToggle: () => void;
  notificationPrefs: NotificationPrefs;
  onNotificationPrefChange: (key: keyof NotificationPrefs, value: boolean) => void;

  // Account
  onLogout?: () => void;
  onReportBug?: () => void;
}

const speedLabel = (ms: number) =>
  ms <= 100 ? 'Very Fast' : ms <= 300 ? 'Fast' : ms <= 500 ? 'Normal' : ms <= 700 ? 'Slow' : 'Very Slow';

const tabButtonClassName = (active: boolean) =>
  `rounded border px-3 py-1.5 text-xs font-bold transition-colors ${
    active
      ? 'border-[var(--rpg-gold)] bg-[var(--rpg-gold)] text-black'
      : 'border-[var(--rpg-border)] bg-[var(--rpg-surface)] text-[var(--rpg-text-secondary)] hover:bg-[var(--rpg-border)]'
  }`;

const inputClassName =
  'mt-1 w-full rounded border border-[var(--rpg-border)] bg-[var(--rpg-background)] px-3 py-2 text-sm text-[var(--rpg-text-primary)] outline-none focus:border-[var(--rpg-gold)]';

const primaryButtonClassName =
  'rounded bg-[var(--rpg-gold)] px-4 py-2 text-xs font-bold text-black transition-colors hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60';

const secondaryButtonClassName =
  'rounded border border-[var(--rpg-border)] bg-[var(--rpg-surface)] px-4 py-2 text-xs font-bold text-[var(--rpg-text-primary)] transition-colors hover:bg-[var(--rpg-border)] disabled:cursor-not-allowed disabled:opacity-60';

const realmSectionButtonClassName =
  'w-full rounded border border-[var(--rpg-border)] bg-[var(--rpg-background)] px-3 py-3 text-left text-sm text-[var(--rpg-text-primary)] transition-colors hover:border-[var(--rpg-gold)] hover:bg-[var(--rpg-surface)] disabled:cursor-not-allowed disabled:opacity-60';

function countEntries(value: unknown): number {
  if (Array.isArray(value)) {
    return value.length;
  }
  if (value && typeof value === 'object') {
    return Object.keys(value).length;
  }
  return 0;
}

function formatRealmEndsAt(value: string | Date | null): string | null {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function Settings({
  username,
  email,
  emailVerified,
  isPremium,
  premiumExpiresAt,
  seasonArchives,
  realmLabel,
  realmEndsAt,
  activePlayerId,
  characters,
  switchingPlayerId,
  onSwitchPlayer,
  onAccountRefresh,
  onForceRelogin,
  combatLogSpeedMs,
  onCombatLogSpeedChange,
  onCombatLogSpeedCommit,
  autoSkipKnownCombat,
  onAutoSkipKnownCombatChange,
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
  forgeConfirmRarity,
  onForgeConfirmRarityChange,
  confirmRarity,
  onConfirmRarityChange,
  lootRevealRarity,
  onLootRevealRarityChange,
  showNpcDialogue,
  onShowNpcDialogueChange,
  showItemFlavourText,
  onShowItemFlavourTextChange,
  showBestiaryLore,
  onShowBestiaryLoreChange,
  pushState,
  onPushToggle,
  notificationPrefs,
  onNotificationPrefChange,
  onLogout,
  onReportBug,
}: SettingsProps) {
  const [activeTab, setActiveTab] = useState<'account' | 'game'>('account');
  const [isRealmSwitcherOpen, setIsRealmSwitcherOpen] = useState(false);
  const [emailForm, setEmailForm] = useState({ email, password: '' });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [accountMessage, setAccountMessage] = useState<string | null>(null);
  const [accountBusy, setAccountBusy] = useState<'email' | 'password' | 'verify' | null>(null);
  const hasRealmSwitcher = characters.length > 1 && Boolean(onSwitchPlayer);
  const currentRealmEndsAt = formatRealmEndsAt(realmEndsAt);
  const isRealmSwitching = switchingPlayerId !== null;

  useEffect(() => {
    setEmailForm((prev) => ({ ...prev, email }));
  }, [email]);

  const clearAccountFeedback = () => {
    setAccountError(null);
    setAccountMessage(null);
  };

  const handleResendVerification = async () => {
    setAccountBusy('verify');
    clearAccountFeedback();

    const res = await resendVerification();

    setAccountBusy(null);
    if (!res.data) {
      setAccountError(res.error?.message ?? 'Failed to resend verification email.');
      return;
    }

    setAccountMessage(res.data.message);
  };

  const handleSubmitEmail = async () => {
    clearAccountFeedback();
    if (emailForm.email.trim().toLowerCase() === email.trim().toLowerCase()) {
      setAccountError('Enter a different email address to update.');
      return;
    }
    setAccountBusy('email');

    const res = await changeEmail(emailForm.email, emailForm.password);

    if (!res.data) {
      setAccountBusy(null);
      setAccountError(res.error?.message ?? 'Failed to update email.');
      return;
    }

    setAccountMessage(res.data.message);
    setEmailForm((prev) => ({ ...prev, password: '' }));
    try {
      await onAccountRefresh();
    } catch {
      setAccountMessage(null);
      setAccountError('Email updated, but failed to refresh account.');
    } finally {
      setAccountBusy(null);
    }
  };

  const handleSubmitPassword = async () => {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('New password confirmation does not match.');
      clearAccountFeedback();
      return;
    }

    setPasswordError(null);
    setAccountBusy('password');
    clearAccountFeedback();

    const res = await changePassword(passwordForm.currentPassword, passwordForm.newPassword);

    setAccountBusy(null);
    if (!res.data) {
      setAccountError(res.error?.message ?? 'Failed to update password.');
      return;
    }

    setPasswordForm({
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    });
    onForceRelogin();
  };

  const renderCharacterRealm = (character: CharacterSummary) => {
    const nextRealmLabel = character.seasonName ?? PRESEASON_REALM_LABEL;
    const isActiveCharacter = character.id === activePlayerId;
    const rowLabel = `${character.username} · ${nextRealmLabel} · Level ${character.characterLevel}`;

    return (
      <button
        key={character.id}
        type="button"
        disabled={isRealmSwitching || isActiveCharacter}
        aria-label={rowLabel}
        onClick={() => {
          if (!isActiveCharacter) {
            setIsRealmSwitcherOpen(false);
            onSwitchPlayer?.(character.id);
          }
        }}
        className={realmSectionButtonClassName}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-bold text-[var(--rpg-text-primary)]">{character.username}</p>
            <p className="text-xs text-[var(--rpg-text-secondary)]">
              {nextRealmLabel} · Level {character.characterLevel}
            </p>
          </div>
          <span className="shrink-0 text-[10px] font-pixel uppercase tracking-wide text-[var(--rpg-gold)]">
            {isActiveCharacter ? 'Current' : isRealmSwitching ? 'Switching' : 'Switch'}
          </span>
        </div>
      </button>
    );
  };

  return (
    <ScreenContainer>
      <h2 className="text-xl font-bold font-almendra text-[var(--rpg-text-primary)]">Settings</h2>
      <PixelCard className="space-y-3">
        <div className="space-y-1">
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--rpg-text-secondary)]">Username</p>
          <p className="text-sm font-bold text-[var(--rpg-text-primary)]">{username}</p>
        </div>
        <div className="space-y-3 border-t border-[var(--rpg-border)] pt-3">
          <div className="space-y-1 text-sm text-[var(--rpg-text-secondary)]">
            <p className="text-xs font-bold uppercase tracking-wide">Current Realm</p>
            {hasRealmSwitcher ? (
              <button
                type="button"
                aria-label={`Current Realm: ${realmLabel}`}
                aria-expanded={isRealmSwitcherOpen}
                aria-controls="settings-realm-switcher"
                onClick={() => setIsRealmSwitcherOpen((open) => !open)}
                className={realmSectionButtonClassName}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-bold text-[var(--rpg-text-primary)]">{realmLabel}</p>
                    {currentRealmEndsAt && (
                      <p className="text-xs text-[var(--rpg-text-secondary)]">Ends {currentRealmEndsAt}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-[10px] font-pixel uppercase tracking-wide text-[var(--rpg-gold)]">
                    Switch
                  </span>
                </div>
              </button>
            ) : (
              <div className="rounded border border-[var(--rpg-border)] bg-[var(--rpg-background)] px-3 py-3">
                <p className="font-bold text-[var(--rpg-text-primary)]">{realmLabel}</p>
                {currentRealmEndsAt && (
                  <p className="text-xs text-[var(--rpg-text-secondary)]">Ends {currentRealmEndsAt}</p>
                )}
              </div>
            )}
          </div>
          {hasRealmSwitcher && isRealmSwitcherOpen && (
            <div id="settings-realm-switcher" className="space-y-2">
              {characters.map((character) => renderCharacterRealm(character))}
            </div>
          )}
        </div>
      </PixelCard>

      <div role="tablist" aria-label="Settings sections" className="flex gap-2">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'account'}
          className={tabButtonClassName(activeTab === 'account')}
          onClick={() => setActiveTab('account')}
        >
          Account
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'game'}
          className={tabButtonClassName(activeTab === 'game')}
          onClick={() => setActiveTab('game')}
        >
          Game
        </button>
      </div>

      {activeTab === 'account' && (
        <div className="space-y-4">
          {onReportBug && (
            <HelpSupportCard
              discordUrl={DISCORD_INVITE_URL}
              knownIssuesUrl={KNOWN_ISSUES_URL}
              onReportBug={onReportBug}
            />
          )}

          <PixelCard>
            <h3 className="mb-3 text-sm font-bold text-[var(--rpg-text-primary)]">Account</h3>
            <div className="space-y-2 text-sm text-[var(--rpg-text-secondary)]">
              <p>Current email</p>
              <p className="font-bold text-[var(--rpg-text-primary)]">{email}</p>
              <p>{emailVerified ? 'Email verified' : 'Email not verified'}</p>
            </div>

            {!emailVerified && (
              <button
                type="button"
                onClick={() => void handleResendVerification()}
                disabled={accountBusy !== null}
                className={`mt-4 ${secondaryButtonClassName}`}
              >
                Resend verification
              </button>
            )}

            {accountError && (
              <p className="mt-3 text-xs font-bold text-[var(--rpg-red)]">{accountError}</p>
            )}
            {accountMessage && (
              <p className="mt-3 text-xs font-bold text-[var(--rpg-green-light)]">{accountMessage}</p>
            )}
          </PixelCard>

          <PixelCard>
            <h3 className="mb-3 text-sm font-bold text-[var(--rpg-text-primary)]">Change email</h3>
            <div className="space-y-3">
              <label className="block text-xs text-[var(--rpg-text-secondary)]" htmlFor="settings-new-email">
                New email
              </label>
              <input
                id="settings-new-email"
                type="email"
                value={emailForm.email}
                onChange={(event) => setEmailForm((prev) => ({ ...prev, email: event.target.value }))}
                className={inputClassName}
              />

              <label className="block text-xs text-[var(--rpg-text-secondary)]" htmlFor="settings-email-password">
                Current password for email change
              </label>
              <input
                id="settings-email-password"
                type="password"
                value={emailForm.password}
                onChange={(event) => setEmailForm((prev) => ({ ...prev, password: event.target.value }))}
                className={inputClassName}
              />

              <button
                type="button"
                onClick={() => void handleSubmitEmail()}
                disabled={accountBusy !== null}
                className={primaryButtonClassName}
              >
                Update email
              </button>
            </div>
          </PixelCard>

          <PixelCard>
            <h3 className="mb-3 text-sm font-bold text-[var(--rpg-text-primary)]">Change password</h3>
            <div className="space-y-3">
              <label className="block text-xs text-[var(--rpg-text-secondary)]" htmlFor="settings-current-password">
                Current password
              </label>
              <input
                id="settings-current-password"
                type="password"
                value={passwordForm.currentPassword}
                onChange={(event) => setPasswordForm((prev) => ({ ...prev, currentPassword: event.target.value }))}
                className={inputClassName}
              />

              <label className="block text-xs text-[var(--rpg-text-secondary)]" htmlFor="settings-new-password">
                New password
              </label>
              <input
                id="settings-new-password"
                type="password"
                value={passwordForm.newPassword}
                onChange={(event) => {
                  setPasswordError(null);
                  setPasswordForm((prev) => ({ ...prev, newPassword: event.target.value }));
                }}
                className={inputClassName}
              />

              <label className="block text-xs text-[var(--rpg-text-secondary)]" htmlFor="settings-confirm-password">
                Confirm new password
              </label>
              <input
                id="settings-confirm-password"
                type="password"
                value={passwordForm.confirmPassword}
                aria-invalid={Boolean(passwordError)}
                aria-describedby={passwordError ? 'settings-confirm-password-error' : undefined}
                onChange={(event) => {
                  setPasswordError(null);
                  setPasswordForm((prev) => ({ ...prev, confirmPassword: event.target.value }));
                }}
                className={inputClassName}
              />

              {passwordError && (
                <p id="settings-confirm-password-error" className="text-xs font-bold text-[var(--rpg-red)]">
                  {passwordError}
                </p>
              )}

              <button
                type="button"
                onClick={() => void handleSubmitPassword()}
                disabled={accountBusy !== null}
                className={primaryButtonClassName}
              >
                Update password
              </button>
            </div>
          </PixelCard>

          <SupportPocketrealmCard
            initialIsPremium={isPremium}
            initialPremiumExpiresAt={premiumExpiresAt}
          />

          <PixelCard>
            <h3 className="mb-3 text-sm font-bold text-[var(--rpg-text-primary)]">Season Archives</h3>
            {seasonArchives.length === 0 ? (
              <p className="text-sm text-[var(--rpg-text-secondary)]">No past seasons yet.</p>
            ) : (
              <div className="space-y-3">
                {seasonArchives.map((archive) => {
                  const rewardCount = countEntries(archive.rewardsEarned);
                  const rankCount = countEntries(archive.leaderboardRanks);

                  return (
                    <div
                      key={archive.id}
                      className="rounded border border-[var(--rpg-border)] bg-[var(--rpg-background)] px-3 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-[var(--rpg-text-primary)]">
                            {archive.season.name}
                          </p>
                          <p className="text-xs text-[var(--rpg-text-secondary)]">
                            {archive.username} · Level {archive.characterLevel}
                          </p>
                        </div>
                        <span className="text-[10px] font-pixel uppercase tracking-wide text-[var(--rpg-gold)]">
                          Archived
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--rpg-text-secondary)]">
                        <span className="rounded border border-[var(--rpg-border)] px-2 py-1">
                          {rewardCount} rewards
                        </span>
                        <span className="rounded border border-[var(--rpg-border)] px-2 py-1">
                          {rankCount} tracked ranks
                        </span>
                        <span className="rounded border border-[var(--rpg-border)] px-2 py-1">
                          {archive.characterXp.toLocaleString()} XP
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </PixelCard>

          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="w-full rounded bg-[var(--rpg-red)] px-4 py-2 text-white"
            >
              Logout
            </button>
          )}
        </div>
      )}

      {activeTab === 'game' && (
        <div className="space-y-4">
          <PixelCard>
            <h3 className="text-sm font-bold text-[var(--rpg-text-primary)] mb-3">Combat</h3>

            <div className="space-y-4">
              <div>
                <p className="text-xs text-[var(--rpg-text-secondary)] mb-1">Combat Log Speed</p>
                <div className="flex items-center gap-3">
                  <Slider
                    min={100}
                    max={1000}
                    step={100}
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

          <PixelCard>
            <h3 className="text-sm font-bold text-[var(--rpg-text-primary)] mb-3">Exploration</h3>

            <div className="space-y-4">
              <div>
                <p className="text-xs text-[var(--rpg-text-secondary)] mb-1">Exploration Playback Speed</p>
                <div className="flex items-center gap-3">
                  <Slider
                    min={100}
                    max={1000}
                    step={100}
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
                  <Slider
                    min={EXPLORATION_CONSTANTS.MIN_EXPLORATION_TURNS}
                    max={EXPLORATION_CONSTANTS.MAX_EXPLORATION_TURNS}
                    step={10}
                    value={[defaultExploreTurns]}
                    onValueChange={(val) => onDefaultExploreTurnsChange(val[0])}
                    onValueCommit={(val) => onDefaultExploreTurnsCommit(val[0])}
                  />
                  <span className="text-[12px] font-pixel text-[var(--rpg-text-primary)] w-16 text-right shrink-0">
                    {defaultExploreTurns.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </PixelCard>

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

          <PixelCard>
            <h3 className="text-sm font-bold text-[var(--rpg-text-primary)] mb-3">Crafting</h3>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-[var(--rpg-text-secondary)]">Default to Max Quantity</p>
                <p className="text-xs text-[var(--rpg-text-secondary)] opacity-60">Auto-set quantity to maximum when selecting a stackable recipe</p>
              </div>
              <ToggleSwitch checked={defaultRefiningMax} onChange={onDefaultRefiningMaxChange} />
            </div>

            <div className="mt-4">
              <RaritySelector
                label="Forge Destruction Confirmation"
                description="Show a confirmation dialog when forging items at or above this rarity."
                value={forgeConfirmRarity}
                onChange={onForgeConfirmRarityChange}
              />
            </div>
          </PixelCard>

          <PixelCard>
            <h3 className="text-sm font-bold text-[var(--rpg-text-primary)] mb-3">Inventory</h3>
            <RaritySelector
              label="Confirm Before Drop / Salvage / Sell"
              description="Show a confirmation dialog when destroying items at or above this rarity."
              value={confirmRarity}
              onChange={onConfirmRarityChange}
            />

            <div className="mt-4">
              <RaritySelector
                label="Loot Reveal Popup"
                description="Show an animated popup when items at or above this rarity are added to your backpack."
                value={lootRevealRarity}
                onChange={onLootRevealRarityChange}
              />
            </div>
          </PixelCard>

          <PixelCard>
            <h3 className="text-sm font-bold text-[var(--rpg-text-primary)] mb-3">Lore & Flavour</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-[var(--rpg-text-secondary)]">NPC Dialogue</p>
                  <p className="text-xs text-[var(--rpg-text-secondary)] opacity-60">Show NPC dialogue banners on crafting, gathering, and other screens</p>
                </div>
                <ToggleSwitch checked={showNpcDialogue} onChange={onShowNpcDialogueChange} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-[var(--rpg-text-secondary)]">Item Flavour Text</p>
                  <p className="text-xs text-[var(--rpg-text-secondary)] opacity-60">Show flavour text descriptions in your inventory</p>
                </div>
                <ToggleSwitch checked={showItemFlavourText} onChange={onShowItemFlavourTextChange} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-[var(--rpg-text-secondary)]">Bestiary Lore</p>
                  <p className="text-xs text-[var(--rpg-text-secondary)] opacity-60">Show appearance, behaviour, and lore sections in bestiary entries</p>
                </div>
                <ToggleSwitch checked={showBestiaryLore} onChange={onShowBestiaryLoreChange} />
              </div>
            </div>
          </PixelCard>

          {pushState !== 'unsupported' && (
            <PixelCard>
              <h3 className="text-sm font-bold text-[var(--rpg-text-primary)] mb-3">Notifications</h3>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-[var(--rpg-text-secondary)]">Push Notifications</p>
                  {pushState === 'denied' && (
                    <p className="text-xs text-[var(--rpg-red)] mt-0.5">Blocked in browser settings</p>
                  )}
                </div>
                <ToggleSwitch checked={pushState === 'subscribed'} onChange={onPushToggle} />
              </div>
              {pushState === 'subscribed' && (
                <div className="mt-3 space-y-2 border-t border-[var(--rpg-border)] pt-3">
                  {NOTIFICATION_LABELS.map(({ key, label }) => (
                    <label key={key} className="flex items-center justify-between cursor-pointer">
                      <span className="text-xs text-[var(--rpg-text-secondary)]">{label}</span>
                      <input
                        type="checkbox"
                        checked={notificationPrefs[key]}
                        onChange={(event) => onNotificationPrefChange(key, event.target.checked)}
                        className="accent-[var(--rpg-gold)] w-4 h-4"
                      />
                    </label>
                  ))}
                </div>
              )}
            </PixelCard>
          )}
        </div>
      )}
    </ScreenContainer>
  );
}
