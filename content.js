// This script runs in the context of Jira pages

// Extract ticket ID from the current URL
function getCurrentTicketId() {
  const url = window.location.href;
  // Matches both formats:
  // - https://your-domain.atlassian.net/browse/PROJ-123
  // - https://jira.service.tools-pi.com/browse/PROJ-123
  // - And other Jira URL patterns that might include ticket IDs
  const jiraUrlRegex = /[\/\?&]([A-Z]+-\d+)(?:[\?&#]|$)/i;
  const match = url.match(jiraUrlRegex);
  return match ? match[1] : null;
}

// Get the base URL for the current Jira instance
function getJiraBaseUrl() {
  const url = new URL(window.location.href);
  return `${url.protocol}//${url.host}`;
}

// Function to extract ticket ID from URL
function extractJiraTicketId(url) {
  if (!url) return null;
  const jiraUrlRegex = /[\/\?&]([A-Z]+-\d+)(?:[\?&#]|$)/i;
  const match = url.match(jiraUrlRegex);
  return match ? match[1] : null;
}

// Function to update the badge
function updateBadge() {
  const ticketId = extractJiraTicketId(window.location.href);
  if (ticketId) {
    chrome.runtime.sendMessage({
      action: 'updateBadge',
      forceUpdate: true
    });
  }
}

// Run on initial load
updateBadge();

// Also run when the page is fully loaded
if (document.readyState === 'complete') {
  updateBadge();
} else {
  window.addEventListener('load', updateBadge);
}

// Handle SPA navigation
let lastUrl = window.location.href;
const observer = new MutationObserver(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    updateBadge();
  }
});

observer.observe(document, { subtree: true, childList: true });

// Listen for messages from the popup or background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getTicketInfo') {
    const ticketId = extractJiraTicketId(window.location.href);
    if (!ticketId) {
      sendResponse({ error: 'Not a Jira ticket page' });
      return;
    }
    
    // Extract ticket summary if available
    let summary = '';
    // Try different selectors to find the summary
    const summaryElement = document.querySelector('h1[data-test-id="issue.views.issue-base.foundation.summary.heading"]') ||
                         document.querySelector('h1[data-test-id="issue.views.issue-base.foundation.summary.heading"] + div') ||
                         document.querySelector('.jira-issue-header__summary') ||
                         document.querySelector('#summary-val') ||
                         document.querySelector('#summary-val .user-content-block') ||
                         document.querySelector('h1');
    
    if (summaryElement) {
      summary = summaryElement.textContent.trim();
      // Clean up any extra whitespace
      summary = summary.replace(/\s+/g, ' ');
    }
    
    // Extract ticket status if available
    const statusElement = document.querySelector('[data-test-id="issue.views.issue-base.foundation.status"]') ||
                         document.querySelector('.status');
    const status = statusElement ? statusElement.textContent.trim() : '';
    
    // Get the canonical URL for this ticket
    const canonicalUrl = `${getJiraBaseUrl()}/browse/${ticketId}`;
    
    // Also save the URL to storage for future reference
    chrome.storage.local.set({
      [`url_${ticketId}`]: window.location.href
    });
    
    sendResponse({
      ticketId,
      title: summary, // Using summary as title for backward compatibility
      summary,        // New field for summary
      status,
      url: window.location.href,
      canonicalUrl: canonicalUrl
    });
  }
  
  // Return true to indicate we'll send a response asynchronously
  return true;
});
