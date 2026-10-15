import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => fs.existsSync(p));

/**
 * Screenshot a local HTML page at a given viewport width.
 * Headless Chrome enforces a minimum window width, which silently crops "mobile" screenshots. Narrow widths are therefore
 * rendered inside an iframe of exactly that width, so the page really lays out in a 375px viewport.
 */
export function screenshotPage(htmlPath, png, width, height) {
  if (!CHROME || !fs.existsSync(htmlPath)) return false;
  let target = htmlPath;
  let win = [width, height];
  if (width < 700) {
    target = path.join(path.dirname(png), `_frame-${width}-${path.basename(png, '.png')}.html`);
    fs.writeFileSync(target, `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#cfd2d6">
<iframe src="${pathToFileURL(htmlPath).href}" style="display:block;width:${width}px;height:${height}px;border:0;background:#fff;margin:12px auto"></iframe></body>`);
    win = [Math.max(width + 24, 520), height + 24];
  }
  spawnSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--window-size=${win[0]},${win[1]}`, `--screenshot=${png}`, pathToFileURL(target).href], { timeout: 60000 });
  return fs.existsSync(png);
}
