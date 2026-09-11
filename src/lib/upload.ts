/* Image upload for the Studio. Three routes, picked automatically:
   1. Cloudinary (unsigned preset) when VITE_CLOUDINARY_* is set
   2. Google Drive through the Sheets Apps Script when VITE_SHEETS_* is set
   3. Otherwise the image is kept in this browser only (for trying things out)
   Photos are resized in the browser first, so phone pictures upload quickly. */
import { sheets, sheetsReady } from './sheets';

const cloud = (import.meta.env.VITE_CLOUDINARY_CLOUD as string) || '';
const preset = (import.meta.env.VITE_CLOUDINARY_PRESET as string) || '';
const cloudinaryReady = !!cloud && !!preset && cloud !== 'your-cloud';

export type UploadMode = 'cloudinary' | 'drive' | 'local';
export const uploadMode: UploadMode = cloudinaryReady ? 'cloudinary' : sheetsReady ? 'drive' : 'local';
/** Kept for older imports — uploads now always work (local mode as the fallback). */
export const uploadReady = true;

async function decode(file: File): Promise<CanvasImageSource & { width: number; height: number }> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
  } catch {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    await img.decode();
    URL.revokeObjectURL(url);
    return img;
  }
}

/** Downscale to `max` px on the long side; PNG keeps transparency (ornaments), photos become JPEG/WebP. */
export async function resizeImage(file: File, max: number, keepAlpha: boolean): Promise<Blob> {
  const src = await decode(file);
  const scale = Math.min(1, max / Math.max(src.width, src.height));
  const w = Math.round(src.width * scale), h = Math.round(src.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, w, h);
  const type = keepAlpha ? 'image/webp' : 'image/jpeg';
  const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, type, keepAlpha ? 0.86 : 0.85));
  if (!blob) throw new Error('Gambar tidak bisa diproses.');
  return blob;
}

const toDataUrl = (b: Blob) => new Promise<string>((res, rej) => {
  const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(b);
});

export async function uploadAsset(file: File, kind: 'photo' | 'orn' | 'petal' = 'photo'): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Berkas harus berupa gambar (JPG, PNG, WebP, HEIC dari galeri).');
  if (file.size > 25 * 1024 * 1024) throw new Error('Maksimal 25 MB per gambar.');
  const keepAlpha = kind !== 'photo' || file.type === 'image/png';
  const blob = await resizeImage(file, uploadMode === 'local' ? 900 : 1600, keepAlpha);

  if (uploadMode === 'cloudinary') {
    const body = new FormData();
    body.append('file', blob, file.name);
    body.append('upload_preset', preset);
    body.append('folder', 'wedding');
    const res = await fetch('https://api.cloudinary.com/v1_1/' + cloud + '/image/upload', { method: 'POST', body });
    if (!res.ok) throw new Error('Upload gagal (' + res.status + ').');
    const json = await res.json();
    return String(json.secure_url).replace('/upload/', '/upload/f_auto,q_auto,w_1600,c_limit/');
  }

  const dataUrl = await toDataUrl(blob);
  if (uploadMode === 'drive') {
    const { url } = await sheets.uploadImage({ data: dataUrl.split(',')[1], mime: blob.type, name: file.name.replace(/\.[^.]+$/, '') + (keepAlpha ? '.webp' : '.jpg') });
    return url;
  }
  return dataUrl;   // local only: shown in this browser's preview, not publishable
}
