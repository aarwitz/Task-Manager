# Task Manager

A simple, lightweight task management system designed for small teams. Think JIRA, but streamlined for just you and your partner to stay organized on your robotics project.

## Features

- **Simple Login** - Just a username, no passwords needed
- **Issue Creation** - Create and track issues with title, description, and automatic ID assignment
- **Backlog Management** - View all unassigned issues, sort by status or date
- **Sprint Planning** - Create sprints and assign issues to them
- **Kanban Board** - Drag and drop issues between To Do, In Progress, In Review, and Done
- **Comments** - Discuss issues with your team through comments
- **Persistent Storage** - All data saved locally using SQLite

## Tech Stack

- **Backend**: FastAPI (Python)
- **Database**: SQLite
- **Frontend**: HTML, CSS, JavaScript (vanilla)

## Installation

1. Make sure you have Python 3.8+ installed

2. Install dependencies:
```bash
pip install -r requirements.txt
```

## Running the Application

1. Start the server:
```bash
cd backend
python main.py
```

Or use the convenience script:
```bash
chmod +x start.sh
./start.sh
```

2. Access the application:
   - On your computer: http://localhost:8000
   - From other devices on your network: http://YOUR_LOCAL_IP:8000
   
   To find your local IP:
   - Linux: `ip addr show | grep inet`
   - Windows: `ipconfig`
   - Mac: `ifconfig | grep inet`

3. Login with any username (it will be created automatically if it doesn't exist)

## Usage

### Creating Your First Sprint

1. Go to the Backlog view
2. Click "Create Sprint" and give it a name
3. Click "Start" on the sprint you created
4. Now you can assign issues to your active sprint

### Managing Issues

1. Click "+ Create Issue" from any page
2. Fill in the title and description
3. The issue automatically goes to the backlog
4. From the backlog, you can assign issues to your active sprint
5. In the sprint view, drag issues between columns to update their status

### Working with Sprints

- Only one sprint can be active at a time
- Starting a new sprint will end the current one
- When you end a sprint, all issues (including completed ones) move back to the backlog
- You can track issue progress through the 4 columns: To Do, In Progress, In Review, Done

### Commenting on Issues

- Click on any issue to view its details
- Scroll to the bottom to add comments
- All comments show the username of who posted them

## Project Structure

```
Task-Manager/
├── backend/
│   ├── main.py           # FastAPI application and routes
│   ├── models.py         # Database models
│   ├── schemas.py        # Pydantic schemas for API
│   └── database.py       # Database configuration
├── frontend/
│   ├── index.html        # Login page
│   ├── backlog.html      # Backlog view
│   ├── sprint.html       # Sprint/Kanban board
│   ├── issue.html        # Issue detail page
│   ├── css/
│   │   └── styles.css    # All styles
│   └── js/
│       ├── backlog.js    # Backlog functionality
│       ├── sprint.js     # Sprint/drag-drop functionality
│       └── issue.js      # Issue detail functionality
├── requirements.txt      # Python dependencies
└── taskmanager.db       # SQLite database (created on first run)
```

## Network Access

The server is configured to listen on `0.0.0.0:8000`, which means:
- Anyone on your local network can access it
- They just need to navigate to your computer's local IP address on port 8000
- No authentication beyond the username is required
- Perfect for a small team working on the same WiFi

## Notes

- All data is stored locally in `taskmanager.db`
- Issue IDs are monotonically increasing and never reused
- No password authentication - this is designed for trusted small teams
- The application is lightweight and can handle plenty of issues with your available storage and RAM

## Future Enhancements (Optional)

Feel free to add:
- File/image attachments to issues
- Issue priority levels
- Time tracking
- Sprint velocity metrics
- Issue filtering and search
- User avatars
- Email notifications

Enjoy staying organized! 🤖
