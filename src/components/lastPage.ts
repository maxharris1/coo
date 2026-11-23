export const LAST_PAGE_KEY = "coo.lastPage";

export function rememberPage(
  path: string,
  store: Pick<Storage, "setItem">,
): void {
  const pathname = path.split(/[?#]/, 1)[0];
  if (pathname === "/more" || pathname.startsWith("/more/")) return;
  store.setItem(LAST_PAGE_KEY, pathname);
}

export function lastPage(store: Pick<Storage, "getItem">): string {
  return store.getItem(LAST_PAGE_KEY) ?? "/more";
}
