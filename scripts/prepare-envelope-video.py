"""Prepare the supplied envelope assets for transparent inline playback.

Requires imageio-ffmpeg, numpy and Pillow. Run from the app directory.
Only near-white pixels connected to the frame edge are removed, preserving
the light paper inside the envelope.
"""
import argparse
from pathlib import Path

import imageio_ffmpeg
import numpy as np
from PIL import Image, ImageDraw, ImageFilter


def frames(path, fps=None):
    reader = imageio_ffmpeg.read_frames(str(path), pix_fmt="rgb24", output_params=["-vf", f"fps={fps}"] if fps else [])
    metadata = next(reader)
    width, height = metadata["size"]
    for raw in reader:
        yield np.frombuffer(raw, np.uint8).reshape(height, width, 3)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default="assets/source/open-envelope-720.mp4")
    parser.add_argument("--output", default="public/assets/ivory-garden")
    parser.add_argument("--width", type=int, default=540)
    parser.add_argument("--fps", type=int, default=24)
    parser.add_argument("--crf", type=int, default=20)
    args = parser.parse_args()
    source, output = Path(args.input), Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    left, top, right, bottom = 1 << 30, 1 << 30, 0, 0
    for rgb in frames(source):
        y, x = np.where(rgb.min(axis=2) < 245)
        left, top = min(left, int(x.min())), min(top, int(y.min()))
        right, bottom = max(right, int(x.max()) + 1), max(bottom, int(y.max()) + 1)
        height, width = rgb.shape[:2]
    crop = (max(0, left - 24), max(0, top - 24), min(width, right + 24), min(height, bottom + 24))
    animation = []
    fps = args.fps
    for index, rgb in enumerate(frames(source, fps)):
        rgb = rgb[crop[1]:crop[3], crop[0]:crop[2]].copy()
        low, high = rgb.min(axis=2), rgb.max(axis=2)
        candidate = (low >= 247) & ((high.astype(int) - low.astype(int)) <= 8)
        mask = Image.fromarray((candidate * 255).astype(np.uint8)).copy()
        ImageDraw.floodfill(mask, (0, 0), 128)
        background = np.asarray(mask) == 128
        edge = np.asarray(Image.fromarray((background * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))) > 0
        alpha = (~background).astype(np.float32)
        alpha[edge] *= np.clip((253 - low[edge].astype(float)) / 7, 0, 1)
        # Contract the matte slightly to remove the MP4's white compression fringe.
        alpha = np.asarray(Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(5)).filter(ImageFilter.GaussianBlur(.35))).astype(np.float32) / 255
        if (alpha == 0).mean() < .05:
            raise RuntimeError(f"Frame {index} has no usable transparent background")
        colour = np.clip((rgb.astype(float) - 253 * (1 - alpha[..., None])) / np.maximum(alpha[..., None], .001), 0, 255).astype(np.uint8)
        colour[alpha == 0] = 0
        rgba = Image.fromarray(np.dstack((colour, (alpha * 255).astype(np.uint8))))
        rgba = rgba.resize((args.width, round(rgba.height * args.width / rgba.width)), Image.Resampling.LANCZOS)
        animation.append(rgba)
        if index % 24 == 0:
            print(f"Processed frame {index}", flush=True)
    # MP4 has no alpha channel: pack the matte below the colour frame so the
    # browser can reconstruct transparency while retaining native video timing.
    packed_path = output / "open-envelope-alpha.mp4"
    frame_width, frame_height = animation[0].size
    writer = imageio_ffmpeg.write_frames(str(packed_path), (frame_width, frame_height * 2), fps=fps,
        codec="libx264", pix_fmt_in="rgb24", pix_fmt_out="yuv420p", macro_block_size=2,
        output_params=["-crf", str(args.crf), "-movflags", "+faststart"])
    writer.send(None)
    for frame in animation:
        pixels = np.asarray(frame)
        packed = np.concatenate((pixels[:, :, :3], np.repeat(pixels[:, :, 3:], 3, axis=2)), axis=0)
        writer.send(packed.tobytes())
    writer.close()

    # Match the closed artwork to the first video frame, reserving the space
    # above it for the opening flap and card instead of shifting the layout.
    first = next(frames(source))
    y, x = np.where(first.min(axis=2) < 200)
    closed = Image.open(source.with_name("close-envelope.webp")).convert("RGBA")
    closed = closed.resize((int(x.max() - x.min() + 1), int(y.max() - y.min() + 1)), Image.Resampling.LANCZOS)
    still = Image.new("RGBA", (crop[2] - crop[0], crop[3] - crop[1]))
    still.paste(closed, (int(x.min()) - crop[0], int(y.min()) - crop[1]))
    still.resize((frame_width, frame_height), Image.Resampling.LANCZOS).save(output / "close-envelope.webp", quality=92, method=6)
    for file in [packed_path, output / "close-envelope.webp"]:
        print(f"{file}: {file.stat().st_size:,} bytes", flush=True)
    print(f"Canvas: {animation[0].width} × {animation[0].height}; frames: {len(animation)}")


if __name__ == "__main__":
    main()
