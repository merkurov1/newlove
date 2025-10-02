"use client";
import { useState, useEffect } from 'react';

interface SearchBoxProps {
  onSearch: (query: string) => void;
  placeholder?: string;
  className?: string;
  debounceMs?: number;
}

export function SearchBox({ 
  onSearch, 
  placeholder = "Поиск...", 
  className = "",
  debounceMs = 300
}: SearchBoxProps) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      onSearch(query);
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [query, onSearch, debounceMs]);

  return (
    <div className={`relative ${className}`}>
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <span className="text-gray-400">🔍</span>
      </div>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="
          block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md
          leading-5 bg-white placeholder-gray-500 focus:outline-none 
          focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 
          focus:border-blue-500 text-sm
        "
        placeholder={placeholder}
      />
      {query && (
        <button
          onClick={() => setQuery('')}
          className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
        >
          ✕
        </button>
      )}
    </div>
  );
}