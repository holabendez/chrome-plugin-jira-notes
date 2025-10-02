// Content script to interact with Jira pages

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getTicketInfo') {
    const summary = extractTicketSummary();
    sendResponse({ summary });
  }
  return true; // Required for async response
});

// Extract the ticket summary from the Jira page
function extractTicketSummary() {
  // First, try to find the ticket ID to avoid using it as the summary
  const ticketId = extractJiraTicketId(window.location.href);
  const ticketIdPattern = ticketId ? new RegExp(`^${ticketId}\\s*$`, 'i') : null;
  
  // Try different selectors for different Jira versions and layouts
  // Ordered by most specific to least specific
  const selectors = [
    // New Jira Cloud - Summary field
    '[data-testid="issue.views.issue-base.foundation.summary.heading"]',
    // Old Jira Cloud - Summary field
    '#summary-val',
    // Jira Server - Summary field
    '#summary-val',
    // Jira next-gen projects
    '[data-test-id="issue.issue-view.views.issue-base.foundation.summary.heading"]',
    // Try to find any element that's likely to be the summary
    'h1:not([id*="key"])',
    '[data-test-id="issue.issue-view.views.issue-base.foundation.summary.heading"] + h1',
    '.js-issue-title',
    '.issue-header .jira-issue-status-lozenge + h1',
    '.issue-header-content h1',
    'h1:first-of-type',
    'h1'
  ];

  for (const selector of selectors) {
    const elements = Array.from(document.querySelectorAll(selector));
    for (const element of elements) {
      const text = element.textContent.trim();
      // Skip if the text is empty, matches the ticket ID, or looks like a title
      if (text && 
          !(ticketIdPattern && ticketIdPattern.test(text)) && 
          !/^[A-Z]+-\d+\s*$/.test(text) &&
          !/^Ticket\s+[A-Z]+-\d+\s*$/i.test(text)) {
        // Additional check to ensure we're not picking up the title
        if (!element.closest('header') || selector.includes('summary')) {
          return text;
        }
      }
    }
  }

  // If we couldn't find a good summary, return null
  return null;
}

// Send a message to the background script when the page loads with the ticket info
function sendTicketInfo() {
  const ticketId = extractJiraTicketId(window.location.href);
  if (ticketId) {
    const summary = extractTicketSummary();
    if (summary) {
      // Store the summary in chrome.storage.local so it's available to the popup
      const noteKey = `note_${ticketId}`;
      chrome.storage.local.get([noteKey], (result) => {
        const currentNote = result[noteKey] || {};
        if (currentNote.summary !== summary) {
          chrome.storage.local.set({
            [noteKey]: {
              ...currentNote,
              summary: summary,
              // Preserve existing fields
              content: currentNote.content || '',
              project: currentNote.project || ticketId.split('-')[0],
              title: currentNote.title || `Ticket ${ticketId}`,
              timestamp: currentNote.timestamp || Date.now()
            }
          });
        }
      });
    }
  }
}

// Extract Jira ticket ID from URL
function extractJiraTicketId(url) {
  const jiraUrlRegex = /[\/\?&]([A-Z]+-\d+)(?:[\?&#]|$)/i;
  const match = url.match(jiraUrlRegex);
  return match ? match[1] : null;
}

// Run when the page loads
if (extractJiraTicketId(window.location.href)) {
  // Initial check
  sendTicketInfo();
  
  // Also check after a delay in case the page loads dynamically
  setTimeout(sendTicketInfo, 2000);
  
  // And set up a MutationObserver to detect dynamic changes
  const observer = new MutationObserver((mutations) => {
    sendTicketInfo();
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
}
