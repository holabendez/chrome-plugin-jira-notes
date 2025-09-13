// Migration script for Jira Notes
// Handles data migration between different versions

/**
 * Migrate from v1 to v2 format (original to structured data)
 */
function migrateFromV1ToV2() {
  return new Promise((resolve) => {
    // Check if migration is needed
    chrome.storage.local.get(['jiraNotes', 'migration_v2_done'], function(result) {
      // If migration already done or no notes to migrate
      if (result.migration_v2_done || !result.jiraNotes) {
        resolve(false);
        return;
      }

      const oldNotes = result.jiraNotes;
      const newNotes = {};
      const currentTime = Date.now();
      
      // Convert old format to new format
      Object.keys(oldNotes).forEach(ticketId => {
        newNotes[`note_${ticketId}`] = {
          content: oldNotes[ticketId],
          timestamp: currentTime,
          project: ticketId.split('-')[0],
          title: `Ticket ${ticketId}`,
          atRisk: false  // Default to not at risk for migrated notes
        };
        
        // Save the URL for reference - will be updated when the note is accessed
        newNotes[`url_${ticketId}`] = `https://jira.atlassian.net/browse/${ticketId}`; // Default URL
      });
      
      // Save new format and mark migration as done
      chrome.storage.local.set({
        ...newNotes,
        migration_v2_done: true
      }, function() {
        // Remove old format to save space
        chrome.storage.local.remove('jiraNotes');
        console.log('Migration to v2 completed successfully');
        resolve(true);
      });
    });
  });
}

/**
 * Migrate to v1.3+ format (adds risk status)
 */
function migrateToV1_3() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['migration_v1_3_done'], function(result) {
      // If migration already done
      if (result.migration_v1_3_done) {
        resolve(false);
        return;
      }
      
      // Get all notes
      chrome.storage.local.get(null, function(allData) {
        const updates = {};
        let notesUpdated = 0;
        
        // Find all note_* keys
        Object.keys(allData).forEach(key => {
          if (key.startsWith('note_')) {
            const note = allData[key];
            // If note exists but doesn't have atRisk property, add it
            if (note && typeof note === 'object' && !('atRisk' in note)) {
              updates[key] = {
                ...note,
                atRisk: false  // Default to not at risk for existing notes
              };
              notesUpdated++;
            }
          }
        });
        
        if (notesUpdated > 0) {
          chrome.storage.local.set(updates, function() {
            console.log(`Updated ${notesUpdated} notes with risk status`);
            // Mark migration as done
            chrome.storage.local.set({ migration_v1_3_done: true }, () => {
              resolve(true);
            });
          });
        } else {
          // No updates needed, just mark as done
          chrome.storage.local.set({ migration_v1_3_done: true }, () => {
            resolve(false);
          });
        }
      });
    });
  });
}

// Run migrations when the script loads
async function runMigrations() {
  try {
    // Run migrations in sequence
    const v2Result = await migrateFromV1ToV2();
    const v1_3Result = await migrateToV1_3();
    
    if (v2Result || v1_3Result) {
      console.log('Migrations completed successfully');
    }
  } catch (error) {
    console.error('Migration error:', error);
  }
}

// Start migrations
runMigrations();
