// components/MarkdownImage.js
import Image from 'next/image';

// Этот компонент будет заменять стандартный тег <img>
const MarkdownImage = (props) => {
  return (
    <Image
      src={props.src}
      alt={props.alt}
      width={1200} // Задаем большую ширину по умолчанию
      height={675} // и высоту (соотношение 16:9)
      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw" // Адаптивные размеры
      className="my-8 rounded-lg shadow-md transition-transform duration-300 hover:scale-[1.02]" // Стили для красоты
    />
  );
};

export default MarkdownImage;
