// ... все ваши существующие импорты и функции ...

// --- РАССЫЛКА (Newsletter) ---
export async function subscribeToNewsletter(prevState, formData) {
  // ... эта функция остается без изменений ...
}


// --- РАССЫЛКИ (Letter) ---

export async function createLetter(formData) {
  const session = await verifyAdmin();
  const title = formData.get('title')?.toString();
  const content = formData.get('content')?.toString();
  const slug = formData.get('slug')?.toString();
  const published = formData.get('published') === 'on';

  if (!title || !content || !slug) {
    throw new Error('Title, content, and slug are required.');
  }

  await prisma.letter.create({
    data: {
      title,
      content,
      slug,
      published,
      publishedAt: published ? new Date() : null,
      authorId: session.user.id,
    },
  });

  revalidatePath('/admin/letters');
  redirect('/admin/letters');
}

export async function updateLetter(formData) {
  await verifyAdmin();
  const id = formData.get('id')?.toString();
  const title = formData.get('title')?.toString();
  const content = formData.get('content')?.toString();
  const slug = formData.get('slug')?.toString();
  const published = formData.get('published') === 'on';

  if (!id || !title || !content || !slug) {
    throw new Error('All fields are required.');
  }
  
  await prisma.letter.update({
    where: { id: id },
    data: {
      title,
      content,
      slug,
      published,
      publishedAt: published ? new Date() : null,
    },
  });

  revalidatePath('/admin/letters');
  revalidatePath(`/${slug}`); // Предполагаем, что письма тоже будут по "плоским" URL
  redirect('/admin/letters');
}

export async function deleteLetter(formData) {
  await verifyAdmin();
  const id = formData.get('id')?.toString();
  if (!id) { throw new Error('Letter ID is required.'); }
  
  const letter = await prisma.letter.findUnique({ where: { id } });
  await prisma.letter.delete({ where: { id: id } });

  revalidatePath('/admin/letters');
  if (letter) revalidatePath(`/${letter.slug}`);
}


