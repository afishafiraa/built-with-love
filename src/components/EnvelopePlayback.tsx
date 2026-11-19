import { useEffect, useRef, useState } from 'react';

const WIDTH = 540;
const HEIGHT = 652;

export function EnvelopePlayback({ playing, poster, onComplete }: { playing: boolean; poster: string; onComplete: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [painted, setPainted] = useState(false);
  const completeRef = useRef(onComplete);
  useEffect(() => { completeRef.current = onComplete; }, [onComplete]);

  useEffect(() => {
    if (!playing) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    const buffer = document.createElement('canvas');
    buffer.width = WIDTH;
    buffer.height = HEIGHT * 2;
    const source = buffer.getContext('2d', { willReadFrequently: true });
    if (!video || !canvas || !context || !source || video.error) { completeRef.current(); return; }

    let frame = 0;
    let videoFrame = 0;
    let lastTime = -1;
    let disposed = false;
    let hasPainted = false;
    const useVideoFrames = typeof video.requestVideoFrameCallback === 'function';
    const finish = () => { if (!disposed) completeRef.current(); };
    const paint = () => {
      if (disposed) return;
      const time = Math.floor(video.currentTime * 24);
      if (video.readyState >= 2 && (useVideoFrames || time !== lastTime)) {
        const width = video.videoWidth;
        const height = video.videoHeight / 2;
        if (buffer.width !== width || buffer.height !== height * 2) {
          buffer.width = width;
          buffer.height = height * 2;
        }
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }
        source.drawImage(video, 0, 0);
        const pixels = source.getImageData(0, 0, width, height * 2);
        const offset = width * height * 4;
        // The lower half carries the alpha matte; the upper half keeps the
        // white invitation card opaque on browsers without alpha-video support.
        for (let i = 0; i < offset; i += 4) {
          const alpha = pixels.data[offset + i];
          pixels.data[i + 3] = alpha < 8 ? 0 : alpha > 247 ? 255 : alpha;
        }
        context.putImageData(pixels, 0, 0, 0, 0, width, height);
        lastTime = time;
        if (!hasPainted) { hasPainted = true; setPainted(true); }
      }
      if (useVideoFrames) videoFrame = video.requestVideoFrameCallback(paint);
      else frame = requestAnimationFrame(paint);
    };
    video.addEventListener('ended', finish);
    video.addEventListener('error', finish);
    video.play().then(() => { if (!disposed) paint(); }).catch(finish);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      if (useVideoFrames) video.cancelVideoFrameCallback(videoFrame);
      video.pause();
      video.removeEventListener('ended', finish);
      video.removeEventListener('error', finish);
    };
  }, [playing]);

  return <>
    <img src={poster} alt="" width={WIDTH} height={HEIGHT} loading="eager" decoding="async"
      style={{ visibility: painted ? 'hidden' : 'visible' }} {...{ fetchpriority: 'high' }} />
    <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} hidden={!painted} aria-hidden="true" />
    <video ref={videoRef} src="/assets/ivory-garden/open-envelope-alpha.mp4" preload="auto" muted playsInline
      aria-hidden="true" className="ig-envelope-video-source" />
  </>;
}
