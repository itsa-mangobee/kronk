import { useState, useCallback } from 'react';

import { defineMessages, useIntl } from 'react-intl';

import api from 'mastodon/api';

import type { BoothSet } from '../types';

import { CoverPositionEditor } from './cover_position_editor';
import { EventCombobox } from './event_combobox';
import type { EventSelection } from './event_combobox';
import { GenreTagInput } from './genre_tag_input';

const messages = defineMessages({
  title: { id: 'booth.upload.title', defaultMessage: 'Title' },
  artist: { id: 'booth.upload.artist', defaultMessage: 'Artist / DJ name' },
  event: { id: 'booth.upload.event', defaultMessage: 'Event name (optional)' },
  eventDate: {
    id: 'booth.upload.event_date',
    defaultMessage: 'Event date (optional)',
  },
  genre: { id: 'booth.upload.genre', defaultMessage: 'Genre (optional)' },
  description: {
    id: 'booth.upload.description',
    defaultMessage: 'Description (optional)',
  },
  cover: {
    id: 'booth.upload.cover',
    defaultMessage: 'Cover image (optional)',
  },
  save: { id: 'booth.edit.save', defaultMessage: 'Save changes' },
  cancel: { id: 'booth.upload.cancel', defaultMessage: 'Cancel' },
  removeCover: {
    id: 'booth.edit.remove_cover',
    defaultMessage: 'Remove cover',
  },
  heading: { id: 'booth.edit.heading', defaultMessage: 'Edit set' },
});

interface Props {
  set: BoothSet;
  onSuccess: (updated: BoothSet) => void;
  onCancel: () => void;
}

const COVER_LIMIT = 1 * 1024 * 1024 * 1024;

