import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

// Инициализируем серверный клиент Supabase (используем сервисную или обычную ключевую пару для бэкенда)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Лучше использовать service_role для записи в защищенные бакеты
);

export async function generateAndUploadReel(lotId: string, data: {
  imageUrl: string;
  artist: string;
  title: string;
  auctionHouse: string;
  location: string;
  price: string;
}) {
  const tmpDir = path.join(process.cwd(), 'tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  const inputImagePath = path.join(tmpDir, `input_${lotId}_${Date.now()}.jpg`);
  const outputVideoPath = path.join(tmpDir, `output_${lotId}_${Date.now()}.mp4`);

  try {
    // 1. Скачиваем картинку лота локально
    const imgRes = await fetch(data.imageUrl);
    if (!imgRes.ok) throw new Error('Не удалось скачать изображение лота');
    const arrayBuffer = await imgRes.arrayBuffer();
    fs.writeFileSync(inputImagePath, Buffer.from(arrayBuffer));

    // 2. Экранируем текст для FFmpeg
    const textMain = `${data.artist.toUpperCase()}\n«${data.title}»`;
    const textSub = `${data.auctionHouse} • ${data.location}\nEst: ${data.price}`;

    // 3. Команда FFmpeg (зум + титры, ровно 30 секунд)
    const ffmpegCommand = `ffmpeg -loop 1 -i "${inputImagePath}" -filter_complex \
      "zoompan=z='min(zoom+0.0015,1.15)':d=900:s=1080x1920,format=yuv420p[v]; \
      [v]drawtext=text='${textMain}':fontcolor=white:fontsize=50:x=(w-text_w)/2:y=150:box=1:boxcolor=black@0.5:boxborderw=20[v1]; \
      [v1]drawtext=text='${textSub}':fontcolor=white:fontsize=36:x=(w-text_w)/2:y=h-250:box=1:boxcolor=black@0.5:boxborderw=15" \
      -t 30 -pix_fmt yuv420p "${outputVideoPath}"`;

    execSync(ffmpegCommand);

    // 4. Читаем сгенерированный MP4 файл для загрузки в Supabase
    const videoBuffer = fs.readFileSync(outputVideoPath);
    const fileName = `reels/lot-${lotId}-${Date.now()}.mp4`;

    // 5. Загружаем в бакет (например, 'artifacts' или создайте отдельный 'reels')
    const { error: uploadError } = await supabase.storage
      .from('artifacts') 
      .upload(fileName, videoBuffer, {
        contentType: 'video/mp4',
        upsert: true,
      });

    if (uploadError) throw uploadError;

    // 6. Получаем публичную ссылку на файл
    const { data: publicUrlData } = supabase.storage
      .from('artifacts')
      .getPublicUrl(fileName);

    return publicUrlData.publicUrl;

  } catch (error) {
    console.error('Reel generation/upload error:', error);
    throw error;
  } finally {
    // Очищаем временные файлы с диска Codespace
    if (fs.existsSync(inputImagePath)) fs.unlinkSync(inputImagePath);
    if (fs.existsSync(outputVideoPath)) fs.unlinkSync(outputVideoPath);
  }
}
