import { NextResponse } from 'next/server';
import { cookies } from 'headers';
import fs from 'fs/promises';
import path from 'path';

export async function GET() {
  try {
    const cookieStore = cookies();
    const hasAccess = cookieStore.get('unframed_access')?.value === 'true';
    const isAdmin = cookieStore.get('unframed_admin')?.value === 'true';

    if (!hasAccess && !isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Храните файл в защищенной директории (например, в корне проекта в папке /content)
    const filePath = path.join(process.cwd(), 'content', 'Unframed.markdown');
    const fileContent = await fs.readFile(filePath, 'utf8');

    return NextResponse.json({ content: fileContent });
  } catch (error) {
    return NextResponse.json({ error: 'Manuscript not found' }, { status: 404 });
  }
}
