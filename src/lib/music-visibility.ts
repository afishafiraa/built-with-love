type Playback = {
  pause: () => void;
  resume: () => void;
  shouldResume: () => boolean;
  onVisibility: (hidden: boolean) => void;
};

export function bindMusicVisibility(playback: Playback) {
  let leaving = false;
  let hidden = document.hidden;
  const notify = () => {
    const next = leaving || document.hidden;
    if (next === hidden) return;
    hidden = next;
    playback.onVisibility(hidden);
    if (hidden) playback.pause();
    else if (playback.shouldResume()) playback.resume();
  };
  const onHide = () => { leaving = true; notify(); };
  const onShow = () => { leaving = false; notify(); };
  playback.onVisibility(hidden);
  if (hidden) playback.pause();
  document.addEventListener('visibilitychange', notify);
  window.addEventListener('pagehide', onHide);
  window.addEventListener('pageshow', onShow);
  return () => {
    document.removeEventListener('visibilitychange', notify);
    window.removeEventListener('pagehide', onHide);
    window.removeEventListener('pageshow', onShow);
  };
}
