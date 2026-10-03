chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'sizer:options') chrome.runtime.openOptionsPage();
});
