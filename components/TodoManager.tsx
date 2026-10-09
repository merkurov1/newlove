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

  const projects = Array.from(new Set(todos.map((t) => t.project_id)));

  const toggleComplete = async (id: string, currentStatus: boolean) => {
    const updatedStatus = !currentStatus;
    
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, is_completed: updatedStatus } : t))
    );

    await fetch('/api/piero/todo', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_completed: updatedStatus }),
    });
  };

  const handleDelete = async (id: string) => {
    setTodos((prev) => prev.filter((t) => t.id !== id));

    await fetch(`/api/piero/todo?id=${id}`, {
      method: 'DELETE',
    });
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const newTaskPayload = {
      project_id: selectedProject === 'all' ? 'p1' : selectedProject,
      title: newTitle.trim(),
      start_date: '2026-10-09',
      is_completed: false,
      order_index: todos.length,
    };

    const res = await fetch('/api/piero/todo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newTaskPayload),
    });

    const data = await res.json();
    if (data.data && data.data[0]) {
      setTodos((prev) => [...prev, data.data[0]]);
      setNewTitle('');
    }
  };

  const filteredTodos = selectedProject === 'all' 
    ? todos 
    : todos.filter((t) => t.project_id === selectedProject);

  return (
    <div className="w-full max-w-[1200px] mx-auto pt-32 pb-24 px-6 lg:px-10 font-sans text-stone-900">
      {/* Шапка */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between pb-8 border-b border-stone-300 gap-4">
        <div>
          <span className="font-mono text-[10px] tracking-widest text-stone-400 uppercase block mb-1">
            Task Engine
          </span>
          <h1 className="text-xl sm:text-2xl font-bold uppercase tracking-[0.2em] text-stone-900">
            DO
          </h1>
        </div>

        {/* Фильтр проектов */}
        <div className="flex items-center gap-3 overflow-x-auto pb-1 sm:pb-0 font-mono text-xs">
          <button
            type="button"
            onClick={() => setSelectedProject('all')}
            className={`px-3 py-1 uppercase tracking-wider transition-colors cursor-pointer ${
              selectedProject === 'all'
                ? 'bg-stone-900 text-white'
                : 'text-stone-500 hover:text-stone-900 border border-stone-200'
            }`}
          >
            All
          </button>
          {projects.map((proj) => (
            <button
              key={proj}
              type="button"
              onClick={() => setSelectedProject(proj)}
              className={`px-3 py-1 uppercase tracking-wider transition-colors cursor-pointer ${
                selectedProject === proj
                  ? 'bg-stone-900 text-white'
                  : 'text-stone-500 hover:text-stone-900 border border-stone-200'
              }`}
            >
              {proj}
            </button>
          ))}
        </div>
      </div>

      {/* Форма быстрых задач */}
      <form onSubmit={handleAddTask} className="py-6 border-b border-stone-200">
        <div className="flex items-center gap-4">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="ADD NEW TASK..."
            className="flex-1 bg-transparent border-none text-sm font-medium tracking-wide placeholder-stone-400 focus:outline-none focus:ring-0 uppercase"
          />
          <button
            type="submit"
            className="font-mono text-xs uppercase tracking-[0.15em] px-4 py-2 bg-stone-900 text-white hover:bg-stone-800 transition-colors cursor-pointer"
          >
            + Add
          </button>
        </div>
      </form>

      {/* Список */}
      <div className="divide-y divide-stone-200/70">
        {filteredTodos.map((item) => (
          <div
            key={item.id}
            className="group flex items-center justify-between py-4 transition-colors hover:bg-stone-100/50 px-2 -mx-2"
          >
            <div className="flex items-center gap-4 min-w-0 flex-1 pr-4">
              <button
                type="button"
                onClick={() => toggleComplete(item.id, item.is_completed)}
                className={`w-4 h-4 shrink-0 rounded-none border border-stone-900 flex items-center justify-center transition-all cursor-pointer ${
                  item.is_completed ? 'bg-stone-900' : 'bg-transparent'
                }`}
              >
                {item.is_completed && (
                  <span className="text-white text-[10px] leading-none">✓</span>
                )}
              </button>

              <span
                className={`text-sm tracking-wide truncate transition-all ${
                  item.is_completed
                    ? 'line-through text-stone-400 font-normal'
                    : 'text-stone-900 font-medium'
                }`}
              >
                {item.title}
              </span>
            </div>

            <div className="flex items-center gap-6 shrink-0">
              <span className="font-mono text-xs text-stone-400">
                {item.start_date}
              </span>

              {/* Появление крестика удаления при hover */}
              <button
                type="button"
                onClick={() => handleDelete(item.id)}
                aria-label="Delete task"
                className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 text-stone-400 hover:text-stone-900 font-mono text-base leading-none p-1 cursor-pointer"
              >
                ×
              </button>
            </div>
          </div>
        ))}

        {filteredTodos.length === 0 && (
          <div className="py-12 text-center font-mono text-xs text-stone-400 uppercase tracking-widest">
            No tasks found
          </div>
        )}
      </div>
    </div>
  );
}
