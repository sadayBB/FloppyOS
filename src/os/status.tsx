import { createContext, useContext, useEffect } from 'react';

/** Lets an app show Explorer-style status text at the bottom of its window. */
export const StatusCtx = createContext<((parts: string[] | null) => void) | null>(null);

export function useWindowStatus(parts: (string | false | null | undefined)[]) {
  const set = useContext(StatusCtx);
  const clean = parts.filter((p): p is string => !!p);
  const key = clean.join('\u0001');
  useEffect(() => {
    set?.(clean);
  }, [key, set]);
  useEffect(() => () => set?.(null), [set]);
}
