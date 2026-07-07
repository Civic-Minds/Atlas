import React from 'react';
import { Search, X } from 'lucide-react';

export interface StopInputProps {
  label: string;
  value: string;
  selected: boolean;
  onChange: (v: string) => void;
  onFocus: () => void;
  onClear: () => void;
  onBlur?: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

export const StopInput = React.forwardRef<HTMLInputElement, StopInputProps>(
  ({ label, value, selected, onChange, onFocus, onClear, onBlur, onKeyDown }, ref) => {
    const [focused, setFocused] = React.useState(false);
    const placeholder = (focused || value) ? 'Search stations…' : label;
    return (
      <div className="flex items-center gap-2 h-9 bg-[var(--bg-app)] border border-[var(--border-primary)] rounded-lg px-3 focus-within:border-[var(--accent)] transition-colors">
        <Search className="w-3 h-3 text-[var(--text-dim)] shrink-0" />
        <input
          ref={ref}
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => { setFocused(true); onFocus(); }}
          onBlur={() => { setFocused(false); onBlur?.(); }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-xs font-bold text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none min-w-0"
        />
        {value && (
          <button onClick={onClear} className="text-[var(--text-dim)] hover:text-[var(--text-primary)] transition-colors">
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
    );
  }
);
StopInput.displayName = 'StopInput';
