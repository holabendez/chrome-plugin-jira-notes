// Listen for extension installation or update
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Initialize storage with default values
    chrome.storage.local.get(['jiraNotes'], (result) => {
      if (!result.jiraNotes) {
        chrome.storage.local.set({ jiraNotes: {} });
      }
    });
    
    // Open a welcome page
    chrome.tabs.create({
      url: chrome.runtime.getURL('welcome.html')
    });
  }
});

// Update the extension icon badge with note status
function updateBadge(tabId, url) {
  const ticketId = extractJiraTicketId(url);
  
  if (!ticketId) {
    chrome.action.setBadgeText({ text: '', tabId });
    return;
  }
  
  chrome.storage.local.get(['jiraNotes'], (result) => {
    const notes = result.jiraNotes || {};
    const hasNote = !!notes[ticketId];
    
    chrome.action.setBadgeText({
      text: hasNote ? '📝' : '',
      tabId
    });
  });
}

// Extract Jira ticket ID from URL
function extractJiraTicketId(url) {
  if (!url) return null;
  const jiraUrlRegex = /[\/\?&]([A-Z]+-\d+)(?:[\?&#]|$)/i;
  const match = url.match(jiraUrlRegex);
  return match ? match[1] : null;
}

// Update badge when tab is updated
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active) {
    updateBadge(tabId, tab.url);
  }
});

// Update badge when tab is activated
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (tab) {
      updateBadge(activeInfo.tabId, tab.url);
    }
  });
});
