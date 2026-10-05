import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function generateAndUploadReel(lotId: string, data: {
  imageUrl: string;
  artist: string;
  title: string;
  auctionHouse: string;
  location: string;
  price: string;
}) {
  const tmpDir = path.join(os.tmpdir(), 'art-engine-reels');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  const inputImagePath = path.join(tmpDir, `input_${lotId}_${Date.now()}.jpg`);
  const outputVideoPath = path.join(tmpDir, `output_${lotId}_${Date.now()}.mp4`);

  try {
    console.log(`[ReelGen] Downloading stored image from: ${data.imageUrl}`);

    // Картинка уже находится в Supabase Storage, скачиваем напрямую и без задержек
    const imgRes = await fetch(data.imageUrl, { signal: AbortSignal.timeout(15_000) });
    if (!imgRes.ok) {
      throw new Error(`Unable to download the source image (status: ${imgRes.status})`);
    }

    const arrayBuffer = await imgRes.arrayBuffer();
    if (arrayBuffer.byteLength > 15 * 1024 * 1024) {
      throw new Error('The source image is too large for reel rendering.');
    }
    fs.writeFileSync(inputImagePath, Buffer.from(arrayBuffer));

    // Escape FFmpeg drawtext syntax. Arguments are passed directly to ffmpeg,
    // never through a shell, so auction metadata cannot become shell syntax.
    const escapeDrawtext = (value: string) => String(value || '')
      .replace(/\\/g, '\\\\')
      .replace(/:/g, '\\:')
      .replace(/'/g, "\\'")
      .replace(/%/g, '%%')
      .replace(/\r?\n/g, '\\n');

    const textMain = escapeDrawtext(`${data.artist.toUpperCase()}\n${data.title}`);
    const textSub = escapeDrawtext(`${data.auctionHouse} • ${data.location}\nEst: ${data.price}`);

    const filter = [
      "zoompan=z='min(zoom+0.0015,1.15)':d=900:s=1080x1920,format=yuv420p[v]",
      `[v]drawtext=text='${textMain}':fontcolor=white:fontsize=50:x=(w-text_w)/2:y=150:box=1:boxcolor=black@0.5:boxborderw=20[v1]`,
      `[v1]drawtext=text='${textSub}':fontcolor=white:fontsize=36:x=(w-text_w)/2:y=h-250:box=1:boxcolor=black@0.5:boxborderw=15`,
    ].join(';');

    const ffmpeg = spawnSync('ffmpeg', [
      '-y', '-loop', '1', '-i', inputImagePath,
      '-filter_complex', filter,
      '-t', '30', '-pix_fmt', 'yuv420p', outputVideoPath,
    ], { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 });

    if (ffmpeg.error) throw ffmpeg.error;
    if (ffmpeg.status !== 0) {
      throw new Error(`FFmpeg rendering failed: ${ffmpeg.stderr?.slice(-500) || 'unknown error'}`);
    }

    const videoBuffer = fs.readFileSync(outputVideoPath);
    const fileName = `reels/lot-${lotId}-${Date.now()}.mp4`;

    const { error: uploadError } = await supabase.storage
      .from('artifacts') 
      .upload(fileName, videoBuffer, {
        contentType: 'video/mp4',
        upsert: true,
      });

    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabase.storage
      .from('artifacts')
      .getPublicUrl(fileName);

    return publicUrlData.publicUrl;

  } catch (error) {
    console.error('Reel generation/upload error:', error);
    throw error;
  } finally {
    if (fs.existsSync(inputImagePath)) fs.unlinkSync(inputImagePath);
    if (fs.existsSync(outputVideoPath)) fs.unlinkSync(outputVideoPath);
  }
}
