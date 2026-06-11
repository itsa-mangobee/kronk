# frozen_string_literal: true

class NudgeService < BaseService
  CONSECUTIVE_LIMIT = 5

  def call(source_account, target_account, text: nil, media_attachment_id: nil, voice_attachment_id: nil, in_reply_to_notification_id: nil)
    return if source_account.id == target_account.id
    raise Mastodon::NotPermittedError unless nudge_allowed?(source_account, target_account)

    # Use the sender's Account record as the activity so no separate table is needed.
    # NotifyService is called directly (not via LocalNotificationWorker) to skip the
    # dedup guard, allowing multiple nudges between the same pair of users.
    # skip_push: true defers streaming dispatch so we can attach the NudgeMessage
    # before the receiver's client serializes the payload.
    notify_service = NotifyService.new
    notification = notify_service.call(target_account, 'nudge', source_account, skip_push: true)

    if notification && (text.present? || media_attachment_id.present? || voice_attachment_id.present? || in_reply_to_notification_id.present?)
      NudgeMessage.create!(
        notification: notification,
        body: text.presence,
        media_attachment_id: media_attachment_id.presence,
        voice_attachment_id: voice_attachment_id.presence,
        in_reply_to_notification_id: in_reply_to_notification_id.presence,
        expires_at: NudgeMessage::EXPIRY_HOURS.hours.from_now
      )
    end

    # Dispatch streaming + push now that the message is in the database.
    notify_service.dispatch! if notification

    notification
  end

  private

  def nudge_allowed?(source, target)
    recent = Notification.where(type: 'nudge')
                         .where(
                           '(account_id = ? AND from_account_id = ?) OR (account_id = ? AND from_account_id = ?)',
                           source.id, target.id, target.id, source.id
                         )
                         .order(id: :desc)
                         .limit(CONSECUTIVE_LIMIT)
                         .to_a
    # Always allowed if fewer than CONSECUTIVE_LIMIT messages exist
    return true if recent.length < CONSECUTIVE_LIMIT

    # Blocked only if all of the last CONSECUTIVE_LIMIT nudges came from source
    recent.any? { |n| n.from_account_id == target.id }
  end
end
