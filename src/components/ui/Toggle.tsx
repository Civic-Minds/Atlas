import { TRANSITION_BASE } from '../../styles';

interface ToggleProps {
  on: boolean;
  onToggle: () => void;
  /** Accessible name; the visible label lives next to the toggle. */
  label: string;
  className?: string;
}

/** On/off switch (button with role="switch"). Colours come from the --toggle-* tokens. */
export default function Toggle({ on, onToggle, label, className = 'shrink-0' }: ToggleProps) {
  return (
    <button type="button" onClick={onToggle} aria-label={label} role="switch" aria-checked={on} className={className}>
      <span
        className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${TRANSITION_BASE} ${
          on ? 'bg-[var(--toggle-on-bg)]' : 'bg-[var(--toggle-off-bg)]'
        }`}
      >
        <span
          className={`absolute top-1 h-3 w-3 rounded-full shadow-sm transition-transform ${TRANSITION_BASE} ${
            on ? 'translate-x-5 bg-[var(--toggle-knob-on)]' : 'translate-x-1 bg-[var(--toggle-knob-off)]'
          }`}
        />
      </span>
    </button>
  );
}
