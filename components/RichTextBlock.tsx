// components/RichTextBlock.tsx
import React from 'react';
import { FC } from 'react';

export const RichTextBlock: FC<{ html: string }> = ({ html }) =>
  html ? <div dangerouslySetInnerHTML={{ __html: html }} /> : null;

export default RichTextBlock;

