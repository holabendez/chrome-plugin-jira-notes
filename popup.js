document.addEventListener('DOMContentLoaded', function() {
  // DOM elements
  const noteInput = document.getElementById('noteInput');
  const saveBtn = document.getElementById('saveBtn');
  const clearBtn = document.getElementById('clearBtn');
  const exportBtn = document.getElementById('exportBtn');
  const importBtn = document.getElementById('importBtn');
  const ticketInfo = document.getElementById('ticketInfo');
  const statusEl = document.getElementById('status');
  
  let currentTicketId = '';
  let currentNote = '';
  
  // Initialize the popup
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    const url = tabs[0].url;
    const ticketId = extractJiraTicketId(url);
    
    if (ticketId) {
      currentTicketId = ticketId;
      updateTicketInfo(ticketId);
      loadNote(ticketId);
    } else {
      ticketInfo.textContent = 'Not on a Jira ticket page';
      noteInput.disabled = true;
      saveBtn.disabled = true;
      clearBtn.disabled = true;
    }
  });
  
  // Event Listeners
  saveBtn.addEventListener('click', saveNote);
  clearBtn.addEventListener('click', clearNote);
  exportBtn.addEventListener('click', exportNotes);
  importBtn.addEventListener('click', importNotes);
  
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
    chrome.storage.local.get(['jiraNotes'], function(result) {
      const notes = result.jiraNotes || {};
      currentNote = notes[ticketId] || '';
      noteInput.value = currentNote;
      updateStatus(currentNote ? 'Note loaded' : 'No saved note for this ticket');
    });
  }
  
  function saveNote() {
    if (!currentTicketId) return;
    
    const note = noteInput.value.trim();
    
    chrome.storage.local.get(['jiraNotes'], function(result) {
      const notes = result.jiraNotes || {};
      
      if (note) {
        notes[currentTicketId] = note;
      } else {
        delete notes[currentTicketId];
      }
      
      chrome.storage.local.set({ jiraNotes: notes }, function() {
        currentNote = note;
        updateStatus(note ? 'Note saved successfully!' : 'Note cleared');
      });
    });
  }
  
  function clearNote() {
    if (confirm('Are you sure you want to clear this note?')) {
      noteInput.value = '';
      saveNote();
    }
  }
  
  function exportNotes() {
    chrome.storage.local.get(['jiraNotes'], function(result) {
      const notes = result.jiraNotes || {};
      if (Object.keys(notes).length === 0) {
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
      
      updateStatus('Notes exported successfully');
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
          const notes = JSON.parse(e.target.result);
          if (typeof notes !== 'object' || notes === null) {
            throw new Error('Invalid notes format');
          }
          
          chrome.storage.local.get(['jiraNotes'], function(result) {
            const existingNotes = result.jiraNotes || {};
            const updatedNotes = { ...existingNotes, ...notes };
            
            chrome.storage.local.set({ jiraNotes: updatedNotes }, function() {
              updateStatus(`Imported notes for ${Object.keys(notes).length} tickets`);
              if (currentTicketId && notes[currentTicketId]) {
                noteInput.value = notes[currentTicketId];
              }
            });
          });
        } catch (error) {
          updateStatus('Error: Invalid notes file');
          console.error('Error importing notes:', error);
        }
      };
      reader.readAsText(file);
    };
    
    input.click();
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
});
