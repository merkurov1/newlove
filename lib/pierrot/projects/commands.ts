export type ProjectCommand =
  | { action: 'create'; name: string }
  | { action: 'delete'; name: string; confirmed: boolean }
  | { action: 'move_task'; taskQuery: string | null; projectName: string }
  | { action: 'none' };

function clean(value: string): string {
  return value.replace(/[\s.!?]+$/g, '').replace(/^['«“]|['»”]$/g, '').trim().slice(0, 160);
}

export function detectProjectCommand(message: string): ProjectCommand {
  const value = message.trim();
  const confirmedDelete = value.match(
    /^(?:да[,\s]+)?(?:удали|удалить|подтверждаю)\s+(?:проект\s+)?(.+)$/iu
  );
  if (confirmedDelete && /^(?:да|подтверждаю)/iu.test(value)) {
    return { action: 'delete', name: clean(confirmedDelete[1]), confirmed: true };
  }
  const create = value.match(/^(?:пьеро[,:]?\s*)?(?:создай|создать|заведи|завести)\s+(?:новый\s+)?проект\s+(.+)$/iu);
  if (create) return { action: 'create', name: clean(create[1]) };

  const deleteMatch = value.match(
    /^(?:пьеро[,:]?\s*)?(?:удали|удалить|архивируй|архивировать)\s+(?:проект\s+)?(.+)$/iu
  );
  if (deleteMatch) {
    const name = clean(deleteMatch[1]);
    return { action: 'delete', name, confirmed: false };
  }

  const move = value.match(
    /^(?:пьеро[,:]?\s*)?(?:перенеси|перемести|отправь)\s+(?:(.+?)\s+)?в\s+проект\s+([\p{L}\p{N}][\p{L}\p{N} &'’_-]{0,100})$/iu
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

  return { action: 'none' };
}
