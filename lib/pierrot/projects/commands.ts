export type ProjectCommand =
  | { action: 'create'; name: string; task: string | null }
  | { action: 'delete'; name: string; confirmed: boolean }
  | { action: 'move_task'; taskQuery: string | null; projectName: string }
  | { action: 'rate'; name: string; rating: number }
  | { action: 'update_brief'; name: string; brief: string; note: string }
  | { action: 'none' };

function clean(value: string): string {
  return value
    .replace(/[\s.!?;:]+$/g, '')
    .replace(/^['«“]|['»”]$/g, '')
    .replace(/^(?:проект[аеу]?|project)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

const FOLLOW_UP_TASK =
  /\s+(?:и|а|затем|потом|and|then)\s+(?:там\s+)?(?:добав(?:ь|ьте)|добавить|созда(?:й|йте)|создать|запиш(?:и|ите)|записать|постав(?:ь|ьте)|поставить|add|create)\s+(?:новую\s+|new\s+)?(?:задачу|задачy|таск|task)\s*[:—–-]?\s*/i;

function splitCreateBody(value: string): { name: string; task: string | null } {
  const marker = value.search(FOLLOW_UP_TASK);
  if (marker < 0) return { name: clean(value), task: null };

  const name = clean(value.slice(0, marker));
  const task = value
    .slice(marker)
    .replace(FOLLOW_UP_TASK, '')
    .replace(/^[\s:—–,.-]+/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2_000);

  return { name, task: task || null };
}

export function detectProjectCommand(message: string): ProjectCommand {
  const value = message.trim();

  const confirmedDelete = value.match(
    /^(?:да[,\s]+)?(?:удали|удалить|подтверждаю)\s+проект\s+(.+)$/iu
  );
  if (confirmedDelete && /^(?:да|подтверждаю)/iu.test(value)) {
    return { action: 'delete', name: clean(confirmedDelete[1]), confirmed: true };
  }

  const create = value.match(
    /^(?:пьеро[,:]?\s*)?(?:создай|создать|заведи|завести)\s+(?:новый\s+)?проект\s+(.+)$/iu
  );
  if (create) {
    const parsed = splitCreateBody(create[1]);
    return { action: 'create', name: parsed.name, task: parsed.task };
  }

  const deleteMatch = value.match(
    /^(?:пьеро[,:]?\s*)?(?:удали|удалить|архивируй|архивировать)\s+проект\s+(.+)$/iu
  );
  if (deleteMatch) {
    const name = clean(deleteMatch[1]);
    return { action: 'delete', name, confirmed: false };
  }

  const move = value.match(
    /^(?:пьеро[,:]?\s*)?(?:перенеси|перемести|отправь)\s+(?:(.+?)\s+)?в\s+проект\s+([\p{L}\p{N}][\p{L}\p{N} &'’_./-]{0,100})$/iu
  );
  if (move) {
    return {
      action: 'move_task',
      taskQuery: move[1]
        ? clean(move[1].replace(/^(?:(?:эту\s+)?задачу|task)\s*/iu, '')) || null
        : null,
      projectName: clean(move[2]),
    };
  }

  // Owner rating is always a separate field; it must never be written into the
  // model's internal importance/confidence values.
  const rated = value.match(
    /^(?:пьеро[,:]?\s*)?(?:поставь|поставить|установи|установить|задай|задать|оцени|оценить|rate|set)\s+(?:проекту|проект|project)\s+(.+?)\s+(?:оценку|рейтинг|rating|на)?\s*[:—–-]?\s*(\d{1,2})(?:\s*(?:\/\s*10|из\s*10))?[\s.!?]*$/iu
  );
  if (rated) {
    const rating = Number(rated[2]);
    if (Number.isInteger(rating) && rating >= 1 && rating <= 10) {
      return { action: 'rate', name: clean(rated[1]), rating };
    }
  }

  const brief = value.match(
    /^(?:пьеро[,:]?\s*)?(?:обнови|обновить|запиши|записать|измени|изменить|update)\s+(?:project\s+)?бриф\s+(?:проекта\s+|project\s+)?(.+?)\s*[:—–-]\s*(.+)$/iu
  );
  if (brief) {
    const name = clean(brief[1]);
    const text = brief[2].replace(/\s+/g, ' ').trim().slice(0, 20_000);
    if (text.length >= 20) {
      return {
        action: 'update_brief',
        name,
        brief: text,
        note: `Owner chat brief update: ${value.slice(0, 240)}`,
      };
    }
  }

  return { action: 'none' };
}
