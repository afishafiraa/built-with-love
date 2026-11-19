type Playback = {
  pause: () => void;
  resume: () => void;
  shouldResume: () => boolean;
  onVisibility: (hidden: boolean) => void;
  isPlaying?: () => boolean;
};

export function bindMusicVisibility(playback: Playback) {
  let leaving = false;
  let hidden = document.hidden;
  let retry: ReturnType<typeof setTimeout> | undefined;
  const cancelRetry = () => { clearTimeout(retry); retry = undefined; };
  const recover = () => {
    cancelRetry();
    if (hidden || !playback.shouldResume()) return;
    const delays = [300, 700, 1500];
    const attempt = (index: number) => {
      if (hidden || !playback.shouldResume()) return;
      if (!playback.isPlaying?.()) playback.resume();
      // Mobile media sessions may still be waking up at visibilitychange.
      if (index < delays.length) retry = setTimeout(() => attempt(index + 1), delays[index]);
    };
    attempt(0);
  };
  const notify = () => {
    const next = leaving || document.hidden;
    if (next === hidden) {
      if (!hidden) recover();
      return;
    }
    hidden = next;
    playback.onVisibility(hidden);
    if (hidden) { cancelRetry(); playback.pause(); }
    else recover();
  };
  const onHide = () => { leaving = true; notify(); };
  const onShow = () => { leaving = false; notify(); };
  const onInteraction = () => {
    if (!hidden && playback.shouldResume() && !playback.isPlaying?.()) recover();
  };
  playback.onVisibility(hidden);
  if (hidden) playback.pause();
  document.addEventListener('visibilitychange', notify);
  window.addEventListener('pagehide', onHide);
  window.addEventListener('pageshow', onShow);
  window.addEventListener('focus', onInteraction);
  document.addEventListener('pointerup', onInteraction, true);
  document.addEventListener('keydown', onInteraction, true);
  return () => {
    cancelRetry();
    document.removeEventListener('visibilitychange', notify);
    window.removeEventListener('pagehide', onHide);
    window.removeEventListener('pageshow', onShow);
    window.removeEventListener('focus', onInteraction);
    document.removeEventListener('pointerup', onInteraction, true);
    document.removeEventListener('keydown', onInteraction, true);
  };
}
