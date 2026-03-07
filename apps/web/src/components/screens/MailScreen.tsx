'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  getFriendMailInbox,
  getFriendMailSent,
  readFriendMail,
  deleteFriendMail,
  sendFriendMail,
  getFriendsList,
} from '@/lib/api';
import { MAIL_CONSTANTS } from '@pocketrealm/shared';
import type { FriendMailEntry, FriendListEntry } from '@pocketrealm/shared';
import { relativeTime } from '@/lib/format';
import { ScreenContainer } from '../common/ScreenContainer';
import { PixelCard } from '../PixelCard';
import { PixelButton } from '../PixelButton';
import { LoadingCard } from '../common/LoadingCard';
import { ErrorBanner } from '../common/ErrorBanner';

interface MailScreenProps {
  playerId: string | null;
  onMailCountChanged?: () => void;
  initialRecipientId?: string;
  initialRecipientName?: string;
}

type MailView = 'inbox' | 'sent' | 'compose' | 'read';

// Which list the user was on before opening a mail
type ReturnView = 'inbox' | 'sent';

export function MailScreen({
  playerId,
  onMailCountChanged,
  initialRecipientId,
  initialRecipientName,
}: MailScreenProps) {
  const [activeView, setActiveView] = useState<MailView>(
    initialRecipientId ? 'compose' : 'inbox',
  );
  const [returnView, setReturnView] = useState<ReturnView>('inbox');

  // List data
  const [inbox, setInbox] = useState<FriendMailEntry[]>([]);
  const [sent, setSent] = useState<FriendMailEntry[]>([]);
  const [inboxTotal, setInboxTotal] = useState(0);
  const [sentTotal, setSentTotal] = useState(0);
  const [inboxPage, setInboxPage] = useState(1);
  const [sentPage, setSentPage] = useState(1);
  const [inboxTotalPages, setInboxTotalPages] = useState(1);
  const [sentTotalPages, setSentTotalPages] = useState(1);

  // Read view
  const [selectedMail, setSelectedMail] = useState<FriendMailEntry | null>(null);

  // Compose state
  const [friends, setFriends] = useState<FriendListEntry[]>([]);
  const [composeRecipientId, setComposeRecipientId] = useState(initialRecipientId ?? '');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [sending, setSending] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // General
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // -----------------------------------------------------------------------
  // Loaders
  // -----------------------------------------------------------------------

  const PAGE_SIZE = 20;

  const loadInbox = useCallback(async (page: number) => {
    try {
      const res = await getFriendMailInbox(page);
      if (res.error) { setError(res.error.message); return; }
      if (res.data) {
        setInbox(res.data.mails);
        setInboxTotal(res.data.total);
        setInboxTotalPages(Math.ceil(res.data.total / PAGE_SIZE));
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load inbox');
    }
  }, []);

  const loadSent = useCallback(async (page: number) => {
    try {
      const res = await getFriendMailSent(page);
      if (res.error) { setError(res.error.message); return; }
      if (res.data) {
        setSent(res.data.mails);
        setSentTotal(res.data.total);
        setSentTotalPages(Math.ceil(res.data.total / PAGE_SIZE));
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load sent mail');
    }
  }, []);

  const loadFriends = useCallback(async () => {
    try {
      const res = await getFriendsList();
      if (res.data) setFriends(res.data.friends);
    } catch {
      // non-critical, keep going
    }
  }, []);

  // Initial load
  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([loadInbox(1), loadFriends()]).finally(() => setLoading(false));
  }, [loadInbox, loadFriends]);

  // -----------------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------------

  const handleOpenMail = async (mail: FriendMailEntry, from: ReturnView) => {
    setError(null);
    setReturnView(from);
    try {
      const res = await readFriendMail(mail.id);
      if (res.error) { setError(res.error.message); return; }
      if (res.data) {
        setSelectedMail(res.data.mail);
        // Mark as read locally in inbox list
        if (!mail.isRead) {
          setInbox((prev) => prev.map((m) => (m.id === mail.id ? { ...m, isRead: true } : m)));
          onMailCountChanged?.();
        }
        setActiveView('read');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to read mail');
    }
  };

  const handleDelete = async (mailId: string) => {
    setError(null);
    try {
      const res = await deleteFriendMail(mailId);
      if (res.error) { setError(res.error.message); return; }
      // Remove from local lists
      setInbox((prev) => prev.filter((m) => m.id !== mailId));
      setSent((prev) => prev.filter((m) => m.id !== mailId));
      setInboxTotal((t) => Math.max(0, t - 1));
      onMailCountChanged?.();
      // If reading this mail, go back
      if (selectedMail?.id === mailId) {
        setSelectedMail(null);
        setActiveView(returnView);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete mail');
    }
  };

  const handleSend = async () => {
    if (!composeRecipientId || !composeSubject.trim() || !composeBody.trim()) {
      setError('Please fill in all fields.');
      return;
    }
    setError(null);
    setSending(true);
    try {
      const res = await sendFriendMail(composeRecipientId, composeSubject.trim(), composeBody.trim());
      if (res.error) { setError(res.error.message); setSending(false); return; }
      setSuccessMsg('Mail sent successfully!');
      setComposeRecipientId('');
      setComposeSubject('');
      setComposeBody('');
      // Refresh sent list and switch to it after a moment
      await loadSent(1);
      setSentPage(1);
      setTimeout(() => {
        setSuccessMsg(null);
        setActiveView('sent');
      }, 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send mail');
    } finally {
      setSending(false);
    }
  };

  const handleReply = (mail: FriendMailEntry) => {
    setComposeRecipientId(mail.senderId);
    const reSubject = mail.subject.startsWith('Re: ') ? mail.subject : `Re: ${mail.subject}`;
    setComposeSubject(reSubject.slice(0, MAIL_CONSTANTS.MAX_SUBJECT_LENGTH));
    setComposeBody('');
    setActiveView('compose');
  };

  const handleTabSwitch = (view: MailView) => {
    setError(null);
    setSuccessMsg(null);
    setActiveView(view);
    if (view === 'sent' && sent.length === 0) {
      void loadSent(sentPage);
    }
    if (view === 'compose' && friends.length === 0) {
      void loadFriends();
    }
  };

  // Pagination handlers
  const handleInboxPageChange = (page: number) => {
    setInboxPage(page);
    void loadInbox(page);
  };

  const handleSentPageChange = (page: number) => {
    setSentPage(page);
    void loadSent(page);
  };

  // -----------------------------------------------------------------------
  // Render helpers
  // -----------------------------------------------------------------------

  const tabs: { id: MailView; label: string; count?: number }[] = [
    { id: 'inbox', label: 'Inbox', count: inboxTotal },
    { id: 'sent', label: 'Sent', count: sentTotal },
    { id: 'compose', label: 'Compose' },
  ];

  // -----------------------------------------------------------------------
  // Loading state
  // -----------------------------------------------------------------------

  if (loading) {
    return (
      <ScreenContainer>
        <h2 className="text-xl font-bold font-almendra text-[var(--rpg-text-primary)]">Mail</h2>
        <LoadingCard />
      </ScreenContainer>
    );
  }

  // -----------------------------------------------------------------------
  // Main render
  // -----------------------------------------------------------------------

  return (
    <ScreenContainer>
      <h2 className="text-xl font-bold font-almendra text-[var(--rpg-text-primary)]">Mail</h2>

      {error && <ErrorBanner message={error} />}
      {successMsg && (
        <div className="p-3 rounded bg-[var(--rpg-green-dark)]/20 border border-[var(--rpg-green-light)] text-[var(--rpg-green-light)] text-sm">
          {successMsg}
        </div>
      )}

      {/* Tabs -- only show when not reading a mail */}
      {activeView !== 'read' && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabSwitch(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors ${
                activeView === tab.id
                  ? 'bg-[var(--rpg-gold)] text-[var(--rpg-background)]'
                  : 'bg-[var(--rpg-surface)] text-[var(--rpg-text-secondary)]'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className="ml-1 text-xs opacity-70">({tab.count})</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Inbox view */}
      {activeView === 'inbox' && (
        <MailList
          mails={inbox}
          nameKey="sender"
          playerId={playerId}
          page={inboxPage}
          totalPages={inboxTotalPages}
          onPageChange={handleInboxPageChange}
          onOpen={(m) => void handleOpenMail(m, 'inbox')}
          onDelete={(id) => void handleDelete(id)}
        />
      )}

      {/* Sent view */}
      {activeView === 'sent' && (
        <MailList
          mails={sent}
          nameKey="recipient"
          playerId={playerId}
          page={sentPage}
          totalPages={sentTotalPages}
          onPageChange={handleSentPageChange}
          onOpen={(m) => void handleOpenMail(m, 'sent')}
          onDelete={(id) => void handleDelete(id)}
        />
      )}

      {/* Compose view */}
      {activeView === 'compose' && (
        <ComposeView
          friends={friends}
          recipientId={composeRecipientId}
          recipientName={initialRecipientName}
          subject={composeSubject}
          body={composeBody}
          sending={sending}
          onRecipientChange={setComposeRecipientId}
          onSubjectChange={setComposeSubject}
          onBodyChange={setComposeBody}
          onSend={() => void handleSend()}
        />
      )}

      {/* Read view */}
      {activeView === 'read' && selectedMail && (
        <ReadView
          mail={selectedMail}
          playerId={playerId}
          onBack={() => { setSelectedMail(null); setActiveView(returnView); }}
          onReply={() => handleReply(selectedMail)}
          onDelete={() => void handleDelete(selectedMail.id)}
        />
      )}
    </ScreenContainer>
  );
}

// -----------------------------------------------------------------------
// Sub-components (defined outside MailScreen to avoid re-mount on state change)
// -----------------------------------------------------------------------

function MailList({
    mails,
    nameKey,
    playerId: _pid,
    page,
    totalPages,
    onPageChange,
    onOpen,
    onDelete,
  }: {
    mails: FriendMailEntry[];
    nameKey: 'sender' | 'recipient';
    playerId: string | null;
    page: number;
    totalPages: number;
    onPageChange: (p: number) => void;
    onOpen: (m: FriendMailEntry) => void;
    onDelete: (id: string) => void;
  }) {
    if (mails.length === 0) {
      return (
        <PixelCard>
          <p className="text-sm text-[var(--rpg-text-secondary)]">No mail here yet.</p>
        </PixelCard>
      );
    }

    return (
      <div className="space-y-2">
        {mails.map((mail) => {
          const displayName = nameKey === 'sender' ? mail.senderName : mail.recipientName;
          const isUnread = nameKey === 'sender' && !mail.isRead;

          return (
            <PixelCard key={mail.id} padding="sm">
              <div className="flex items-center gap-2">
                {/* Mail row content -- clickable */}
                <button
                  className="flex-1 text-left min-w-0"
                  onClick={() => onOpen(mail)}
                >
                  <div className="flex items-center gap-2 text-sm">
                    <span
                      className={`truncate ${
                        isUnread
                          ? 'font-bold text-[var(--rpg-text-primary)]'
                          : 'text-[var(--rpg-text-secondary)]'
                      }`}
                    >
                      {displayName}
                    </span>
                    {mail.isSystem && (
                      <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-[var(--rpg-blue-light)]/20 text-[var(--rpg-blue-light)]">
                        System
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span
                      className={`text-sm truncate ${
                        isUnread
                          ? 'font-bold text-[var(--rpg-text-primary)]'
                          : 'text-[var(--rpg-text-secondary)]'
                      }`}
                    >
                      {mail.subject}
                    </span>
                  </div>
                  <span className="text-[10px] text-[var(--rpg-text-secondary)] opacity-60 mt-0.5 block">
                    {relativeTime(mail.createdAt)}
                  </span>
                </button>

                {/* Delete button */}
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(mail.id); }}
                  className="shrink-0 w-7 h-7 flex items-center justify-center rounded text-[var(--rpg-red)] hover:bg-[var(--rpg-red)]/10 transition-colors"
                  title="Delete"
                >
                  &times;
                </button>
              </div>
            </PixelCard>
          );
        })}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 pt-2">
            <PixelButton
              size="sm"
              variant="secondary"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              Prev
            </PixelButton>
            <span className="text-sm text-[var(--rpg-text-secondary)]">
              {page} / {totalPages}
            </span>
            <PixelButton
              size="sm"
              variant="secondary"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              Next
            </PixelButton>
          </div>
        )}
      </div>
    );
  }

  function ComposeView({
    friends: friendList,
    recipientId,
    recipientName,
    subject,
    body,
    sending: isSending,
    onRecipientChange,
    onSubjectChange,
    onBodyChange,
    onSend,
  }: {
    friends: FriendListEntry[];
    recipientId: string;
    recipientName?: string;
    subject: string;
    body: string;
    sending: boolean;
    onRecipientChange: (id: string) => void;
    onSubjectChange: (s: string) => void;
    onBodyChange: (b: string) => void;
    onSend: () => void;
  }) {
    return (
      <PixelCard>
        <div className="space-y-3">
          {/* Recipient */}
          <div>
            <label className="block text-xs text-[var(--rpg-text-secondary)] mb-1">To</label>
            {recipientName && recipientId ? (
              <div className="text-sm text-[var(--rpg-text-primary)]">{recipientName}</div>
            ) : (
              <select
                value={recipientId}
                onChange={(e) => onRecipientChange(e.target.value)}
                className="w-full bg-[var(--rpg-background)] border border-[var(--rpg-border)] rounded px-2 py-1.5 text-sm text-[var(--rpg-text-primary)]"
              >
                <option value="">Select a friend...</option>
                {friendList.map((f) => (
                  <option key={f.playerId} value={f.playerId}>
                    {f.username} (Lv.{f.characterLevel})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Subject */}
          <div>
            <label className="block text-xs text-[var(--rpg-text-secondary)] mb-1">
              Subject
              <span className="ml-1 opacity-60">
                ({subject.length}/{MAIL_CONSTANTS.MAX_SUBJECT_LENGTH})
              </span>
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => onSubjectChange(e.target.value.slice(0, MAIL_CONSTANTS.MAX_SUBJECT_LENGTH))}
              maxLength={MAIL_CONSTANTS.MAX_SUBJECT_LENGTH}
              placeholder="Subject..."
              className="w-full bg-[var(--rpg-background)] border border-[var(--rpg-border)] rounded px-2 py-1.5 text-sm text-[var(--rpg-text-primary)]"
            />
          </div>

          {/* Body */}
          <div>
            <label className="block text-xs text-[var(--rpg-text-secondary)] mb-1">
              Message
              <span className="ml-1 opacity-60">
                ({body.length}/{MAIL_CONSTANTS.MAX_BODY_LENGTH})
              </span>
            </label>
            <textarea
              value={body}
              onChange={(e) => onBodyChange(e.target.value.slice(0, MAIL_CONSTANTS.MAX_BODY_LENGTH))}
              maxLength={MAIL_CONSTANTS.MAX_BODY_LENGTH}
              rows={6}
              placeholder="Write your message..."
              className="w-full bg-[var(--rpg-background)] border border-[var(--rpg-border)] rounded px-2 py-1.5 text-sm text-[var(--rpg-text-primary)] resize-none"
            />
          </div>

          {/* Gold cost + send */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--rpg-gold)]">
              Sending costs {MAIL_CONSTANTS.GOLD_COST} gold
            </span>
            <PixelButton
              size="sm"
              variant="gold"
              disabled={isSending || !recipientId || !subject.trim() || !body.trim()}
              onClick={onSend}
            >
              {isSending ? 'Sending...' : 'Send'}
            </PixelButton>
          </div>
        </div>
      </PixelCard>
    );
  }

  function ReadView({
    mail,
    playerId: pid,
    onBack,
    onReply,
    onDelete: onDel,
  }: {
    mail: FriendMailEntry;
    playerId: string | null;
    onBack: () => void;
    onReply: () => void;
    onDelete: () => void;
  }) {
    const isSentByMe = mail.senderId === pid;

    return (
      <div className="space-y-3">
        {/* Back button */}
        <button
          onClick={onBack}
          className="text-sm text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)] transition-colors"
        >
          &larr; Back
        </button>

        <PixelCard>
          <div className="space-y-3">
            {/* Header */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-[var(--rpg-text-secondary)]">From:</span>
                <span className="text-[var(--rpg-text-primary)] font-semibold">{mail.senderName}</span>
                {mail.isSystem && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--rpg-blue-light)]/20 text-[var(--rpg-blue-light)]">
                    System
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-[var(--rpg-text-secondary)]">To:</span>
                <span className="text-[var(--rpg-text-primary)]">{mail.recipientName}</span>
              </div>
              <div className="text-sm font-semibold text-[var(--rpg-text-primary)]">{mail.subject}</div>
              <div className="text-[10px] text-[var(--rpg-text-secondary)] opacity-60">
                {relativeTime(mail.createdAt)} &middot; {new Date(mail.createdAt).toLocaleString()}
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-[var(--rpg-border)]" />

            {/* Body */}
            <p className="text-sm text-[var(--rpg-text-primary)] whitespace-pre-wrap break-words">
              {mail.body}
            </p>
          </div>
        </PixelCard>

        {/* Actions */}
        <div className="flex gap-2">
          {!isSentByMe && !mail.isSystem && (
            <PixelButton size="sm" variant="primary" onClick={onReply}>
              Reply
            </PixelButton>
          )}
          <PixelButton size="sm" variant="danger" onClick={onDel}>
            Delete
          </PixelButton>
        </div>
      </div>
    );
  }
