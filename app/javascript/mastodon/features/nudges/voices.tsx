/**
 * voices.tsx — Saved voice recording/playback code for nudges.
 * NOT imported anywhere — archived for future restoration.
 *
 * To restore: import these components and hooks into thread.tsx,
 * re-add voice state/refs, and re-wire the compose bar.
 *
 * See thread.tsx git history (before voice removal commit) for full integration.
 */

import { useEffect, useState, useCallback, useRef } from 'react';

import MicIcon from '@/material-icons/400-24px/mic.svg?react';
import PauseIcon from '@/material-icons/400-24px/pause-fill.svg?react';
import PlayArrowIcon from '@/material-icons/400-24px/play_arrow-fill.svg?react';
import StopIcon from '@/material-icons/400-24px/stop.svg?react';
import api from 'mastodon/api';
import { Icon } from 'mastodon/components/icon';

const MAX_VOICE_SECONDS = 60;
const WAVEFORM_BARS = 40;
const VOICE_PLAYER_BARS = 30;

// Decorative waveform for received voice messages (no amplitude data available)
const decorativeWaveform = Array.from({ length: VOICE_PLAYER_BARS }, (_, i) => {
  const x = i / (VOICE_PLAYER_BARS - 1);
  return 0.2 + 0.65 * Math.abs(Math.sin(x * Math.PI * 4 + 0.8));
});

export const VoicePlayer: React.FC<{ src: string; isSent: boolean }> = ({
  src,
  isSent,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = new Audio(src);
    audioRef.current = audio;
    audio.onloadedmetadata = () => {
      setDuration(audio.duration);
    };
    audio.ontimeupdate = () => {
      setElapsed(audio.currentTime);
      setProgress(audio.duration > 0 ? audio.currentTime / audio.duration : 0);
    };
    audio.onended = () => {
      setPlaying(false);
      setElapsed(0);
      setProgress(0);
    };
    return () => {
      audio.pause();
      audio.src = '';
    };
  }, [src]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      void audio.play();
      setPlaying(true);
    }
  }, [playing]);

  const fmtTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div
      className={`nudge-voice-player${isSent ? ' nudge-voice-player--sent' : ''}`}
    >
      <button
        type='button'
        className='nudge-voice-player__play'
        onClick={toggle}
        aria-label={playing ? 'Pause' : 'Play'}
      >
        <Icon
          icon={playing ? PauseIcon : PlayArrowIcon}
          id={playing ? 'pause' : 'play_arrow'}
        />
      </button>
      <div className='nudge-voice-player__waveform'>
        {decorativeWaveform.map((h, i) => (
          <span
            key={i}
            className={`nudge-voice-player__bar${i / VOICE_PLAYER_BARS < progress ? ' nudge-voice-player__bar--played' : ''}`}
            style={{ '--bar-h': String(h) } as React.CSSProperties}
          />
        ))}
      </div>
      <span className='nudge-voice-player__time'>
        {fmtTime(playing || elapsed > 0 ? elapsed : duration)}
      </span>
    </div>
  );
};

export const WaveformBars: React.FC<{ bars: number[]; live?: boolean }> = ({
  bars,
  live,
}) => (
  <div className={`nudge-waveform${live ? ' nudge-waveform--live' : ''}`}>
    {bars.map((h, i) => (
      <span
        key={i}
        className='nudge-waveform__bar'
        style={{ '--bar-h': String(Math.max(0.06, h)) } as React.CSSProperties}
      />
    ))}
  </div>
);

// Prefer ogg and mp4 — Paperclip's spoof detector correctly identifies both
// as audio. WebM is a last resort: the `file` command always reports WebM
// as video/webm, causing a 422 when declared as audio/webm. Spoofing as
// video/webm passes the check but routes through the video transcoder.
export async function uploadBlob(blob: Blob): Promise<string> {
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
  const { data } = await api().post<{ id: string }>('/api/v2/media', form);
  return data.id;
}

// ─── Voice recording hook ────────────────────────────────────────────────────
// All state, refs, and callbacks needed to record a voice memo.
// Re-add these to NudgesThread to restore the feature.

