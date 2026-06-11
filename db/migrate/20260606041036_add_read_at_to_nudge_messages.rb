# frozen_string_literal: true

class AddReadAtToNudgeMessages < ActiveRecord::Migration[8.0]
  def change
    add_column :nudge_messages, :read_at, :datetime
  end
end
