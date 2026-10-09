export interface TodoItem {
  id: string;
  project_id: string;
  title: string;
  start_date: string;
  end_date?: string | null;
  is_completed: boolean;
  order_index: number;
  metadata?: Record<string, any>;
  created_at?: string;
}