export function useVoiceRecording() {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const voiceSecondsRef = useRef(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const capturedSamplesRef = useRef<number[]>([]);
  const sampleIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const voiceUploadRef = useRef<Promise<string> | null>(null);

  const [voiceId, setVoiceId] = useState<string | undefined>();
  const [voiceBlob, setVoiceBlob] = useState<Blob | undefined>();
  const [voiceBlobUrl, setVoiceBlobUrl] = useState<string | undefined>();
  const [recording, setRecording] = useState(false);
  const [voiceSeconds, setVoiceSeconds] = useState(0);
  const [liveWaveformBars, setLiveWaveformBars] = useState<number[]>([]);
  const [capturedWaveform, setCapturedWaveform] = useState<number[]>([]);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);

  // Manage blob object URL lifecycle
  useEffect(() => {
    if (!voiceBlob) return;
    const url = URL.createObjectURL(voiceBlob);
    setVoiceBlobUrl(url);
    return () => {
      URL.revokeObjectURL(url);
      setVoiceBlobUrl(undefined);
    };
  }, [voiceBlob]);

  // Cleanup audio pipeline on unmount
  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
      mediaRecorderRef.current?.stop();
      if (animationFrameRef.current !== null)
        cancelAnimationFrame(animationFrameRef.current);
      if (sampleIntervalRef.current !== null)
        clearInterval(sampleIntervalRef.current);
      void audioCtxRef.current?.close();
    },
    [],
  );

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

        const audioCtx = new AudioContext();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.8;
        source.connect(analyser);
        audioCtxRef.current = audioCtx;
        analyserRef.current = analyser;

        const freqData = new Uint8Array(analyser.frequencyBinCount);
        const drawFrame = () => {
          analyser.getByteFrequencyData(freqData);
          const usable = Math.floor(freqData.length * 0.65);
          setLiveWaveformBars(
            Array.from({ length: WAVEFORM_BARS }, (_, i) => {
              const idx = Math.floor((i / WAVEFORM_BARS) * usable);
              return (freqData[idx] ?? 0) / 255;
            }),
          );
          animationFrameRef.current = requestAnimationFrame(drawFrame);
        };
        animationFrameRef.current = requestAnimationFrame(drawFrame);

        capturedSamplesRef.current = [];
        const timeData = new Uint8Array(analyser.fftSize);
        sampleIntervalRef.current = setInterval(() => {
          analyserRef.current?.getByteTimeDomainData(timeData);
          let sum = 0;
          for (const v of timeData) {
            const norm = v / 128 - 1;
            sum += norm * norm;
          }
          capturedSamplesRef.current.push(Math.sqrt(sum / timeData.length));
        }, 100);

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

          if (animationFrameRef.current !== null) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
          }
          if (sampleIntervalRef.current !== null) {
            clearInterval(sampleIntervalRef.current);
            sampleIntervalRef.current = null;
          }
          void audioCtxRef.current?.close();
          audioCtxRef.current = null;
          setLiveWaveformBars([]);

          const samples = capturedSamplesRef.current;
          const maxVal = Math.max(...samples, 0.001);
          const norm = samples.map((s) => s / maxVal);
          setCapturedWaveform(
            Array.from({ length: WAVEFORM_BARS }, (_, i) => {
              const t = norm.length <= 1 ? 0 : i / (WAVEFORM_BARS - 1);
              const si = Math.min(Math.floor(t * norm.length), norm.length - 1);
              return Math.max(0.08, norm[si] ?? 0.08);
            }),
          );

          const blob = new Blob(chunksRef.current, {
            type: recorder.mimeType || 'audio/webm',
          });
          const seconds = voiceSecondsRef.current;
          setRecording(false);
          if (timerRef.current) clearInterval(timerRef.current);
          setVoiceBlob(blob);
          setVoiceSeconds(seconds);
          voiceUploadRef.current = uploadBlob(blob);
        };
        recorder.start();
        mediaRecorderRef.current = recorder;
        setRecording(true);
        setVoiceSeconds(0);
        voiceSecondsRef.current = 0;
        timerRef.current = setInterval(() => {
          setVoiceSeconds((s) => {
            const next = s + 1;
            voiceSecondsRef.current = next;
            if (next >= MAX_VOICE_SECONDS) recorder.stop();
            return next;
          });
        }, 1000);
      } catch {
        // mic permission denied
      }
    })();
  }, []);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
  }, []);

  const handleRemoveVoice = useCallback(() => {
    setVoiceId(undefined);
    setVoiceBlob(undefined);
    setVoiceSeconds(0);
    setCapturedWaveform([]);
    setIsPlayingPreview(false);
    if (previewAudioRef.current) previewAudioRef.current.pause();
    voiceUploadRef.current = null;
  }, []);

  const onPreviewEnded = useCallback(() => {
    setIsPlayingPreview(false);
  }, []);

  const handlePlayPreview = useCallback(() => {
    const audio = previewAudioRef.current;
    if (!audio) return;
    if (isPlayingPreview) {
      audio.pause();
      setIsPlayingPreview(false);
    } else {
      void audio.play();
      setIsPlayingPreview(true);
    }
  }, [isPlayingPreview]);

  return {
    // State
    voiceId,
    setVoiceId,
    voiceBlob,
    setVoiceBlob,
    voiceBlobUrl,
    recording,
    voiceSeconds,
    liveWaveformBars,
    capturedWaveform,
    isPlayingPreview,
    // Refs
    previewAudioRef,
    voiceUploadRef,
    // Callbacks
    startRecording,
    stopRecording,
    handleRemoveVoice,
    onPreviewEnded,
    handlePlayPreview,
  };
}

