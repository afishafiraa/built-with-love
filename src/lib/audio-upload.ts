import { api } from './api';

const MAX_AUDIO_BYTES = 15_000_000;

function audioMime(file: File) {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'mp3') return 'audio/mpeg';
  if (extension === 'm4a') return 'audio/mp4';
  if (extension === 'mp4') return 'video/mp4';
  return '';
}

export function audioTitle(filename: string) {
  return filename.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function uploadAudio(source: File) {
  const mime = audioMime(source);
  if (!mime) throw new Error('Gunakan berkas MP3, M4A, atau MP4. MP3 paling kompatibel.');
  if (!source.size || source.size > MAX_AUDIO_BYTES) throw new Error('Ukuran musik maksimal 15 MB.');

  const ticket = await api.createAudioUpload({ name: source.name, mime, size: source.size });
  const file = source.type === mime ? source : new File([source], source.name, { type: mime });
  const body = new FormData();
  body.append('cacheControl', '31536000');
  body.append('', file);
  const response = await fetch(ticket.signedUrl, {
    method: 'PUT',
    headers: { 'x-upsert': 'false' },
    body
  });
  if (!response.ok) throw new Error('Upload musik gagal. Pastikan bucket audio sudah dibuat lalu coba lagi.');
  return { url: ticket.url, title: audioTitle(source.name) };
}
