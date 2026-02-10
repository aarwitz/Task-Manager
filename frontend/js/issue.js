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
    
    const title = document.getElementById('newIssueTitle').value;
    const description = document.getElementById('newIssueDescription').value;
    
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
        } else {
            alert('Failed to create issue');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('An error occurred');
    }
});

// Get issue ID from URL
const urlParams = new URLSearchParams(window.location.search);
const issueId = urlParams.get('id');

if (!issueId) {
    alert('No issue specified');
    window.location.href = '/static/backlog.html';
}

// Load issue details
async function loadIssue() {
    try {
        const response = await fetch(`/api/issues/${issueId}`);
        
        if (!response.ok) {
            alert('Issue not found');
            window.location.href = '/static/backlog.html';
            return;
        }
        
        const issue = await response.json();
        
        // Populate issue details
        document.getElementById('issueId').textContent = `#${issue.id}`;
        document.getElementById('issueTitle').textContent = issue.title;
        document.getElementById('issueDescription').textContent = issue.description;
        document.getElementById('issueCreated').textContent = new Date(issue.created_at).toLocaleString();
        document.getElementById('issueCreatedBy').textContent = issue.created_by;
        
        const statusBadge = document.getElementById('issueStatus');
        statusBadge.textContent = formatStatus(issue.status);
        statusBadge.className = `status-badge ${issue.status}`;
        
        // Load comments
        loadComments(issue.comments);
        
    } catch (error) {
        console.error('Error loading issue:', error);
        alert('An error occurred');
    }
}

// Load comments
function loadComments(comments) {
    const commentsList = document.getElementById('commentsList');
    
    if (comments.length === 0) {
        commentsList.innerHTML = '<div class="no-data"><p>No comments yet. Be the first to comment!</p></div>';
        return;
    }
    
    commentsList.innerHTML = comments.map(comment => `
        <div class="comment">
            <div class="comment-header">
                <span class="comment-author">${comment.username}</span>
                <span class="comment-date">${new Date(comment.created_at).toLocaleString()}</span>
            </div>
            <div class="comment-content">${comment.content}</div>
        </div>
    `).join('');
}

// Add comment
document.getElementById('addCommentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const content = document.getElementById('commentContent').value;
    
    try {
        const response = await fetch(`/api/issues/${issueId}/comments`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                content,
                username
            })
        });
        
        if (response.ok) {
            document.getElementById('commentContent').value = '';
            // Reload issue to get updated comments
            loadIssue();
        } else {
            alert('Failed to add comment');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('An error occurred');
    }
});

// Format status for display
function formatStatus(status) {
    return status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
}

// Initial load
loadIssue();
