import { useCallback, useEffect, useRef, useState } from 'react';

/** youtube / youtube music / youtu.be -> embeddable player id */
export function youtubeId(url: string): string | null {
  if (!url) return null;
  const m = String(url).match(/(?:v=|youtu\.be\/|\/embed\/|\/shorts\/)([A-Za-z0-9_-]{6,})/);
  return m ? m[1] : null;
}

/** Background music sits at 30/100 — present, but never over the reading. */
export const MUSIC_VOLUME = 0.3;

/** The hidden YouTube player only takes a volume once it has loaded, and only
    through the iframe API's postMessage channel (enablejsapi=1 in the src). */
export function setYtVolume(frame: HTMLIFrameElement | null) {
  sendYtCommand(frame, 'setVolume', [Math.round(MUSIC_VOLUME * 100)]);
}

function sendYtCommand(frame: HTMLIFrameElement | null, func: string, args: unknown[] = []) {
  frame?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), 'https://www.youtube-nocookie.com');
}

type Kind = { kind: 'synth' } | { kind: 'yt'; id: string } | { kind: 'file'; url: string };

function musicKind(url: string): Kind {
  if (!url) return { kind: 'synth' };
  const yt = youtubeId(url);
  if (yt) return { kind: 'yt', id: yt };
  return { kind: 'file', url };
}

/**
 * Background music: a direct audio file, a hidden YouTube player, or — when no
 * URL is set — a soft pentatonic chime generated with Web Audio.
 */
export function useMusic(url: string, title = '') {
  const [playing, setPlaying] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const ytFrame = useRef<HTMLIFrameElement | null>(null);
  const wantYt = useRef(false);
  const kind = musicKind(url);

  const stopSynth = () => { window.clearInterval(timer.current); timer.current = undefined; };

  const start = useCallback(() => {
    const k = musicKind(url);
    setPlaying(true);
    if (k.kind === 'yt') {
      // The iframe is mounted while the cover is visible. Sending playVideo
      // directly from this click/tap is accepted far more consistently by
      // iOS Safari, Chrome iOS and Samsung Internet than iframe autoplay.
      wantYt.current = true;
      sendYtCommand(ytFrame.current, 'playVideo');
      return;
    }
    if (k.kind === 'file') {
      if (!audio.current || audio.current.src !== new URL(k.url, location.href).href) {
        audio.current?.pause();
        audio.current = new Audio(k.url);
        audio.current.loop = true;
        audio.current.preload = 'auto';
      }
      audio.current.volume = MUSIC_VOLUME;
      audio.current.play().catch(() => setPlaying(false));
      return;
    }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!ctx.current) ctx.current = new AC();
      const c = ctx.current;
      c.resume();
      const scale = [392, 440, 493.88, 587.33, 659.25, 783.99, 880];
      const pattern = [0, 3, 5, 4, 2, 5, 6, 3];
      let i = 0;
      const note = () => {
        const t = c.currentTime;
        const osc = c.createOscillator();
        const g = c.createGain();
        osc.type = 'sine';
        osc.frequency.value = scale[pattern[i % 8]] * (i % 16 < 8 ? 1 : 1.5);
        i++;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.12 * MUSIC_VOLUME, t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
        osc.connect(g).connect(c.destination);
        osc.start(t); osc.stop(t + 2.3);
      };
      stopSynth();
      note();
      timer.current = window.setInterval(note, 700);
    } catch { setPlaying(false); }
  }, [url]);

  const stop = useCallback(() => {
    stopSynth();
    audio.current?.pause();
    wantYt.current = false;
    sendYtCommand(ytFrame.current, 'pauseVideo');
    setPlaying(false);
  }, []);

  const toggle = useCallback(() => { if (playing) stop(); else start(); }, [playing, start, stop]);

  // Keep playback intent when guests switch tabs. Browsers may still suspend a
  // background page (especially iOS or battery-saver mode), so re-assert play
  // when the page becomes visible again without requiring another tap.
  useEffect(() => {
    const onVis = () => {
      if (document.hidden || !playing) return;
      const k = musicKind(url);
      if (k.kind === 'file' && audio.current?.paused) audio.current.play().catch(() => setPlaying(false));
      if (k.kind === 'yt' && wantYt.current) sendYtCommand(ytFrame.current, 'playVideo');
      if (k.kind === 'synth') ctx.current?.resume();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [playing, url]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = title ? new MediaMetadata({ title }) : null;
    navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
    try {
      navigator.mediaSession.setActionHandler('play', start);
      navigator.mediaSession.setActionHandler('pause', stop);
    } catch { /* action handlers are optional on older browsers */ }
    return () => {
      try {
        navigator.mediaSession.setActionHandler('play', null);
        navigator.mediaSession.setActionHandler('pause', null);
      } catch { /* ignore unsupported cleanup */ }
    };
  }, [playing, start, stop, title]);

  /* A changing URL means a new source: Studio edits, but also the published
     config arriving from Sheets a moment after the page opened. That second case
     used to silence the music — the guest tapped "buka undangan" while the URL
     was still the default, and this effect then reset `playing` to false, which
     stops the chime and unmounts the YouTube frame. Carry the intent over to the
     new source instead, and leave the first run (mount) alone. */
  const prevUrl = useRef(url);
  useEffect(() => {
    if (prevUrl.current === url) return;
    prevUrl.current = url;
    stopSynth();
    audio.current?.pause();
    if (playing) start(); else setPlaying(false);
  }, [url, playing, start]);

  useEffect(() => () => { stopSynth(); audio.current?.pause(); ctx.current?.close(); }, []);

  const onYtLoad = useCallback((frame: HTMLIFrameElement) => {
    ytFrame.current = frame;
    setYtVolume(frame);
    // If a guest opened the card before a slow iframe finished loading, honour
    // that request as soon as the player becomes available. The music control
    // remains a second explicit user-tap fallback on restrictive browsers.
    if (wantYt.current) sendYtCommand(frame, 'playVideo');
    window.setTimeout(() => {
      setYtVolume(frame);
      if (wantYt.current) sendYtCommand(frame, 'playVideo');
    }, 900);
  }, []);

  const setYtFrame = useCallback((frame: HTMLIFrameElement | null) => { ytFrame.current = frame; }, []);
  const ytSrc = kind.kind === 'yt'
    ? 'https://www.youtube-nocookie.com/embed/' + kind.id + '?loop=1&playlist=' + kind.id + '&controls=0&modestbranding=1&playsinline=1&enablejsapi=1'
    : '';

  // Keep the player mounted before the opening tap; mounting it only after the
  // tap is the root cause of autoplay failures on several mobile browsers.
  return { playing, start, stop, toggle, ytSrc, setYtFrame, onYtLoad };
}
