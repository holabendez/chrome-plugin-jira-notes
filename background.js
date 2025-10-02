// Import the data service
import dataService from './data-service.js';

// Initialize data service when background script loads
(async () => {
  try {
    console.log('Initializing data service...');
    await dataService.init();
    console.log('Data service initialized successfully');
    
    // Log the current state of the storage for debugging
    const allData = await chrome.storage.local.get(null);
    console.log('Current storage state:', allData);
    
    // Check if we have any tickets
    const tickets = await dataService.getAllTickets();
    console.log(`Found ${Object.keys(tickets).length} tickets after initialization`);
    
  } catch (error) {
    console.error('Failed to initialize data service:', error);
  }
})();

// Listen for extension installation or update
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // Open a welcome page
    chrome.tabs.create({
      url: chrome.runtime.getURL('welcome.html')
    });
  } else if (details.reason === 'update') {
    // Handle any data migrations on update
    try {
      await dataService.migrateIfNeeded();
      console.log('Data migration completed successfully');
    } catch (error) {
      console.error('Error during data migration:', error);
    }
  }
});

// Update the extension icon badge with note and risk status
async function updateBadge(tabId, url) {
  // If we have a tab ID but no URL, try to get the URL from the tab
  if (tabId && !url) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab?.url) {
        updateBadge(tabId, tab.url);
      }
    } catch (error) {
      console.error('Error getting tab:', error);
    }
    return;
  }
  
  const ticketId = extractJiraTicketId(url || '');
  
  if (!ticketId) {
    chrome.action.setBadgeText({ text: '', tabId });
    return;
  }
  
  try {
    const ticket = await dataService.getTicket(ticketId);
    const hasNote = ticket?.notes?.trim() || false;
    const isAtRisk = ticket?.isAtRisk || false;
    
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
}

// Extract Jira ticket ID from URL
function extractJiraTicketId(url) {
  if (!url) return null;
  // Matches both formats:
  // - https://your-domain.atlassian.net/browse/PROJ-123
  // - https://jira.service.tools-pi.com/browse/PROJ-123
  const jiraUrlRegex = /[\/\?&]([A-Z]+-\d+)(?:[\?&#]|$)/i;
  const match = url.match(jiraUrlRegex);
  return match ? match[1] : null;
}

// Get ticket summary from the page
async function getTicketSummary() {
  try {
    const tabId = await getActiveTabId();
    if (!tabId) return '';
    
    // Try to get summary from the page
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        // Common Jira selectors for the ticket summary
        const selectors = [
          '[data-testid="issue.views.issue-base.foundation.summary.heading"]', // Newer Jira Cloud
          'h1[data-test-id="issue.views.issue-base.foundation.summary.heading"]', // Older Jira Cloud
          '.issue-link', // Some Jira versions
          '#summary-val', // Classic view
          '.jira-issue-header__title', // Jira Service Management
          'h1' // Fallback to first h1
        ];
        
        for (const selector of selectors) {
          const elements = Array.from(document.querySelectorAll(selector));
          // Find the most likely candidate (prioritize elements with text content)
          const element = elements.find(el => {
            const text = el.textContent?.trim() || '';
            return text.length > 0 && text.length < 200; // Reasonable length for a summary
          });
          
          if (element) {
            return element.textContent.trim();
          }
        }
        return '';
      }
    });
    
    return result?.result || '';
  } catch (error) {
    console.error('Error getting ticket summary:', error);
    return '';
  }
}

// Get all tickets from the data service
async function getAllTickets() {
  try {
    const tickets = await dataService.getAllTickets();
    console.log(`Retrieved ${Object.keys(tickets).length} tickets from storage`);
    return tickets;
  } catch (error) {
    console.error('Error getting all tickets:', error);
    return {};
  }
}

// Update badge when tab is updated
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab && tab.url) {
    console.log(`Tab ${tabId} updated with URL: ${tab.url}`);
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
  // Handle getTicketSummary request
  else if (request.action === 'getTicketSummary') {
    (async () => {
      try {
        const summary = await getTicketSummary();
        if (sendResponse) {
          sendResponse({ status: 'success', summary });
        }
      } catch (error) {
        console.error('Error getting ticket summary:', error);
        if (sendResponse) {
          sendResponse({ status: 'error', error: error.message });
        }
      }
    })();
    return true; // Keep the message channel open for async response
  }
  
  return true; // Keep the message channel open for async response
});

// Listen for tab URL changes to update the badge
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab?.url) {
    updateBadge(tabId, tab.url);
  }
});

// Update badge when tab is activated
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (tab?.url) {
      updateBadge(tab.id, tab.url);
    }
  });
});
