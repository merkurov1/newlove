import type { GroomingScope } from './types';

export type GroomingAuditCommand = {
  kind: 'audit';
  scope: GroomingScope;
  projectName: string | null;
  /** The owner explicitly asked for the whole workspace, not the current project. */
  explicitGlobal: boolean;
};

export type GroomingApprovalCommand =
  | { kind: 'approve'; mode: 'all' | 'safe' | 'selected'; ordinals: number[] }
  | { kind: 'reject'; mode: 'all' | 'selected'; ordinals: number[] }
  | { kind: 'show'; mode: 'show'; ordinals: [] }
  | { kind: 'repeat'; mode: 'repeat'; ordinals: [] };

export type GroomingCommand = GroomingAuditCommand | GroomingApprovalCommand;

/**
 * Resolves the actual audit scope. A command written in a project chat is
 * project-scoped by default; only an explicit "whole workspace" phrase escapes
 * that boundary. A command in the main chat has no project and therefore audits
 * the general workspace.
 */
export function resolveGroomingTarget(input: {
  command: GroomingAuditCommand;
  conversationProject: { id: string; name: string } | null;
}): {
  scope: GroomingScope;
  projectId: string | null;
  projectName: string | null;
  global: boolean;
} {
  if (input.command.explicitGlobal) {
    return {
      scope: input.command.scope,
      projectId: null,
      projectName: input.command.projectName,
      global: true,
    };
  }
  if (input.command.projectName) {
    return {
      scope: input.command.scope,
      projectId: null,
      projectName: input.command.projectName,
      global: false,
    };
  }
  if (input.conversationProject) {
    return {
      scope: input.command.scope,
      projectId: input.conversationProject.id,
      projectName: null,
      global: false,
    };
  }
  return {
    scope: input.command.scope,
    projectId: null,
    projectName: null,
    global: true,
  };
}

const SCOPE_WORDS: Array<{ scope: GroomingScope; pattern: RegExp }> = [
  { scope: 'conversations', pattern: /диалог|разговор|переписк|conversation|chat/i },
  { scope: 'projects', pattern: /проект|project/i },
  { scope: 'tasks', pattern: /задач|task/i },
  { scope: 'memory', pattern: /памят|memory|brain|мозг/i },
  { scope: 'github', pattern: /github|гитхаб|issue|pull request|коммит|commit/i },
  { scope: 'context', pattern: /контекст|context|резюм|summary/i },
];

