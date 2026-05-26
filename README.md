# Task Manager

A lightweight issue, sprint, and execution queue for the RSL workflow. It tracks planning data, branch/repo context, comments, evidence, and autonomous launcher readiness in one place.

## Features

- **Trusted-user login** - Canonical Task Manager identities for internal users
- **Issue planning fields** - Title, description, assignee, branch, repo slug, acceptance criteria, story points, and blocked reason
- **Backlog and sprint views** - Backlog management, active sprint flow, and issue detail editing
- **Execution readiness tracking** - `auto_launch_enabled`, `launch_state`, `launch_error`, and `last_launch_at`
- **Comments and images** - Issue discussion plus screenshot/image uploads
- **Activity history** - Field-level audit trail for create, update, and execution events
- **Persistent local storage** - SQLite-backed state with additive startup migrations

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
5. In the sprint view, move issues through `to_do`, `in_progress`, `in_review`, `done`, or `blocked`

### Working with Sprints

- Only one sprint can be active at a time
- Starting a new sprint will end the current one
- When you end a sprint, issues remain assigned to that sprint for history and review
- Active work is tracked through `to_do`, `in_progress`, `in_review`, `done`, and `blocked`

### Auto-launch Workflow

- Auto-launch is available only for coding issues assigned to `Dwight`, `Jerry`, `Resi`, or `Druck`
- A ready issue must be `in_progress`, unblocked, and include `branch`, `repo_slug`, and `acceptance_criteria`
- When readiness is satisfied and `auto_launch_enabled=true`, Task Manager queues the canonical Dwight launcher
- Launcher postback writes the real execution outcome through `POST /api/issues/{id}/launch-result`
- Launch states currently used by Task Manager are `disabled`, `waiting`, `ready`, `queued`, `launched`, and `failed`

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
│   ├── database.py       # Database configuration
│   └── normalize_tm_identities.py  # Canonical TM username normalization
├── frontend/
│   ├── index.html        # Login page
│   ├── backlog.html      # Backlog planning surface
│   ├── sprint.html       # Sprint / kanban surface
│   ├── issue.html        # Issue detail page
│   ├── search.html       # Search and issue creation surface
│   ├── factory.html      # Experimental execution map
│   ├── miniapp.html      # Experimental compact surface
│   └── js/               # Shared frontend behavior
├── requirements.txt      # Python dependencies
├── start.sh              # Local launcher helper
└── taskmanager.db        # SQLite database (created on first run)
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
- Task Manager owns launcher readiness and detached queueing; the launcher posts real outcomes back after execution starts or fails
- The factory/miniapp surfaces are experimental and should be treated as secondary interfaces until explicitly hardened
