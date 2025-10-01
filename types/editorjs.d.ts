// Типы для Editor.js OutputData и Block

export type EditorJsBlock = {
  id?: string;
  type: string;
  data: any;
};

export type EditorJsOutputData = {
  time: number;
  blocks: EditorJsBlock[];
  version: string;
};
