// Import the migration script
importScripts('migration.js');

// Listen for extension installation or update
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // Initialize storage with default values
    await chrome.storage.local.get(['jiraNotes'], (result) => {
      if (!result.jiraNotes) {
        chrome.storage.local.set({ jiraNotes: {} });
      }
    });
    
    // Open a welcome page
    chrome.tabs.create({
      url: chrome.runtime.getURL('welcome.html')
    });
  }
  
  // Always check for migrations when the extension is updated
  if (details.reason === 'update') {
    // The migration will be handled by the imported migration.js
    console.log('Extension updated, checking for migrations...');
  }
});

// Update the extension icon badge with note and risk status
function updateBadge(tabId, url) {
  // If we have a tab ID but no URL, try to get the URL from the tab
  if (tabId && !url) {
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        console.error('Error getting tab:', chrome.runtime.lastError);
        return;
      }
      if (tab && tab.url) {
        updateBadge(tab.id, tab.url);
      }
    });
    return;
  }
  
  const ticketId = extractJiraTicketId(url || '');
  
  if (!ticketId) {
    chrome.action.setBadgeText({ text: '', tabId });
    return;
  }
  
  // Check for note and risk status in storage
  chrome.storage.local.get([`note_${ticketId}`, 'jiraNotes', `risk_${ticketId}`], (result) => {
    try {
      // Check for note in new format
      const hasNewNote = result[`note_${ticketId}`]?.content?.trim() || false;
      
      // Check for note in old format
      const hasOldNote = result.jiraNotes?.[ticketId]?.trim() || false;
      
      const hasNote = hasNewNote || hasOldNote;
      const isAtRisk = result[`risk_${ticketId}`] === true;
      
      // Debug log
      console.log(`Updating badge for ${ticketId}:`, { hasNewNote, hasOldNote, hasNote, isAtRisk });
      
      // Priority: At Risk > Has Note > Default
      if (isAtRisk) {
        chrome.action.setBadgeText({ text: '🚩', tabId });
        chrome.action.setBadgeBackgroundColor({ color: '#f8d7da', tabId });
      } else if (hasNote) {
        chrome.action.setBadgeText({ text: '📝', tabId });
        chrome.action.setBadgeBackgroundColor({ color: '#e2e8f0', tabId });
      } else {
        chrome.action.setBadgeText({ text: '', tabId });
      }
    } catch (error) {
      console.error('Error updating badge:', error);
      chrome.action.setBadgeText({ text: '', tabId });
    }
  });
}

// Extract Jira ticket ID from URL
function extractJiraTicketId(url) {
  if (!url) return null;
  const jiraUrlRegex = /[\/\?&]([A-Z]+-\d+)(?:[\?&#]|$)/i;
  const match = url.match(jiraUrlRegex);
  return match ? match[1] : null;
}

// Create context menu item
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'openAllNotes',
    title: 'View All Jira Notes',
    contexts: ['action'],
    documentUrlPatterns: ['<all_urls>']
  });
});

// Handle context menu item click
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'openAllNotes') {
    chrome.tabs.create({ url: chrome.runtime.getURL('all-notes.html') });
  }
});

// Update badge when tab is updated
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab && tab.url) {
    updateBadge(tabId, tab.url);
  }
});

// Update badge when tab is activated
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (tab && tab.url) {
      updateBadge(tab.id, tab.url);
    }
  });
});

// Update badge when the extension is installed or updated
chrome.runtime.onInstalled.addListener(() => {
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (tabs[0] && tabs[0].url) {
      updateBadge(tabs[0].id, tabs[0].url);
    }
  });
});

// Listen for messages from the popup or content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Handle badge update requests
  if (request.action === 'updateBadge') {
    // If we have a tab ID from the sender, use that
    if (sender?.tab?.id) {
      updateBadge(sender.tab.id, sender.tab.url);
    } 
    // If we have a specific tab ID in the request
    else if (request.tabId) {
      updateBadge(request.tabId);
    }
    // Otherwise, get the active tab
    else {
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (tabs[0]?.id) {
          updateBadge(tabs[0].id, tabs[0].url);
        }
      });
    }
    
    // Send response back to indicate completion
    if (sendResponse) {
      sendResponse({status: 'success'});
    }
    return true; // Keep the message channel open for async response
  } 
  // Handle direct badge setting
  else if (request.action === 'setBadge' && sender?.tab?.id) {
    chrome.action.setBadgeText({
      text: request.text || '',
      tabId: sender.tab.id
    });
    
    if (request.backgroundColor) {
      chrome.action.setBadgeBackgroundColor({
        color: request.backgroundColor,
        tabId: sender.tab.id
      });
    }
    
    if (sendResponse) {
      sendResponse({status: 'success'});
    }
    return true;
  }
  
  return true;
});
