import { Node, mergeAttributes } from '@tiptap/core';

export const GalleryGrid = Node.create({
  name: 'galleryGrid',
  group: 'block',
  content: 'image+',
  selectable: true,
  draggable: true,
  parseHTML() {
    return [
      {
        tag: 'div.gallery-grid',
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { class: 'gallery-grid' }), 0];
  },
});

export default GalleryGrid;
