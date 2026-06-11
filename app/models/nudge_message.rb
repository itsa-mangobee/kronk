# frozen_string_literal: true

class NudgeMessage < ApplicationRecord
  belongs_to :notification
  belongs_to :media_attachment, optional: true
  belongs_to :voice_attachment, class_name: 'MediaAttachment', optional: true
  belongs_to :in_reply_to_notification, class_name: 'Notification', optional: true

  MAX_WORDS = 100
  EXPIRY_HOURS = 24

  scope :not_expired, -> { where('expires_at IS NULL OR expires_at > ?', Time.current) }

  def expired?
    expires_at.present? && expires_at <= Time.current
  end

  validate :word_count_within_limit

  private

  def word_count_within_limit
    return if body.blank?

    errors.add(:body, "exceeds #{MAX_WORDS} word limit") if body.split.size > MAX_WORDS
  end
end
