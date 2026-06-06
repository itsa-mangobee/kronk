import { useEffect, useState, useCallback, useRef, useMemo } from 'react';

import { defineMessages, FormattedMessage, useIntl } from 'react-intl';

import { Helmet } from 'react-helmet';
import { useParams, useLocation } from 'react-router-dom';

import AddPhotoIcon from '@/material-icons/400-24px/add_photo_alternate.svg?react';
import ArrowUpwardIcon from '@/material-icons/400-24px/arrow_upward-fill.svg?react';
import CelebrationIcon from '@/material-icons/400-24px/celebration-fill.svg?react';
import PartnerExchangeIcon from '@/material-icons/400-24px/partner_exchange-fill.svg?react';
import { importFetchedAccounts } from 'mastodon/actions/importer';
import { decrementNudgeCount } from 'mastodon/actions/notification_groups';
import api from 'mastodon/api';
import { apiGetNudgeThread, apiNudgeAccount } from 'mastodon/api/accounts';
import type {
  ApiNudgeThreadMessage,
  ApiNudgeInReplyTo,
} from 'mastodon/api/accounts';
import { apiNudgeReact, apiNudgeUnreact } from 'mastodon/api/notifications';
import { Avatar } from 'mastodon/components/avatar';
import { Column } from 'mastodon/components/column';
import type { ColumnRef } from 'mastodon/components/column';
import { ColumnHeader } from 'mastodon/components/column_header';
import { Icon } from 'mastodon/components/icon';
import type { Account } from 'mastodon/models/account';
import type { NotificationGroupNudge } from 'mastodon/models/notification_group';
import { selectUnreadNudgesCount } from 'mastodon/selectors/notifications';
import { useAppDispatch, useAppSelector } from 'mastodon/store';

const CONSECUTIVE_LIMIT = 5;

const EMOJI_QUICK_PICKS = [
  '❤️',
  '😂',
  '🤣',
  '😍',
  '🥰',
  '😊',
  '😎',
  '🤔',
  '😢',
  '😭',
  '😡',
  '🤯',
  '🥳',
  '🤗',
  '😅',
  '😬',
  '🙄',
  '😇',
  '🤩',
  '🫠',
  '👍',
  '👎',
  '🙌',
  '👏',
  '🤝',
  '🫶',
  '🤙',
  '💪',
  '🙏',
  '🤞',
  '🔥',
  '💯',
  '✨',
  '⚡',
  '💥',
  '🎉',
  '🎊',
  '🌟',
  '💎',
  '🏆',
];

const EmojiOption: React.FC<{
  emoji: string;
  isMe: boolean;
  notificationId: string;
  onPick: (emoji: string) => void;
}> = ({ emoji, isMe, onPick }) => {
  const handleClick = useCallback(() => {
    onPick(emoji);
  }, [onPick, emoji]);

  return (
    <button
      type='button'
      className={`nudge-emoji-picker__option${isMe ? ' nudge-emoji-picker__option--me' : ''}`}
      onClick={handleClick}
      aria-label={emoji}
    >
      {emoji}
    </button>
  );
};

