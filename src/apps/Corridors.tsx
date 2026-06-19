import React from 'react';
import type { Agency } from '../App';

interface Props {
  agencies: Agency[];
  lightMode: boolean;
  setLightMode: (v: boolean) => void;
}

export default function Corridors({ agencies: _agencies, lightMode: _lightMode, setLightMode: _setLightMode }: Props) {
  return (
    <div className="flex items-center justify-center h-full text-[var(--text-dim)] text-sm">
      Corridors — coming soon
    </div>
  );
}
