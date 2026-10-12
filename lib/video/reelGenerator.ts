import { createClient } from '@supabase/supabase-js';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface LotReelData {
  imageUrl: string;
  artist: string;
  title: string;
  auctionHouse: string;
  location: string;
  price: string;
}

/**
 * Скачивает файл по URL во временную директорию
 */
async function downloadToTemp(url: string, extension: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download resource from ${url}: ${res.statusText}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  
  const tempFilePath = path.join(os.tmpdir(), `reel-${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${extension}`);
  await fs.writeFile(tempFilePath, buffer);
  return tempFilePath;
}

export async function generateAndUploadReel(lotId: string, lotData: LotReelData): Promise<string> {
  const tempDir = os.tmpdir();
  const outputFilePath = path.join(tempDir, `output-${lotId}-${Date.now()}.mp4`);
  let imagePath = '';
  
  try {
    console.log(`[ReelGen] Starting generation for lot ${lotId}...`);

    // 1. Скачиваем картинку локально для FFmpeg
    imagePath = await downloadToTemp(lotData.imageUrl, 'jpg');

    // 2. Форматируем тексты для безопасного вывода в FFmpeg drawtext
    const esc = (str: string) => (str || '').replace(/'/g, "").replace(/:/g, "\\:");
    
    const textAuction = esc(`${lotData.auctionHouse.toUpperCase()} | LOT PRESENTATION`);
    const textArtistTitle = esc(`${lotData.artist} — ${lotData.title}`);
    const textEstimate = esc(`ESTIMATE: ${lotData.price}`);

    // 3. Собираем мощный FFmpeg filter_complex
    // - Длительность: 35 секунд (35 * 30 кадров = 1050 кадров)
    // - zoompan создает плавное движение по картинке (Ken Burns effect)
    // - drawtext выводит плашки в заданные интервалы времени (t)
    const duration = 35;
    const fps = 30;
    const totalFrames = duration * fps;

    const filterComplex = [
      // Масштабируем картинку под вертикальный формат 1080x1920 с зумом
      `[0:v]scale=2160:3840,zoompan=z='min(zoom+0.001,1.15)':d=${totalFrames}:s=1080:1920:fps=${fps}[v0]`,
      
      // Плашка 1: Аукционный дом (показываем с 2 по 8 секунду)
      `[v0]drawtext=text='${textAuction}':fontcolor=white:fontsize=42:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:x=(w-text_w)/2:y=220:box=1:boxcolor=black@0.6:boxborderw=16:enable='between(t,2,8)'[v1]`,
      
      // Плашка 2: Художник и название (показываем с 9 по 24 секунду)
      `[v1]drawtext=text='${textArtistTitle}':fontcolor=white:fontsize=50:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.7:boxborderw=20:enable='between(t,9,24)'[v2]`,
      
      // Плашка 3: Ожидаемая цена / Эстимейт (показываем с 25 по 33 секунду)
      `[v2]drawtext=text='${textEstimate}':fontcolor=white:fontsize=56:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:x=(w-text_w)/2:y=h-300:box=1:boxcolor=black@0.8:boxborderw=24:enable='between(t,25,33)'[v_final]`
    ].join(';');

    // Собираем аргументы для запуска процесса FFmpeg через spawn
    const ffmpegArgs = [
      '-y',
      '-loop', '1',
      '-i', imagePath,
      '-f', 'lavfi', '-i', `anullsrc=r=44100:cl=stereo`, // Генерация тишины, если нет готовой озвучки (можно заменить на реальный аудиофайл)
      '-filter_complex', filterComplex,
      '-map', '[v_final]',
      '-map', '1:a',
      '-t', String(duration),
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-preset', 'fast',
      '-crf', '23',
      '-c:a', 'aac',
      '-b:a', '192k',
      outputFilePath
    ];

    await new Promise<void>((resolve, reject) => {
      const proc = spawn('ffmpeg', ffmpegArgs);
      
      let stderrData = '';
      proc.stderr.on('data', (data) => {
        stderrData += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          console.error('[FFmpeg Error output]:', stderrData.slice(-1000));
          reject(new Error(`FFmpeg exited with code ${code}`));
        }
      });
    });

    console.log('[ReelGen] FFmpeg rendering completed successfully.');

    // 4. Загружаем готовый видеофайл в Supabase Storage
    const fileBuffer = await fs.readFile(outputFilePath);
    const storageFileName = `reels/lot-${lotId}-${Date.now()}.mp4`;

    const { error: uploadError } = await supabase.storage
      .from('artifacts')
      .upload(storageFileName, fileBuffer, {
        contentType: 'video/mp4',
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Failed to upload reel to Supabase Storage: ${uploadError.message}`);
    }

    const { data: publicUrlData } = supabase.storage
      .from('artifacts')
      .getPublicUrl(storageFileName);

    if (!publicUrlData?.publicUrl) {
      throw new Error('Failed to retrieve public URL for the generated reel.');
    }

    console.log(`[ReelGen] Reel successfully uploaded: ${publicUrlData.publicUrl}`);
    return publicUrlData.publicUrl;

  } finally {
    // Очищаем временные файлы
    if (imagePath) {
      fs.unlink(imagePath).catch(() => {});
    }
    fs.unlink(outputFilePath).catch(() => {});
  }
}
