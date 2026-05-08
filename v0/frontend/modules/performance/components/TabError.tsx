import React from 'react';
import { AlertTriangle } from 'lucide-react';

export function TabError({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 text-red-500 text-sm py-8">
      <AlertTriangle className="w-4 h-4" /> {message}
    </div>
  );
}
