import { createClient } from '@supabase/supabase-js';
import TodoManager from '@/components/TodoManager';
import { TodoItem } from '@/types/todo';

export const revalidate = 0;

async function getTodos(): Promise<TodoItem[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data, error } = await supabase
    .from('todo')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching todos:', error);
    return [];
  }

  return data || [];
}

export default async function DoPage() {
  const todos = await getTodos();

  return (
    <main className="min-h-screen bg-[#FAF8F5]">
      <TodoManager initialTodos={todos} />
    </main>
  );
}
