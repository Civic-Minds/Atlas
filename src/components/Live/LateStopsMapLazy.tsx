import { lazy, Suspense, type ComponentProps } from 'react';

const LateStopsMap = lazy(() => import('./LateStopsMap'));

/** The late-stops map, loaded on demand so the map library stays out of the report pages' first load (CIV-977). */
export default function LateStopsMapLazy(props: ComponentProps<typeof LateStopsMap>) {
  return (
    <Suspense fallback={<div className={`${props.className ?? ''}`}><div className={`${props.mapClassName ?? 'h-72'} w-full rounded-2xl border border-[var(--border-primary)]`} /></div>}>
      <LateStopsMap {...props} />
    </Suspense>
  );
}
