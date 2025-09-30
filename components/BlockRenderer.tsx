// src/components/BlockRenderer.tsx
import React from 'react';
import RichTextBlock from './RichTextBlock';
import GalleryGrid from './GalleryGrid';
import CodeBlock from './CodeBlock';

const componentsMap: { [key: string]: React.ComponentType<any> } = {
  richText: RichTextBlock,
  gallery: GalleryGrid,
  codeBlock: CodeBlock,
};

export default function BlockRenderer({ blocks }: { blocks: any[] }) {
  if (!Array.isArray(blocks)) {
    return <p style={{ color: 'red' }}>Ошибка: Блоки не являются массивом!</p>;
  }
  if (blocks.length === 0) {
    return <p style={{ color: 'orange' }}>Контент для этой страницы пуст.</p>;
  }

  return (
    <>
      {blocks.map((block, idx) => {
        // Пытаемся найти тип блока по разным популярным ключам: 'type' или 'blockType'
        const blockType = block.type || block.blockType;
        const Component = componentsMap[blockType];

        if (Component) {
          // Передаем все данные блока как props
          return <Component key={idx} {...block} />;
        }

        // Если компонент для такого типа блока не найден, выводим ошибку
        return (
          <div key={idx} style={{
            border: '2px dashed red', padding: '10px', margin: '16px 0',
            fontFamily: 'monospace', backgroundColor: '#fff0f0', color: '#333'
          }}>
            <strong>Неизвестный тип блока!</strong>
            <p>Полученный тип: "{blockType || 'не определен'}"</p>
            <p>Полные данные блока:</p>
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: '12px' }}>
              {JSON.stringify(block, null, 2)}
            </pre>
          </div>
        );
      })}
    </>
  );
}
