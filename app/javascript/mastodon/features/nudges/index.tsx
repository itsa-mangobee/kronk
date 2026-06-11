import { useEffect, useState, useCallback, useRef } from 'react';

import { defineMessages, FormattedMessage, useIntl } from 'react-intl';

import { Helmet } from 'react-helmet';
import { Link, useHistory } from 'react-router-dom';

import PartnerExchangeActiveIcon from '@/material-icons/400-24px/partner_exchange-fill.svg?react';
import { importFetchedAccounts } from 'mastodon/actions/importer';
import { openModal } from 'mastodon/actions/modal';
import {
  decrementNudgeCount,
  setUnreadNudgeCount,
} from 'mastodon/actions/notification_groups';
import { apiGetNudgePartners, apiNudgeAccount } from 'mastodon/api/accounts';
import type {
  ApiNudgeLastMessage,
  ApiNudgePartner,
  ApiNudgeSuggestion,
} from 'mastodon/api/accounts';
import { Avatar } from 'mastodon/components/avatar';
import { Button } from 'mastodon/components/button';
import { Column } from 'mastodon/components/column';
import type { ColumnRef } from 'mastodon/components/column';
import { ColumnHeader } from 'mastodon/components/column_header';
import { DisplayName } from 'mastodon/components/display_name';
import { Icon } from 'mastodon/components/icon';
import { RelativeTimestamp } from 'mastodon/components/relative_timestamp';
import type { NotificationGroupNudge } from 'mastodon/models/notification_group';
import { useAppDispatch, useAppSelector } from 'mastodon/store';

interface NudgeAlertData {
  id: string;
  accountId: string;
}

const messages = defineMessages({
  title: { id: 'nudges.title', defaultMessage: 'Nudges' },
  previewImage: { id: 'nudges.preview.image', defaultMessage: 'Image' },
  previewVideo: { id: 'nudges.preview.video', defaultMessage: 'Video' },
  previewVoice: { id: 'nudges.preview.voice', defaultMessage: 'Voice memo' },
  previewNudge: { id: 'nudges.preview.nudge', defaultMessage: 'Nudged' },
  dismiss: { id: 'nudges.alert.dismiss', defaultMessage: 'Dismiss' },
  nudgeAllBack: {
    id: 'nudges.nudge_all_back',
    defaultMessage: 'Nudge all back',
  },
  nudgeAllBackDone: {
    id: 'nudges.nudge_all_back_done',
    defaultMessage: 'Done!',
  },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function lastMessagePreview(
  msg: ApiNudgeLastMessage,
  previewImage: string,
  previewVideo: string,
  previewVoice: string,
  previewNudge: string,
): string {
  const prefix = msg.direction === 'sent' ? 'You: ' : '';
  switch (msg.type) {
    case 'text':
      return `${prefix}${msg.body ?? ''}`;
    case 'image':
      return `${prefix}${previewImage}`;
    case 'video':
      return `${prefix}${previewVideo}`;
    case 'voice':
      return `${prefix}${previewVoice}`;
    default:
      return `${prefix}${previewNudge}`;
  }
}

// ── Live alert banner ─────────────────────────────────────────────────────────

const NudgeAlert: React.FC<{
  alert: NudgeAlertData;
  onDismiss: (id: string) => void;
}> = ({ alert, onDismiss }) => {
  const dispatch = useAppDispatch();
  const history = useHistory();
  const account = useAppSelector((state) =>
    state.accounts.get(alert.accountId),
  );
  const [nudgedBack, setNudgedBack] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => {
      onDismiss(alert.id);
    }, 8000);
    return () => {
      window.clearTimeout(t);
    };
  }, [alert.id, onDismiss]);

  const handleDismissClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDismiss(alert.id);
    },
    [onDismiss, alert.id],
  );

  const handleOpen = useCallback(() => {
    onDismiss(alert.id);
    history.push(`/nudges/${alert.accountId}`);
  }, [alert.id, alert.accountId, onDismiss, history]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleOpen();
    },
    [handleOpen],
  );

  const handleLinkClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  const handleNudgeBackClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (nudgedBack) return;
      dispatch(
        openModal({
          modalType: 'NUDGE_COMPOSE',
          modalProps: {
            accountId: alert.accountId,
            onSent: () => {
              setNudgedBack(true);
              dispatch(decrementNudgeCount());
            },
          },
        }),
      );
    },
    [alert.accountId, nudgedBack, dispatch],
  );

  if (!account) return null;

  return (
    <div
      className='nudge-alert'
      onClick={handleOpen}
      role='button'
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <Icon
        id='partner_exchange'
        icon={PartnerExchangeActiveIcon}
        className='nudge-alert__icon'
      />
      <span className='nudge-alert__text'>
        <FormattedMessage
          id='nudges.alert.nudged_by'
          defaultMessage='<a>@{acct}</a> has nudged you'
          values={{
            acct: account.acct,
            a: (chunks) => (
              <Link to={`/@${account.acct}`} onClick={handleLinkClick}>
                {chunks}
              </Link>
            ),
          }}
        />
      </span>
      <Button compact disabled={nudgedBack} onClick={handleNudgeBackClick}>
        {nudgedBack ? (
          <FormattedMessage id='nudges.nudged_back' defaultMessage='Nudged!' />
        ) : (
          <FormattedMessage
            id='nudges.nudge_back'
            defaultMessage='Nudge back'
          />
        )}
      </Button>
      <button
        className='nudge-alert__dismiss'
        onClick={handleDismissClick}
        type='button'
        aria-label='Dismiss'
      >
        ×
      </button>
    </div>
  );
};

