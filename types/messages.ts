// types/messages.ts
export type InitialMessage = {
  id: string;
  createdAt: string | Date;
  content: string;
  userId: string;
  user: { name: string | null; image: string | null };
  // Optional reply structure
  replyTo?: { id: string; author?: string | null; content: string };
};

export type TypingUser = { name: string; image: string };
