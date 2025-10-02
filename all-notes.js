// All Notes Page - Shows all saved Jira notes

document.addEventListener('DOMContentLoaded', function() {
  const notesContainer = document.getElementById('notesContainer');
  const searchInput = document.getElementById('searchInput');
  const filterProject = document.getElementById('filterProject');
  const sortBy = document.getElementById('sortBy');
  const exportAllBtn = document.getElementById('exportAllBtn');
  
  let allNotes = [];
  let projects = new Set();
  
  // Load all notes and risk statuses from storage
  function loadAllNotes() {
    chrome.storage.local.get(null, function(items) {
      allNotes = [];
      projects.clear();
      
      // First, collect all risk statuses
      const riskStatuses = {};
      Object.keys(items).forEach(key => {
        if (key.startsWith('risk_')) {
          const ticketId = key.replace('risk_', '');
          riskStatuses[ticketId] = items[key];
        }
      });
      
      // Then process notes
      Object.keys(items).forEach(key => {
        if (key.startsWith('note_')) {
          const ticketId = key.replace('note_', '');
          const note = {
            id: ticketId,
            content: items[key].content,
            project: items[key].project || 'Other',
            timestamp: items[key].timestamp || 0,
            title: items[key].title || `Ticket ${ticketId}`,
            isAtRisk: riskStatuses[ticketId] || false
          };
          allNotes.push(note);
          projects.add(note.project);
        }
      });
      
      // Populate project filter dropdown
      populateProjectFilter();
      
      // Display notes
      displayNotes();
    });
  }
  
  // Populate project filter dropdown
  function populateProjectFilter() {
    // Clear existing options except the first one
    while (filterProject.options.length > 1) {
      filterProject.remove(1);
    }
    
    // Add project options
    const sortedProjects = Array.from(projects).sort();
    sortedProjects.forEach(project => {
      const option = document.createElement('option');
      option.value = project;
      option.textContent = project;
      filterProject.appendChild(option);
    });
  }
  
  // Display notes based on filters and sort
  function displayNotes() {
    let filteredNotes = [...allNotes];
    
    // Apply search filter
    const searchTerm = searchInput.value.toLowerCase();
    if (searchTerm) {
      filteredNotes = filteredNotes.filter(note => 
        note.content.toLowerCase().includes(searchTerm) || 
        note.title.toLowerCase().includes(searchTerm) ||
        note.id.toLowerCase().includes(searchTerm)
      );
    }
    
    // Apply project filter
    const selectedProject = filterProject.value;
    if (selectedProject) {
      filteredNotes = filteredNotes.filter(note => note.project === selectedProject);
    }
    
    // Apply risk filter
    const riskFilter = document.getElementById('filterRisk').value;
    if (riskFilter === 'atRisk') {
      filteredNotes = filteredNotes.filter(note => note.isAtRisk);
    }
    
    // Apply sorting
    const sortValue = sortBy.value;
    filteredNotes.sort((a, b) => {
      switch(sortValue) {
        case 'date-asc':
          return a.timestamp - b.timestamp;
        case 'date-desc':
          return b.timestamp - a.timestamp;
        case 'project':
          return a.project.localeCompare(b.project) || a.id.localeCompare(b.id);
        case 'ticket':
          return a.id.localeCompare(b.id);
        default:
          return b.timestamp - a.timestamp;
      }
    });
    
    // Render notes
    renderNotes(filteredNotes);
  }
  
  // Render notes to the DOM
  function renderNotes(notes) {
    notesContainer.innerHTML = '';
    
    if (notes.length === 0) {
      const emptyState = document.createElement('div');
      emptyState.className = 'empty-state';
      emptyState.innerHTML = '<p>No notes match your search criteria.</p>';
      notesContainer.appendChild(emptyState);
      return;
    }
    
    notes.forEach(note => {
      const noteElement = createNoteElement(note);
      notesContainer.appendChild(noteElement);
    });
  }
  
  // Create a note card element
  function createNoteElement(note) {
    const noteCard = document.createElement('div');
    noteCard.className = 'note-card' + (note.isAtRisk ? ' at-risk' : '');
    
    const header = document.createElement('div');
    header.className = 'note-header';
    
    const title = document.createElement('h3');
    title.textContent = note.title;
    title.className = 'note-title';
    
    // Add risk indicator
    if (note.isAtRisk) {
      const riskBadge = document.createElement('span');
      riskBadge.className = 'risk-badge';
      riskBadge.textContent = '🚩 At Risk';
      riskBadge.title = 'This ticket is marked as At Risk';
      header.appendChild(riskBadge);
    }
    
    const ticketId = document.createElement('div');
    ticketId.textContent = note.id;
    ticketId.className = 'ticket-id';
    ticketId.title = 'Click to open in Jira';
    ticketId.style.cursor = 'pointer';
    ticketId.onclick = () => openJiraTicket(note.id);
    
    const project = document.createElement('div');
    project.textContent = note.project;
    project.className = 'project-tag';
    
    const content = document.createElement('div');
    content.textContent = note.content;
    content.className = 'note-content';
    
    const timestamp = document.createElement('div');
    timestamp.textContent = new Date(note.timestamp).toLocaleString();
    timestamp.className = 'timestamp';
    
    // Build the note card
    header.appendChild(title);
    noteCard.appendChild(header);
    noteCard.appendChild(ticketId);
    noteCard.appendChild(project);
    noteCard.appendChild(content);
    noteCard.appendChild(timestamp);
    
    return noteCard;
  }
  
  // Open Jira ticket in a new tab
  function openJiraTicket(ticketId) {
    // Try to find the original URL from storage
    chrome.storage.local.get(`url_${ticketId}`, function(result) {
      const url = result[`url_${ticketId}`] || 
                 `https://jira.atlassian.net/browse/${ticketId}`;
      chrome.tabs.create({ url });
    });
  }
  
  // Export all notes to a file
  function exportAllNotes() {
    // First, collect all risk statuses
    const riskStatuses = {};
    allNotes.forEach(note => {
      riskStatuses[note.id] = note.isAtRisk || false;
    });
    
    const exportData = {
      version: '1.1',  // Bump version to indicate risk status support
      exportedAt: new Date().toISOString(),
      notes: allNotes.map(note => ({
        id: note.id,
        title: note.title,
        project: note.project,
        content: note.content,
        timestamp: note.timestamp,
        isAtRisk: note.isAtRisk || false
      })),
      riskStatuses: riskStatuses
    };
    
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `jira-notes-${new Date().toISOString().split('T')[0]}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  }
  
  // Import notes from file
  function importNotes() {
    const fileInput = document.getElementById('importFileInput');
    fileInput.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const importData = JSON.parse(event.target.result);
          if (!importData.notes || !Array.isArray(importData.notes)) {
            throw new Error('Invalid import file format');
          }
          
          // Check if this is a v1.1+ export with risk statuses
          const hasRiskStatuses = importData.version && parseFloat(importData.version) >= 1.1 && importData.riskStatuses;
          
          // Load existing notes first
          chrome.storage.local.get(null, function(items) {
            const updates = {};
            const riskUpdates = {};
            const importedTicketIds = new Set();
            
            // Process imported notes
            importData.notes.forEach(note => {
              if (note.id && note.content) {
                const noteKey = `note_${note.id}`;
                updates[noteKey] = {
                  content: note.content,
                  project: note.project || 'Other',
                  timestamp: note.timestamp || Date.now(),
                  title: note.title || `Ticket ${note.id}`
                };
                
                // Handle risk status for v1.1+ format
                if (hasRiskStatuses && importData.riskStatuses[note.id]) {
                  riskUpdates[`risk_${note.id}`] = true;
                } 
                // Fallback to check if risk status is embedded in the note (for backward compatibility)
                else if (note.isAtRisk) {
                  riskUpdates[`risk_${note.id}`] = true;
                }
                
                importedTicketIds.add(note.id);
              }
            });
            
            // First save the note content updates
            chrome.storage.local.set(updates, function() {
              if (chrome.runtime.lastError) {
                console.error('Error importing notes:', chrome.runtime.lastError);
                alert('Error importing notes. Please check the console for details.');
                return;
              }
              
              // Then save the risk status updates if there are any
              if (Object.keys(riskUpdates).length > 0) {
                chrome.storage.local.set(riskUpdates, function() {
                  if (chrome.runtime.lastError) {
                    console.error('Error importing risk statuses:', chrome.runtime.lastError);
                    alert('Notes imported, but there was an error importing risk statuses.');
                  }
                  // Reload notes to show the imported ones
                  loadAllNotes();
                  alert(`Successfully imported ${importedTicketIds.size} notes with risk statuses.`);
                });
              } else {
                // No risk statuses to import, just reload notes
                loadAllNotes();
                alert(`Successfully imported ${importedTicketIds.size} notes.`);
              }
            });
          });
          
        } catch (error) {
          console.error('Error parsing import file:', error);
          alert('Error importing notes: ' + error.message);
        }
        
        // Reset file input
        fileInput.value = '';
      };
      
      reader.onerror = () => {
        alert('Error reading file');
        fileInput.value = '';
      };
      
      reader.readAsText(file);
    };
    
    // Trigger file selection
    fileInput.click();
  }
  
  // Event Listeners
  searchInput.addEventListener('input', displayNotes);
  filterProject.addEventListener('change', displayNotes);
  document.getElementById('filterRisk').addEventListener('change', displayNotes);
  sortBy.addEventListener('change', displayNotes);
  exportAllBtn.addEventListener('click', exportAllNotes);
  document.getElementById('importBtn').addEventListener('click', importNotes);
  
  // Initial load
  loadAllNotes();
});