// ── Conversation row ──────────────────────────────────────────────────────────

const ConversationRow: React.FC<{
  partner: ApiNudgePartner;
  previewImage: string;
  previewVideo: string;
  previewVoice: string;
  previewNudge: string;
}> = ({ partner, previewImage, previewVideo, previewVoice, previewNudge }) => {
  const account = useAppSelector((state) =>
    state.accounts.get(partner.account_id),
  );
  const isUnread =
    partner.can_nudge_back && partner.last_message.direction === 'received';

  if (!account) return null;

  const preview = lastMessagePreview(
    partner.last_message,
    previewImage,
    previewVideo,
    previewVoice,
    previewNudge,
  );

  return (
    <Link
      to={`/nudges/${partner.account_id}`}
      className={`nudge-conv-row${isUnread ? ' nudge-conv-row--unread' : ''}`}
    >
      <div className='nudge-conv-row__avatar'>
        <Avatar account={account} size={48} />
        {isUnread && <span className='nudge-conv-row__unread-dot' />}
      </div>

      <div className='nudge-conv-row__body'>
        <div className='nudge-conv-row__top'>
          <span className='nudge-conv-row__name'>
            <DisplayName account={account} />
          </span>
          {partner.last_nudge_at && (
            <span className='nudge-conv-row__time'>
              <RelativeTimestamp timestamp={partner.last_nudge_at} />
            </span>
          )}
        </div>

        <div className='nudge-conv-row__bottom'>
          <span
            className={`nudge-conv-row__preview${isUnread ? ' nudge-conv-row__preview--unread' : ''}`}
          >
            {preview}
          </span>
          {partner.streak > 1 && (
            <span className='nudge-conv-row__streak'>
              <Icon icon={PartnerExchangeActiveIcon} id='partner_exchange' />
              {partner.streak}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
};

// ── Suggestion row ────────────────────────────────────────────────────────────

const SuggestionRow: React.FC<{ suggestion: ApiNudgeSuggestion }> = ({
  suggestion,
}) => {
  const dispatch = useAppDispatch();
  const account = useAppSelector((state) =>
    state.accounts.get(suggestion.account_id),
  );
  const [nudged, setNudged] = useState(false);

  const handleNudge = useCallback(() => {
    if (nudged) return;
    dispatch(
      openModal({
        modalType: 'NUDGE_COMPOSE',
        modalProps: {
          accountId: suggestion.account_id,
          onSent: () => {
            setNudged(true);
          },
        },
      }),
    );
  }, [suggestion.account_id, nudged, dispatch]);

  if (!account) return null;

  return (
    <div className='nudge-conv-row nudge-conv-row--suggestion'>
      <Link to={`/@${account.acct}`} className='nudge-conv-row__avatar'>
        <Avatar account={account} size={48} />
      </Link>
      <div className='nudge-conv-row__body'>
        <div className='nudge-conv-row__top'>
          <span className='nudge-conv-row__name'>
            <DisplayName account={account} />
          </span>
        </div>
        <div className='nudge-conv-row__bottom'>
          <span className='nudge-conv-row__preview'>@{account.acct}</span>
        </div>
      </div>
      <div className='nudge-conv-row__action'>
        {nudged ? (
          <Button compact disabled>
            <FormattedMessage
              id='nudges.nudged_back'
              defaultMessage='Nudged!'
            />
          </Button>
        ) : (
          <Button compact onClick={handleNudge}>
            <Icon icon={PartnerExchangeActiveIcon} id='partner_exchange' />
          </Button>
        )}
      </div>
    </div>
  );
};

// ── Page ──────────────────────────────────────────────────────────────────────

export const NudgesPage: React.FC<{ multiColumn?: boolean }> = ({
  multiColumn,
}) => {
  const intl = useIntl();
  const dispatch = useAppDispatch();
  const columnRef = useRef<ColumnRef>(null);
  const seenGroupsRef = useRef<Map<string, string> | null>(null);

  const [partners, setPartners] = useState<ApiNudgePartner[]>([]);
  const [suggestions, setSuggestions] = useState<ApiNudgeSuggestion[]>([]);
  const [grandTotal, setGrandTotal] = useState(0);
  const [totalSent, setTotalSent] = useState(0);
  const [totalReceived, setTotalReceived] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [alerts, setAlerts] = useState<NudgeAlertData[]>([]);
  const [nudgingAll, setNudgingAll] = useState(false);
  const [nudgedAll, setNudgedAll] = useState(false);

  const previewImage = intl.formatMessage(messages.previewImage);
  const previewVideo = intl.formatMessage(messages.previewVideo);
  const previewVoice = intl.formatMessage(messages.previewVoice);
  const previewNudge = intl.formatMessage(messages.previewNudge);

  const nudgeGroups = useAppSelector((state) =>
    [
      ...state.notificationGroups.groups,
      ...state.notificationGroups.pendingGroups,
    ].filter((g): g is NotificationGroupNudge => g.type === 'nudge'),
  );

  const dismissAlert = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGetNudgePartners();
      if (data.accounts.length) dispatch(importFetchedAccounts(data.accounts));
      setPartners(data.partners);
      setSuggestions(data.suggestions);
      setGrandTotal(data.grand_total);
      setTotalSent(data.total_sent);
      setTotalReceived(data.total_received);
      dispatch(setUnreadNudgeCount(data.pending_count));
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [dispatch]);

  useEffect(() => {
    void load();
  }, [load]);

  // Fallback poll — keeps inbox fresh if streaming misses an event
  useEffect(() => {
    const id = setInterval(() => {
      void load();
    }, 15000);
    return () => {
      clearInterval(id);
    };
  }, [load]);

  useEffect(() => {
    if (seenGroupsRef.current === null) {
      seenGroupsRef.current = new Map(
        nudgeGroups.map((g) => [g.group_key, g.latest_page_notification_at]),
      );
      return;
    }

    const seenGroups = seenGroupsRef.current;
    const newAlerts: NudgeAlertData[] = [];
    nudgeGroups.forEach((group) => {
      const seen = seenGroups.get(group.group_key);
      if (seen !== group.latest_page_notification_at) {
        const accountId = group.sampleAccountIds[0];
        if (accountId) {
          newAlerts.push({
            id: `${group.group_key}-${group.latest_page_notification_at}`,
            accountId,
          });
        }
        seenGroups.set(group.group_key, group.latest_page_notification_at);
      }
    });

    if (newAlerts.length > 0) {
      setAlerts((prev) => [...newAlerts, ...prev].slice(0, 5));
      void load();
    }
  }, [nudgeGroups, load]);

  const handleHeaderClick = useCallback(() => {
    columnRef.current?.scrollTop();
  }, []);

  const handleNudgeAllBack = useCallback(() => {
    const pending = partners.filter(
      (p) => p.can_nudge_back && p.last_message.direction === 'received',
    );
    if (pending.length === 0 || nudgingAll || nudgedAll) return;
    setNudgingAll(true);
    void (async () => {
      for (const p of pending) {
        try {
          await apiNudgeAccount(p.account_id);
          dispatch(decrementNudgeCount());
        } catch {
          // skip failed individual nudges
        }
      }
      setNudgingAll(false);
      setNudgedAll(true);
      setTimeout(() => {
        setNudgedAll(false);
      }, 3000);
      void load();
    })();
  }, [partners, nudgingAll, nudgedAll, dispatch, load]);

  // Sort conversations by most recent activity
  const sortedPartners = [...partners].sort((a, b) => {
    const tA = a.last_nudge_at ? new Date(a.last_nudge_at).getTime() : 0;
    const tB = b.last_nudge_at ? new Date(b.last_nudge_at).getTime() : 0;
    return tB - tA;
  });

  const unreadCount = partners.filter(
    (p) => p.can_nudge_back && p.last_message.direction === 'received',
  ).length;

  return (
    <Column
      bindToDocument={!multiColumn}
      ref={columnRef}
      label={intl.formatMessage(messages.title)}
    >
      <ColumnHeader
        icon='partner_exchange'
        iconComponent={PartnerExchangeActiveIcon}
        title={intl.formatMessage(messages.title)}
        onClick={handleHeaderClick}
        multiColumn={multiColumn}
        showBackButton
      />

      {alerts.length > 0 && (
        <div className='nudge-alerts'>
          {alerts.map((alert) => (
            <NudgeAlert key={alert.id} alert={alert} onDismiss={dismissAlert} />
          ))}
        </div>
      )}

      <div className='scrollable nudge-page'>
        {!loading && grandTotal > 0 && (
          <div className='nudge-grand-total'>
            <div className='nudge-grand-total__headline'>
              <span className='nudge-grand-total__count'>{grandTotal}</span>
              <span className='nudge-grand-total__label'>
                <FormattedMessage
                  id='nudges.grand_total_label'
                  defaultMessage='Grand Total of Nudges'
                />
              </span>
            </div>
            <div className='nudge-grand-total__breakdown'>
              <div className='nudge-grand-total__stat'>
                <span className='nudge-grand-total__stat-number nudge-grand-total__stat-number--sent'>
                  {totalSent}
                </span>
                <span className='nudge-grand-total__stat-label'>
                  <FormattedMessage
                    id='nudges.total_sent'
                    defaultMessage='SENT'
                  />
                </span>
              </div>
              <div className='nudge-grand-total__stat-divider' />
              <div className='nudge-grand-total__stat'>
                <span className='nudge-grand-total__stat-number nudge-grand-total__stat-number--received'>
                  {totalReceived}
                </span>
                <span className='nudge-grand-total__stat-label'>
                  <FormattedMessage
                    id='nudges.total_received'
                    defaultMessage='RECEIVED'
                  />
                </span>
              </div>
              {unreadCount > 0 && (
                <>
                  <div className='nudge-grand-total__stat-divider' />
                  <div className='nudge-grand-total__stat'>
                    <span className='nudge-grand-total__stat-number nudge-grand-total__stat-number--new'>
                      {unreadCount}
                    </span>
                    <span className='nudge-grand-total__stat-label'>
                      <FormattedMessage
                        id='nudges.unread_count_label'
                        defaultMessage='NEW'
                      />
                    </span>
                  </div>
                </>
              )}
            </div>
            {unreadCount > 0 && (
              <div className='nudge-grand-total__actions'>
                <Button
                  compact
                  disabled={nudgingAll || nudgedAll}
                  onClick={handleNudgeAllBack}
                >
                  {nudgedAll
                    ? intl.formatMessage(messages.nudgeAllBackDone)
                    : nudgingAll
                      ? '…'
                      : intl.formatMessage(messages.nudgeAllBack)}
                </Button>
              </div>
            )}
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
              id='nudges.error'
              defaultMessage='Could not load nudges. Try refreshing.'
            />
          </div>
        )}

        {!loading &&
          !loadError &&
          partners.length === 0 &&
          suggestions.length === 0 && (
            <div className='nudge-empty-state'>
              <Icon
                icon={PartnerExchangeActiveIcon}
                id='partner_exchange'
                className='nudge-empty-state__icon'
              />
              <p className='nudge-empty-state__title'>
                <FormattedMessage
                  id='nudges.empty_title'
                  defaultMessage='No nudges yet'
                />
              </p>
              <p className='nudge-empty-state__body'>
                <FormattedMessage
                  id='nudges.empty_body'
                  defaultMessage='Nudge someone to start a conversation. Find people to follow first if this list is empty.'
                />
              </p>
            </div>
          )}

        {!loading && !loadError && sortedPartners.length > 0 && (
          <div className='nudge-conv-list'>
            {sortedPartners.map((partner) => (
              <ConversationRow
                key={partner.account_id}
                partner={partner}
                previewImage={previewImage}
                previewVideo={previewVideo}
                previewVoice={previewVoice}
                previewNudge={previewNudge}
              />
            ))}
          </div>
        )}

        {!loading && !loadError && suggestions.length > 0 && (
          <>
            <div className='nudge-section-header nudge-section-header--suggestions'>
              <FormattedMessage
                id='nudges.section_suggestions'
                defaultMessage='NUDGE SOMEONE'
              />
            </div>
            {suggestions.slice(0, 3).map((s) => (
              <SuggestionRow key={s.account_id} suggestion={s} />
            ))}
          </>
        )}
      </div>

      <Helmet>
        <title>{intl.formatMessage(messages.title)}</title>
        <meta name='robots' content='noindex' />
      </Helmet>
    </Column>
  );
};

// eslint-disable-next-line import/no-default-export
export default NudgesPage;
