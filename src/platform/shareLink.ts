import { EDITOR } from '@/config/editor';
import { decodeMap } from '@/sim/world/customMap';
import { pageUrl } from './clipboard';

/** A shared map in a page address's hash (`#map=v1.…`), if it is a valid map. */
export function sharedMapFromHash(hash: string): string | null {
  const prefix = `#${EDITOR.hashKey}=`;
  if (!hash.startsWith(prefix)) return null;
  const text = decodeURIComponent(hash.slice(prefix.length));
  return decodeMap(text) ? text : null;
}

/** The link that opens this map in the editor. */
export function mapLink(encoded: string): string {
  return `${pageUrl()}#${EDITOR.hashKey}=${encoded}`;
}
