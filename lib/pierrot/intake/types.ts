export type IntakeType = 'food' | 'drink';

export type ParsedIntakeItem = {
  type: IntakeType;
  itemName: string;
  quantity: number | null;
  unit: string | null;
  occurredAt: string;
  timezone: string;
};

export type IntakeParseResult = {
  detected: boolean;
  items: ParsedIntakeItem[];
  /** Aggregate confidence in [0, 1]. */
  confidence: number;
  reason: string;
  language: 'ru' | 'en';
  timezone: string;
  timezoneKnown: boolean;
  usedModel: boolean;
};

export type IntakeLog = {
  id: string;
  userId: string;
  type: IntakeType;
  itemName: string;
  quantity: number | null;
  unit: string | null;
  rawText: string;
  occurredAt: string;
  timezone: string | null;
  sourceMessageId: string | null;
  confidence: number;
  createdAt: string;
};

export type IntakeQueryIntent =
  | { kind: 'list'; period: 'today' | 'yesterday' | 'week' | 'last7' | 'all' }
  | { kind: 'count'; period: 'today' | 'yesterday' | 'week' | 'last7' | 'all' }
  | { kind: 'water'; period: 'today' | 'yesterday' | 'week' | 'last7' | 'all' };

export type IntakeMutationIntent =
  | { kind: 'delete_last' }
  | { kind: 'correct_last'; replacement: string | null };
