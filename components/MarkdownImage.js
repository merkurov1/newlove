// components/MarkdownImage.js
// КАНДИДАТ НА УДАЛЕНИЕ: не используется ни в одном компоненте или странице
import Image from 'next/image';

const MarkdownImage = (props) => {
  return (
    // Добавляем mb-8 (отступ снизу) и break-inside-avoid-column
    <div className="mb-8 break-inside-avoid-column">
      <Image
        src={props.src}
        alt={props.alt}
        width={1200}
        height={675}
        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
        className="rounded-lg shadow-md transition-transform duration-300 hover:scale-[1.02]"
      />
    </div>
  );
};

export default MarkdownImage;
