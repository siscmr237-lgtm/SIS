import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { Input } from './ui/input';

export interface ParentMatch {
  id: number;
  name: string;
  phone: string;
}

interface ParentTypeaheadProps {
  value: string;
  onChange: (name: string) => void;
  onSelect: (parent: ParentMatch) => void;
  placeholder?: string;
}

// Name-based typeahead for linking a student to a shared Parent record.
// Selecting a suggestion hands the full match (including phone) back to the
// caller via onSelect; free-typing just reports the raw text via onChange —
// the caller decides whether that means "create a new parent" or "edit the
// currently-linked one in place".
export function ParentTypeahead({ value, onChange, onSelect, placeholder }: ParentTypeaheadProps) {
  const [results, setResults] = useState<ParentMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  useEffect(() => {
    const query = value.trim();
    if (query.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      api.get(`/parents/search?query=${encodeURIComponent(query)}`)
        .then((data) => setResults(data || []))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [value]);

  const showDropdown = open && value.trim().length >= 2 && (loading || results.length > 0);

  return (
    <div className="relative" ref={containerRef}>
      <Input
        placeholder={placeholder || 'Enter parent name'}
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        autoComplete="off"
      />
      {showDropdown && (
        <div className="absolute left-0 right-0 top-full mt-1 z-10 bg-white border rounded-md shadow-lg max-h-80 overflow-y-auto py-1">
          {loading ? (
            <p className="px-3 py-2 text-sm text-gray-400">Searching…</p>
          ) : (
            results.map((p) => (
              <button
                type="button"
                key={p.id}
                className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                onClick={() => { onSelect(p); setOpen(false); }}
              >
                <span className="font-medium">{p.name}</span>
                <span className="text-gray-500"> — {p.phone}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
