// The rendering scripts (examples, fixtures, screenshots, OG image, OCR eval) drive a real Chrome
// through puppeteer-core, which ships no browser of its own. Resolve one per platform:
// CHROME_PATH wins, then the usual install locations, then whatever puppeteer finds by itself.
import { existsSync } from 'node:fs';

export function chromePath(): string | undefined {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidates =
    process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium']
      : process.platform === 'win32'
        ? [
            'C:/Program Files/Google/Chrome/Application/chrome.exe',
            'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
            `${process.env.LOCALAPPDATA ?? ''}/Google/Chrome/Application/chrome.exe`,
            'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
            'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
          ]
        : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  return candidates.find((p) => p && existsSync(p));
}
