// ... все ваши существующие импорты ...
// ... все ваши существующие функции (verifyAdmin, createArticle и т.д.) ...

export async function deleteProject(formData) {
  // ...
  revalidatePath('/projects');
}


// --- РАССЫЛКА (Newsletter) ---

export async function subscribeToNewsletter(prevState, formData) {
  'use server';

  const email = formData.get('email')?.toString().toLowerCase();

  // Валидация email
  if (!email || !/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(email)) {
    return { status: 'error', message: 'Пожалуйста, введите корректный email.' };
  }

  try {
    // Ищем пользователя в основной таблице User по этому email
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    // Создаем запись в таблице подписчиков
    await prisma.subscriber.create({
      data: {
        email: email,
        // Если пользователь с таким email найден, привязываем подписку к его ID
        userId: existingUser?.id || null,
      },
    });

    return { status: 'success', message: 'Спасибо за подписку! Мы добавили вас в список.' };

  } catch (error) {
    // Prisma код P2002 означает нарушение unique constraint (т.е. email уже существует)
    if (error.code === 'P2002') {
      return { status: 'error', message: 'Этот email уже есть в нашей базе подписчиков.' };
    }
    
    // Любая другая ошибка
    console.error('Ошибка подписки на рассылку:', error);
    return { status: 'error', message: 'Произошла непредвиденная ошибка. Попробуйте снова.' };
  }
}

Ваши следующие шаги:
 * Замените содержимое prisma/schema.prisma и components/Footer.js.
 * Добавьте новую функцию subscribeToNewsletter в конец вашего файла app/admin/actions.js.
 * Выполните миграцию. Это самый важный шаг. Откройте терминал и запустите:
   npx prisma migrate dev --name add_subscribers_table




