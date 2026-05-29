import { useEffect, useState, useCallback, useRef } from 'react';

import { defineMessages, FormattedMessage, useIntl } from 'react-intl';

import { AxiosError } from 'axios';

import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';

import PartnerExchangeActiveIcon from '@/material-icons/400-24px/partner_exchange-fill.svg?react';
import PartnerExchangeIcon from '@/material-icons/400-24px/partner_exchange.svg?react';
import { importFetchedAccounts } from 'mastodon/actions/importer';
import {
  decrementNudgeCount,
  setUnreadNudgeCount,
} from 'mastodon/actions/notification_groups';
import { apiNudgeAccount, apiGetNudgePartners } from 'mastodon/api/accounts';
import type { ApiNudgePartner } from 'mastodon/api/accounts';
import { Avatar } from 'mastodon/components/avatar';
import { Button } from 'mastodon/components/button';
import { Column } from 'mastodon/components/column';
import { ColumnHeader } from 'mastodon/components/column_header';
import { DisplayName } from 'mastodon/components/display_name';
import { Icon } from 'mastodon/components/icon';
import { RelativeTimestamp } from 'mastodon/components/relative_timestamp';
import type { NotificationGroupNudge } from 'mastodon/models/notification_group';
import { useAppDispatch, useAppSelector } from 'mastodon/store';

const MILESTONE_THRESHOLD = 10;

interface NudgeAlertData {
  id: string;
  accountId: string;
}

const messages = defineMessages({
  title: { id: 'nudges.title', defaultMessage: 'Nudges' },
});

// ── Live nudge alert banner ───────────────────────────────────────────────────

const NudgeAlert: React.FC<{
  alert: NudgeAlertData;
  onDismiss: (id: string) => void;
}> = ({ alert, onDismiss }) => {
  const dispatch = useAppDispatch();
  const account = useAppSelector((state) =>
    state.accounts.get(alert.accountId),
  );
  const [nudgedBack, setNudgedBack] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => onDismiss(alert.id), 8000);
    return () => window.clearTimeout(t);
  }, [alert.id, onDismiss]);

  const handleNudgeBack = useCallback(async () => {
    if (loading || nudgedBack) return;
    setLoading(true);
    try {
      await apiNudgeAccount(alert.accountId);
      setNudgedBack(true);
      dispatch(decrementNudgeCount());
    } catch (e: unknown) {
      if (e instanceof AxiosError && e.response?.status === 422) {
        setNudgedBack(true);
      }
    } finally {
      setLoading(false);
    }
  }, [alert.accountId, loading, nudgedBack, dispatch]);

  if (!account) return null;

  return (
    <div className='nudge-alert'>
      <Icon id='partner_exchange' icon={PartnerExchangeActiveIcon} className='nudge-alert__icon' />
      <span className='nudge-alert__text'>
        <FormattedMessage
          id='nudges.alert.nudged_by'
          defaultMessage='<a>@{acct}</a> nudged you!'
          values={{
            acct: account.acct,
            a: (chunks) => (
              <Link to={`/@${account.acct}`}>{chunks}</Link>
            ),
          }}
        />
      </span>
      <Button
        compact
        disabled={loading || nudgedBack}
        onClick={handleNudgeBack}
      >
        {nudgedBack ? (
          <FormattedMessage id='nudges.nudged_back' defaultMessage='Nudged!' />
        ) : (
          <FormattedMessage id='nudges.nudge_back' defaultMessage='Nudge back' />
        )}
      </Button>
      <button
        className='nudge-alert__dismiss'
        onClick={() => onDismiss(alert.id)}
        aria-label='Dismiss'
      >
        ×
      </button>
    </div>
  );
};

// ── Partner card ──────────────────────────────────────────────────────────────

