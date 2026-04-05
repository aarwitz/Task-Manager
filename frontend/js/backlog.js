// Check if user is logged in
const username = localStorage.getItem('username');
if (!username) {
    window.location.href = '/static/index.html';
}

document.getElementById('currentUser').textContent = username;

// Logout functionality
document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('username');
    window.location.href = '/static/index.html';
});

// Create Issue Modal
const createIssueModal = document.getElementById('createIssueModal');
const createIssueBtn = document.getElementById('createIssueBtn');
const closeModal = document.querySelector('#createIssueModal .close');
const cancelBtn = document.querySelector('#createIssueModal .cancel-btn');

createIssueBtn.addEventListener('click', () => {
    createIssueModal.classList.add('show');
});

closeModal.addEventListener('click', () => {
    createIssueModal.classList.remove('show');
});

cancelBtn.addEventListener('click', () => {
    createIssueModal.classList.remove('show');
});

window.addEventListener('click', (e) => {
    if (e.target === createIssueModal) {
        createIssueModal.classList.remove('show');
    }
});

const issueImagesInput = document.getElementById('issueImages');
const issueImagesLabel = document.getElementById('issueImagesLabel');

if (issueImagesInput && issueImagesLabel) {
    issueImagesInput.addEventListener('change', () => {
        const files = issueImagesInput.files;
        if (!files || files.length === 0) {
            issueImagesLabel.textContent = 'No files selected';
            return;
        }
        issueImagesLabel.textContent = `${files.length} image${files.length === 1 ? '' : 's'} selected`;
    });
}

async function uploadIssueImages(issueId, files) {
    if (!files || files.length === 0) {
        return;
    }

    const uploads = Array.from(files).map((file) => {
        const formData = new FormData();
        formData.append('file', file);
        return fetch(`/api/issues/${issueId}/images?source_type=description&uploaded_by=${encodeURIComponent(username)}`, {
            method: 'POST',
            body: formData,
        });
    });

    const results = await Promise.all(uploads);
    const hasFailure = results.some((result) => !result.ok);
    if (hasFailure) {
        throw new Error('One or more image uploads failed');
    }
}

// Create Issue Form
document.getElementById('createIssueForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const title = document.getElementById('issueTitle').value;
    const description = document.getElementById('issueDescription').value;
    const assignedTo = document.getElementById('issueAssignedTo').value || null;
    const imageFiles = issueImagesInput ? issueImagesInput.files : null;
    
    try {
        const response = await fetch('/api/issues', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                title,
                description,
                created_by: username,
                assigned_to: assignedTo
            })
        });
        
        if (response.ok) {
            const createdIssue = await response.json();
            await uploadIssueImages(createdIssue.id, imageFiles);
            createIssueModal.classList.remove('show');
            document.getElementById('createIssueForm').reset();
            if (issueImagesLabel) {
                issueImagesLabel.textContent = 'No files selected';
            }
            loadIssues();
        } else {
            alert('Failed to create issue');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('An error occurred');
    }
});

// Create Sprint Modal
const createSprintModal = document.getElementById('createSprintModal');
const createSprintBtn = document.getElementById('createSprintBtn');
const closeSprintModal = document.querySelector('#createSprintModal .close');
const cancelSprintBtn = document.querySelector('#createSprintModal .cancel-sprint-btn');

createSprintBtn.addEventListener('click', () => {
    createSprintModal.classList.add('show');
});

closeSprintModal.addEventListener('click', () => {
    createSprintModal.classList.remove('show');
});

cancelSprintBtn.addEventListener('click', () => {
    createSprintModal.classList.remove('show');
});

window.addEventListener('click', (e) => {
    if (e.target === createSprintModal) {
        createSprintModal.classList.remove('show');
    }
});

// Create Sprint Form
document.getElementById('createSprintForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const name = document.getElementById('sprintName').value;
    
    try {
        const response = await fetch('/api/sprints', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name })
        });
        
        if (response.ok) {
            createSprintModal.classList.remove('show');
            document.getElementById('createSprintForm').reset();
            loadSprints();
        } else {
            alert('Failed to create sprint');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('An error occurred');
    }
});

