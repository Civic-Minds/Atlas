// jest-dom's own vitest types extend `Assertion<T>`, which vitest 5 no longer merges (its Assertion takes <R, T>).
// Vitest 5 reads custom matchers from `Matchers<R, T>`, so register jest-dom's there (CIV-827). Remove this once
// @testing-library/jest-dom ships vitest 5 types.
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface Matchers<R extends void | Promise<void> = void | Promise<void>, T = unknown> extends TestingLibraryMatchers<any, R> {}
}