const NudgePartnerItem: React.FC<{
  partner: ApiNudgePartner;
  onNudged: (accountId: string) => void;
}> = ({ partner, onNudged }) => {
  const dispatch = useAppDispatch();
  const account = useAppSelector((state) =>
    state.accounts.get(partner.account_id),
  );
  const [nudgedBack, setNudgedBack] = useState(false);
  const [loading, setLoading] = useState(false);
  const canNudge = partner.can_nudge_back && !nudgedBack;
  const total = partner.sent_count + partner.received_count;
  const isMilestone = total >= MILESTONE_THRESHOLD;

  const handleNudgeBack = useCallback(async () => {
    if (loading || !canNudge) return;
    setLoading(true);
    try {
      await apiNudgeAccount(partner.account_id);
      setNudgedBack(true);
      dispatch(decrementNudgeCount());
      onNudged(partner.account_id);
    } catch (e: unknown) {
      if (e instanceof AxiosError && e.response?.status === 422) {
        setNudgedBack(true);
        onNudged(partner.account_id);
      }
    } finally {
      setLoading(false);
    }
  }, [partner.account_id, loading, canNudge, dispatch, onNudged]);

  if (!account) return null;

  return (
    <div className={`nudge-partner-item${canNudge ? ' nudge-partner-item--active' : ''}`}>
      <Link to={`/@${account.acct}`} className='nudge-partner-item__avatar'>
        <Avatar account={account} size={46} />
      </Link>

      <div className='nudge-partner-item__body'>
        <div className='nudge-partner-item__name'>
          <Link to={`/@${account.acct}`}>
            <DisplayName account={account} />
          </Link>
          {isMilestone && <span className='nudge-partner-item__milestone-star' aria-label='milestone'>★</span>}
        </div>

        <div className='nudge-partner-item__meta'>
          <span className='nudge-partner-item__streak-sent'>
            ↑ {partner.sent_count}
          </span>
          <span className='nudge-partner-item__streak-received'>
            ↓ {partner.received_count}
          </span>
          {partner.last_nudge_at && (
            <span className='nudge-partner-item__time'>
              <RelativeTimestamp timestamp={partner.last_nudge_at} />
            </span>
          )}
        </div>
      </div>

      <div className='nudge-partner-item__action'>
        {canNudge ? (
          <Button compact disabled={loading} onClick={handleNudgeBack}>
            <FormattedMessage id='nudges.nudge_back' defaultMessage='Nudge back' />
          </Button>
        ) : nudgedBack ? (
          <Button compact disabled>
            <FormattedMessage id='nudges.nudged_back' defaultMessage='Nudged!' />
          </Button>
        ) : (
          <span className='nudge-partner-item__waiting'>
            <FormattedMessage id='nudges.awaiting_reply' defaultMessage='awaiting reply' />
          </span>
        )}
      </div>
    </div>
  );
};

// ── Page ──────────────────────────────────────────────────────────────────────

