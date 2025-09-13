document.addEventListener('DOMContentLoaded', function() {
  // DOM elements
  const noteInput = document.getElementById('noteInput');
  const saveBtn = document.getElementById('saveBtn');
  const clearBtn = document.getElementById('clearBtn');
  const exportBtn = document.getElementById('exportBtn');
  const importBtn = document.getElementById('importBtn');
  const viewAllNotesBtn = document.getElementById('viewAllNotes');
  const atRiskBtn = document.getElementById('atRiskBtn');
  const ticketInfo = document.getElementById('ticketInfo');
  const statusEl = document.getElementById('status');
  
  let currentTicketId = '';
  let currentNote = '';
  
  // Load and update the risk button state
  function updateRiskButtonState(isAtRisk) {
    if (isAtRisk) {
      atRiskBtn.classList.add('at-risk');
      atRiskBtn.innerHTML = '<span class="risk-icon">🚩</span> Marked as At Risk';
    } else {
      atRiskBtn.classList.remove('at-risk');
      atRiskBtn.innerHTML = '<span class="risk-icon">🚩</span> Mark as At Risk';
    }
  }

  // Initialize the popup
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    const url = tabs[0]?.url || '';
    const ticketId = extractJiraTicketId(url);
    
    if (ticketId) {
      currentTicketId = ticketId;
      updateTicketInfo(ticketId);
      
      // Load risk status first
      chrome.storage.local.get([`risk_${ticketId}`], function(result) {
        updateRiskButtonState(result[`risk_${ticketId}`] === true);
      });
      
      // Update badge immediately when popup opens
      chrome.runtime.sendMessage({ 
        action: 'updateBadge',
        forceUpdate: true 
      });
      
      // Then load the note
      loadNote(ticketId);
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
  
  // Event Listeners
  saveBtn.addEventListener('click', saveNote);
  clearBtn.addEventListener('click', clearNote);
  exportBtn.addEventListener('click', exportNotes);
  importBtn.addEventListener('click', importNotes);
  viewAllNotesBtn.addEventListener('click', viewAllNotes);
  timestampBtn.addEventListener('click', insertTimestamp);
  atRiskBtn.addEventListener('click', toggleAtRiskStatus);
  
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
  
  function loadNote(ticketId) {
    // First check the new format, then fall back to old format
    chrome.storage.local.get([`note_${ticketId}`, 'jiraNotes', `risk_${ticketId}`], function(result) {
      // Check new format first
      if (result[`note_${ticketId}`] !== undefined) {
        currentNote = result[`note_${ticketId}`].content || '';
        noteInput.value = currentNote;
      } 
      // Fall back to old format
      else if (result.jiraNotes && result.jiraNotes[ticketId] !== undefined) {
        currentNote = result.jiraNotes[ticketId];
        noteInput.value = currentNote;
        // Trigger migration of this note to new format
        migrateNoteToNewFormat(ticketId, currentNote);
      } else {
        currentNote = '';
        noteInput.value = '';
      }
      
      // Update risk status
      updateRiskUI(result[`risk_${ticketId}`] === true);
      
      updateStatus(currentNote ? 'Note loaded' : 'No saved note for this ticket');
    });
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
  
  function saveNote() {
    if (!currentTicketId) return;
    
    const noteContent = noteInput.value.trim();
    const noteKey = `note_${currentTicketId}`;
    const urlKey = `url_${currentTicketId}`;
    
    // Get current risk status
    chrome.storage.local.get([`risk_${currentTicketId}`], function(riskResult) {
      const isAtRisk = riskResult[`risk_${currentTicketId}`] === true;
      
      if (noteContent) {
        // Save in new format
        const noteData = {
          content: noteContent,
          timestamp: Date.now(),
          project: currentTicketId.split('-')[0],
          title: `Ticket ${currentTicketId}`,
          atRisk: isAtRisk  // Include risk status in note data
        };
        
        // Get the current URL and ensure it's from a supported Jira instance
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
          let url = tabs[0]?.url || '';
          
          // If this is a Jira ticket page, use the canonical URL format
          if (url.match(/atlassian\.net\/browse\//) || 
              url.match(/jira\.service\.tools-pi\.com\/browse\//)) {
            const urlObj = new URL(url);
            url = `${urlObj.protocol}//${urlObj.host}/browse/${currentTicketId}`;
          }
          
          const updates = {
            [noteKey]: noteData,
            [urlKey]: url
          };
          
          // If we have old format data, clean it up
          chrome.storage.local.get(['jiraNotes'], function(result) {
            if (result.jiraNotes && result.jiraNotes[currentTicketId] !== undefined) {
              delete result.jiraNotes[currentTicketId];
              updates.jiraNotes = result.jiraNotes;
            }
            
            chrome.storage.local.set(updates, function() {
              currentNote = noteContent;
              updateStatus('Note saved successfully!');
              // Notify background script to update the badge
              chrome.runtime.sendMessage({ action: 'updateBadge' });
              // Also update the badge in the popup
              updateBadge();
            });
          });
        });
      } else {
        // Clear note - remove from both old and new formats
        chrome.storage.local.get(['jiraNotes'], function(result) {
          const updates = {};
          
          // Remove from old format if it exists
          if (result.jiraNotes && result.jiraNotes[currentTicketId] !== undefined) {
            delete result.jiraNotes[currentTicketId];
            updates.jiraNotes = result.jiraNotes;
          }
          
          // Remove from new format
          chrome.storage.local.remove([noteKey, urlKey], function() {
            if (Object.keys(updates).length > 0) {
              chrome.storage.local.set(updates, function() {
                currentNote = '';
                updateStatus('Note cleared');
                updateBadge();
              });
            } else {
              currentNote = '';
              updateStatus('Note cleared');
              updateBadge();
            }
          });
        });
      }
    });
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
  function updateBadge() {
    if (!currentTicketId) return;
    
    // Always update the badge via the background script to ensure consistency
    chrome.runtime.sendMessage({ action: 'updateBadge' });
    
    // Update local UI state
    chrome.storage.local.get([`risk_${currentTicketId}`, `note_${currentTicketId}`, 'jiraNotes'], function(result) {
      const isAtRisk = result[`risk_${currentTicketId}`] === true;
      const hasNewNote = result[`note_${currentTicketId}`]?.content?.trim() || false;
      const hasOldNote = result.jiraNotes?.[currentTicketId]?.trim() || false;
      const hasNote = hasNewNote || hasOldNote;
      
      // Update risk button state
      atRiskBtn.disabled = false;
      if (isAtRisk) {
        atRiskBtn.classList.add('at-risk');
        atRiskBtn.innerHTML = '<span class="risk-icon">🚩</span> Marked as At Risk';
      } else {
        atRiskBtn.classList.remove('at-risk');
        atRiskBtn.innerHTML = '<span class="risk-icon">🚩</span> Mark as At Risk';
      }
    });
  }
  
  // Toggle At Risk status
  function toggleAtRiskStatus() {
    if (!currentTicketId) return;
    
    const riskKey = `risk_${currentTicketId}`;
    
    chrome.storage.local.get([riskKey], function(result) {
      const isAtRisk = !result[riskKey];
      
      // Update storage
      chrome.storage.local.set({ [riskKey]: isAtRisk }, function() {
        // Update button state
        updateRiskButtonState(isAtRisk);
        
        // Update the badge
        updateBadge();
        
        // Show status message
        updateStatus(isAtRisk ? 'Marked as At Risk' : 'Removed At Risk status');
      });
    });
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
