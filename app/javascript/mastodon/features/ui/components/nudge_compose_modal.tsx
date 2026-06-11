import { useCallback, useRef, useState, useEffect } from 'react';

import { FormattedMessage } from 'react-intl';

import MicIcon from '@/material-icons/400-24px/mic.svg?react';
import PartnerExchangeIcon from '@/material-icons/400-24px/partner_exchange-fill.svg?react';
import StopIcon from '@/material-icons/400-24px/stop.svg?react';
import { apiNudgeAccount } from 'mastodon/api/accounts';
import { Avatar } from 'mastodon/components/avatar';
import { Button } from 'mastodon/components/button';
import { Icon } from 'mastodon/components/icon';
import { useAppSelector } from 'mastodon/store';

const MAX_WORDS = 100;
const MAX_VOICE_SECONDS = 30;

function countWords(text: string): number {
  return text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
}

async function uploadBlob(blob: Blob, csrfToken: string): Promise<string> {
  let uploadType: string;
  let ext: string;
  if (blob.type.startsWith('audio/ogg')) {
    uploadType = 'audio/ogg';
    ext = 'ogg';
  } else if (
    blob.type.startsWith('audio/mp4') ||
    blob.type.startsWith('audio/x-m4a')
  ) {
    uploadType = 'audio/mp4';
    ext = 'm4a';
  } else {
    uploadType = 'video/webm';
    ext = 'webm';
  }
  const form = new FormData();
  form.append('file', new File([blob], `voice.${ext}`, { type: uploadType }));
  const res = await fetch('/api/v2/media', {
    method: 'POST',
    body: form,
    headers: { 'X-CSRF-Token': csrfToken },
    credentials: 'same-origin',
  });
  if (!res.ok) throw new Error('upload failed');
  const json = (await res.json()) as { id: string };
  return json.id;
}

