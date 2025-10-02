// All Notes Page - Shows all saved Jira notes
import dataService from './data-service.js';

// Initialize data service
(async () => {
  try {
    await dataService.init();
    console.log('Data service initialized in all-notes');
  } catch (error) {
    console.error('Failed to initialize data service:', error);
  }
})();

document.addEventListener('DOMContentLoaded', async function() {
  const notesContainer = document.getElementById('notesContainer');
  const searchInput = document.getElementById('searchInput');
  const projectFilter = document.getElementById('projectFilter');
  const archiveFilter = document.getElementById('archiveFilter');
  const sortBy = document.getElementById('sortBy');
  const exportAllBtn = document.getElementById('exportAllBtn');
  const showAtRiskBtn = document.getElementById('showAtRiskBtn');
  const backBtn = document.getElementById('backBtn');
  
  let allTickets = [];
  let projects = new Set();
  let showOnlyAtRisk = false;
  
  // Back to extension button
  backBtn.addEventListener('click', () => {
    window.close();
  });
  
  // Load all tickets from storage
  async function loadAllTickets() {
    try {
      console.log('Loading all tickets...');
      allTickets = [];
      projects.clear();
      
      // Get all tickets from data service
      const tickets = await dataService.getAllTickets();
      console.log('Retrieved tickets from storage:', tickets);
      
      // Process tickets
      Object.entries(tickets).forEach(([ticketId, ticketData]) => {
        console.log(`Processing ticket ${ticketId}:`, ticketData);
        const project = ticketId.split('-')[0];
        const ticket = {
          id: ticketId,
          project,
          summary: ticketData.summary || '',
          content: ticketData.notes || '',
          isAtRisk: ticketData.isAtRisk || false,
          isArchived: ticketData.isArchived || false,
          createdAt: ticketData.createdAt || new Date().toISOString(),
          updatedAt: ticketData.updatedAt || new Date().toISOString()
        };
        
        allTickets.push(ticket);
        projects.add(project);
        console.log(`Added ticket ${ticketId} to display list`);
      });
      
      console.log(`Found ${allTickets.length} tickets`);
      console.log('Projects:', Array.from(projects));
      
      // Populate project filter dropdown
      populateProjectFilter();
      
      // Display tickets
      displayTickets();
    } catch (error) {
      console.error('Error loading tickets:', error);
      updateStatus('Failed to load tickets', true);
    }
  }
  
  // Populate project filter dropdown
  function populateProjectFilter() {
    // Clear existing options except the first one
    while (projectFilter.options.length > 1) {
      projectFilter.remove(1);
    }
    
    // Add project options
    Array.from(projects).sort().forEach(project => {
      const option = document.createElement('option');
      option.value = project;
      option.textContent = project;
      projectFilter.appendChild(option);
    });
  }
  
  // Display tickets based on filters and sort
  function displayTickets() {
    console.log('Displaying tickets...');
    const searchTerm = searchInput.value.toLowerCase();
    const selectedProject = projectFilter.value;
    const archiveFilterValue = archiveFilter.value;
    
    console.log('Filters:', { searchTerm, selectedProject, archiveFilterValue });
    console.log('All tickets:', allTickets);
    
    let filteredTickets = allTickets.filter(ticket => {
      // Filter by search term
      const matchesSearch = searchTerm === '' || 
        ticket.content.toLowerCase().includes(searchTerm) || 
        ticket.summary.toLowerCase().includes(searchTerm) ||
        ticket.id.toLowerCase().includes(searchTerm);
      
      // Filter by project
      const matchesProject = !selectedProject || ticket.project === selectedProject;
      
      // Filter by risk status
      const matchesRisk = !showOnlyAtRisk || ticket.isAtRisk;
      
      // Filter by archive status
      let matchesArchive = true;
      if (archiveFilterValue === 'active') {
        matchesArchive = !ticket.isArchived;
      } else if (archiveFilterValue === 'archived') {
        matchesArchive = ticket.isArchived;
      }
      
      return matchesSearch && matchesProject && matchesRisk && matchesArchive;
    });
    
    // Sort tickets
    const sortOrder = sortBy.value;
    filteredTickets.sort((a, b) => {
      switch(sortOrder) {
        case 'date-asc':
          return new Date(a.updatedAt) - new Date(b.updatedAt);
        case 'project':
          return a.project.localeCompare(b.project) || a.id.localeCompare(b.id);
        case 'ticket':
          return a.id.localeCompare(b.id);
        case 'date-desc':
        default:
          return new Date(b.updatedAt) - new Date(a.updatedAt);
      }
    });
    renderTickets(filteredTickets);
  }
  
  // Render tickets to the DOM
  function renderTickets(tickets) {
    console.log('Rendering tickets:', tickets);
    notesContainer.innerHTML = '';
    
    if (tickets.length === 0) {
      const emptyState = document.createElement('div');
      emptyState.className = 'empty-state';
      emptyState.textContent = 'No notes found matching your criteria.';
      notesContainer.appendChild(emptyState);
      console.log('No tickets to display');
      return;
    }
    
    console.log('Rendering tickets HTML...');
    
    // Clear existing content
    notesContainer.innerHTML = '';
    
    // Create a document fragment for better performance
    const fragment = document.createDocumentFragment();
    
    // Add each ticket to the fragment
    tickets.forEach(ticket => {
      const ticketElement = document.createElement('div');
      ticketElement.innerHTML = createTicketElement(ticket);
      fragment.appendChild(ticketElement.firstElementChild);
    });
    
    // Add all tickets to the container at once
    notesContainer.appendChild(fragment);
    
    // Add event listeners after the DOM is updated
    document.querySelectorAll('.view-ticket').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const ticketId = e.target.closest('.ticket-actions').dataset.ticketId;
        openJiraTicket(ticketId);
      });
    });
    
    // Add archive/unarchive event listeners
    document.querySelectorAll('.archive-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const ticketId = e.target.closest('.ticket-actions').dataset.ticketId;
        await toggleArchiveStatus(ticketId);
      });
    });
    
    // Add delete event listeners
    document.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        if (confirm('Are you sure you want to delete this note? This cannot be undone.')) {
          const ticketId = e.target.closest('.ticket-actions').dataset.ticketId;
          deleteTicket(ticketId);
        }
      });
    });
  }
  
  // Create a ticket card element
  function createTicketElement(ticket) {
    const riskBadge = ticket.isAtRisk ? '<span class="risk-badge">🚩 At Risk</span>' : '';
    const archivedClass = ticket.isArchived ? 'archived' : '';
    const riskClass = ticket.isAtRisk ? 'at-risk' : '';
    const formattedDate = new Date(ticket.updatedAt || ticket.createdAt).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    return `
      <div class="note-card ${archivedClass} ${riskClass}" data-ticket-id="${ticket.id}">
        <div class="ticket-header">
          <h3>
            <span class="ticket-id">${ticket.id}</span>
            ${riskBadge}
            ${ticket.isArchived ? '<span class="archived-badge">📦 Archived</span>' : ''}
          </h3>
          ${ticket.summary ? `<div class="ticket-summary">${ticket.summary}</div>` : ''}
        </div>
        <div class="note-content">
          <p>${ticket.content || '<em>No notes for this ticket</em>'}</p>
        </div>
        <div class="ticket-meta">
          <span class="last-updated">Last updated: ${formattedDate}</span>
          <div class="ticket-actions" data-ticket-id="${ticket.id}">
            <button class="archive-btn" title="${ticket.isArchived ? 'Unarchive' : 'Archive'}">
              ${ticket.isArchived ? '📦 Unarchive' : '📥 Archive'}
            </button>
            <button class="delete-btn" title="Delete">🗑️ Delete</button>
            <a href="#" class="view-ticket" title="Open in Jira">🔗 Open</a>
          </div>
        </div>
      </div>
    `;
  }
  
  // Open Jira ticket in a new tab
  function openJiraTicket(ticketId) {
    // Try to get the current tab's URL to determine the Jira domain
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs && tabs[0] && tabs[0].url) {
        const url = new URL(tabs[0].url);
        const baseUrl = `${url.protocol}//${url.host}`;
        chrome.tabs.create({
          url: `${baseUrl}/browse/${ticketId}`
        });
      } else {
        // Fallback to default Jira URL
        chrome.tabs.create({
          url: `https://jira.atlassian.net/browse/${ticketId}`
        });
      }
    });
  }
  
  // Toggle archive status for a ticket
  async function toggleArchiveStatus(ticketId) {
    try {
      const ticket = allTickets.find(t => t.id === ticketId);
      if (!ticket) return;
      
      const isArchived = !ticket.isArchived;
      await dataService.saveTicket(ticketId, { isArchived });
      
      // Update local state
      ticket.isArchived = isArchived;
      ticket.updatedAt = new Date().toISOString();
      
      // Refresh the display
      displayTickets();
      updateStatus(`Ticket ${isArchived ? 'archived' : 'unarchived'} successfully`);
    } catch (error) {
      console.error('Error toggling archive status:', error);
      updateStatus('Failed to update archive status', true);
    }
  }
  
  // Delete a ticket's notes
  async function deleteTicket(ticketId) {
    try {
      await dataService.saveTicket(ticketId, { notes: null });
      
      // Update local state
      allTickets = allTickets.filter(t => t.id !== ticketId);
      
      // Refresh the display
      displayTickets();
      updateStatus('Note deleted successfully');
    } catch (error) {
      console.error('Error deleting ticket:', error);
      updateStatus('Failed to delete note', true);
    }
  }
  
  // Export all notes to a file
  async function exportAllNotes() {
    try {
      const exportData = await dataService.exportData();
      
      const dataStr = 'data:text/json;charset=utf-8,' + 
        encodeURIComponent(JSON.stringify(exportData, null, 2));
      
      const downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.setAttribute('href', dataStr);
      downloadAnchorNode.setAttribute('download', 
        `jira-notes-${new Date().toISOString().split('T')[0]}.json`);
      
      document.body.appendChild(downloadAnchorNode);
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
      
      updateStatus('Export completed successfully');
    } catch (error) {
      console.error('Error exporting notes:', error);
      updateStatus('Failed to export notes', true);
    }
  }
  
  // Show status message
  function updateStatus(message, isError = false) {
    const statusEl = document.createElement('div');
    statusEl.className = `status-message ${isError ? 'error' : 'success'}`;
    statusEl.textContent = message;
    
    // Remove any existing status messages
    document.querySelectorAll('.status-message').forEach(el => el.remove());
    
    // Add the new status message
    notesContainer.insertAdjacentElement('beforebegin', statusEl);
    
    // Auto-hide after 3 seconds
    setTimeout(() => {
      statusEl.style.opacity = '0';
      setTimeout(() => statusEl.remove(), 300);
    }, 3000);
  }
  
  // Event Listeners
  searchInput.addEventListener('input', displayTickets);
  projectFilter.addEventListener('change', displayTickets);
  archiveFilter.addEventListener('change', displayTickets);
  sortBy.addEventListener('change', displayTickets);
  exportAllBtn.addEventListener('click', exportAllNotes);
  
  // Toggle show only at risk tickets
  showAtRiskBtn.addEventListener('click', () => {
    showOnlyAtRisk = !showOnlyAtRisk;
    showAtRiskBtn.classList.toggle('active', showOnlyAtRisk);
    displayTickets();
  });
  
  // Handle import button click
  const importBtn = document.getElementById('importBtn');
  if (importBtn) {
    importBtn.addEventListener('click', async () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      
      input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      try {
        const content = await file.text();
        const data = JSON.parse(content);
        
        // Import the data
        await dataService.importData(data);
        
        // Reload tickets
        await loadAllTickets();
        updateStatus('Import completed successfully');
      } catch (error) {
        console.error('Error importing data:', error);
        updateStatus('Failed to import data. Please check the file format.', true);
      }
      };
      
      input.click();
    });
  } else {
    console.warn('Import button not found in the DOM');
  }
  
  // Initial load
  loadAllTickets();
});
