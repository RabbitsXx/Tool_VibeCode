// Pure functions that merge the kit's settings fragment into a user's settings.json
// without touching anything the user owns (model, env, their own hooks and rules).

/** Every hook command the kit installs contains this path segment, so we can find our own entries later. */
export const HOOK_MARKER = '/vibe/hooks/';

const LISTS = ['allow', 'ask', 'deny'];

const isVibeHandler = (h) => typeof h?.command === 'string' && h.command.replaceAll('\\', '/').includes(HOOK_MARKER);

function stripVibeHooks(hooks) {
  const out = {};
  for (const [event, groups] of Object.entries(hooks ?? {})) {
    if (!Array.isArray(groups)) {
      out[event] = groups;
      continue;
    }
    const kept = [];
    for (const group of groups) {
      const handlers = (group.hooks ?? []).filter((h) => !isVibeHandler(h));
      if (handlers.length) kept.push({ ...group, hooks: handlers });
      else if (!(group.hooks ?? []).length) kept.push(group); // not ours, leave odd shapes alone
    }
    if (kept.length) out[event] = kept;
  }
  return out;
}

/** Replace {{HOOKS_DIR}} placeholders (recursively) in a fragment. */
export function renderFragment(fragment, hooksDir) {
  return JSON.parse(JSON.stringify(fragment).replaceAll('{{HOOKS_DIR}}', hooksDir.replaceAll('\\', '/')));
}

/**
 * @param {object} current   parsed settings.json (or {})
 * @param {object} fragment  rendered fragment ({permissions, hooks})
 * @param {{withHooks?: boolean}} opts
 * @param {{withHooks?: boolean, previouslyAdded?: {allow?: string[], ask?: string[], deny?: string[]}}} opts
 * @returns {{settings: object, added: {allow: string[], ask: string[], deny: string[]}, skipped: string[], retired: string[]}}
 */
export function mergeSettings(current, fragment, { withHooks = true, previouslyAdded = {} } = {}) {
  const settings = structuredClone(current ?? {});
  const added = { allow: [], ask: [], deny: [] };
  const skipped = [];
  const retired = [];

  settings.permissions ??= {};
  // Rules a previous kit version added that the current fragment no longer has: retire them, so upgrades never leave stale rules.
  for (const list of LISTS) {
    const keep = new Set(fragment.permissions?.[list] ?? []);
    const gone = (previouslyAdded[list] ?? []).filter((r) => !keep.has(r));
    if (!gone.length || !Array.isArray(settings.permissions[list])) continue;
    settings.permissions[list] = settings.permissions[list].filter((r) => !gone.includes(r));
    retired.push(...gone.map((r) => `${list}: ${r}`));
  }
  for (const list of LISTS) {
    const have = new Set(settings.permissions[list] ?? []);
    for (const rule of fragment.permissions?.[list] ?? []) {
      if (have.has(rule)) continue;
      // Respect an explicit user allow: an 'ask'/'deny' on the same rule would silently reverse their choice.
      if (list !== 'allow' && (settings.permissions.allow ?? []).includes(rule)) {
        skipped.push(`${list}: ${rule} (already in your allow list)`);
        continue;
      }
      settings.permissions[list] = [...(settings.permissions[list] ?? []), rule];
      added[list].push(rule);
    }
  }

  // Hooks: drop our previous entries, then append the current ones (idempotent, picks up path changes).
  const hooks = stripVibeHooks(settings.hooks);
  if (withHooks) {
    for (const [event, groups] of Object.entries(fragment.hooks ?? {})) {
      hooks[event] = [...(hooks[event] ?? []), ...groups];
    }
  }
  if (Object.keys(hooks).length) settings.hooks = hooks;
  else delete settings.hooks;

  for (const list of LISTS) if (Array.isArray(settings.permissions[list]) && !settings.permissions[list].length) delete settings.permissions[list];
  if (!Object.keys(settings.permissions).length) delete settings.permissions;

  return { settings, added, skipped, retired };
}

/** Undo mergeSettings: remove exactly the rules we added and every vibe-owned hook. */
export function unmergeSettings(current, added = {}) {
  const settings = structuredClone(current ?? {});
  if (settings.permissions) {
    for (const list of LISTS) {
      if (!Array.isArray(settings.permissions[list])) continue;
      const drop = new Set(added[list] ?? []);
      settings.permissions[list] = settings.permissions[list].filter((r) => !drop.has(r));
      if (!settings.permissions[list].length) delete settings.permissions[list];
    }
    if (!Object.keys(settings.permissions).length) delete settings.permissions;
  }
  if (settings.hooks) {
    const hooks = stripVibeHooks(settings.hooks);
    if (Object.keys(hooks).length) settings.hooks = hooks;
    else delete settings.hooks;
  }
  return settings;
}

export function hasVibeHooks(settings) {
  return Object.values(settings?.hooks ?? {}).some((groups) =>
    Array.isArray(groups) && groups.some((g) => (g.hooks ?? []).some(isVibeHandler)));
}
