// Managed block inside the user's CLAUDE.md. Everything outside the markers belongs to the user.

export const BEGIN = '<!-- VIBE-KIT:BEGIN (managed by Tool_VibeCode - edit outside this block, changes inside are overwritten) -->';
export const END = '<!-- VIBE-KIT:END -->';

const BLOCK_RE = /<!-- VIBE-KIT:BEGIN[^\n]*-->[\s\S]*?<!-- VIBE-KIT:END -->\r?\n?/;

const eolOf = (text) => (text.includes('\r\n') ? '\r\n' : '\n');

export function upsertBlock(text, body) {
  const original = text ?? '';
  const eol = eolOf(original);
  const block = `${BEGIN}\n${body.trim()}\n${END}`.replaceAll('\n', eol) + eol;
  if (BLOCK_RE.test(original)) return original.replace(BLOCK_RE, () => block);
  if (!original.trim()) return block;
  const sep = original.endsWith(eol) ? eol : eol + eol;
  return original + sep + block;
}

// Also swallows the one blank line upsertBlock inserted before the block, so install + uninstall round-trips exactly.
const REMOVE_RE = new RegExp(`(?:\\r?\\n)?${BLOCK_RE.source}`);

export function removeBlock(text) {
  if (text == null) return text;
  return text.replace(REMOVE_RE, '');
}

export const hasBlock = (text) => BLOCK_RE.test(text ?? '');
