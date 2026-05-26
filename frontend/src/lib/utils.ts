import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type DebouncedFunction<T extends (...args: any[]) => void> = ((
  ...args: Parameters<T>
) => void) & {
  flush: () => void;
  cancel: () => void;
  pending: () => boolean;
};

export function debounce<T extends (...args: any[]) => void>(
  fn: T,
  delayMs: number
): DebouncedFunction<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;

  function run() {
    if (!lastArgs) return;
    const args = lastArgs;
    lastArgs = null;
    timer = null;
    fn(...args);
  }

  const debounced = ((...args: Parameters<T>) => {
    lastArgs = args;
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, delayMs);
  }) as DebouncedFunction<T>;

  debounced.flush = () => {
    if (timer) clearTimeout(timer);
    run();
  };

  debounced.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    lastArgs = null;
  };

  debounced.pending = () => lastArgs !== null;

  return debounced;
}