function formatSize(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${Math.round(bytes / 1_000)} KB`;
}

async function uploadMedia(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  const res = await api().post<{ id: string }>('/api/v1/media', form);
  return res.data.id;
}

export const EditForm: React.FC<Props> = ({ set, onSuccess, onCancel }) => {
  const intl = useIntl();
  const [title, setTitle] = useState(set.title);
  const [artistName, setArtistName] = useState(set.artist_name);
  const [eventId, setEventId] = useState<string | null>(set.event_id);
  const [eventName, setEventName] = useState(set.event_name ?? '');
  const [eventDate, setEventDate] = useState(set.event_date ?? '');
  const [genres, setGenres] = useState<string[]>(set.genres);
  const [description, setDescription] = useState(set.description);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [removeCover, setRemoveCover] = useState(false);
  const [coverOffsetY, setCoverOffsetY] = useState(set.cover_offset_y ?? 50);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setTitle(e.target.value);
    },
    [],
  );

  const handleArtistChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setArtistName(e.target.value);
    },
    [],
  );

  const handleDescriptionChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setDescription(e.target.value);
    },
    [],
  );

  const handleEventLink = useCallback((data: EventSelection) => {
    setEventId(data.id);
    setEventName(data.name);
    setEventDate(data.date);
  }, []);

  const handleEventNameChange = useCallback((name: string) => {
    setEventId(null);
    setEventName(name);
  }, []);

  const handleEventClear = useCallback(() => {
    setEventId(null);
    setEventName('');
    setEventDate('');
  }, []);

  const handleEventDateChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setEventDate(e.target.value);
    },
    [],
  );

  const handleRemoveCoverClick = useCallback(() => {
    setRemoveCover(true);
  }, []);

  const handleCoverFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0] ?? null;
      if (file && file.size > COVER_LIMIT) {
        setCoverError(
          `File is too large (${formatSize(file.size)}). Maximum is 1 GB.`,
        );
        setCoverFile(null);
        setCoverPreviewUrl(null);
        e.target.value = '';
      } else {
        setCoverError(null);
        setCoverFile(file);
        setRemoveCover(false);
        setCoverPreviewUrl(file ? URL.createObjectURL(file) : null);
      }
    },
    [],
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setSaving(true);
      setError(null);

      void (async () => {
        try {
          const payload: Record<string, unknown> = {
            title,
            artist_name: artistName,
            genres,
            cover_offset_y: coverOffsetY,
            event_id: eventId ?? '',
          };
          if (eventName) payload.event_name = eventName;
          if (eventDate) payload.event_date = eventDate;
          if (description) payload.description = description;

          if (removeCover) {
            payload.remove_cover = 'true';
          } else if (coverFile) {
            payload.cover_id = await uploadMedia(coverFile);
          }

          const res = await api().patch<BoothSet>(
            `/api/v1/booth_sets/${set.id}`,
            payload,
          );
          onSuccess(res.data);
        } catch {
          setError('Could not save changes — please try again.');
          setSaving(false);
        }
      })();
    },
    [
      title,
      artistName,
      eventId,
      eventName,
      eventDate,
      genres,
      description,
      coverFile,
      coverOffsetY,
      removeCover,
      set.id,
      onSuccess,
    ],
  );

  return (
    <form className='booth-upload-form' onSubmit={handleSubmit}>
      <h3 className='booth-upload-form__heading'>
        {intl.formatMessage(messages.heading)}
      </h3>

      {error && <div className='booth-upload-form__error'>{error}</div>}

      <label className='booth-upload-form__field'>
        <span>{intl.formatMessage(messages.title)} *</span>
        <input
          type='text'
          value={title}
          onChange={handleTitleChange}
          required
          maxLength={200}
          disabled={saving}
        />
      </label>

      <label className='booth-upload-form__field'>
        <span>{intl.formatMessage(messages.artist)} *</span>
        <input
          type='text'
          value={artistName}
          onChange={handleArtistChange}
          required
          maxLength={200}
          disabled={saving}
        />
      </label>

      <div className='booth-upload-form__field'>
        <span>{intl.formatMessage(messages.event)}</span>
        <EventCombobox
          eventId={eventId}
          eventName={eventName}
          onLink={handleEventLink}
          onNameChange={handleEventNameChange}
          onClear={handleEventClear}
          disabled={saving}
        />
      </div>

      {!eventId && (
        <label className='booth-upload-form__field'>
          <span>{intl.formatMessage(messages.eventDate)}</span>
          <input
            type='date'
            value={eventDate}
            onChange={handleEventDateChange}
            disabled={saving}
          />
        </label>
      )}

      <div className='booth-upload-form__field'>
        <span>{intl.formatMessage(messages.genre)}</span>
        <GenreTagInput value={genres} onChange={setGenres} disabled={saving} />
      </div>

      <label className='booth-upload-form__field'>
        <span>{intl.formatMessage(messages.description)}</span>
        <textarea
          value={description}
          onChange={handleDescriptionChange}
          rows={3}
          maxLength={5000}
          disabled={saving}
        />
      </label>

      <div className='booth-upload-form__field'>
        <span>{intl.formatMessage(messages.cover)}</span>

        {(coverPreviewUrl ?? (set.cover_url && !removeCover)) && (
          <CoverPositionEditor
            coverUrl={coverPreviewUrl ?? set.cover_url ?? ''}
            offsetY={coverOffsetY}
            onChange={setCoverOffsetY}
            disabled={saving}
          />
        )}

        {set.cover_url && !removeCover && !coverPreviewUrl && (
          <button
            type='button'
            className='booth-edit-form__remove-cover'
            onClick={handleRemoveCoverClick}
            disabled={saving}
          >
            {intl.formatMessage(messages.removeCover)}
          </button>
        )}

        <input
          type='file'
          accept='image/*'
          onChange={handleCoverFileChange}
          disabled={saving}
        />
        {coverError && (
          <span className='booth-upload-form__file-error'>{coverError}</span>
        )}
      </div>

      <div className='booth-upload-form__actions'>
        <button
          type='button'
          className='booth-upload-form__cancel'
          onClick={onCancel}
          disabled={saving}
        >
          {intl.formatMessage(messages.cancel)}
        </button>
        <button
          type='submit'
          className='booth-upload-form__submit'
          disabled={saving || !title || !artistName}
        >
          {saving ? 'Saving…' : intl.formatMessage(messages.save)}
        </button>
      </div>
    </form>
  );
};
