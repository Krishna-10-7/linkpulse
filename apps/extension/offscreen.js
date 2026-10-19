// Runs in the offscreen document: the only extension context that can write to the clipboard
// without a visible page.
chrome.runtime.onMessage.addListener(msg => {
  if (msg?.target !== 'offscreen' || msg.type !== 'copy') return;
  const t = document.getElementById('t');
  t.value = msg.text;
  t.select();
  document.execCommand('copy');
});
