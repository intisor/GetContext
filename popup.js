document.addEventListener('DOMContentLoaded', () => {
  const analyzeBtn = document.getElementById('analyze-btn');
  const openOptions = document.getElementById('open-options');
  const openGithub = document.getElementById('open-github');
  const versionEl = document.getElementById('version');

  const manifest = chrome.runtime.getManifest();
  versionEl.textContent = `v${manifest.version || '1.0.0'}`;

  analyzeBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || !tabs[0]) return;
      chrome.tabs.sendMessage(tabs[0].id, { type: 'recon_runAnalysis' }, (resp) => {
        // close popup after requesting analysis
        window.close();
      });
    });
  });

  openOptions.addEventListener('click', () => chrome.runtime.openOptionsPage());

  openGithub.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://github.com/intisor/GetContext' });
  });
});
