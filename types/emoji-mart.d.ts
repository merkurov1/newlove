declare module 'emoji-mart' {
  import * as React from 'react';
  export interface EmojiData {
    id: string;
    name: string;
    native: string;
    colons: string;
    [key: string]: any;
  }
  export interface PickerProps {
    onSelect: (emoji: EmojiData) => void;
    title?: string;
    emoji?: string;
    theme?: string;
    showPreview?: boolean;
    showSkinTones?: boolean;
    style?: React.CSSProperties;
    [key: string]: any;
  }
  export const Picker: React.ComponentType<PickerProps>;
  export default Picker;
}
