# Task Manager

A simple, lightweight task management system designed for small teams. Think JIRA, but streamlined for just you and your partner to stay organized on your robotics project.

## Features

- **Simple Login** - Lightweight username-based access for trusted RSL VPN users
- **Issue Creation** - Create and track issues with title, description, story points, branch, repo slug, blockers, and acceptance criteria
- **Backlog Management** - View all unassigned issues, sort by status or recency
- **Sprint Planning** - Create sprints and assign issues to them
- **Kanban Board** - Drag and drop issues between To Do, In Progress, In Review, Blocked, and Done
- **Comments and Images** - Discuss issues and upload screenshots/images
- **Activity History** - Field-level audit trail on issue updates
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

3. Login with an allowed Task Manager username

## Stopping and Restarting After Changes

On this machine, Task Manager is currently running as a **systemd user service** named `task-manager.service`, so you will not see a terminal to press `Ctrl + C`.

### Check if it is running

```bash
systemctl --user status task-manager.service
```

### If you changed the frontend

For changes to HTML, CSS, or JavaScript in the `frontend/` folder, a browser refresh is usually enough because the files are served directly.

- Normal refresh: `F5`
- Hard refresh if needed: `Ctrl + Shift + R`

If the browser still shows the old version, restart the service too:

```bash
systemctl --user restart task-manager.service
```

### If you changed the backend

After changing Python files in `backend/`, restart the service:

```bash
systemctl --user restart task-manager.service
```

### Start and stop commands

```bash
systemctl --user stop task-manager.service
systemctl --user start task-manager.service
systemctl --user restart task-manager.service
```

### View logs

```bash
journalctl --user -u task-manager.service -f
```

### If you ever run it manually instead of as a service

If you start the app yourself with `python main.py` or `./start.sh`, then you can stop it in that terminal with `Ctrl + C`.

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
- When you end a sprint, issues remain assigned to that sprint for history and review
- You can track issue progress through the 5 columns: To Do, In Progress, In Review, Blocked, Done

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
- Anyone on the allowed network path can access it
- They just need to navigate to your host on port 8000
- Current access is lightweight and intended for trusted internal use only
- Recommended deployment model is behind the RSL VPN or another trusted private network

## Notes

- All data is stored locally in `taskmanager.db`
- Issue IDs are monotonically increasing and never reused
- The current auth model is intentionally lightweight and should be treated as internal-only
- Story points are the only sizing measure used in the product
- The application is lightweight and can handle small-team usage comfortably, but changes should be validated before broader onboarding

## Current Operational Notes

- Images are supported on issue descriptions, attachments, and comments
- Branch links can store per-issue repo context via `repo_slug`
- Activity history is recorded for issue creation, comments, and field updates
- The factory/miniapp surfaces are experimental and should be treated as secondary interfaces until explicitly hardened

Enjoy staying organized! 🤖
