'use client';

import { useState } from 'react';
import { TodoItem } from '@/types/todo';

interface TodoManagerProps {
  initialTodos: TodoItem[];
}

export default function TodoManager({ initialTodos }: TodoManagerProps) {
  const [todos, setTodos] = useState<TodoItem[]>(initialTodos);
  const [newTitle, setNewTitle] = useState('');
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const projects = Array.from(
    new Set(todos.map((t) => t.project_id).filter(Boolean))
  );

  const toggleComplete = async (id: string, currentStatus: boolean) => {
    const nextStatus = !currentStatus;

    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, is_completed: nextStatus } : t))
    );

    try {
      await fetch('/api/todo', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_completed: nextStatus }),
      });
    } catch (err) {
      console.error('Failed to update task:', err);
    }
  };

  const handleDelete = async (id: string) => {
    setTodos((prev) => prev.filter((t) => t.id !== id));

    try {
      await fetch(`/api/todo?id=${id}`, {
        method: 'DELETE',
      });
    } catch (err) {
      console.error('Failed to delete task:', err);
    }
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || isSubmitting) return;

    setIsSubmitting(true);

    // Валидная дата YYYY-MM-DD для поля типа date в Postgres
    const todayIso = new Date().toISOString().split('T')[0];

    const payload = {
      project_id: selectedProject === 'all' ? 'general' : selectedProject,
      title: newTitle.trim(),
      start_date: todayIso,
      is_completed: false,
      order_index: todos.length,
    };

    try {
      const res = await fetch('/api/todo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok && data.data && data.data[0]) {
        setTodos((prev) => [data.data[0], ...prev]);
        setNewTitle('');
      } else {
        alert(`Error adding task: ${data.error || 'Server error'}`);
      }
    } catch (err) {
      console.error('Request failed:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Форматирование даты из YYYY-MM-DD в DD.MM
  const formatDateDisplay = (dateStr?: string) => {
    if (!dateStr) return '09.10';
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        return `${parts[2]}.${parts[1]}`;
      }
      return dateStr;
    } catch {
      return '09.10';
    }
  };

  const filteredTodos =
    selectedProject === 'all'
      ? todos
      : todos.filter((t) => t.project_id === selectedProject);

  return (
    <div className="w-full max-w-[1000px] mx-auto pt-36 pb-32 px-6 font-sans text-stone-900">
      {/* Header */}
      <header className="mb-12 border-b border-stone-200 pb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-6">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-stone-400 mb-2">
            System // Task Engine
          </p>
          <h1 className="text-xl sm:text-2xl font-bold uppercase tracking-[0.2em] text-stone-900">
            DO
          </h1>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 overflow-x-auto font-mono text-[11px] tracking-widest uppercase">
          <button
            type="button"
            onClick={() => setSelectedProject('all')}
            className={`px-3 py-1 transition-colors cursor-pointer ${
              selectedProject === 'all'
                ? 'bg-stone-900 text-stone-50'
                : 'text-stone-400 hover:text-stone-900'
            }`}
          >
            ALL
          </button>
          {projects.map((proj) => (
            <button
              key={proj}
              type="button"
              onClick={() => setSelectedProject(proj)}
              className={`px-3 py-1 transition-colors cursor-pointer ${
                selectedProject === proj
                  ? 'bg-stone-900 text-stone-50'
                  : 'text-stone-400 hover:text-stone-900'
              }`}
            >
              {proj}
            </button>
          ))}
        </div>
      </header>

      {/* Input row */}
      <form onSubmit={handleAddTask} className="mb-10">
        <div className="flex items-center gap-4 border-b border-stone-900 pb-3">
          <span className="font-mono text-xs text-stone-400">+</span>
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="NEW TASK..."
            disabled={isSubmitting}
            className="flex-1 bg-transparent border-none outline-none text-sm font-medium tracking-wide placeholder-stone-300 uppercase focus:ring-0 text-stone-900"
          />
          <button
            type="submit"
            disabled={!newTitle.trim() || isSubmitting}
            className="font-mono text-[11px] uppercase tracking-[0.2em] text-stone-900 hover:text-stone-500 disabled:opacity-20 cursor-pointer transition-colors"
          >
            {isSubmitting ? 'SAVING...' : '[ ADD ]'}
          </button>
        </div>
      </form>

      {/* List */}
      <div className="space-y-0 divide-y divide-stone-100">
        {filteredTodos.map((item) => (
          <div
            key={item.id}
            className="group flex items-center justify-between py-4 hover:bg-stone-50/80 transition-colors px-2 -mx-2"
          >
            <div className="flex items-center gap-4 min-w-0 flex-1 pr-4">
              <button
                type="button"
                onClick={() => toggleComplete(item.id, item.is_completed)}
                className={`w-3.5 h-3.5 shrink-0 border border-stone-900 flex items-center justify-center transition-all cursor-pointer ${
                  item.is_completed ? 'bg-stone-900' : 'bg-transparent'
                }`}
              >
                {item.is_completed && (
                  <span className="text-white text-[9px] leading-none">✓</span>
                )}
              </button>

              <span
                className={`text-sm tracking-wide truncate ${
                  item.is_completed
                    ? 'line-through text-stone-300 font-normal'
                    : 'text-stone-900 font-medium'
                }`}
              >
                {item.title}
              </span>
            </div>

            <div className="flex items-center gap-6 shrink-0 font-mono text-xs">
              <span className="text-stone-300 text-[11px]">
                {formatDateDisplay(item.start_date)}
              </span>

              <button
                type="button"
                onClick={() => handleDelete(item.id)}
                aria-label="Delete"
                className="opacity-0 group-hover:opacity-100 text-stone-400 hover:text-stone-900 transition-opacity p-1 cursor-pointer"
              >
                ×
              </button>
            </div>
          </div>
        ))}

        {filteredTodos.length === 0 && (
          <div className="py-16 text-center font-mono text-xs uppercase tracking-[0.25em] text-stone-300">
            NO TASKS
          </div>
        )}
      </div>
    </div>
  );
}