export const NudgeComposeModal: React.FC<{
  accountId: string;
  inReplyToNotificationId?: string;
  onClose: () => void;
  onSent?: (streak: number) => void;
}> = ({ accountId, inReplyToNotificationId, onClose, onSent }) => {
  const account = useAppSelector((state) => state.accounts.get(accountId));

  // 'choose' = picking between just-nudge and add-message
  // 'compose' = writing a message
  const [mode, setMode] = useState<'choose' | 'compose'>(
    inReplyToNotificationId ? 'compose' : 'choose',
  );

  const [text, setText] = useState('');
  const [mediaId, setMediaId] = useState<string | undefined>();
  const [mediaPreview, setMediaPreview] = useState<string | undefined>();
  const [voiceId, setVoiceId] = useState<string | undefined>();
  const [voiceBlob, setVoiceBlob] = useState<Blob | undefined>();
  const [recording, setRecording] = useState(false);
  const [voiceSeconds, setVoiceSeconds] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const wordCount = countWords(text);
  const overLimit = wordCount > MAX_WORDS;

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
      mediaRecorderRef.current?.stop();
    },
    [],
  );

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setText(e.target.value);
    },
    [],
  );

  const handleAttachClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setUploading(true);
      void (async () => {
        try {
          const formData = new FormData();
          formData.append('file', file);
          const csrfMeta = document.querySelector<HTMLMetaElement>(
            'meta[name="csrf-token"]',
          );
          const response = await fetch('/api/v2/media', {
            method: 'POST',
            body: formData,
            headers: { 'X-CSRF-Token': csrfMeta?.content ?? '' },
            credentials: 'same-origin',
          });
          if (response.ok) {
            const json = (await response.json()) as { id: string };
            setMediaId(json.id);
            setMediaPreview(URL.createObjectURL(file));
          }
        } finally {
          setUploading(false);
        }
      })();
    },
    [],
  );

  const handleRemoveImage = useCallback(() => {
    setMediaId(undefined);
    setMediaPreview(undefined);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleRemoveVoice = useCallback(() => {
    setVoiceId(undefined);
    setVoiceBlob(undefined);
    setVoiceSeconds(0);
  }, []);

  const startRecording = useCallback(() => {
    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        const mimeType =
          (
            [
              'audio/ogg;codecs=opus',
              'audio/mp4',
              'audio/webm;codecs=opus',
              'audio/webm',
            ] as const
          ).find((t) => MediaRecorder.isTypeSupported(t)) ?? 'audio/webm';
        const recorder = new MediaRecorder(stream, {
          mimeType,
          audioBitsPerSecond: 128_000,
        });
        chunksRef.current = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        recorder.onstop = () => {
          stream.getTracks().forEach((t) => {
            t.stop();
          });
          const blob = new Blob(chunksRef.current, {
            type: recorder.mimeType || 'audio/webm',
          });
          setVoiceBlob(blob);
          setRecording(false);
          if (timerRef.current) clearInterval(timerRef.current);
        };
        recorder.start();
        mediaRecorderRef.current = recorder;
        setRecording(true);
        setVoiceSeconds(0);
        timerRef.current = setInterval(() => {
          setVoiceSeconds((s) => {
            if (s + 1 >= MAX_VOICE_SECONDS) {
              recorder.stop();
              return s + 1;
            }
            return s + 1;
          });
        }, 1000);
      } catch {
        // mic permission denied — silently ignore
      }
    })();
  }, []);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
  }, []);

  const send = useCallback(
    async (withMessage: boolean) => {
      if (sending) return;
      setSending(true);
      setError(null);
      try {
        const csrfMeta = document.querySelector<HTMLMetaElement>(
          'meta[name="csrf-token"]',
        );
        const csrfToken = csrfMeta?.content ?? '';

        let resolvedVoiceId = voiceId;
        if (withMessage && voiceBlob && !voiceId) {
          resolvedVoiceId = await uploadBlob(voiceBlob, csrfToken);
          setVoiceId(resolvedVoiceId);
        }

        const params = withMessage
          ? {
              text: text.trim() || undefined,
              media_id: mediaId,
              voice_id: resolvedVoiceId,
              in_reply_to_notification_id: inReplyToNotificationId,
            }
          : {};
        const result = await apiNudgeAccount(accountId, params);
        onSent?.(result.streak);
        onClose();
      } catch (err: unknown) {
        const errData =
          err != null && typeof err === 'object' && 'response' in err
            ? (err as { response?: { data?: { error?: string } } }).response
                ?.data?.error
            : null;
        setError(
          errData === 'waiting_for_nudge_back'
            ? 'Waiting for them to nudge back first'
            : 'Failed to send — try again',
        );
      } finally {
        setSending(false);
      }
    },
    [
      accountId,
      text,
      mediaId,
      voiceId,
      voiceBlob,
      inReplyToNotificationId,
      sending,
      onSent,
      onClose,
    ],
  );

  const handleJustNudge = useCallback(() => void send(false), [send]);
  const handleSendNudge = useCallback(() => void send(true), [send]);
  const handleAddMessage = useCallback(() => {
    setMode('compose');
  }, []);

  if (!account) return null;

  const hasMessage =
    text.trim().length > 0 || !!mediaId || !!voiceBlob || !!voiceId;

  return (
    <div className='modal-root__modal nudge-compose-modal'>
      <div className='nudge-compose-modal__header'>
        <Icon icon={PartnerExchangeIcon} id='partner_exchange' />
        <h2>
          <FormattedMessage
            id='nudge_compose.title'
            defaultMessage='Nudge @{acct}'
            values={{ acct: account.acct }}
          />
        </h2>
      </div>

      {inReplyToNotificationId && (
        <div className='nudge-compose-modal__reply-banner'>
          <FormattedMessage
            id='nudge_compose.replying'
            defaultMessage='Replying to their nudge'
          />
        </div>
      )}

      <div className='nudge-compose-modal__recipient'>
        <Avatar account={account} size={36} />
        <span className='nudge-compose-modal__recipient-name'>
          {account.display_name || account.acct}
        </span>
      </div>

      {mode === 'choose' ? (
        <div className='nudge-compose-modal__options'>
          <Button disabled={sending} onClick={handleJustNudge}>
            <FormattedMessage
              id='nudge_compose.just_nudge'
              defaultMessage='Just nudge'
            />
          </Button>
          <button
            type='button'
            className='nudge-compose-modal__add-message-btn'
            onClick={handleAddMessage}
          >
            <FormattedMessage
              id='nudge_compose.add_message'
              defaultMessage='Add a message'
            />
          </button>
        </div>
      ) : (
        <div className='nudge-compose-modal__body'>
          <textarea
            className='nudge-compose-modal__textarea'
            placeholder='Write something… (optional)'
            value={text}
            onChange={handleTextChange}
            rows={4}
            maxLength={2000}
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />

          <div className='nudge-compose-modal__counter-row'>
            <div className='nudge-compose-modal__attach-group'>
              <button
                className='nudge-compose-modal__attach-btn'
                onClick={handleAttachClick}
                disabled={uploading || !!mediaId}
                type='button'
              >
                {uploading ? (
                  <FormattedMessage
                    id='nudge_compose.uploading'
                    defaultMessage='Uploading…'
                  />
                ) : (
                  <FormattedMessage
                    id='nudge_compose.attach_image'
                    defaultMessage='Attach image'
                  />
                )}
              </button>

              {!voiceBlob && !voiceId ? (
                <button
                  className={`nudge-compose-modal__voice-btn${recording ? ' nudge-compose-modal__voice-btn--recording' : ''}`}
                  onClick={recording ? stopRecording : startRecording}
                  type='button'
                  disabled={sending}
                >
                  <Icon
                    icon={recording ? StopIcon : MicIcon}
                    id={recording ? 'stop' : 'mic'}
                  />
                  {recording ? (
                    <span>{voiceSeconds}s</span>
                  ) : (
                    <FormattedMessage
                      id='nudge_compose.voice'
                      defaultMessage='Voice'
                    />
                  )}
                </button>
              ) : (
                <div className='nudge-compose-modal__voice-preview'>
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <audio
                    controls
                    src={voiceBlob ? URL.createObjectURL(voiceBlob) : undefined}
                    className='nudge-compose-modal__voice-audio'
                  />
                  <button
                    className='nudge-compose-modal__remove-img'
                    onClick={handleRemoveVoice}
                    type='button'
                    aria-label='Remove voice'
                  >
                    ×
                  </button>
                </div>
              )}
            </div>

            <span
              className={`nudge-compose-modal__word-count${overLimit ? ' nudge-compose-modal__word-count--over' : ''}`}
            >
              {wordCount}/{MAX_WORDS}
            </span>
          </div>

          <input
            ref={fileInputRef}
            type='file'
            accept='image/*'
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />

          {mediaPreview && (
            <div className='nudge-compose-modal__preview'>
              <img
                src={mediaPreview}
                alt=''
                className='nudge-compose-modal__preview-img'
              />
              <button
                className='nudge-compose-modal__remove-img'
                onClick={handleRemoveImage}
                type='button'
                aria-label='Remove image'
              >
                ×
              </button>
            </div>
          )}

          {error && <p className='nudge-compose-modal__error'>{error}</p>}

          <div className='nudge-compose-modal__actions'>
            <button className='link-button' onClick={onClose}>
              <FormattedMessage
                id='confirmation_modal.cancel'
                defaultMessage='Cancel'
              />
            </button>

            <div className='nudge-compose-modal__send-group'>
              <Button
                disabled={sending || overLimit}
                onClick={hasMessage ? handleSendNudge : handleJustNudge}
              >
                <FormattedMessage
                  id='nudge_compose.send_nudge'
                  defaultMessage='Send nudge'
                />
              </Button>
            </div>
          </div>
        </div>
      )}

      {mode === 'choose' && (
        <div className='nudge-compose-modal__choose-footer'>
          <button className='link-button' onClick={onClose}>
            <FormattedMessage
              id='confirmation_modal.cancel'
              defaultMessage='Cancel'
            />
          </button>
        </div>
      )}
    </div>
  );
};
