import dataService from './data-service.js';

document.addEventListener('DOMContentLoaded', async function() {
  // DOM elements
  const noteInput = document.getElementById('noteInput');
  const saveBtn = document.getElementById('saveBtn');
  const clearBtn = document.getElementById('clearBtn');
  const exportBtn = document.getElementById('exportBtn');
  const importBtn = document.getElementById('importBtn');
  const viewAllNotesBtn = document.getElementById('viewAllNotes');
  const atRiskBtn = document.getElementById('atRiskBtn');
  const archiveBtn = document.getElementById('archiveBtn');
  const ticketInfo = document.getElementById('ticketInfo');
  const statusEl = document.getElementById('status');
  const summaryEl = document.getElementById('ticketSummary');
  
  let currentTicketId = '';
  let currentNote = '';
  let currentTicket = null;
  
  // Update UI based on ticket data
  function updateUI(ticket) {
    // Update risk button
    if (ticket?.isAtRisk) {
      atRiskBtn.classList.add('at-risk');
      atRiskBtn.innerHTML = '<span class="risk-icon">🚩</span> Marked as At Risk';
    } else {
      atRiskBtn.classList.remove('at-risk');
      atRiskBtn.innerHTML = '<span class="risk-icon">🚩</span> Mark as At Risk';
    }
    
    // Update archive button
    if (ticket?.isArchived) {
      archiveBtn.classList.add('archived');
      archiveBtn.innerHTML = 'Unarchive Ticket';
    } else {
      archiveBtn.classList.remove('archived');
      archiveBtn.innerHTML = 'Archive Ticket';
    }
    
    // Update summary if available
    if (ticket?.summary) {
      summaryEl.textContent = ticket.summary;
      summaryEl.style.display = 'block';
    } else {
      summaryEl.style.display = 'none';
    }
  }

  // Initialize the popup
  chrome.tabs.query({active: true, currentWindow: true}, async function(tabs) {
    const url = tabs[0]?.url || '';
    const ticketId = extractJiraTicketId(url);
    
    if (ticketId) {
      currentTicketId = ticketId;
      updateTicketInfo(ticketId);
      
      try {
        // Load ticket data
        currentTicket = await dataService.getTicket(ticketId) || {};
        
        // If no summary, try to get it from the page
        if (!currentTicket.summary) {
          const summary = await getTicketSummary();
          if (summary) {
            currentTicket.summary = summary;
            await dataService.saveTicket(ticketId, { summary });
          }
        }
        
        // Update UI with ticket data
        updateUI(currentTicket);
        
        // Load the note
        loadNote(ticketId);
      } catch (error) {
        console.error('Error initializing popup:', error);
        updateStatus('Error loading ticket data', true);
      }
    } else {
      ticketInfo.textContent = 'Not on a Jira ticket page';
      noteInput.disabled = true;
      saveBtn.disabled = true;
      clearBtn.disabled = true;
      atRiskBtn.disabled = true;
      
      // Clear badge if not on a Jira ticket
      chrome.action.setBadgeText({ text: '' });
    }
  });
  
  // Toggle Archive status
  async function toggleArchiveStatus() {
    if (!currentTicketId) return;
    
    try {
      const isArchived = !currentTicket?.isArchived;
      
      // Update the ticket
      await dataService.archiveTicket(currentTicketId, isArchived);
      
      // Update the UI
      if (currentTicket) {
        currentTicket.isArchived = isArchived;
      }
      
      // Update the badge
      await updateBadge();
      
      // Show status message
      updateStatus(isArchived ? 'Ticket archived' : 'Ticket unarchived');
    } catch (error) {
      console.error('Error toggling archive status:', error);
      updateStatus('Failed to update archive status', true);
    }
  }
  
  // Get ticket summary from the current page
  async function getTicketSummary() {
    return new Promise((resolve) => {
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (tabs && tabs[0]) {
          chrome.scripting.executeScript({
            target: {tabId: tabs[0].id},
            func: () => {
              // Try to find the summary element in the page
              const summaryElement = 
                document.querySelector('[data-testid="issue.views.issue-base.foundation.summary.heading"]') || // Jira Cloud
                document.querySelector('#summary-val') || // Jira Server
                document.querySelector('.jira-issue-header__title'); // Jira Service Management
              
              return summaryElement ? summaryElement.textContent.trim() : '';
            }
          }, (results) => {
            const summary = results?.[0]?.result || '';
            resolve(summary);
          });
        } else {
          resolve('');
        }
      });
    });
  }

  // Event Listeners
  saveBtn.addEventListener('click', saveNote);
  clearBtn.addEventListener('click', clearNote);
  exportBtn.addEventListener('click', exportNotes);
  importBtn.addEventListener('click', importNotes);
  viewAllNotesBtn.addEventListener('click', viewAllNotes);
  timestampBtn.addEventListener('click', insertTimestamp);
  atRiskBtn.addEventListener('click', toggleAtRiskStatus);
  archiveBtn.addEventListener('click', toggleArchiveStatus);
  
  // Functions
  function extractJiraTicketId(url) {
    // Matches Jira ticket URLs like:
    // https://your-domain.atlassian.net/browse/PROJ-123
    // https://your-domain.atlassian.net/secure/RapidBoard.jspa?rapidView=1&modal=detail&selectedIssue=PROJ-123
    const jiraUrlRegex = /[\/\?&]([A-Z]+-\d+)(?:[\?&#]|$)/i;
    const match = url.match(jiraUrlRegex);
    return match ? match[1] : null;
  }
  
  function updateTicketInfo(ticketId) {
    ticketInfo.textContent = `Jira Ticket: ${ticketId}`;
  }
  
  async function loadNote(ticketId) {
    try {
      const ticket = await dataService.getTicket(ticketId);
      if (ticket) {
        currentNote = ticket.notes || '';
        noteInput.value = currentNote;
        updateRiskUI(ticket.isAtRisk || false);
        updateStatus(currentNote ? 'Note loaded' : 'No saved note for this ticket');
      } else {
        currentNote = '';
        noteInput.value = '';
        updateRiskUI(false);
        updateStatus('No saved note for this ticket');
      }
    } catch (error) {
      console.error('Error loading note:', error);
      updateStatus('Error loading note', true);
    }
  }
  
  // Helper function to migrate a single note to the new format
  function migrateNoteToNewFormat(ticketId, content) {
    const noteKey = `note_${ticketId}`;
    const noteData = {
      content: content,
      timestamp: Date.now(),
      project: ticketId.split('-')[0],
      title: `Ticket ${ticketId}`
    };
    
    // Save in new format
    chrome.storage.local.set({
      [noteKey]: noteData
    }, function() {
      console.log(`Migrated note for ${ticketId} to new format`);
    });
  }
  
  async function saveNote() {
    if (!currentTicketId) return;
    
    const noteContent = noteInput.value.trim();
    
    try {
      if (noteContent) {
        // Save the note
        await dataService.saveTicket(currentTicketId, {
          notes: noteContent,
          isAtRisk: currentTicket?.isAtRisk || false,
          isArchived: currentTicket?.isArchived || false,
          summary: currentTicket?.summary || ''
        });
        
        currentNote = noteContent;
        updateStatus('Note saved successfully!');
        
        // Update the badge
        await updateBadge();
        
        // Notify background script to update the badge
        chrome.runtime.sendMessage({ action: 'updateBadge' });
      } else {
        // Clear the note
        await dataService.saveTicket(currentTicketId, {
          notes: '',
          isAtRisk: currentTicket?.isAtRisk || false,
          isArchived: currentTicket?.isArchived || false,
          summary: currentTicket?.summary || ''
        });
        
        currentNote = '';
        updateStatus('Note cleared');
        
        // Update the badge
        await updateBadge();
      }
    } catch (error) {
      console.error('Error saving note:', error);
      updateStatus('Failed to save note', true);
    }
  }
  
  function clearNote() {
    if (confirm('Are you sure you want to clear this note?')) {
      noteInput.value = '';
      saveNote();
    }
  }
  
  function exportNotes() {
    // Get all notes in the new format
    chrome.storage.local.get(null, function(items) {
      // Filter for note_* keys and format for export
      const notes = {};
      let noteCount = 0;
      
      Object.keys(items).forEach(key => {
        if (key.startsWith('note_')) {
          const ticketId = key.replace('note_', '');
          notes[ticketId] = {
            content: items[key].content,
            timestamp: items[key].timestamp,
            project: items[key].project,
            title: items[key].title,
            url: items[`url_${ticketId}`] || ''
          };
          noteCount++;
        }
      });
      
      // If no notes found in new format, check old format
      if (noteCount === 0 && items.jiraNotes) {
        Object.assign(notes, items.jiraNotes);
        noteCount = Object.keys(notes).length;
      }
      
      if (noteCount === 0) {
        updateStatus('No notes to export');
        return;
      }
      
      const data = JSON.stringify(notes, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      chrome.downloads.download({
        url: url,
        filename: `jira-notes-${new Date().toISOString().split('T')[0]}.json`,
        saveAs: true
      });
      
      updateStatus(`Exported ${noteCount} note(s) successfully`);
    });
  }
  
  function importNotes() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = function(e) {
      const file = e.target.files[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = function(e) {
        try {
          const importedNotes = JSON.parse(e.target.result);
          if (typeof importedNotes !== 'object' || importedNotes === null) {
            throw new Error('Invalid notes format');
          }
          
          // Prepare updates for the new format
          const updates = {};
          let importedCount = 0;
          
          // Process each imported note
          Object.entries(importedNotes).forEach(([ticketId, noteData]) => {
            const noteKey = `note_${ticketId}`;
            const urlKey = `url_${ticketId}`;
            
            // Handle both old and new format imports
            if (typeof noteData === 'string') {
              // Old format: { "TICKET-123": "note content" }
              updates[noteKey] = {
                content: noteData,
                timestamp: Date.now(),
                project: ticketId.split('-')[0],
                title: `Ticket ${ticketId}`
              };
              importedCount++;
            } else if (noteData.content !== undefined) {
              // New format: { "TICKET-123": { content: "...", timestamp: 123, ... } }
              updates[noteKey] = {
                content: noteData.content,
                timestamp: noteData.timestamp || Date.now(),
                project: noteData.project || ticketId.split('-')[0],
                title: noteData.title || `Ticket ${ticketId}`
              };
              
              // Save URL if available in the imported data
              if (noteData.url) {
                updates[urlKey] = noteData.url;
              }
              
              importedCount++;
            }
          });
          
          if (importedCount === 0) {
            updateStatus('No valid notes found in the file');
            return;
          }
          
          // Apply all updates
          chrome.storage.local.set(updates, function() {
            updateStatus(`Successfully imported ${importedCount} note(s)`);
            
            // If we're on a ticket page with an imported note, load it
            if (currentTicketId && updates[`note_${currentTicketId}`]) {
              loadNote(currentTicketId);
            }
          });
          
        } catch (error) {
          updateStatus('Error: Invalid notes file', true);
          console.error('Error importing notes:', error);
        }
      };
      reader.readAsText(file);
    };
    
    input.click();
  }
  
  function getFormattedTimestamp() {
    const now = new Date();
    const date = now.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
    const time = now.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    });
    return `[${date} ${time}] `;
  }

  function insertTimestamp() {
    const textarea = document.getElementById('noteInput');
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const timestamp = getFormattedTimestamp();
    
    // Insert timestamp at cursor position
    const text = textarea.value;
    textarea.value = text.substring(0, start) + timestamp + text.substring(end);
    
    // Position cursor after the inserted timestamp
    const newCursorPos = start + timestamp.length;
    textarea.setSelectionRange(newCursorPos, newCursorPos);
    
    // Focus back on the textarea
    textarea.focus();
    
    // Update the note
    saveNote();
    updateStatus('Timestamp added');
  }

  // Update the badge based on note and risk status
  async function updateBadge() {
    if (!currentTicketId) return;
    
    try {
      const ticket = await dataService.getTicket(currentTicketId);
      if (ticket) {
        currentTicket = ticket;
        
        // Update risk button state
        atRiskBtn.disabled = false;
        if (ticket.isAtRisk) {
          atRiskBtn.classList.add('at-risk');
          atRiskBtn.innerHTML = '<span class="risk-icon">🚩</span> Marked as At Risk';
        } else {
          atRiskBtn.classList.remove('at-risk');
          atRiskBtn.innerHTML = '<span class="risk-icon">🚩</span> Mark as At Risk';
        }
        
        // Update archive button state
        if (ticket.isArchived) {
          archiveBtn.classList.add('archived');
          archiveBtn.textContent = '📦 Unarchive Ticket';
        } else {
          archiveBtn.classList.remove('archived');
          archiveBtn.textContent = '📥 Archive Ticket';
        }
        
        // Update summary if available
        if (ticket.summary) {
          summaryEl.textContent = ticket.summary;
          summaryEl.style.display = 'block';
        } else {
          summaryEl.style.display = 'none';
        }
      }
      
      // Always update the badge via the background script to ensure consistency
      chrome.runtime.sendMessage({ action: 'updateBadge' });
    } catch (error) {
      console.error('Error updating badge:', error);
    }
  }
  
  // Toggle At Risk status
  async function toggleAtRiskStatus() {
    if (!currentTicketId) return;
    
    try {
      const isAtRisk = !currentTicket?.isAtRisk;
      
      // Update the ticket
      await dataService.saveTicket(currentTicketId, {
        ...currentTicket,
        isAtRisk,
        notes: currentTicket?.notes || ''
      });
      
      // Update the UI
      if (currentTicket) {
        currentTicket.isAtRisk = isAtRisk;
      }
      
      // Update the badge
      await updateBadge();
      
      // Show status message
      updateStatus(isAtRisk ? 'Marked as At Risk' : 'Removed At Risk status');
    } catch (error) {
      console.error('Error toggling risk status:', error);
      updateStatus('Failed to update risk status', true);
    }
  }
  
  function updateStatus(message, isError = false) {
    statusEl.textContent = message;
    statusEl.style.color = isError ? '#d73a49' : '#586069';
    
    if (message) {
      setTimeout(() => {
        statusEl.textContent = '';
      }, 3000);
    }
  }
  
  function viewAllNotes(e) {
    e.preventDefault();
    // Open the all-notes.html page in a new tab
    chrome.tabs.create({ url: chrome.runtime.getURL('all-notes.html') });
  }
});
