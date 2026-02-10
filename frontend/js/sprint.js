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

// Create Issue Form
document.getElementById('createIssueForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const title = document.getElementById('issueTitle').value;
    const description = document.getElementById('issueDescription').value;
    
    try {
        const response = await fetch('/api/issues', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                title,
                description,
                created_by: username
            })
        });
        
        if (response.ok) {
            createIssueModal.classList.remove('show');
            document.getElementById('createIssueForm').reset();
            
            // Check if there's an active sprint, if so reload it
            const activeSprint = await getActiveSprint();
            if (activeSprint) {
                loadSprintIssues(activeSprint.id);
            }
        } else {
            alert('Failed to create issue');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('An error occurred');
    }
});

let currentSprint = null;

// Get active sprint
async function getActiveSprint() {
    try {
        const response = await fetch('/api/sprints/active');
        if (response.ok) {
            return await response.json();
        }
        return null;
    } catch (error) {
        console.error('Error fetching active sprint:', error);
        return null;
    }
}

// Load sprint and issues
async function loadSprint() {
    const sprint = await getActiveSprint();
    
    if (!sprint) {
        document.getElementById('noSprintMessage').style.display = 'block';
        document.getElementById('sprintBoard').style.display = 'none';
        document.getElementById('startSprintBtn').style.display = 'none';
        document.getElementById('endSprintBtn').style.display = 'none';
        return;
    }
    
    currentSprint = sprint;
    document.getElementById('noSprintMessage').style.display = 'none';
    document.getElementById('sprintBoard').style.display = 'grid';
    
    document.getElementById('sprintTitle').textContent = sprint.name;
    document.getElementById('sprintInfo').textContent = 
        `Started: ${new Date(sprint.started_at).toLocaleString()}`;
    
    if (sprint.is_active) {
        document.getElementById('startSprintBtn').style.display = 'none';
        document.getElementById('endSprintBtn').style.display = 'block';
    } else {
        document.getElementById('startSprintBtn').style.display = 'block';
        document.getElementById('endSprintBtn').style.display = 'none';
    }
    
    await loadSprintIssues(sprint.id);
}

// Load issues for sprint
async function loadSprintIssues(sprintId) {
    try {
        const response = await fetch(`/api/issues?sprint_id=${sprintId}`);
        const issues = await response.json();
        
        // Clear all columns
        document.querySelectorAll('.column-content').forEach(column => {
            column.innerHTML = '';
        });
        
        // Group issues by status
        const issuesByStatus = {
            to_do: [],
            in_progress: [],
            in_review: [],
            done: []
        };
        
        issues.forEach(issue => {
            issuesByStatus[issue.status].push(issue);
        });
        
        // Populate columns
        Object.keys(issuesByStatus).forEach(status => {
            const column = document.querySelector(`.column-content[data-status="${status}"]`);
            const issues = issuesByStatus[status];
            
            // Update count
            const countBadge = document.querySelector(`.column[data-status="${status}"] .issue-count`);
            countBadge.textContent = issues.length;
            
            // Add issues to column
            issues.forEach(issue => {
                const issueCard = createIssueCard(issue);
                column.appendChild(issueCard);
            });
        });
        
        setupDragAndDrop();
    } catch (error) {
        console.error('Error loading sprint issues:', error);
    }
}

// Create issue card element
function createIssueCard(issue) {
    const card = document.createElement('div');
    card.className = 'sprint-issue-card';
    card.draggable = true;
    card.dataset.issueId = issue.id;
    
    card.innerHTML = `
        <h4>${issue.title}</h4>
        <div class="issue-meta">
            <div class="issue-id-badge">#${issue.id}</div>
            <span>${issue.created_by}</span>
        </div>
    `;
    
    card.addEventListener('click', () => {
        window.location.href = `/static/issue.html?id=${issue.id}`;
    });
    
    return card;
}

// Setup drag and drop
function setupDragAndDrop() {
    const cards = document.querySelectorAll('.sprint-issue-card');
    const columns = document.querySelectorAll('.column-content');
    
    cards.forEach(card => {
        card.addEventListener('dragstart', handleDragStart);
        card.addEventListener('dragend', handleDragEnd);
    });
    
    columns.forEach(column => {
        column.addEventListener('dragover', handleDragOver);
        column.addEventListener('drop', handleDrop);
        column.addEventListener('dragenter', handleDragEnter);
        column.addEventListener('dragleave', handleDragLeave);
    });
}

let draggedElement = null;

function handleDragStart(e) {
    draggedElement = this;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    document.querySelectorAll('.column-content').forEach(col => {
        col.classList.remove('drag-over');
    });
}

function handleDragOver(e) {
    if (e.preventDefault) {
        e.preventDefault();
    }
    e.dataTransfer.dropEffect = 'move';
    return false;
}

function handleDragEnter(e) {
    this.classList.add('drag-over');
}

function handleDragLeave(e) {
    if (e.target.classList.contains('column-content')) {
        this.classList.remove('drag-over');
    }
}

async function handleDrop(e) {
    if (e.stopPropagation) {
        e.stopPropagation();
    }
    
    e.preventDefault();
    
    const newStatus = this.dataset.status;
    const issueId = draggedElement.dataset.issueId;
    
    try {
        const response = await fetch(`/api/issues/${issueId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ status: newStatus })
        });
        
        if (response.ok) {
            // Move the card to the new column
            this.appendChild(draggedElement);
            
            // Update counts
            updateIssueCounts();
        } else {
            alert('Failed to update issue status');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('An error occurred');
    }
    
    return false;
}

// Update issue counts in column headers
function updateIssueCounts() {
    document.querySelectorAll('.column').forEach(column => {
        const status = column.dataset.status;
        const count = column.querySelector('.column-content').children.length;
        column.querySelector('.issue-count').textContent = count;
    });
}

// End sprint button handler
document.getElementById('endSprintBtn').addEventListener('click', async () => {
    if (!currentSprint) return;
    
    if (!confirm('End this sprint? All issues will be moved back to the backlog.')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/sprints/${currentSprint.id}/end`, {
            method: 'POST'
        });
        
        if (response.ok) {
            alert('Sprint ended! All issues moved to backlog.');
            window.location.href = '/static/backlog.html';
        } else {
            alert('Failed to end sprint');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('An error occurred');
    }
});

// Initial load
loadSprint();
