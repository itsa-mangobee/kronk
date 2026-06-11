# frozen_string_literal: true

class REST::NotificationGroupSerializer < ActiveModel::Serializer
  include RoutingHelper

  # Please update app/javascript/api_types/notification.ts when making changes to the attributes
  attributes :group_key, :notifications_count, :type, :most_recent_notification_id

  attribute :page_min_id, if: :paginated?
  attribute :page_max_id, if: :paginated?
  attribute :latest_page_notification_at, if: :paginated?

  attribute :sample_account_ids
  attribute :status_id, if: :status_type?
  belongs_to :report, if: :report_type?, serializer: REST::ReportSerializer
  belongs_to :account_relationship_severance_event, key: :event, if: :relationship_severance_event?, serializer: REST::AccountRelationshipSeveranceEventSerializer
  belongs_to :account_warning, key: :moderation_warning, if: :moderation_warning_event?, serializer: REST::AccountWarningSerializer
  belongs_to :generated_annual_report, key: :annual_report, if: :annual_report_event?, serializer: REST::AnnualReportEventSerializer

  attribute :event_invitation, if: :event_invitation_type?
  attribute :nudge_streak, if: :nudge_type?
  attribute :nudge_message, if: :nudge_type?
  attribute :nudge_reactions, if: :nudge_type?

  def sample_account_ids
    object.sample_accounts.pluck(:id).map(&:to_s)
  end

  def status_id
    object.target_status&.id&.to_s
  end

  def status_type?
    [:favourite, :reblog, :status, :mention, :poll, :update, :quote, :quoted_update].include?(object.type)
  end

  def report_type?
    object.type == :'admin.report'
  end

  def relationship_severance_event?
    object.type == :severed_relationships
  end

  def moderation_warning_event?
    object.type == :moderation_warning
  end

  def annual_report_event?
    object.type == :annual_report
  end

  def event_invitation_type?
    object.type == :event_invitation
  end

  def nudge_type?
    object.type == :nudge
  end

  attribute :media_tag_preview_url, if: :media_tag_type?
  attribute :media_tag_status_path, if: :media_tag_type?

  def media_tag_type?
    object.type == :media_tag
  end

  def media_tag_preview_url
    url = object.notification&.activity&.media_attachment&.file&.url(:small)
    full_asset_url(url) if url
  end

  def media_tag_status_path
    status = object.notification&.activity&.media_attachment&.status
    return nil unless status&.account

    "/@#{status.account.acct}/#{status.id}"
  end

  def nudge_streak
    notif = object.notification
    a = notif.account_id
    b = notif.from_account_id
    Notification.where(type: 'nudge')
                .where('(account_id = ? AND from_account_id = ?) OR (account_id = ? AND from_account_id = ?)', a, b, b, a)
                .count
  end

  def nudge_message
    msg = object.notification&.nudge_message
    return nil unless msg

    reply_msg = msg.in_reply_to_notification&.nudge_message
    {
      body: msg.body,
      media_url: msg.media_attachment&.file&.url,
      voice_url: msg.voice_attachment&.file&.url,
      in_reply_to: reply_msg ? { body: reply_msg.body, media_url: reply_msg.media_attachment&.file&.url } : nil,
    }
  end

  def nudge_reactions
    notif = object.notification
    counts = NudgeReaction.where(notification: notif).group(:emoji).count
    viewer = scope
    me = viewer ? NudgeReaction.find_by(notification: notif, account: viewer.account)&.emoji : nil
    NudgeReaction::ALLOWED_EMOJI.index_with do |emoji|
      { count: counts[emoji] || 0, me: me == emoji }
    end
  end

  def event_invitation
    invitation = object.notification&.event_invitation
    return nil unless invitation&.event

    {
      event_id: invitation.event.id.to_s,
      event_title: invitation.event.title,
      event_start_time: invitation.event.start_time,
      event_type: invitation.event.event_type,
    }
  end

  def page_min_id
    object.pagination_data[:min_id].to_s
  end

  def page_max_id
    object.most_recent_notification_id.to_s
  end

  def latest_page_notification_at
    object.pagination_data[:latest_notification_at]
  end

  def paginated?
    object.pagination_data.present?
  end
end
