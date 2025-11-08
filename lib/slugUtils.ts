// Утилита для генерации slug из заголовка
export function generateSlug(title: string) {
  if (!title) return '';

  return title
    // Удаляем эмодзи и специальные символы
    .replace(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '')
    // Удаляем HTML теги если есть
    .replace(/<[^>]*>/g, '')
    // Переводим в нижний регистр
    .toLowerCase()
    // Заменяем пробелы и специальные символы на дефисы
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    // Убираем дефисы в начале и конце
    .replace(/^-+|-+$/g, '')
    // Ограничиваем длину
    .substring(0, 100);
}

// Транслитерация кириллицы для SEO-friendly URL
export function transliterate(text: string) {
  const map: Record<string, string> = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e', 'ж': 'zh',
    'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
    'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'ts',
    'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
    'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ё': 'E', 'Ж': 'Zh',
    'З': 'Z', 'И': 'I', 'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M', 'Н': 'N', 'О': 'O',
    'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T', 'У': 'U', 'Ф': 'F', 'Х': 'H', 'Ц': 'Ts',
    'Ч': 'Ch', 'Ш': 'Sh', 'Щ': 'Sch', 'Ъ': '', 'Ы': 'Y', 'Ь': '', 'Э': 'E', 'Ю': 'Yu', 'Я': 'Ya'
  };

  return text.replace(/[а-яё]/gi, function(match) {
    return map[match] || match;
  });
}

// Комбинированная функция для создания SEO-friendly slug
export function createSeoSlug(title: string) {
  if (!title) return '';
  
  // Сначала транслитерируем кириллицу
  const transliterated = transliterate(title);
  // Затем генерируем slug
  return generateSlug(transliterated);
}

/**
 * Создает уникальный слаг проверяя существующие
 * @param {string} title - исходный заголовок
 * @param {string[]} existingSlugs - массив существующих слагов
 * @param {number} maxLength - максимальная длина слага
 * @returns {string} уникальный слаг
 */
export function generateUniqueSlug(title: string, existingSlugs: string[] = [], maxLength = 50) {
  const baseSlug = createSeoSlug(title).substring(0, maxLength - 4); // оставляем место для суффикса
  
  if (!existingSlugs.includes(baseSlug)) {
    return baseSlug;
  }

  // Если базовый слаг уже существует, добавляем числовой суффикс
  let counter = 1;
  let uniqueSlug;
  
  do {
    uniqueSlug = `${baseSlug}-${counter}`;
    counter++;
  } while (existingSlugs.includes(uniqueSlug));

  return uniqueSlug;
}

/**
 * Валидирует слаг
 * @param {string} slug - слаг для проверки
 * @returns {boolean} true если слаг валидный
 */
export function isValidSlug(slug: string) {
  if (!slug) return false;
  
  // Слаг должен содержать только буквы, цифры и дефисы
  // Не должен начинаться или заканчиваться дефисом
  // Не должен содержать несколько дефисов подряд
  const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  return slugPattern.test(slug) && slug.length <= 100;
}

/**
 * Создает слаг для письма на основе subject
 * @param {string} subject - тема письма
 * @param {string[]} existingSlugs - существующие слаги
 * @returns {string} слаг для письма
 */
export function generateLetterSlug(subject: string, existingSlugs: string[] = []) {
  return generateUniqueSlug(subject, existingSlugs, 60);
}

/**
 * Создает слаг для открытки на основе title
 * @param {string} title - название открытки
 * @param {string[]} existingSlugs - существующие слаги
 * @returns {string} слаг для открытки
 */
export function generatePostcardSlug(title: string, existingSlugs: string[] = []) {
  return generateUniqueSlug(title, existingSlugs, 50);
}