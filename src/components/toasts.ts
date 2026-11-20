export type Toast = { id: number; message: string };

export function createToasts(lifetimeMs: number) {
  let toasts: readonly Toast[] = [];
  let nextId = 1;
  const listeners = new Set<() => void>();
  const set = (next: readonly Toast[]) => {
    toasts = next;
    for (const listener of listeners) listener();
  };
  const dismiss = (id: number) => set(toasts.filter((t) => t.id !== id));

  return {
    show(message: string) {
      const id = nextId++;
      set([...toasts, { id, message }]);
      setTimeout(() => dismiss(id), lifetimeMs);
    },
    dismiss,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => toasts,
  };
}
