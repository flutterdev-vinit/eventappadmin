import { useState, useEffect } from 'react';

/**
 * Returns a debounced copy of `value` that only updates after `delay` ms of
 * inactivity. Use this to delay server queries while the user is still typing.
 *
 * @example
 * const debouncedMode = useDebounce(mode, 400);
 * useEffect(() => { fetchEventsPage(status, null, debouncedMode); }, [debouncedMode]);
 */
export function useDebounce<T>(value: T, delay = 400): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
