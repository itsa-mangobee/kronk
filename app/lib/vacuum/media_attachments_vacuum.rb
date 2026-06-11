# frozen_string_literal: true

class Vacuum::MediaAttachmentsVacuum
  TTL = 1.day.freeze

  def initialize(retention_period)
    @retention_period = retention_period
  end

  def perform
    vacuum_orphaned_records!
    vacuum_cached_files! if retention_period?
  end

  private

  def vacuum_cached_files!
    media_attachments_past_retention_period.find_in_batches do |media_attachments|
      AttachmentBatch.new(MediaAttachment, media_attachments).clear
    rescue => e
      Rails.logger.error("Skipping batch while removing cached media attachments due to error: #{e}")
    end
  end

  def vacuum_orphaned_records!
    orphaned_media_attachments.find_in_batches do |media_attachments|
      AttachmentBatch.new(MediaAttachment, media_attachments).delete
    rescue => e
      Rails.logger.error("Skipping batch while removing orphaned media attachments due to error: #{e}")
    end
  end

  def media_attachments_past_retention_period
    MediaAttachment
      .remote
      .cached
      .created_before(@retention_period.ago)
      .updated_before(@retention_period.ago)
  end

  def orphaned_media_attachments
    booth_set_attachment_ids = BoothSet.where.not(audio_attachment_id: nil).select(:audio_attachment_id)
      .union(BoothSet.where.not(cover_attachment_id: nil).select(:cover_attachment_id))

    MediaAttachment
      .unattached
      .where.not(id: booth_set_attachment_ids)
      .created_before(TTL.ago)
  end

  def retention_period?
    @retention_period.present?
  end
end
