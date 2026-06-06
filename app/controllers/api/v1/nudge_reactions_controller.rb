# frozen_string_literal: true

class Api::V1::NudgeReactionsController < Api::BaseController
  before_action -> { doorkeeper_authorize! :write, :'write:accounts' }
  before_action :require_user!
  before_action :set_notification

  def create
    emoji = params[:emoji].to_s.strip
    return render json: { error: 'Emoji required' }, status: 422 if emoji.blank?
    return render json: { error: 'Invalid emoji' }, status: 422 if emoji.length > 8

    NudgeReaction.find_or_create_by!(
      notification: @notification,
      account: current_user.account
    ) { |r| r.emoji = emoji }.tap { |r| r.update!(emoji: emoji) }

    render json: reactions_json
  end

  def destroy
    NudgeReaction.find_by(notification: @notification, account: current_user.account)&.destroy
    render json: reactions_json
  end

  private

  def set_notification
    @notification = Notification.find(params[:id])
    return if @notification.account_id == current_user.account_id || @notification.from_account_id == current_user.account_id

    render json: { error: 'Not found' }, status: 404
  end

  def reactions_json
    counts = NudgeReaction.where(notification: @notification).group(:emoji).count
    me = NudgeReaction.find_by(notification: @notification, account: current_user.account)&.emoji
    counts.each_with_object({}) do |(emoji, count), hash|
      hash[emoji] = { count: count, me: me == emoji }
    end
  end
end
