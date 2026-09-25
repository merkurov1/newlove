import { execSync } from 'child_process';
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
    const imgRes = await fetch(data.imageUrl);
    if (!imgRes.ok) {
      throw new Error(`Не удалось скачать изображение из хранилища (статус: ${imgRes.status})`);
    }

    const arrayBuffer = await imgRes.arrayBuffer();
    fs.writeFileSync(inputImagePath, Buffer.from(arrayBuffer));

    // Экранируем текст для FFmpeg
    const textMain = `${data.artist.toUpperCase()}\n«${data.title}»`;
    const textSub = `${data.auctionHouse} • ${data.location}\nEst: ${data.price}`;

    // Команда FFmpeg (зум + титры, ровно 30 секунд)
    const ffmpegCommand = `ffmpeg -loop 1 -i "${inputImagePath}" -filter_complex \
      "zoompan=z='min(zoom+0.0015,1.15)':d=900:s=1080x1920,format=yuv420p[v]; \
      [v]drawtext=text='${textMain}':fontcolor=white:fontsize=50:x=(w-text_w)/2:y=150:box=1:boxcolor=black@0.5:boxborderw=20[v1]; \
      [v1]drawtext=text='${textSub}':fontcolor=white:fontsize=36:x=(w-text_w)/2:y=h-250:box=1:boxcolor=black@0.5:boxborderw=15" \
      -t 30 -pix_fmt yuv420p "${outputVideoPath}"`;

    execSync(ffmpegCommand);

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
