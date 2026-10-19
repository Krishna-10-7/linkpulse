import { getSettings, call, DEFAULT_SERVER } from './lib.js';

const $ = id => document.getElementById(id);
const status = (text, cls) => { $('status').textContent = text; $('status').className = cls || 'muted'; };

getSettings().then(({ server, token }) => { $('server').value = server; $('token').value = token; });

$('save').addEventListener('click', async () => {
  const server = ($('server').value.trim() || DEFAULT_SERVER).replace(/\/+$/, '');
  const token = $('token').value.trim();
  let origin;
  try { origin = new URL(server).origin; } catch { return status('That server address is not a URL.', 'err'); }
  // Servers other than the built-in ones need host permission, asked for once.
  const granted = await chrome.permissions.contains({ origins: [`${origin}/*`] }) || await chrome.permissions.request({ origins: [`${origin}/*`] }).catch(() => false);
  if (!granted) return status('Permission to reach that server was not granted.', 'err');
  await chrome.storage.sync.set({ server, token });
  status('Testing…');
  try {
    const { user } = await call('/auth/me');
    status(`Connected as ${user.email}`, 'ok');
  } catch (err) {
    status(err.status === 401 ? 'The token was not accepted.' : err.message, 'err');
  }
});
