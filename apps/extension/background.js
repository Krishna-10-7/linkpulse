import { shorten, isShortenable, NotConfigured, getSettings } from './lib.js';

// Entry points: right-click a link, right-click the page, right-click selected text,
// the Alt+Shift+S shortcut and the "lp" keyword in the address bar.
// Browsers do not let extensions add items to the address bar's own right-click menu,
// so "Shorten this page's URL" on the page menu covers that case.

const MENU = { link: 'lp-link', page: 'lp-page', selection: 'lp-selection' };

chrome.runtime.onInstalled.addListener(({ reason }) => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: MENU.link, title: 'Shorten link with LinkPulse', contexts: ['link'] });
    chrome.contextMenus.create({ id: MENU.page, title: "Shorten this page's URL", contexts: ['page', 'frame'] });
    chrome.contextMenus.create({ id: MENU.selection, title: 'Shorten selected URL', contexts: ['selection'] });
  });
  if (reason === 'install') chrome.runtime.openOptionsPage();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU.link) return run(info.linkUrl);
  if (info.menuItemId === MENU.page) return run(info.pageUrl || tab?.url);
  if (info.menuItemId === MENU.selection) {
    const text = (info.selectionText || '').trim();
    return run(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  }
});

chrome.commands.onCommand.addListener(async command => {
  if (command !== 'shorten-current-tab') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  run(tab?.url);
});

chrome.omnibox.setDefaultSuggestion({ description: 'Shorten a URL with LinkPulse — type or paste it, then press Enter' });
chrome.omnibox.onInputEntered.addListener(text => {
  const t = text.trim();
  run(/^https?:\/\//i.test(t) ? t : `https://${t}`);
});

async function run(url) {
  if (!isShortenable(url)) return notify('Nothing to shorten', 'Only http and https pages can be shortened.');
  try {
    const { link, warnings, reused } = await shorten(url);
    await copy(link.shortUrl);
    notify(reused ? 'Existing link copied' : 'Copied to clipboard',
      `${link.shortUrl}${reused ? '\nYou had already shortened this page.' : warnings?.length ? `\n${warnings[0].message}` : ''}`);
  } catch (err) {
    if (err instanceof NotConfigured) { chrome.runtime.openOptionsPage(); return; }
    notify('Could not shorten', err.message);
  }
}

// A service worker has no clipboard; an offscreen document does the copy.
async function copy(text) {
  const existing = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (!existing.length) {
    await chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['CLIPBOARD'], justification: 'Copy the new short link to the clipboard' });
  }
  await chrome.runtime.sendMessage({ target: 'offscreen', type: 'copy', text });
}

function notify(title, message) {
  chrome.notifications.create({ type: 'basic', iconUrl: 'icons/icon128.png', title, message, priority: 1 });
}

// Clicking a notification opens the dashboard.
chrome.notifications.onClicked.addListener(async () => {
  const { server } = await getSettings();
  chrome.tabs.create({ url: `${server}/app/links/` });
});
