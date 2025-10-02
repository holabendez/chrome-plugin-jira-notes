// Data Service for Jira Notes
// Handles all storage operations with backward compatibility

class DataService {
  constructor() {
    this.STORAGE_VERSION = '1.4.0';
    this.STORAGE_KEYS = {
      V1: { NOTES: 'notes', RISK_STATUS: 'riskStatus' },
      V2: { TICKETS: 'v2_tickets', METADATA: 'v2_metadata' }
    };
  }

  // Initialize the data service and migrate if needed
  async init() {
    await this.migrateIfNeeded();
  }

  // Check if migration is needed and perform it
  async migrateIfNeeded() {
    const data = await chrome.storage.local.get(null);
    
    // If already migrated, return
    if (data[this.STORAGE_KEYS.V2.METADATA]?.version === this.STORAGE_VERSION) {
      console.log('Data already migrated to v2');
      return;
    }

    console.log('Starting data migration...');
    
    // Check for old format data (note_* and risk_* keys)
    const oldFormatNotes = {};
    const oldFormatRiskStatus = {};
    const oldFormatUrls = {};
    
    // Scan all keys to find old format data
    for (const [key, value] of Object.entries(data)) {
      if (key.startsWith('note_') && key !== 'notes') {
        const ticketId = key.substring(5); // Remove 'note_' prefix
        oldFormatNotes[ticketId] = value?.content || value;
      } else if (key.startsWith('risk_')) {
        const ticketId = key.substring(5); // Remove 'risk_' prefix
        oldFormatRiskStatus[ticketId] = value;
      } else if (key.startsWith('url_')) {
        const ticketId = key.substring(4); // Remove 'url_' prefix
        oldFormatUrls[ticketId] = value;
      }
    }
    
    // Also check for the old jiraNotes object
    const oldJiraNotes = data.jiraNotes || {};
    
    console.log('Found old format data:', {
      oldFormatNotes,
      oldFormatRiskStatus,
      oldFormatUrls,
      oldJiraNotes
    });
    
    const v2Tickets = {};
    const now = new Date().toISOString();
    const migratedTickets = new Set();

    // Migrate from old format (note_* keys)
    for (const [ticketId, note] of Object.entries(oldFormatNotes)) {
      if (note) {
        v2Tickets[ticketId] = {
          notes: typeof note === 'string' ? note : (note.content || ''),
          isAtRisk: !!oldFormatRiskStatus[ticketId],
          url: oldFormatUrls[ticketId] || '',
          createdAt: now,
          updatedAt: now,
          isArchived: false
        };
        migratedTickets.add(ticketId);
      }
    }
    
    // Migrate from old jiraNotes object
    for (const [ticketId, note] of Object.entries(oldJiraNotes)) {
      if (note && !migratedTickets.has(ticketId)) {
        v2Tickets[ticketId] = {
          notes: typeof note === 'string' ? note : (note.content || ''),
          isAtRisk: !!oldFormatRiskStatus[ticketId],
          url: oldFormatUrls[ticketId] || '',
          createdAt: now,
          updatedAt: now,
          isArchived: false
        };
        migratedTickets.add(ticketId);
      }
    }
    
    // If we have any new format tickets, preserve them
    const existingV2Tickets = data[this.STORAGE_KEYS.V2.TICKETS] || {};
    const mergedTickets = { ...existingV2Tickets, ...v2Tickets };
    
    console.log('Migrated tickets:', Object.keys(v2Tickets));
    
    // Save migrated data
    await chrome.storage.local.set({
      [this.STORAGE_KEYS.V2.TICKETS]: mergedTickets,
      [this.STORAGE_KEYS.V2.METADATA]: {
        version: this.STORAGE_VERSION,
        migratedAt: now,
        migratedFromOldFormat: migratedTickets.size > 0
      }
    });
    
    console.log(`Migration complete. Migrated ${migratedTickets.size} tickets.`);
  }

  // Get all tickets
  async getAllTickets() {
    try {
      const result = await chrome.storage.local.get(this.STORAGE_KEYS.V2.TICKETS);
      return result[this.STORAGE_KEYS.V2.TICKETS] || {};
    } catch (error) {
      console.error('Error getting all tickets:', error);
      return {};
    }
  }

  // Get a single ticket
  async getTicket(ticketId) {
    try {
      const tickets = await this.getAllTickets();
      return tickets[ticketId] || null;
    } catch (error) {
      console.error(`Error getting ticket ${ticketId}:`, error);
      return null;
    }
  }

  // Save a ticket
  async saveTicket(ticketId, data) {
    const tickets = await this.getAllTickets();
    const now = new Date().toISOString();
    
    tickets[ticketId] = {
      ...tickets[ticketId],
      ...data,
      updatedAt: now,
      createdAt: tickets[ticketId]?.createdAt || now
    };

    await chrome.storage.local.set({
      [this.STORAGE_KEYS.V2.TICKETS]: tickets
    });
  }

  // Archive a ticket
  async archiveTicket(ticketId, isArchived = true) {
    await this.saveTicket(ticketId, { isArchived });
  }

  // Export all data
  async exportData() {
    const [tickets, metadata] = await Promise.all([
      this.getAllTickets(),
      chrome.storage.local.get(this.STORAGE_KEYS.V2.METADATA)
    ]);
    
    return {
      version: this.STORAGE_VERSION,
      exportedAt: new Date().toISOString(),
      tickets,
      metadata: metadata[this.STORAGE_KEYS.V2.METADATA]
    };
  }

  // Import data
  async importData(data) {
    if (!data || !data.tickets) {
      throw new Error('Invalid import data format');
    }

    const now = new Date().toISOString();
    const existingTickets = await this.getAllTickets();
    
    // Merge imported tickets with existing ones
    const mergedTickets = {
      ...existingTickets,
      ...data.tickets
    };

    // Update timestamps for imported tickets
    for (const ticketId in data.tickets) {
      if (mergedTickets[ticketId]) {
        mergedTickets[ticketId].updatedAt = now;
        if (!mergedTickets[ticketId].createdAt) {
          mergedTickets[ticketId].createdAt = now;
        }
      }
    }

    await chrome.storage.local.set({
      [this.STORAGE_KEYS.V2.TICKETS]: mergedTickets,
      [this.STORAGE_KEYS.V2.METADATA]: {
        version: this.STORAGE_VERSION,
        lastImport: now,
        ...(data.metadata || {})
      }
    });
  }
}

// Create a singleton instance
const dataService = new DataService();

export default dataService;
