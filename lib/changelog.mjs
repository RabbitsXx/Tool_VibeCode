import { compareVersions } from './util.mjs';

const HEADING = /^## \[(Unreleased|\d+\.\d+\.\d+)\](?: - (\d{4}-\d{2}-\d{2}))?\s*$/gm;

/** @returns {{version: string, date: string|null, body: string}[]} newest first, as written in the file */
export function parseChangelog(text) {
  const marks = [...String(text).matchAll(HEADING)];
  return marks.map((m, i) => ({
    version: m[1],
    date: m[2] ?? null,
    body: text.slice(m.index + m[0].length, marks[i + 1]?.index ?? text.length).trim(),
  }));
}

/** Released entries newer than `since` (exclusive) up to `upTo` (inclusive, default: all). */
export function entriesSince(text, since, upTo) {
  return parseChangelog(text).filter((e) =>
    e.version !== 'Unreleased'
    && compareVersions(e.version, since) > 0
    && (!upTo || compareVersions(e.version, upTo) <= 0));
}

export function formatEntries(entries) {
  return entries.map((e) => `v${e.version}${e.date ? ` (${e.date})` : ''}\n${e.body.split('\n').map((l) => `  ${l}`).join('\n')}`).join('\n\n');
}

/** Move the [Unreleased] body under a new version heading. Throws when there is nothing to release. */
export function promoteUnreleased(text, version, date) {
  const entries = parseChangelog(text);
  const unreleased = entries.find((e) => e.version === 'Unreleased');
  if (!unreleased) throw new Error('CHANGELOG.md has no "## [Unreleased]" section');
  if (!unreleased.body) throw new Error('The [Unreleased] section of CHANGELOG.md is empty - describe the changes first');
  if (entries.some((e) => e.version === version)) throw new Error(`CHANGELOG.md already has a section for ${version}`);
  return text.replace(/^## \[Unreleased\][^\n]*\n/m, `## [Unreleased]\n\n## [${version}] - ${date}\n`);
}

export function bumpVersion(version, level) {
  const [maj, min, pat] = version.split('.').map(Number);
  if (level === 'major') return `${maj + 1}.0.0`;
  if (level === 'minor') return `${maj}.${min + 1}.0`;
  if (level === 'patch') return `${maj}.${min}.${pat + 1}`;
  throw new Error(`Unknown bump level "${level}" (use patch, minor or major)`);
}
