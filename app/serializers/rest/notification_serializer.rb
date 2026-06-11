# frozen_string_literal: true

class REST::NotificationSerializer < ActiveModel::Serializer
  # Please update app/javascript/api_types/notification.ts when making changes to the attributes
  attributes :id, :type, :created_at, :group_key

  attribute :filtered, if: :filtered?

  belongs_to :from_account, key: :account, serializer: REST::AccountSerializer
  belongs_to :target_status, key: :status, if: :status_type?, serializer: REST::StatusSerializer
  belongs_to :report, if: :report_type?, serializer: REST::ReportSerializer
  belongs_to :account_relationship_severance_event, key: :event, if: :relationship_severance_event?, serializer: REST::AccountRelationshipSeveranceEventSerializer
  belongs_to :account_warning, key: :moderation_warning, if: :moderation_warning_event?, serializer: REST::AccountWarningSerializer

  def id
    object.id.to_s
  end

  def group_key
    object.group_key || "ungrouped-#{object.id}"
  end

  def status_type?
    [:favourite, :reblog, :status, :mention, :poll, :update, :quoted_update, :quote].include?(object.type)
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

  attribute :nudge_streak, if: :nudge_type?
  attribute :nudge_message, if: :nudge_type?
  attribute :nudge_reactions, if: :nudge_type?

  def nudge_type?
    object.type == :nudge
  end

  attribute :media_tag_preview_url, if: :media_tag_type?
  attribute :media_tag_status_path, if: :media_tag_type?

  def media_tag_type?
    object.type == :media_tag
  end

  def media_tag_preview_url
    url = object.activity&.media_attachment&.file&.url(:small)
    full_asset_url(url) if url
  end

  def media_tag_status_path
    status = object.activity&.media_attachment&.status
    return nil unless status&.account

    "/@#{status.account.acct}/#{status.id}"
  end

  def nudge_streak
    a = object.account_id
    b = object.from_account_id
    Notification.where(type: 'nudge')
                .where('(account_id = ? AND from_account_id = ?) OR (account_id = ? AND from_account_id = ?)', a, b, b, a)
                .count
  end

  def nudge_message
    msg = object.nudge_message
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
    counts = NudgeReaction.where(notification: object).group(:emoji).count
    viewer = scope
    me = viewer ? NudgeReaction.find_by(notification: object, account: viewer.account)&.emoji : nil
    NudgeReaction::ALLOWED_EMOJI.index_with do |emoji|
      { count: counts[emoji] || 0, me: me == emoji }
    end
  end

  delegate :filtered?, to: :object
end
