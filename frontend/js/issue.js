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
    const assignedTo = document.getElementById('newIssueAssignedTo').value || null;
    
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
        document.getElementById('issueAssignedTo').textContent = issue.assigned_to || 'Unassigned';
        
        const statusBadge = document.getElementById('issueStatus');
        statusBadge.textContent = formatStatus(issue.status);
        statusBadge.className = `status-badge ${issue.status}`;
        
        // Load comments
        loadComments(issue.comments);
        
        // Load images
        loadImages(issue.images);
        
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

// Load images
function loadImages(images) {
    const imagesContainer = document.getElementById('issueImages');
    
    if (images.length === 0) {
        imagesContainer.innerHTML = '<div class="no-data"><p>No images attached.</p></div>';
        return;
    }
    
    imagesContainer.innerHTML = images.map(image => `
        <div class="image-item" data-image-id="${image.id}">
            <img src="/static/uploads/${image.filename}" alt="Issue image">
            <button class="image-delete-btn" onclick="deleteImage(${image.id})">Delete</button>
        </div>
    `).join('');
}

// Edit title functionality
document.getElementById('editTitleBtn').addEventListener('click', () => {
    const titleDisplay = document.getElementById('issueTitle');
    const titleEdit = document.getElementById('issueTitleEdit');
    const editBtn = document.getElementById('editTitleBtn');
    const controls = document.getElementById('titleEditControls');
    
    titleEdit.value = titleDisplay.textContent;
    titleDisplay.style.display = 'none';
    titleEdit.style.display = 'block';
    controls.style.display = 'flex';
    editBtn.style.display = 'none';
    titleEdit.focus();
});

document.getElementById('saveTitleBtn').addEventListener('click', async () => {
    const titleEdit = document.getElementById('issueTitleEdit');
    const newTitle = titleEdit.value.trim();
    
    if (!newTitle) {
        alert('Title cannot be empty');
        return;
    }
    
    try {
        const response = await fetch(`/api/issues/${issueId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ title: newTitle })
        });
        
        if (response.ok) {
            document.getElementById('issueTitle').textContent = newTitle;
            cancelTitleEdit();
        } else {
            alert('Failed to update title');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('An error occurred');
    }
});

document.getElementById('cancelTitleBtn').addEventListener('click', cancelTitleEdit);

function cancelTitleEdit() {
    const titleDisplay = document.getElementById('issueTitle');
    const titleEdit = document.getElementById('issueTitleEdit');
    const editBtn = document.getElementById('editTitleBtn');
    const controls = document.getElementById('titleEditControls');
    
    titleDisplay.style.display = 'block';
    titleEdit.style.display = 'none';
    controls.style.display = 'none';
    editBtn.style.display = 'inline-block';
}

// Edit description functionality
document.getElementById('editDescriptionBtn').addEventListener('click', () => {
    const descDisplay = document.getElementById('issueDescription');
    const descEdit = document.getElementById('issueDescriptionEdit');
    const editBtn = document.getElementById('editDescriptionBtn');
    const controls = document.getElementById('descriptionEditControls');
    
    descEdit.value = descDisplay.textContent;
    descDisplay.style.display = 'none';
    descEdit.style.display = 'block';
    controls.style.display = 'flex';
    editBtn.style.display = 'none';
    descEdit.focus();
});

document.getElementById('saveDescriptionBtn').addEventListener('click', async () => {
    const descEdit = document.getElementById('issueDescriptionEdit');
    const newDescription = descEdit.value.trim();
    
    if (!newDescription) {
        alert('Description cannot be empty');
        return;
    }
    
    try {
        const response = await fetch(`/api/issues/${issueId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ description: newDescription })
        });
        
        if (response.ok) {
            document.getElementById('issueDescription').textContent = newDescription;
            cancelDescriptionEdit();
        } else {
            alert('Failed to update description');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('An error occurred');
    }
});

document.getElementById('cancelDescriptionBtn').addEventListener('click', cancelDescriptionEdit);

function cancelDescriptionEdit() {
    const descDisplay = document.getElementById('issueDescription');
    const descEdit = document.getElementById('issueDescriptionEdit');
    const editBtn = document.getElementById('editDescriptionBtn');
    const controls = document.getElementById('descriptionEditControls');
    
    descDisplay.style.display = 'block';
    descEdit.style.display = 'none';
    controls.style.display = 'none';
    editBtn.style.display = 'inline-block';
}

// Image upload functionality
let selectedFile = null;

document.getElementById('imageUpload').addEventListener('change', (e) => {
    const file = e.target.files[0];
    const fileName = document.getElementById('fileName');
    const uploadBtn = document.getElementById('uploadImageBtn');
    
    if (file) {
        selectedFile = file;
        fileName.textContent = file.name;
        uploadBtn.style.display = 'inline-block';
    } else {
        selectedFile = null;
        fileName.textContent = 'No file chosen';
        uploadBtn.style.display = 'none';
    }
});

document.getElementById('uploadImageBtn').addEventListener('click', async () => {
    if (!selectedFile) {
        alert('Please select a file');
        return;
    }
    
    const progressEl = document.getElementById('uploadProgress');
    progressEl.textContent = 'Uploading...';
    
    const formData = new FormData();
    formData.append('file', selectedFile);
    
    try {
        const response = await fetch(`/api/issues/${issueId}/images`, {
            method: 'POST',
            body: formData
        });
        
        if (response.ok) {
            progressEl.textContent = 'Upload successful!';
            document.getElementById('imageUpload').value = '';
            document.getElementById('fileName').textContent = 'No file chosen';
            document.getElementById('uploadImageBtn').style.display = 'none';
            selectedFile = null;
            
            // Reload issue to show new image
            setTimeout(() => {
                progressEl.textContent = '';
                loadIssue();
            }, 1000);
        } else {
            const error = await response.json();
            progressEl.textContent = '';
            alert(error.detail || 'Failed to upload image');
        }
    } catch (error) {
        console.error('Error:', error);
        progressEl.textContent = '';
        alert('An error occurred while uploading');
    }
});

// Delete image
async function deleteImage(imageId) {
    if (!confirm('Are you sure you want to delete this image?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/issues/${issueId}/images/${imageId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            loadIssue(); // Reload to show updated images
        } else {
            alert('Failed to delete image');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('An error occurred');
    }
}

// Initial load
loadIssue();
