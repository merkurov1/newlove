import type { AssistantLanguage } from './language';

type SupportedLanguage = Exclude<AssistantLanguage, 'und'>;

function pick(language: AssistantLanguage, values: Record<SupportedLanguage, string>): string {
  if (language in values) return values[language as SupportedLanguage];
  return values.en;
}

export function privacyExplanation(language: AssistantLanguage): string {
  return pick(language, {
    ru: 'Память в этом чате приватна: я использую её только для того, чтобы лучше отвечать вам. Вы можете посмотреть, что я помню («Что ты помнишь?»), обновить запись («Обнови память: …»), забыть её («Забудь …») или отключить память («Отключи память»). Отключение памяти останавливает новые записи, но не удаляет историю переписки.',
    en: 'Memory in this chat is private: I use it only to answer you better. You can see what I remember (“What do you remember?”), update it (“Update memory: …”), forget it (“Forget …”) or disable memory (“Disable memory”). Disabling memory stops new records but does not erase the conversation history.',
    es: 'La memoria de este chat es privada: solo la uso para responderte mejor. Puedes ver lo que recuerdo («¿Qué recuerdas?»), actualizarlo («Actualiza la memoria: …»), olvidarlo («Olvida …») o desactivar la memoria («Desactiva la memoria»). Desactivarla detiene nuevos registros, pero no borra el historial de la conversación.',
    fr: 'La mémoire de ce chat est privée : je l’utilise uniquement pour mieux vous répondre. Vous pouvez voir ce dont je me souviens (« Que retiens-tu ? »), le mettre à jour (« Mets à jour la mémoire : … »), l’oublier (« Oublie … ») ou désactiver la mémoire (« Désactive la mémoire »). La désactivation arrête les nouveaux enregistrements mais n’efface pas l’historique de la conversation.',
    de: 'Das Gedächtnis in diesem Chat ist privat: Ich nutze es nur, um Ihnen besser zu antworten. Sie können sehen, was ich erinnere („Was erinnerst du dich?“), es aktualisieren („Aktualisiere das Gedächtnis: …“), vergessen („Vergiss …“) oder deaktivieren („Deaktiviere das Gedächtnis“). Das Deaktivieren stoppt neue Einträge, löscht aber nicht den Gesprächsverlauf.',
  });
}

export function memoryRemembered(language: AssistantLanguage): string {
  return pick(language, {
    ru: 'Запомнила.',
    en: 'Remembered.',
    es: 'Lo recordaré.',
    fr: 'C’est noté.',
    de: 'Notiert.',
  });
}

export function memoryUpdated(language: AssistantLanguage, updated: boolean): string {
  if (updated) {
    return pick(language, {
      ru: 'Обновила запись в памяти.',
      en: 'Memory updated.',
      es: 'Memoria actualizada.',
      fr: 'Mémoire mise à jour.',
      de: 'Gedächtnis aktualisiert.',
    });
  }

  return pick(language, {
    ru: 'В памяти пока нет записи, которую можно обновить. Скажите «Запомни, что …».',
    en: 'There is no saved memory to update yet. Say “Remember that …”.',
    es: 'Todavía no hay ningún recuerdo que actualizar. Di «Recuerda que …».',
    fr: 'Il n’y a pas encore de souvenir à mettre à jour. Dites « Retiens que … ».',
    de: 'Es gibt noch keinen gespeicherten Eintrag zum Aktualisieren. Sagen Sie „Merke dir, dass …“.',
  });
}

export function memoryForgotten(language: AssistantLanguage, count: number): string {
  if (count > 0) {
    return pick(language, {
      ru: count === 1 ? 'Забыла эту запись.' : `Забыла записей: ${count}.`,
      en: count === 1 ? 'Forgotten.' : `Forgotten records: ${count}.`,
      es: count === 1 ? 'Lo he olvidado.' : `Recuerdos olvidados: ${count}.`,
      fr: count === 1 ? 'C’est oublié.' : `Souvenirs oubliés : ${count}.`,
      de: count === 1 ? 'Vergessen.' : `Vergessene Einträge: ${count}.`,
    });
  }

  return pick(language, {
    ru: 'Не нашла подходящей записи в памяти.',
    en: 'I could not find a matching memory.',
    es: 'No encontré un recuerdo que coincida.',
    fr: 'Je n’ai pas trouvé de souvenir correspondant.',
    de: 'Ich habe keinen passenden Eintrag gefunden.',
  });
}

export function memoryDisabled(language: AssistantLanguage): string {
  return pick(language, {
    ru: 'Память отключена. Новые записи не создаются. История переписки при этом сохраняется.',
    en: 'Memory is disabled. No new memories will be created. The conversation history is still kept.',
    es: 'La memoria está desactivada. No se crearán nuevos recuerdos. El historial de la conversación se conserva.',
    fr: 'La mémoire est désactivée. Aucun nouveau souvenir ne sera créé. L’historique de la conversation est conservé.',
    de: 'Das Gedächtnis ist deaktiviert. Es werden keine neuen Einträge erstellt. Der Gesprächsverlauf bleibt erhalten.',
  });
}

export function memoryEnabled(language: AssistantLanguage): string {
  return pick(language, {
    ru: 'Память включена. Я снова смогу запоминать то, о чём вы попросите.',
    en: 'Memory is enabled. I can remember what you ask me to again.',
    es: 'La memoria está activada. Vuelvo a poder recordar lo que me pidas.',
    fr: 'La mémoire est activée. Je peux de nouveau retenir ce que vous me demandez.',
    de: 'Das Gedächtnis ist aktiviert. Ich kann wieder speichern, worum Sie bitten.',
  });
}

export function memoryList(
  language: AssistantLanguage,
  memories: Array<{ content: string }>,
  enabled: boolean
): string {
  const header = enabled
    ? pick(language, {
        ru: 'Вот что я помню:',
        en: 'Here is what I remember:',
        es: 'Esto es lo que recuerdo:',
        fr: 'Voici ce dont je me souviens :',
        de: 'Das erinnere ich:',
      })
    : pick(language, {
        ru: 'Память сейчас отключена. Сохранённые ранее записи:',
        en: 'Memory is currently disabled. Previously saved records:',
        es: 'La memoria está desactivada. Recuerdos guardados anteriormente:',
        fr: 'La mémoire est désactivée. Souvenirs enregistrés auparavant :',
        de: 'Das Gedächtnis ist derzeit deaktiviert. Früher gespeicherte Einträge:',
      });

  const body =
    memories.length > 0
      ? memories.map((memory, index) => `${index + 1}. ${memory.content}`).join('\n')
      : pick(language, {
          ru: 'Пока ничего не сохранено.',
          en: 'Nothing has been saved yet.',
          es: 'Todavía no hay nada guardado.',
          fr: 'Rien n’a encore été enregistré.',
          de: 'Es wurde noch nichts gespeichert.',
        });

  return `${header}\n${body}`;
}

export function memoryUnavailable(language: AssistantLanguage): string {
  return pick(language, {
    ru: 'Хранилище памяти временно недоступно. Попробуйте ещё раз позже.',
    en: 'The memory store is temporarily unavailable. Please try again later.',
    es: 'El almacenamiento de memoria no está disponible temporalmente. Inténtalo más tarde.',
    fr: 'Le stockage de la mémoire est temporairement indisponible. Réessayez plus tard.',
    de: 'Der Gedächtnisspeicher ist vorübergehend nicht verfügbar. Bitte versuchen Sie es später erneut.',
  });
}