// Load and display sprints
async function loadSprints() {
    try {
        const response = await fetch('/api/sprints');
        const sprints = await response.json();
        
        const sprintsList = document.getElementById('sprintsList');
        
        if (sprints.length === 0) {
            sprintsList.innerHTML = '<div class="no-data"><p>No sprints created yet. Create one to get started!</p></div>';
            return;
        }
        
        sprintsList.innerHTML = sprints.map(sprint => `
            <div class="sprint-card ${sprint.is_active ? 'active' : ''}">
                <h4>${sprint.name} ${sprint.is_active ? '(Active)' : ''}</h4>
                <div class="sprint-meta">
                    <p>Created: ${new Date(sprint.started_at || Date.now()).toLocaleDateString()}</p>
                </div>
                <div class="sprint-actions">
                    ${!sprint.is_active ? `
                        <button class="btn btn-success btn-sm" onclick="startSprint(${sprint.id})">Start</button>
                    ` : `
                        <button class="btn btn-danger btn-sm" onclick="endSprint(${sprint.id})">End</button>
                    `}
                    <button class="btn btn-secondary btn-sm" onclick="viewSprint(${sprint.id})">View</button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading sprints:', error);
    }
}

// Start sprint
async function startSprint(sprintId) {
    if (!confirm('Start this sprint? This will end any currently active sprint.')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/sprints/${sprintId}/start`, {
            method: 'POST'
        });
        
        if (response.ok) {
            loadSprints();
            alert('Sprint started!');
        } else {
            alert('Failed to start sprint');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('An error occurred');
    }
}

// End sprint
async function endSprint(sprintId) {
    if (!confirm('End this sprint? All issues will be moved back to the backlog.')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/sprints/${sprintId}/end`, {
            method: 'POST'
        });
        
        if (response.ok) {
            loadSprints();
            loadIssues();
            alert('Sprint ended! All issues moved to backlog.');
        } else {
            alert('Failed to end sprint');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('An error occurred');
    }
}

// View sprint
function viewSprint(sprintId) {
    window.location.href = `/static/sprint.html?sprint_id=${sprintId}`;
}

// Load and display backlog issues
async function loadIssues() {
    try {
        const response = await fetch('/api/issues?in_backlog=true');
        const issues = await response.json();
        
        const issuesList = document.getElementById('issuesList');
        
        if (issues.length === 0) {
            issuesList.innerHTML = '<div class="no-data"><h3>No issues in backlog</h3><p>Create an issue to get started!</p></div>';
            return;
        }
        
        // Sort issues based on selected option
        const sortBy = document.getElementById('sortBy').value;
        let sortedIssues = [...issues];
        
        if (sortBy === 'status') {
            const statusOrder = { to_do: 0, in_progress: 1, in_review: 2, done: 3 };
            sortedIssues.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);
        } else {
            sortedIssues.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        }
        
        issuesList.innerHTML = sortedIssues.map(issue => `
            <div class="issue-card" onclick="viewIssue(${issue.id})">
                <div class="issue-card-header">
                    <div>
                        <div class="issue-id-badge">#${issue.id}</div>
                        <div class="issue-card-title">${issue.title}</div>
                    </div>
                    <span class="status-badge ${issue.status}">${formatStatus(issue.status)}</span>
                </div>
                <div class="issue-card-meta">
                    <span>Created: ${new Date(issue.created_at).toLocaleDateString()}</span>
                    <span>By: ${issue.created_by}</span>
                    <span>Assignee: ${issue.assigned_to || "Unassigned"}</span>
                </div>
                <div style="margin-top: 1rem;">
                    <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); assignToActiveSprint(${issue.id})">
                        Assign to Active Sprint
                    </button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading issues:', error);
    }
}

// Assign issue to active sprint
async function assignToActiveSprint(issueId) {
    try {
        // Get active sprint
        const sprintResponse = await fetch('/api/sprints/active');
        
        if (!sprintResponse.ok) {
            alert('No active sprint. Please start a sprint first.');
            return;
        }
        
        const activeSprint = await sprintResponse.json();
        
        const response = await fetch(`/api/issues/${issueId}/assign-to-sprint?sprint_id=${activeSprint.id}`, {
            method: 'POST'
        });
        
        if (response.ok) {
            loadIssues();
            alert('Issue assigned to sprint!');
        } else {
            alert('Failed to assign issue');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('An error occurred');
    }
}

// Format status for display
function formatStatus(status) {
    return status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
}

// View issue detail
function viewIssue(issueId) {
    window.location.href = `/static/issue.html?id=${issueId}`;
}

// Sort change handler
document.getElementById('sortBy').addEventListener('change', loadIssues);

// Initial load
loadSprints();
loadIssues();
