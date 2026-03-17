'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { ModalOverlay } from '../common/ModalOverlay';
import { ConfirmModal } from '../common/ConfirmModal';
import { RARITY_COLORS, type Rarity } from '@/lib/rarity';
import { getFriendProfile, unfriend, blockPlayer } from '@/lib/api';
import { SPAR_CONSTANTS } from '@pocketrealm/shared';
import type { FriendProfile, FriendEquipmentSlot } from '@pocketrealm/shared';

interface FriendProfileModalProps {
  friendshipId: string;
  onClose: () => void;
  onSpar: (friendshipId: string) => void;
  onSendMail: (recipientId: string, recipientName: string) => void;
  onUnfriend: () => void;
  onBlock: () => void;
}

const SLOT_LABELS: Record<string, string> = {
  head: 'Head',
  neck: 'Neck',
  chest: 'Chest',
  gloves: 'Gloves',
  belt: 'Belt',
  legs: 'Legs',
  boots: 'Boots',
  main_hand: 'Main Hand',
  off_hand: 'Off Hand',
  ring: 'Ring',
  charm: 'Charm',
};

function formatSlotName(slot: string): string {
  return SLOT_LABELS[slot] ?? slot.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function EquipmentSlotRow({ slot }: { slot: FriendEquipmentSlot }) {
  return (
    <div className="flex justify-between items-center py-1">
      <span className="text-[var(--rpg-text-secondary)]">{formatSlotName(slot.slot)}</span>
      {slot.itemName && slot.rarity ? (
        <span style={{ color: RARITY_COLORS[slot.rarity as Rarity] ?? RARITY_COLORS.common }}>
          {slot.itemName}
        </span>
      ) : (
        <span className="text-[var(--rpg-text-secondary)] italic">Empty</span>
      )}
    </div>
  );
}

export function FriendProfileModal({
  friendshipId,
  onClose,
  onSpar,
  onSendMail,
  onUnfriend,
  onBlock,
}: FriendProfileModalProps) {
  const [profile, setProfile] = useState<FriendProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<'unfriend' | 'block' | null>(null);
  const action = useAsyncAction();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    getFriendProfile(friendshipId)
      .then((res) => {
        if (cancelled) return;
        if (res.data) {
          setProfile(res.data.profile);
        } else {
          setError(res.error?.message ?? 'Failed to load profile');
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load profile');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [friendshipId]);

  const handleConfirmAction = useCallback(() => {
    if (!confirmAction || !profile) return;
    const doAction = confirmAction === 'unfriend'
      ? () => unfriend(friendshipId)
      : () => blockPlayer(profile.playerId);
    action.run(doAction, (data) => {
      if (data) {
        confirmAction === 'unfriend' ? onUnfriend() : onBlock();
      }
      setConfirmAction(null);
    });
  }, [confirmAction, profile, friendshipId, onUnfriend, onBlock, action.run]);

  // Confirm dialog for unfriend / block
  if (confirmAction && profile) {
    const isUnfriend = confirmAction === 'unfriend';
    return (
      <ConfirmModal
        title={isUnfriend ? 'Remove Friend' : 'Block Player'}
        message={
          isUnfriend
            ? `Are you sure you want to remove ${profile.username} from your friends list?`
            : `Are you sure you want to block ${profile.username}? This will also remove them from your friends list.`
        }
        confirmLabel={isUnfriend ? 'Unfriend' : 'Block'}
        variant="danger"
        onConfirm={handleConfirmAction}
        onCancel={() => setConfirmAction(null)}
      />
    );
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-[var(--rpg-surface)] border border-[var(--rpg-gold)] rounded-lg p-6 max-w-md w-full mx-4 max-h-[80vh] flex flex-col relative">
        {/* Close button */}
        <button
          className="absolute top-3 right-3 text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)] transition-colors text-xl leading-none"
          onClick={onClose}
          aria-label="Close"
        >
          &times;
        </button>

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <span className="text-[var(--rpg-text-secondary)]">Loading profile...</span>
          </div>
        )}

        {/* Error state */}
        {(error || action.error) && !loading && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <span className="text-[var(--rpg-red)] text-sm">{error || action.error}</span>
          </div>
        )}

        {/* Profile content */}
        {profile && !loading && !error && (
          <>
            {/* Header */}
            <div className="mb-4 pr-6">
              <h2 className="font-almendra text-xl text-[var(--rpg-gold)]">{profile.username}</h2>
              <div className="flex items-center gap-3 mt-1">
                <span className="flex items-center gap-1.5 text-sm">
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${
                      profile.isOnline ? 'bg-green-500' : 'bg-gray-500'
                    }`}
                  />
                  <span className="text-[var(--rpg-text-secondary)]">
                    {profile.isOnline ? 'Online' : 'Offline'}
                  </span>
                </span>
                <span className="text-sm text-[var(--rpg-text-secondary)]">
                  Level {profile.characterLevel}
                </span>
              </div>
            </div>

            {/* Equipment */}
            <div className="mb-4 overflow-y-auto flex-1">
              <h3 className="text-sm font-semibold text-[var(--rpg-text-primary)] mb-2">Equipment</h3>
              <div className="text-sm space-y-0.5">
                {profile.equipment.map((slot) => (
                  <EquipmentSlotRow key={slot.slot} slot={slot} />
                ))}
              </div>
            </div>

            {/* Action buttons */}
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--rpg-border)]">
              <button
                className="w-full bg-[var(--rpg-gold)] hover:bg-[#e4b85b] text-[var(--rpg-background)] rounded-lg font-semibold py-2 text-sm transition-all"
                onClick={() => onSpar(friendshipId)}
              >
                Spar ({SPAR_CONSTANTS.TURN_COST} turns)
              </button>
              <button
                className="w-full bg-[var(--rpg-blue-light,#5aaad4)] hover:bg-[#4899c3] text-[var(--rpg-background)] rounded-lg font-semibold py-2 text-sm transition-all"
                onClick={() => onSendMail(profile.playerId, profile.username)}
              >
                Send Mail
              </button>
              <button
                className="w-full bg-[var(--rpg-red,#c44)] hover:bg-[#b33] text-white rounded-lg font-semibold py-2 text-sm transition-all"
                onClick={() => setConfirmAction('unfriend')}
                disabled={action.loading}
              >
                Unfriend
              </button>
              <button
                className="w-full bg-[var(--rpg-red,#c44)] hover:bg-[#b33] text-white rounded-lg font-semibold py-2 text-sm transition-all"
                onClick={() => setConfirmAction('block')}
                disabled={action.loading}
              >
                Block
              </button>
            </div>
          </>
        )}
      </div>
    </ModalOverlay>
  );
}