function clean(value: string): string {
  return value
    .replace(/^'|'$/g, '')
    .replace(/^[«“"]|[»”"]$/g, '')
    .replace(/[\s.!?;:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

function scopeFrom(text: string): GroomingScope {
  for (const entry of SCOPE_WORDS) {
    if (entry.pattern.test(text)) return entry.scope;
  }
  return 'all';
}

function explicitProject(text: string): string | null {
  const match =
    text.match(/(?:в|по|для)\s+проект[еу]?\s+([\p{L}\p{N}][\p{L}\p{N} &'’_./-]{1,100})/iu) ||
    text.match(/project\s+([\p{L}\p{N}][\p{L}\p{N} &'’_./-]{1,100})/iu);
  return match ? clean(match[1]) || null : null;
}

function ordinalList(text: string): number[] {
  const match = text.match(/(\d{1,3}(?:\s*(?:,|и|and)\s*\d{1,3})*)/i);
  if (!match) return [];
  return Array.from(
    new Set(
      (match[1].match(/\d{1,3}/g) || [])
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0)
    )
  ).sort((left, right) => left - right);
}

export function parseGroomingApproval(message: string): GroomingApprovalCommand | null {
  const value = message.trim().replace(/\s+/g, ' ');
  if (!value) return null;

  if (
    /^(?:покажи|показать|повтори|напомни)\s+(?:план|список|предложения)(?:\s+ещё)?[.!]?$/iu.test(
      value
    )
  ) {
    return { kind: 'show', mode: 'show', ordinals: [] };
  }

  if (
    /^(?:повтори|повторить|перезапусти|перезапустить|запусти\s+заново|run\s+again)\s+(?:аудит|ревизию|проверку|план)[.!]?$/iu.test(
      value
    )
  ) {
    return { kind: 'repeat', mode: 'repeat', ordinals: [] };
  }

  if (
    /^(?:отклони|отклонить|отмен(?:и|ить)|убери|reject|cancel|discard)\s+(?:весь\s+)?(?:план|всё|все|all)[.!]?$/iu.test(
      value
    )
  ) {
    return { kind: 'reject', mode: 'all', ordinals: [] };
  }

  const cancelProposal = value.match(
    /^(?:отклони|отклонить|отмен(?:и|ить)|убери|reject|cancel|discard)\s+(?:это\s+)?(?:предложение|пункт|операцию|items?)(?:\s+(.+))?[.!]?$/iu
  );
  if (cancelProposal) {
    const ordinals = cancelProposal[1] ? ordinalList(cancelProposal[1]) : [];
    return ordinals.length > 0
      ? { kind: 'reject', mode: 'selected', ordinals }
      : { kind: 'reject', mode: 'all', ordinals: [] };
  }

  const rejectSelected = value.match(
    /^(?:отклони|отклонить|убери|reject)\s+(?:пункты?|предложения?|операции?|items?)\s+(.+)$/iu
  );
  if (rejectSelected) {
    const ordinals = ordinalList(rejectSelected[1]);
    if (ordinals.length > 0) return { kind: 'reject', mode: 'selected', ordinals };
  }

  if (
    /^(?:подтверди|подтвердить|выполни|выполнить|примен(?:и|ить)|approve|confirm|apply|execute)\s+(?:всё\s+|все\s+)?(?:безопасн(?:ое|ые)|safe)[.!]?$/iu.test(
      value
    )
  ) {
    return { kind: 'approve', mode: 'safe', ordinals: [] };
  }

  if (
    /^(?:подтверждаю|подтверди|подтвердить|выполняй|выполни|выполнить|примен(?:и|ять)|approve|confirm|apply|execute)(?:\s+(?:весь\s+)?(?:план|всё|все|all))?[.!]?$/iu.test(
      value
    )
  ) {
    return { kind: 'approve', mode: 'all', ordinals: [] };
  }

  const selected = value.match(
    /^(?:подтверждаю|подтверди|подтвердить|выполни|выполнить|примен(?:и|ить)|approve|confirm|apply|execute)\s+(?:пункты?|предложения?|операции?|items?)?\s*(.+)$/iu
  );
  if (selected) {
    const ordinals = ordinalList(selected[1]);
    if (ordinals.length > 0) return { kind: 'approve', mode: 'selected', ordinals };
  }

  return null;
}

/**
 * Global workspace grooming. Project-specific review commands remain in
 * `lib/pierrot/projects/commands.ts`; this detector deliberately does not match
 * "наведи порядок в проекте X".
 */
export function detectGroomingCommand(message: string): GroomingAuditCommand | null {
  const value = message.trim();
  if (!value) return null;
  const normalized = value.toLowerCase().replace(/ё/g, 'е');
  const explicitGlobal =
    /(?:во\s+вс[её]м\s+рабоч(?:ем|ей)\s+пространств|вс[её]\s+рабочее\s+пространство|в\s+проектах(?:$|[\s,.;:!?])|по\s+всем\s+проектам|все\s+проекты|весь\s+workspace|entire\s+workspace|all\s+projects)/iu.test(
      value
    );

  const auditPatterns = [
    /^(?:пьеро[,:]?\s*)?(?:наведи|навести|приведи|привести)\s+(?:тут\s+|здесь\s+|сейчас\s+)?(?:всё\s+|все\s+)?(?:в\s+)?порядок(?:\s+(?:в|по|во)\s+(.+))?$/iu,
    /^(?:пьеро[,:]?\s*)?(?:проверь|проверить|проанализируй|проанализировать)\s+(?:рабочую\s+среду|workspace|всё|все)(?:\s+(.+))?$/iu,
    /^(?:пьеро[,:]?\s*)?(?:аудит|ревизия|разбор)\s+(?:рабочей\s+среды|workspace)(?:\s+(.+))?$/iu,
    /^(?:пьеро[,:]?\s*)?(?:groom|tidy\s+up|audit|review)\s+(?:the\s+)?workspace(?:\s+(.+))?$/iu,
  ] as const;

  for (const pattern of auditPatterns) {
    const match = value.match(pattern);
    if (!match) continue;
    const scopeText = typeof match[1] === 'string' ? match[1] : '';
    if (
      /(?:^|\s)в\s+проекте(?:$|\s|[,.;:!?])|проект[аеу]?\s+\S/iu.test(scopeText) ||
      (!explicitGlobal && /(?:^|\s)в\s+проекте(?:$|\s|[,.;:!?])/iu.test(value))
    ) {
      // "наведи порядок в проекте Journal" is the existing project review.
      return null;
    }
    return {
      kind: 'audit',
      scope: scopeFrom(scopeText || normalized),
      projectName: explicitProject(value),
      explicitGlobal,
    };
  }

  if (
    /^(?:пьеро[,:]?\s*)?(?:почисти|почистить|обнови|обновить)\s+(?:рабочий\s+)?контекст[.!]?$/iu.test(
      normalized
    )
  ) {
    return {
      kind: 'audit',
      scope: 'context',
      projectName: explicitProject(value),
      explicitGlobal,
    };
  }
  if (/^(?:пьеро[,:]?\s*)?(?:проверь|проверить)\s+задачи[.!]?$/iu.test(normalized)) {
    return {
      kind: 'audit',
      scope: 'tasks',
      projectName: explicitProject(value),
      explicitGlobal,
    };
  }
  if (
    /^(?:пьеро[,:]?\s*)?(?:сверься|сверить|проверь|проверить)\s+(?:с\s+)?github[.!]?$/iu.test(
      normalized
    )
  ) {
    return {
      kind: 'audit',
      scope: 'github',
      projectName: explicitProject(value),
      explicitGlobal,
    };
  }
  if (/^(?:пьеро[,:]?\s*)?(?:проверь|проверить)\s+проекты[.!]?$/iu.test(normalized)) {
    return {
      kind: 'audit',
      scope: 'projects',
      projectName: explicitProject(value),
      explicitGlobal,
    };
  }
  if (/^(?:пьеро[,:]?\s*)?(?:проверь|проверить)\s+диалоги[.!]?$/iu.test(normalized)) {
    return {
      kind: 'audit',
      scope: 'conversations',
      projectName: explicitProject(value),
      explicitGlobal,
    };
  }

  return null;
}
