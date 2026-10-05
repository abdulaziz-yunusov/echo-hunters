/** Copy text to the clipboard (Phase 13: share links and results). False if the browser said no. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** This page's address without any #map=… (for links). */
export function pageUrl(): string {
  return typeof location === 'undefined' ? '' : location.origin + location.pathname;
}
