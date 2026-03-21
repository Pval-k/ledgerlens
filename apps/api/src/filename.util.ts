/** Single path segment safe for object keys; preserves a readable basename. */
export function safeStorageBasename(name: string): string {
  const base = name.replace(/^.*[/\\]/, '').trim() || 'file';
  return base.replace(/[^\w.\-()+@\s]/g, '_').slice(0, 200);
}
