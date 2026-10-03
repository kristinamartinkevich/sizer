chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') chrome.tabs.create({ url: chrome.runtime.getURL('ui/options.html?welcome=1') });
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'sizer:options') chrome.runtime.openOptionsPage();
});
