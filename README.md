# Jira Notes Chrome Extension

A Chrome extension that allows you to take and manage private notes and risk statuses for Jira tickets.

## Features

- 📝 Take notes on any Jira ticket
- 🚩 Mark tickets as "At Risk" with a single click
- 📋 View all notes and risk statuses in one place
- 🔍 Quickly see which tickets have notes or are marked as At Risk
- 📤 Export/Import your notes and risk statuses for backup or transfer
- 🚀 Lightweight and easy to use

## Installation

### From Chrome Web Store (Coming Soon)

### Manual Installation

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" in the top right corner
4. Click "Load unpacked" and select the extension directory
5. The Jira Notes icon should appear in your extensions toolbar

## How to Use

### Taking Notes
1. Navigate to any Jira ticket in your browser
2. Click the Jira Notes icon in your toolbar
3. Type your notes in the text area
4. Your notes will be automatically saved and associated with the current ticket

### Marking Tickets as At Risk
1. Open the Jira Notes popup on any ticket
2. Click the "Mark as At Risk" button (🚩)
3. The button will update to show the ticket is marked as At Risk
4. The extension icon will also show a red dot for tickets marked as At Risk

### Viewing All Notes and Risk Statuses
1. Click the "View All" link in the popup
2. Use the filters to:
   - Search notes by content
   - Filter by project
   - Show only At Risk tickets
   - Sort by date or ticket ID

### Exporting/Importing Data

- **Export**: Click the "Export" button to save all your notes and risk statuses as a JSON file
- **Import**: Click the "Import" button to import previously exported data

## Version History

### 1.3.2 (Current)
- Added "At Risk" status for tickets
- New "All Notes" page with filtering and search
- Improved UI with better visual indicators

### 1.3.1
- Initial release with basic note-taking functionality

## Privacy

All notes are stored locally in your browser's storage and are not sent to any external servers.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For support or feature requests, please open an issue in the GitHub repository.
