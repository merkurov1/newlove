/** Shared Question contract. Safe to import from client components. */

export const QUESTION_MIN_WORDS = 25;
export const QUESTION_MAX_WORDS = 900;
export const QUESTION_MAX_CHARS = 6000;

export const QUESTION_MIN_CHARS = 25;

export const QUESTION_DRAFT_STORAGE_PREFIX = 'question:draft:';

export const QUESTION_PUBLIC_PATH = '/question';

export type QuestionSynthesisStatus = 'ready' | 'pending' | 'failed';

export type PublicQuestion = {
  id: string;
  text: string;
};

export type PublicSynthesis = {
  content: string;
  updatedAt: string | null;
  version: number;
};

export type QuestionPageData = {
  question: PublicQuestion | null;
  synthesis: PublicSynthesis | null;
  hasAnswers: boolean;
  isAuthenticated: boolean;
  hasAnswered: boolean;
};
