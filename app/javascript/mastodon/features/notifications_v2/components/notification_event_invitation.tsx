import { FormattedMessage, FormattedDate, FormattedTime } from 'react-intl';

import { Link } from 'react-router-dom';

import CalendarMonthIcon from '@/material-icons/400-24px/calendar_month.svg?react';
import VideocamIcon from '@/material-icons/400-24px/diversity_2.svg?react';
import { Icon } from 'mastodon/components/icon';
import type { NotificationGroupEventInvitation } from 'mastodon/models/notification_group';

import type { LabelRenderer } from './notification_group_with_status';
import { NotificationGroupWithStatus } from './notification_group_with_status';

const labelRenderer: LabelRenderer = (displayedName, total) => {
  if (total === 1)
    return (
      <FormattedMessage
        id='notification.event_invitation'
        defaultMessage='{name} invited you to an event'
        values={{ name: displayedName }}
      />
    );

  return (
    <FormattedMessage
      id='notification.event_invitation.name_and_others'
      defaultMessage='{name} and {count, plural, one {# other} other {# others}} invited you to an event'
      values={{
        name: displayedName,
        count: total - 1,
      }}
    />
  );
};

export const NotificationEventInvitation: React.FC<{
  notification: NotificationGroupEventInvitation;
  unread: boolean;
}> = ({ notification, unread }) => {
  const inv = notification.eventInvitation;

  if (!inv) return null;

  const isHuddle = inv.event_type === 'huddle';

  return (
    <NotificationGroupWithStatus
      type='event_invitation'
      icon={CalendarMonthIcon}
      iconId='calendar-month'
      accountIds={notification.sampleAccountIds}
      timestamp={notification.latest_page_notification_at}
      count={notification.notifications_count}
      labelRenderer={labelRenderer}
      unread={unread}
      additionalContent={
        <Link
          to={`/kalendar/${inv.event_id}`}
          className='notification-event-card'
        >
          <div className='notification-event-card__date-badge'>
            <span className='notification-event-card__date-badge__month'>
              <FormattedDate value={inv.event_start_time} month='short' />
            </span>
            <span className='notification-event-card__date-badge__day'>
              <FormattedDate value={inv.event_start_time} day='numeric' />
            </span>
          </div>
          <div className='notification-event-card__info'>
            <div className='notification-event-card__title'>
              <Icon
                id={isHuddle ? 'videocam' : 'calendar_month'}
                icon={isHuddle ? VideocamIcon : CalendarMonthIcon}
              />
              {inv.event_title}
            </div>
            <div className='notification-event-card__meta'>
              <FormattedDate value={inv.event_start_time} weekday='short' />{' '}
              <FormattedTime value={inv.event_start_time} />
            </div>
          </div>
        </Link>
      }
    />
  );
};