const NudgesPage: React.FC<{ multiColumn?: boolean }> = ({ multiColumn }) => {
  const intl = useIntl();
  const dispatch = useAppDispatch();
  const [partners, setPartners] = useState<ApiNudgePartner[]>([]);
  const [grandTotal, setGrandTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<NudgeAlertData[]>([]);

  const nudgeGroups = useAppSelector((state) =>
    [
      ...state.notificationGroups.groups,
      ...state.notificationGroups.pendingGroups,
    ].filter((g): g is NotificationGroupNudge => g.type === 'nudge'),
  );

  const seenGroupsRef = useRef<Map<string, string> | null>(null);

  const dismissAlert = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  // Move a partner from received → sent section after nudging back
  const handlePartnerNudged = useCallback((accountId: string) => {
    setPartners((prev) =>
      prev.map((p) =>
        p.account_id === accountId ? { ...p, can_nudge_back: false } : p,
      ),
    );
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGetNudgePartners();
      if (data.accounts?.length) dispatch(importFetchedAccounts(data.accounts));
      const loadedPartners = data.partners ?? [];
      setPartners(loadedPartners);
      setGrandTotal(data.grand_total ?? 0);
      dispatch(setUnreadNudgeCount(data.pending_count ?? 0));
    } finally {
      setLoading(false);
    }
  }, [dispatch]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (seenGroupsRef.current === null) {
      seenGroupsRef.current = new Map(
        nudgeGroups.map((g) => [g.group_key, g.latest_page_notification_at]),
      );
      return;
    }

    const newAlerts: NudgeAlertData[] = [];

    nudgeGroups.forEach((group) => {
      const seen = seenGroupsRef.current!.get(group.group_key);
      if (seen !== group.latest_page_notification_at) {
        const accountId = group.sampleAccountIds[0];
        if (accountId) {
          newAlerts.push({
            id: `${group.group_key}-${group.latest_page_notification_at}`,
            accountId,
          });
        }
        seenGroupsRef.current!.set(
          group.group_key,
          group.latest_page_notification_at,
        );
      }
    });

    if (newAlerts.length > 0) {
      setAlerts((prev) => [...newAlerts, ...prev].slice(0, 5));
      void load();
    }
  }, [nudgeGroups, load]);

  const received = partners.filter((p) => p.can_nudge_back);
  const sent = partners.filter((p) => !p.can_nudge_back);
  const totalSent = partners.reduce((s, p) => s + p.sent_count, 0);
  const totalReceived = partners.reduce((s, p) => s + p.received_count, 0);

  const handleNudgeAllBack = useCallback(async () => {
    await Promise.allSettled(
      received.map(async (p) => {
        try {
          await apiNudgeAccount(p.account_id);
          dispatch(decrementNudgeCount());
        } catch (e: unknown) {
          if (!(e instanceof AxiosError && e.response?.status === 422)) throw e;
        }
      }),
    );
    setPartners((prev) => prev.map((p) => ({ ...p, can_nudge_back: false })));
  }, [received, dispatch]);

  return (
    <Column
      bindToDocument={!multiColumn}
      label={intl.formatMessage(messages.title)}
    >
      <ColumnHeader
        icon='partner_exchange'
        iconComponent={PartnerExchangeActiveIcon}
        title={intl.formatMessage(messages.title)}
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

      <div className='scrollable'>
        {!loading && (
          <div className='nudge-grand-total'>
            <span className='nudge-grand-total__label'>
              <FormattedMessage
                id='nudges.grand_total_label'
                defaultMessage='Grand Total of Nudges'
              />
            </span>
            <span className='nudge-grand-total__count'>{grandTotal}</span>
            <div className='nudge-grand-total__divider' />
            <div className='nudge-grand-total__stats'>
              <div className='nudge-grand-total__stat'>
                <span className='nudge-grand-total__stat-number nudge-grand-total__stat-number--sent'>{totalSent}</span>
                <span className='nudge-grand-total__stat-label'>
                  <FormattedMessage id='nudges.total_sent' defaultMessage='SENT' />
                </span>
              </div>
              <div className='nudge-grand-total__stat-divider' />
              <div className='nudge-grand-total__stat'>
                <span className='nudge-grand-total__stat-number nudge-grand-total__stat-number--received'>{totalReceived}</span>
                <span className='nudge-grand-total__stat-label'>
                  <FormattedMessage id='nudges.total_received' defaultMessage='RECEIVED' />
                </span>
              </div>
            </div>
          </div>
        )}

        {loading && (
          <div className='loading-indicator'>
            <div className='loading-indicator__figure' />
          </div>
        )}

        {!loading && partners.length === 0 && (
          <div className='empty-column-indicator'>
            <FormattedMessage
              id='nudges.empty'
              defaultMessage='No nudges yet. Go nudge someone cute!'
            />
          </div>
        )}

        {!loading && received.length > 0 && (
          <>
            <div className='nudge-section-header nudge-section-header--received'>
              <FormattedMessage id='nudges.section_received' defaultMessage='NUDGES RECEIVED' />
            </div>
            {received.length >= 2 && (
              <div className='nudge-all-back'>
                <Button onClick={handleNudgeAllBack}>
                  <FormattedMessage
                    id='nudges.nudge_all_back'
                    defaultMessage='Nudge back all {count}'
                    values={{ count: received.length }}
                  />
                </Button>
              </div>
            )}
            {received.map((partner) => (
              <NudgePartnerItem
                key={partner.account_id}
                partner={partner}
                onNudged={handlePartnerNudged}
              />
            ))}
          </>
        )}

        {!loading && sent.length > 0 && (
          <>
            <div className='nudge-section-header nudge-section-header--sent'>
              <FormattedMessage id='nudges.section_sent' defaultMessage='NUDGES SENT' />
            </div>
            {sent.map((partner) => (
              <NudgePartnerItem
                key={partner.account_id}
                partner={partner}
                onNudged={handlePartnerNudged}
              />
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

export default NudgesPage;
