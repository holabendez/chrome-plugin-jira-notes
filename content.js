// This script runs in the context of Jira pages

// Extract ticket ID from the current URL
function getCurrentTicketId() {
  const url = window.location.href;
  const jiraUrlRegex = /[\/\?&]([A-Z]+-\d+)(?:[\?&#]|$)/i;
  const match = url.match(jiraUrlRegex);
  return match ? match[1] : null;
}

// Listen for messages from the popup or background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getTicketInfo') {
    const ticketId = getCurrentTicketId();
    if (!ticketId) {
      sendResponse({ error: 'Not a Jira ticket page' });
      return;
    }
    
    // Extract ticket title if available
    const titleElement = document.querySelector('h1[data-test-id="issue.views.issue-base.foundation.summary.heading"]') || 
                        document.querySelector('h1');
    const title = titleElement ? titleElement.textContent.trim() : '';
    
    // Extract ticket status if available
    const statusElement = document.querySelector('[data-test-id="issue.views.issue-base.foundation.status"]') ||
                         document.querySelector('.status');
    const status = statusElement ? statusElement.textContent.trim() : '';
    
    sendResponse({
      ticketId,
      title,
      status,
      url: window.location.href
    });
  }
  
  // Return true to indicate we'll send a response asynchronously
  return true;
});
