# frozen_string_literal: true

class AddExpiresAtToNudgeMessages < ActiveRecord::Migration[8.0]
  def change
    add_column :nudge_messages, :expires_at, :datetime
  end
end