const EmojiPicker: React.FC<{
  notificationId: string;
  currentMyReaction: string | undefined;
  onReact: (
    notificationId: string,
    emoji: string,
    currentlyMe: boolean,
  ) => void;
}> = ({ notificationId, currentMyReaction, onReact }) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
    };
  }, [open]);

  const handleToggle = useCallback(() => {
    setOpen((v) => !v);
  }, []);

  const handlePick = useCallback(
    (emoji: string) => {
      onReact(notificationId, emoji, currentMyReaction === emoji);
      setOpen(false);
    },
    [onReact, notificationId, currentMyReaction],
  );

  return (
    <div ref={containerRef} className='nudge-emoji-picker'>
      <button
        type='button'
        className='nudge-bubble__react-btn nudge-bubble__react-btn--add'
        onClick={handleToggle}
        aria-label='Add reaction'
      >
        +
      </button>
      {open && (
        <div className='nudge-emoji-picker__popover'>
          {EMOJI_QUICK_PICKS.map((emoji) => (
            <EmojiOption
              key={emoji}
              emoji={emoji}
              isMe={currentMyReaction === emoji}
              notificationId={notificationId}
              onPick={handlePick}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const ReactionButton: React.FC<{
  emoji: string;
  count: number;
  me: boolean;
  notificationId: string;
  onReact: (
    notificationId: string,
    emoji: string,
    currentlyMe: boolean,
  ) => void;
}> = ({ emoji, count, me, notificationId, onReact }) => {
  const handleClick = useCallback(() => {
    onReact(notificationId, emoji, me);
  }, [onReact, notificationId, emoji, me]);

  return (
    <button
      type='button'
      className={`nudge-bubble__react-btn${me ? ' nudge-bubble__react-btn--me' : ''}`}
      onClick={handleClick}
      aria-label={`${emoji}${count > 0 ? ` ${count}` : ''}`}
    >
      <span>{emoji}</span>
      {count > 0 && <span className='nudge-bubble__react-count'>{count}</span>}
    </button>
  );
};

function countWords(text: string): number {
  return text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
}

function pingSound(): void {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.25);
  } catch {
    // audio unavailable
  }
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return 'now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  const timeStr = d.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return timeStr;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString())
    return `Yesterday ${timeStr}`;
  if (diff < 7 * 86_400_000) {
    return `${d.toLocaleDateString([], { weekday: 'short' })} ${timeStr}`;
  }
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${timeStr}`;
}

function formatExpiry(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'Expired';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 0) return `${h}h left`;
  return `${m}m left`;
}

const ReplyQuote: React.FC<{ reply: ApiNudgeInReplyTo; isSent: boolean }> = ({
  reply,
  isSent,
}) => (
  <div
    className={`nudge-reply-quote${isSent ? ' nudge-reply-quote--sent' : ''}`}
  >
    {reply.voice && <span className='nudge-reply-quote__icon'>🎤</span>}
    {reply.image && !reply.voice && (
      <span className='nudge-reply-quote__icon'>🖼️</span>
    )}
    <span className='nudge-reply-quote__body'>
      {reply.body ??
        (reply.voice ? 'Voice message' : reply.image ? 'Image' : 'Nudge')}
    </span>
  </div>
);

const MessageBubble: React.FC<{
  msg: ApiNudgeThreadMessage;
  partnerAccount?: Account | null;
  isNew?: boolean;
  isLastSent?: boolean;
  partnerRead?: boolean;
  onReact: (
    notificationId: string,
    emoji: string,
    currentlyMe: boolean,
  ) => void;
  onReply: (msg: ApiNudgeThreadMessage) => void;
}> = ({
  msg,
  partnerAccount,
  isNew,
  isLastSent,
  partnerRead,
  onReact,
  onReply,
}) => {
  const touchStartXRef = useRef(0);
  const isPing =
    msg.body == null && msg.media_url == null && msg.voice_url == null;
  const isSent = msg.direction === 'sent';
  const isExpired =
    msg.expires_at != null && new Date(msg.expires_at) <= new Date();

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0]?.clientX ?? 0;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartXRef.current;
      if (Math.abs(dx) > 48) onReply(msg);
    },
    [msg, onReply],
  );

  const handleReplyClick = useCallback(() => {
    onReply(msg);
  }, [msg, onReply]);

  if (isPing) {
    return (
      <div className='nudge-ping'>
        <Icon icon={CelebrationIcon} id='celebration' />
        <span>
          {isSent ? (
            <FormattedMessage
              id='nudges.thread.you_nudged'
              defaultMessage='You nudged'
            />
          ) : (
            <FormattedMessage
              id='nudges.thread.nudged_you'
              defaultMessage='Nudged you'
            />
          )}
        </span>
        <span className='nudge-ping__time'>{formatTime(msg.created_at)}</span>
      </div>
    );
  }

  const activeReactions = Object.entries(msg.reactions).filter(
    ([, r]) => r.count > 0 || r.me,
  );
  const hasReactions = activeReactions.some(([, r]) => r.count > 0);
  const currentMyReaction = Object.entries(msg.reactions).find(
    ([, r]) => r.me,
  )?.[0];

  return (
    <div
      className={`nudge-bubble nudge-bubble--${isSent ? 'sent' : 'received'}${isNew ? ' nudge-bubble--new' : ''}${isExpired ? ' nudge-bubble--expired' : ''}`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {!isSent && partnerAccount && (
        <div className='nudge-bubble__avatar'>
          <Avatar account={partnerAccount} size={28} />
        </div>
      )}
      <div className='nudge-bubble__content'>
        {msg.in_reply_to && (
          <ReplyQuote reply={msg.in_reply_to} isSent={isSent} />
        )}
        {isExpired ? (
          <p className='nudge-bubble__expired'>
            <FormattedMessage
              id='nudges.thread.expired'
              defaultMessage='This message has expired'
            />
          </p>
        ) : (
          <>
            {msg.body && <p className='nudge-bubble__text'>{msg.body}</p>}
            {msg.media_url &&
              (msg.media_content_type?.startsWith('video/') ? (
                // eslint-disable-next-line jsx-a11y/media-has-caption
                <video
                  controls
                  src={msg.media_url}
                  className='nudge-bubble__video'
                />
              ) : (
                <img src={msg.media_url} alt='' className='nudge-bubble__img' />
              ))}
            {msg.voice_url && (
              <p className='nudge-bubble__text nudge-bubble__voice-legacy'>
                🎤 Voice message
              </p>
            )}
          </>
        )}
        <div className='nudge-bubble__footer'>
          <span className='nudge-bubble__time'>
            {formatTime(msg.created_at)}
          </span>
          {msg.expires_at && !isExpired && (
            <span className='nudge-bubble__expiry'>
              {formatExpiry(msg.expires_at)}
            </span>
          )}
          {isSent && isLastSent && partnerRead && (
            <span className='nudge-bubble__seen'>
              <FormattedMessage id='nudges.thread.seen' defaultMessage='Seen' />
            </span>
          )}
        </div>
        <div
          className={`nudge-bubble__reactions${hasReactions ? ' nudge-bubble__reactions--active' : ''}`}
        >
          {activeReactions.map(([emoji, r]) => (
            <ReactionButton
              key={emoji}
              emoji={emoji}
              count={r.count}
              me={r.me}
              notificationId={msg.notification_id}
              onReact={onReact}
            />
          ))}
          <EmojiPicker
            notificationId={msg.notification_id}
            currentMyReaction={currentMyReaction}
            onReact={onReact}
          />
        </div>
      </div>
      <button
        type='button'
        className='nudge-bubble__reply-btn'
        onClick={handleReplyClick}
        aria-label='Reply'
      >
        ↩
      </button>
    </div>
  );
};

const MAX_WORDS = 100;

const messages = defineMessages({
  back: { id: 'nudges.back', defaultMessage: 'Nudges' },
  placeholder: {
    id: 'nudges.thread.placeholder',
    defaultMessage: 'Send a message…',
  },
  send: { id: 'nudges.thread.send', defaultMessage: 'Send' },
  nudge: { id: 'nudges.thread.nudge', defaultMessage: 'Nudge' },
  attachMedia: {
    id: 'nudges.thread.attach_media',
    defaultMessage: 'Attach image or video',
  },
  removeAttachment: {
    id: 'nudges.thread.remove_attachment',
    defaultMessage: 'Remove',
  },
});

interface NudgeLocationState {
  attachStatusUrl?: string;
  attachStatusBody?: string | null;
}

const NudgesThread: React.FC<{ multiColumn?: boolean }> = ({ multiColumn }) => {
  const { accountId = '' } = useParams<{ accountId: string }>();
  const location = useLocation<NudgeLocationState>();
  const intl = useIntl();
  const dispatch = useAppDispatch();
  const columnRef = useRef<ColumnRef>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastNudgeKeyRef = useRef<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isFirstLoadRef = useRef(true);
  const prevMessageCountRef = useRef(0);

  const account = useAppSelector((state) => state.accounts.get(accountId));
  const unreadNudgeCount = useAppSelector(selectUnreadNudgesCount);
  const prevNudgeCountRef = useRef<number>(unreadNudgeCount);

  const [threadMessages, setThreadMessages] = useState<ApiNudgeThreadMessage[]>(
    [],
  );
  const [streak, setStreak] = useState(0);
  const [canNudgeBack, setCanNudgeBack] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // Attached status from "nudge on post" navigation
  // location.state is typed as NudgeLocationState but is undefined when navigating directly
  const navState = location.state as NudgeLocationState | undefined;
  const [attachedStatusUrl] = useState<string | undefined>(
    navState?.attachStatusUrl,
  );
  const [attachedStatusBody] = useState<string | null | undefined>(
    navState?.attachStatusBody,
  );

  // Compose state
  const [text, setText] = useState(navState?.attachStatusUrl ?? '');
  const [mediaId, setMediaId] = useState<string | undefined>();
  const [mediaPreview, setMediaPreview] = useState<string | undefined>();
  const [mediaIsVideo, setMediaIsVideo] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streakBumped, setStreakBumped] = useState(false);
  const [newMessageIds, setNewMessageIds] = useState<Set<string>>(new Set());
  const [replyTo, setReplyTo] = useState<ApiNudgeThreadMessage | null>(null);

  const wordCount = countWords(text);
  const overLimit = wordCount > MAX_WORDS;

  const consecutiveSent = useMemo(() => {
    let count = 0;
    for (let i = threadMessages.length - 1; i >= 0; i--) {
      if (threadMessages[i]?.direction === 'sent') count++;
      else break;
    }
    return count;
  }, [threadMessages]);

  const lastSentMsg = useMemo(() => {
    for (let i = threadMessages.length - 1; i >= 0; i--) {
      if (threadMessages[i]?.direction === 'sent') return threadMessages[i];
    }
    return null;
  }, [threadMessages]);

  const [milestone, setMilestone] = useState<number | null>(null);

  const loadThread = useCallback(async () => {
    if (accountId === '') return;
    try {
      const data = await apiGetNudgeThread(accountId);
      setLoadError(false);
      dispatch(importFetchedAccounts([data.account]));
      setThreadMessages((prev) => {
        const prevIds = new Set(prev.map((m) => m.notification_id));
        const incoming = data.messages.filter(
          (m) => !prevIds.has(m.notification_id),
        );
        if (incoming.length > 0 && !isFirstLoadRef.current) {
          const hasIncoming = incoming.some((m) => m.direction === 'received');
          if (hasIncoming) pingSound();
          setNewMessageIds(new Set(incoming.map((m) => m.notification_id)));
          setTimeout(() => {
            setNewMessageIds(new Set());
          }, 600);
        }
        return data.messages;
      });
      setStreak((prev) => {
        const next = data.streak;
        if (next > prev && prev > 0) {
          setStreakBumped(true);
          setTimeout(() => {
            setStreakBumped(false);
          }, 800);
          if ([10, 25, 50, 100].includes(next)) {
            setMilestone(next);
            setTimeout(() => {
              setMilestone(null);
            }, 3000);
          }
        }
        return next;
      });
      setCanNudgeBack(data.can_nudge_back);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [accountId, dispatch]);

  const handleReact = useCallback(
    (notificationId: string, emoji: string, currentlyMe: boolean) => {
      // Optimistic update
      setThreadMessages((prev) =>
        prev.map((m) => {
          if (m.notification_id !== notificationId) return m;
          const updated = { ...m, reactions: { ...m.reactions } };
          if (currentlyMe) {
            const r = updated.reactions[emoji];
            updated.reactions[emoji] = {
              count: Math.max(0, (r ? r.count : 1) - 1),
              me: false,
            };
          } else {
            // Clear any existing my-reaction across all emojis
            for (const e of Object.keys(updated.reactions)) {
              const er = updated.reactions[e];
              if (er?.me) {
                updated.reactions[e] = {
                  count: Math.max(0, er.count - 1),
                  me: false,
                };
              }
            }
            const r = updated.reactions[emoji];
            updated.reactions[emoji] = {
              count: (r ? r.count : 0) + 1,
              me: true,
            };
          }
          return updated;
        }),
      );
      void (async () => {
        try {
          if (currentlyMe) {
            await apiNudgeUnreact(notificationId);
          } else {
            await apiNudgeReact(notificationId, emoji);
          }
        } catch {
          // revert on failure
          void loadThread();
        }
      })();
    },
    [loadThread],
  );

  const handleReply = useCallback((msg: ApiNudgeThreadMessage) => {
    setReplyTo(msg);
    textareaRef.current?.focus();
  }, []);

  const handleDismissReply = useCallback(() => {
    setReplyTo(null);
  }, []);

  useEffect(() => {
    void loadThread();
  }, [loadThread]);

  // Auto-focus compose input on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Auto-scroll: instant on first load, smooth only when count increases
  useEffect(() => {
    if (threadMessages.length === 0) return;
    const count = threadMessages.length;
    if (isFirstLoadRef.current) {
      messagesEndRef.current?.scrollIntoView();
      isFirstLoadRef.current = false;
      prevMessageCountRef.current = count;
    } else if (count > prevMessageCountRef.current) {
      prevMessageCountRef.current = count;
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [threadMessages]);

  // Real-time: reload immediately when a new nudge arrives via streaming
  useEffect(() => {
    if (unreadNudgeCount > prevNudgeCountRef.current && !sending) {
      void loadThread();
    }
    prevNudgeCountRef.current = unreadNudgeCount;
  }, [unreadNudgeCount, sending, loadThread]);

  // Fallback poll every 15s in case streaming is unavailable
  useEffect(() => {
    const id = setInterval(() => {
      if (!sending) void loadThread();
    }, 15000);
    return () => {
      clearInterval(id);
    };
  }, [sending, loadThread]);

  // Listen for incoming nudges from this account and reload thread
  const nudgeGroups = useAppSelector((state) =>
    [
      ...state.notificationGroups.groups,
      ...state.notificationGroups.pendingGroups,
    ].filter(
      (g): g is NotificationGroupNudge =>
        g.type === 'nudge' && g.sampleAccountIds.includes(accountId),
    ),
  );

  useEffect(() => {
    const latest = nudgeGroups[0];
    if (!latest) return;
    const key = latest.latest_page_notification_at;
    if (key !== lastNudgeKeyRef.current) {
      lastNudgeKeyRef.current = key;
      void loadThread();
    }
  }, [nudgeGroups, loadThread]);

  // Auto-resize textarea
  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setText(e.target.value);
      setError(null);
      const el = e.target;
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    },
    [],
  );

  const handleAttachClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Messenger-style: upload immediately, show thumbnail in compose bar — no modal
  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (fileInputRef.current) fileInputRef.current.value = '';
      setError(null);
      setUploading(true);
      void (async () => {
        try {
          const formData = new FormData();
          formData.append('file', file);
          const { data } = await api().post<{ id: string }>(
            '/api/v2/media',
            formData,
          );
          const previewUrl = URL.createObjectURL(file);
          setMediaId(data.id);
          setMediaPreview((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return previewUrl;
          });
          setMediaIsVideo(file.type.startsWith('video/'));
        } catch (err) {
          setError(
            `Upload failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        } finally {
          setUploading(false);
        }
      })();
    },
    [],
  );

  const handleRemoveMedia = useCallback(() => {
    setMediaId(undefined);
    setMediaPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return undefined;
    });
    setMediaIsVideo(false);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const clearCompose = useCallback(() => {
    setText('');
    setMediaId(undefined);
    setMediaPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return undefined;
    });
    setMediaIsVideo(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, []);

  const send = useCallback(
    async (withContent: boolean) => {
      if (accountId === '' || sending) return;
      setSending(true);
      setError(null);
      try {
        const params = withContent
          ? {
              text: text.trim() || undefined,
              media_id: mediaId,
              in_reply_to_notification_id: replyTo?.notification_id,
            }
          : {};

        const result = await apiNudgeAccount(accountId, params);
        setStreak(result.streak);
        setCanNudgeBack(result.can_nudge);
        setReplyTo(null);
        clearCompose();
        void loadThread();
        dispatch(decrementNudgeCount());
      } catch (err: unknown) {
        const status =
          err != null &&
          typeof err === 'object' &&
          'response' in err &&
          err.response != null &&
          typeof err.response === 'object' &&
          'data' in err.response
            ? (err.response as { data?: { error?: string } }).data?.error
            : null;
        const msg =
          status === 'waiting_for_nudge_back'
            ? 'Waiting for them to nudge back first'
            : 'Failed to send — try again';
        setCanNudgeBack(status !== 'waiting_for_nudge_back');
        setError(msg);
      } finally {
        setSending(false);
      }
    },
    [
      accountId,
      sending,
      text,
      mediaId,
      replyTo,
      dispatch,
      clearCompose,
      loadThread,
    ],
  );

  const hasContent = text.trim().length > 0 || !!mediaId;

  const handleSend = useCallback(() => {
    void send(hasContent);
  }, [send, hasContent]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleHeaderClick = useCallback(() => {
    columnRef.current?.scrollTop();
  }, []);

  const title = account ? account.display_name || account.acct : '…';

  return (
    <Column bindToDocument={!multiColumn} ref={columnRef} label={title}>
      <ColumnHeader
        icon='partner_exchange'
        iconComponent={PartnerExchangeIcon}
        title={title}
        onClick={handleHeaderClick}
        multiColumn={multiColumn}
        showBackButton
      />

      <div className='nudge-thread'>
        {account && (
          <div className='nudge-thread-banner'>
            <Avatar account={account} size={40} />
            <div className='nudge-thread-banner__info'>
              <span className='nudge-thread-banner__name'>
                {account.display_name || account.acct}
              </span>
              <span className='nudge-thread-banner__acct'>@{account.acct}</span>
            </div>
            {streak > 0 && (
              <span
                className={`nudge-thread-banner__streak${streakBumped ? ' nudge-thread-banner__streak--bump' : ''}`}
              >
                <Icon icon={PartnerExchangeIcon} id='partner_exchange' />
                {streak}
              </span>
            )}
          </div>
        )}

        {milestone && (
          <div className='nudge-milestone'>
            <Icon icon={CelebrationIcon} id='celebration' />
            <FormattedMessage
              id='nudges.thread.milestone'
              defaultMessage='{count} nudges!'
              values={{ count: milestone }}
            />
          </div>
        )}
        {loading && (
          <div className='loading-indicator'>
            <div className='loading-indicator__figure' />
          </div>
        )}

        {!loading && loadError && (
          <div className='empty-column-indicator'>
            <FormattedMessage
              id='nudges.thread.error'
              defaultMessage='Could not load messages. Try refreshing.'
            />
          </div>
        )}

        {!loading && !loadError && threadMessages.length === 0 && (
          <div className='empty-column-indicator'>
            <FormattedMessage
              id='nudges.thread.empty'
              defaultMessage='No messages yet. Send a nudge!'
            />
          </div>
        )}

        {!loading && !loadError && threadMessages.length > 0 && (
          <div className='nudge-thread__messages'>
            {threadMessages.map((msg) => (
              <MessageBubble
                key={msg.notification_id}
                msg={msg}
                isNew={newMessageIds.has(msg.notification_id)}
                isLastSent={
                  msg.notification_id === lastSentMsg?.notification_id
                }
                partnerRead={lastSentMsg?.read_at != null}
                partnerAccount={
                  msg.direction === 'received' ? account : undefined
                }
                onReact={handleReact}
                onReply={handleReply}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}

        {!canNudgeBack && !loading && (
          <div className='nudge-compose-bar__waiting'>
            <FormattedMessage
              id='nudges.thread.waiting'
              defaultMessage='Waiting for them to nudge back…'
            />
          </div>
        )}

        {canNudgeBack && !loading && consecutiveSent >= 3 && (
          <div className='nudge-compose-bar__limit'>
            <FormattedMessage
              id='nudges.thread.consecutive_warning'
              defaultMessage='{count} of {limit} — they need to reply before you can send more'
              values={{ count: consecutiveSent, limit: CONSECUTIVE_LIMIT }}
            />
          </div>
        )}

        {attachedStatusUrl && (
          <div className='nudge-compose-bar__post-share'>
            <span className='nudge-compose-bar__post-share__label'>
              <FormattedMessage
                id='nudges.thread.sharing_post'
                defaultMessage='Sharing post'
              />
            </span>
            {attachedStatusBody && (
              <span className='nudge-compose-bar__post-share__body'>
                {attachedStatusBody}
              </span>
            )}
          </div>
        )}

        {replyTo && (
          <div className='nudge-compose-bar__reply-banner'>
            <ReplyQuote
              reply={{
                notification_id: replyTo.notification_id,
                body: replyTo.body,
                voice: replyTo.voice_url != null,
                image: replyTo.media_url != null,
              }}
              isSent={false}
            />
            <button
              type='button'
              className='nudge-compose-bar__reply-dismiss'
              onClick={handleDismissReply}
              aria-label='Cancel reply'
            >
              ×
            </button>
          </div>
        )}

        {error && <div className='nudge-compose-bar__error'>{error}</div>}

        <div
          className={`nudge-compose-bar${!canNudgeBack ? ' nudge-compose-bar--disabled' : ''}`}
        >
          {/* Media attachment preview */}
          {mediaPreview !== undefined && (
            <div className='nudge-compose-bar__attachments'>
              <div className='nudge-compose-bar__attachment-preview'>
                {mediaIsVideo ? (
                  <video
                    src={mediaPreview}
                    className='nudge-compose-bar__media-preview'
                    muted
                  />
                ) : (
                  <img
                    src={mediaPreview}
                    alt=''
                    className='nudge-compose-bar__media-preview'
                  />
                )}
                <button
                  type='button'
                  className='nudge-compose-bar__remove-btn'
                  onClick={handleRemoveMedia}
                  aria-label={intl.formatMessage(messages.removeAttachment)}
                >
                  ×
                </button>
              </div>
            </div>
          )}

          <div className='nudge-compose-bar__row'>
            <button
              type='button'
              className='nudge-compose-bar__icon-btn'
              onClick={handleAttachClick}
              disabled={uploading || !!mediaId || !canNudgeBack}
              aria-label={intl.formatMessage(messages.attachMedia)}
              title={intl.formatMessage(messages.attachMedia)}
            >
              <Icon icon={AddPhotoIcon} id='add_photo_alternate' />
            </button>

            <input
              ref={fileInputRef}
              type='file'
              accept='image/*,video/*'
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />

            <textarea
              ref={textareaRef}
              className={`nudge-compose-bar__input${overLimit ? ' nudge-compose-bar__input--over' : ''}`}
              placeholder={intl.formatMessage(messages.placeholder)}
              value={text}
              onChange={handleTextChange}
              onKeyDown={handleKeyDown}
              rows={1}
              disabled={sending || !canNudgeBack}
            />

            <button
              type='button'
              className={`nudge-compose-bar__icon-btn nudge-compose-bar__icon-btn--send${sending ? ' nudge-compose-bar__icon-btn--sending' : ''}`}
              onClick={handleSend}
              disabled={sending || overLimit || !canNudgeBack}
              aria-label={intl.formatMessage(
                hasContent ? messages.send : messages.nudge,
              )}
              title={intl.formatMessage(
                hasContent ? messages.send : messages.nudge,
              )}
            >
              {hasContent ? (
                <Icon icon={ArrowUpwardIcon} id='arrow_upward' />
              ) : (
                <Icon icon={PartnerExchangeIcon} id='partner_exchange' />
              )}
            </button>
          </div>
        </div>
      </div>

      <Helmet>
        <title>{title} — Nudges</title>
        <meta name='robots' content='noindex' />
      </Helmet>
    </Column>
  );
};

// eslint-disable-next-line import/no-default-export
export default NudgesThread;
