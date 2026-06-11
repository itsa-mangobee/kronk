# frozen_string_literal: true

class NudgeReaction < ApplicationRecord
  belongs_to :notification
  belongs_to :account

  validates :emoji, presence: true, length: { maximum: 8 }
  validates :account_id, uniqueness: { scope: :notification_id }
end