// ─── Compose bar voice UI snippets ──────────────────────────────────────────
// These JSX blocks belong in the compose bar section of thread.tsx.
// See their exact positions in the git history.

/*
Mic button (in compose row, before send button):
  {!voiceBlob && !voiceId && (
    <button
      type='button'
      className='nudge-compose-bar__icon-btn'
      onClick={startRecording}
      disabled={sending || !canNudgeBack}
      aria-label={intl.formatMessage(messages.record)}
      title={intl.formatMessage(messages.record)}
    >
      <Icon icon={MicIcon} id='mic' />
    </button>
  )}

Recording in progress UI (before compose row, conditional on `recording`):
  {recording && (
    <div className='nudge-voice-recording'>
      <span className='nudge-voice-recording__dot' />
      <WaveformBars
        bars={liveWaveformBars.length > 0 ? liveWaveformBars : Array<number>(WAVEFORM_BARS).fill(0.05)}
        live
      />
      <span className='nudge-voice-recording__timer'>{voiceSeconds}s</span>
      <button type='button' className='nudge-voice-recording__stop' onClick={stopRecording} aria-label='Stop recording'>
        <Icon icon={StopIcon} id='stop' />
      </button>
    </div>
  )}

Pre-send voice preview (before compose row, conditional on !recording && (voiceBlob ?? voiceId)):
  {!recording && (voiceBlob ?? voiceId) && (
    <div className='nudge-voice-preview'>
      <button type='button' className='nudge-voice-preview__play' onClick={handlePlayPreview} aria-label={isPlayingPreview ? 'Pause' : 'Play'}>
        <Icon icon={isPlayingPreview ? PauseIcon : PlayArrowIcon} id={isPlayingPreview ? 'pause' : 'play_arrow'} />
      </button>
      <WaveformBars bars={capturedWaveform.length > 0 ? capturedWaveform : Array<number>(WAVEFORM_BARS).fill(0.3)} />
      <span className='nudge-voice-preview__dur'>{voiceSeconds}s</span>
      <button type='button' className='nudge-voice-preview__del' onClick={handleRemoveVoice} aria-label='Remove'>×</button>
      <audio ref={previewAudioRef} src={voiceBlobUrl} onEnded={onPreviewEnded} style={{ display: 'none' }} />
    </div>
  )}

In MessageBubble, inside the content (after media_url check):
  {msg.voice_url && (
    <VoicePlayer src={msg.voice_url} isSent={isSent} />
  )}
*/

// ─── send() voice params (in NudgesThread.send) ─────────────────────────────
/*
  let resolvedVoiceId = voiceId;
  if (withContent && voiceBlob && !voiceId) {
    try {
      resolvedVoiceId = await (voiceUploadRef.current ?? uploadBlob(voiceBlob));
    } catch {
      resolvedVoiceId = await uploadBlob(voiceBlob);
    }
    voiceUploadRef.current = null;
    setVoiceId(resolvedVoiceId);
  }
  // Add voice_id to params:
  const params = withContent
    ? { text: text.trim() || undefined, media_id: mediaId, voice_id: resolvedVoiceId, in_reply_to_notification_id: replyTo?.notification_id }
    : {};
*/

// ─── clearCompose() voice resets ────────────────────────────────────────────
/*
  setVoiceId(undefined);
  setVoiceBlob(undefined);
  setVoiceSeconds(0);
  setCapturedWaveform([]);
  setIsPlayingPreview(false);
  if (previewAudioRef.current) previewAudioRef.current.pause();
  voiceUploadRef.current = null;
*/

// ─── hasContent voice check ──────────────────────────────────────────────────
/*
  const hasContent = text.trim().length > 0 || !!mediaId || !!voiceBlob || !!voiceId;
*/

// ─── Polling guards (add `recording` to conditions) ──────────────────────────
/*
  if (unreadNudgeCount > prevNudgeCountRef.current && !sending && !recording) ...
  const id = setInterval(() => { if (!sending && !recording) void loadThread(); }, 15000);
*/

// ─── defineMessages additions ────────────────────────────────────────────────
/*
  record: { id: 'nudges.thread.record', defaultMessage: 'Record voice memo' },
  stopRecording: { id: 'nudges.thread.stop_recording', defaultMessage: 'Stop recording' },
*/

// ─── API ─────────────────────────────────────────────────────────────────────
// Add `voice_id?: string` back to apiNudgeAccount params in api/accounts.ts.
// Backend: NudgeService sets voice_attachment_id from voice_id media param.

export { MicIcon, PauseIcon, PlayArrowIcon, StopIcon };
