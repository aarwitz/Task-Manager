// Check if user is logged in
const username = localStorage.getItem('username');
if (!username) {
    window.location.href = '/static/index.html';
}

document.getElementById('currentUser').textContent = username;

let currentIssue = null;

// GitHub repo config
const GITHUB_REPO = 'aarwitz/Task-Manager';

function getBranchGitHubUrl(branch) {
    if (!branch) return null;
    return `https://github.com/${GITHUB_REPO}/tree/${encodeURIComponent(branch)}`;
}

function renderBranchDisplay(branch) {
    if (!branch) {
        return 'None';
    }
    const url = getBranchGitHubUrl(branch);
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: var(--primary-color); text-decoration: none; border-bottom: 1px solid currentColor; cursor: pointer;">${escapeHtml(branch)}</a>`;
}

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

createIssueBtn.addEventListener('click', async () => {
    await populateIssueSprintOptions();
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

const newIssueImagesInput = document.getElementById('newIssueImages');
const newIssueImagesLabel = document.getElementById('newIssueImagesLabel');
const newIssueSprintSelect = document.getElementById('newIssueSprintId');
const commentImageUploadInput = document.getElementById('commentImageUpload');
const commentFileNameLabel = document.getElementById('commentFileName');

if (newIssueImagesInput && newIssueImagesLabel) {
    newIssueImagesInput.addEventListener('change', () => {
        const files = newIssueImagesInput.files;
        if (!files || files.length === 0) {
            newIssueImagesLabel.textContent = 'No files selected';
            return;
        }
        newIssueImagesLabel.textContent = `${files.length} image${files.length === 1 ? '' : 's'} selected`;
    });
}

if (commentImageUploadInput && commentFileNameLabel) {
    commentImageUploadInput.addEventListener('change', () => {
        const files = commentImageUploadInput.files;
        if (!files || files.length === 0) {
            commentFileNameLabel.textContent = 'No files selected';
            return;
        }
        commentFileNameLabel.textContent = `${files.length} image${files.length === 1 ? '' : 's'} selected`;
    });
}

async function populateIssueSprintOptions() {
    if (!newIssueSprintSelect) {
        return;
    }

    try {
        const [sprintsResponse, activeSprintResponse] = await Promise.all([
            fetch('/api/sprints'),
            fetch('/api/sprints/active'),
        ]);

        if (!sprintsResponse.ok) {
            return;
        }

        const sprints = await sprintsResponse.json();
        const activeSprint = activeSprintResponse.ok ? await activeSprintResponse.json() : null;

        const existingValue = newIssueSprintSelect.value;
        newIssueSprintSelect.innerHTML = '<option value="">Auto (Active Sprint)</option>';
        sprints.forEach((sprint) => {
            const option = document.createElement('option');
            option.value = String(sprint.id);
            option.textContent = sprint.is_active ? `${sprint.name} (Active)` : sprint.name;
            newIssueSprintSelect.appendChild(option);
        });

        if (existingValue && newIssueSprintSelect.querySelector(`option[value="${existingValue}"]`)) {
            newIssueSprintSelect.value = existingValue;
        } else if (activeSprint) {
            newIssueSprintSelect.value = String(activeSprint.id);
        }
    } catch (error) {
        console.error('Error loading sprint options:', error);
    }
}

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatUploadMeta(image) {
    const uploadedAt = new Date(image.uploaded_at).toLocaleString();
    const source = image.source_type === 'comment'
        ? `Comment #${image.comment_id}`
        : image.source_type === 'description'
            ? 'Issue Description'
            : 'Issue Attachment';
    const by = image.uploaded_by ? ` by ${escapeHtml(image.uploaded_by)}` : '';
    return `Uploaded ${uploadedAt}${by} - ${source}`;
}

function renderInlineImages(images, cssClass = 'inline-image-list') {
    if (!images || images.length === 0) {
        return '';
    }

    return `
        <div class="${cssClass}">
            ${images.map((image) => `
                <figure class="inline-image-item">
                    <img src="/static/uploads/${encodeURIComponent(image.filename)}" alt="Attached image">
                    <figcaption>${formatUploadMeta(image)}</figcaption>
                </figure>
            `).join('')}
        </div>
    `;
}

function renderTextWithLineBreaks(text) {
    return escapeHtml(text).replace(/\n/g, '<br>');
}

async function uploadIssueImages(issueId, files, sourceType, commentId = null) {
    if (!files || files.length === 0) {
        return;
    }

    const uploads = Array.from(files).map((file) => {
        const params = new URLSearchParams({
            source_type: sourceType,
            uploaded_by: username,
        });
        if (commentId !== null) {
            params.set('comment_id', String(commentId));
        }
        const formData = new FormData();
        formData.append('file', file);
        return fetch(`/api/issues/${issueId}/images?${params.toString()}`, {
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
    
    const title = document.getElementById('newIssueTitle').value;
    const description = document.getElementById('newIssueDescription').value;
    const assignedTo = document.getElementById('newIssueAssignedTo').value || null;
    const sprintIdRaw = newIssueSprintSelect ? newIssueSprintSelect.value : '';
    const sprintId = sprintIdRaw ? Number(sprintIdRaw) : null;
    const branchInput = document.getElementById('newIssueBranch');
    const branch = branchInput && branchInput.value.trim() ? branchInput.value.trim() : null;
    const imageFiles = newIssueImagesInput ? newIssueImagesInput.files : null;
    
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
                assigned_to: assignedTo,
                sprint_id: sprintId,
                branch
            })
        });
        
        if (response.ok) {
            const createdIssue = await response.json();
            await uploadIssueImages(createdIssue.id, imageFiles, 'description');
            createIssueModal.classList.remove('show');
            document.getElementById('createIssueForm').reset();
            if (newIssueImagesLabel) {
                newIssueImagesLabel.textContent = 'No files selected';
            }
            await populateIssueSprintOptions();
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
        currentIssue = issue;
        
        // Populate issue details
        document.getElementById('issueId').textContent = `#${issue.id}`;
        document.getElementById('issueTitle').textContent = issue.title;
        const descriptionImages = (issue.images || []).filter((image) => image.source_type === 'description');
        document.getElementById('issueDescription').innerHTML = `
            <div class="issue-text">${renderTextWithLineBreaks(issue.description)}</div>
            ${renderInlineImages(descriptionImages)}
        `;
        document.getElementById('issueCreated').textContent = new Date(issue.created_at).toLocaleString();
        document.getElementById('issueCreatedBy').textContent = issue.created_by;
        document.getElementById('issueAssignedTo').textContent = issue.assigned_to || 'Unassigned';
        document.getElementById('issueBranch').innerHTML = renderBranchDisplay(issue.branch);
        
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
                <span class="comment-author">${escapeHtml(comment.username)}</span>
                <span class="comment-date">${new Date(comment.created_at).toLocaleString()}</span>
            </div>
            <div class="comment-content">${renderTextWithLineBreaks(comment.content)}</div>
            ${renderInlineImages(comment.images || [], 'inline-image-list comment-image-list')}
        </div>
    `).join('');
}

// Add comment
document.getElementById('addCommentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const content = document.getElementById('commentContent').value;
    const commentImageFiles = commentImageUploadInput ? commentImageUploadInput.files : null;
    
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
            const createdComment = await response.json();
            await uploadIssueImages(issueId, commentImageFiles, 'comment', createdComment.id);
            document.getElementById('commentContent').value = '';
            if (commentImageUploadInput) {
                commentImageUploadInput.value = '';
            }
            if (commentFileNameLabel) {
                commentFileNameLabel.textContent = 'No files selected';
            }
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
    
    const sortedImages = [...images].sort((a, b) => new Date(b.uploaded_at) - new Date(a.uploaded_at));

    imagesContainer.innerHTML = sortedImages.map(image => `
        <div class="image-item" data-image-id="${image.id}">
            <img src="/static/uploads/${encodeURIComponent(image.filename)}" alt="Issue image">
            <div class="image-meta">
                <div class="image-meta-line">${formatUploadMeta(image)}</div>
            </div>
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
    
    descEdit.value = currentIssue ? currentIssue.description : '';
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
            if (currentIssue) {
                currentIssue.description = newDescription;
            }
            const descriptionImages = currentIssue
                ? (currentIssue.images || []).filter((image) => image.source_type === 'description')
                : [];
            document.getElementById('issueDescription').innerHTML = `
                <div class="issue-text">${renderTextWithLineBreaks(newDescription)}</div>
                ${renderInlineImages(descriptionImages)}
            `;
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

document.getElementById('editBranchBtn').addEventListener('click', () => {
    const branchDisplay = document.getElementById('issueBranch');
    const branchEdit = document.getElementById('issueBranchEdit');
    const editBtn = document.getElementById('editBranchBtn');
    const controls = document.getElementById('branchEditControls');

    branchEdit.value = currentIssue?.branch || '';
    branchDisplay.style.display = 'none';
    branchEdit.style.display = 'block';
    controls.style.display = 'flex';
    editBtn.style.display = 'none';
    branchEdit.focus();
});

document.getElementById('saveBranchBtn').addEventListener('click', async () => {
    const branchEdit = document.getElementById('issueBranchEdit');
    const newBranch = branchEdit.value.trim();

    try {
        const response = await fetch(`/api/issues/${issueId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ branch: newBranch || null })
        });

        if (response.ok) {
            const updatedIssue = await response.json();
            currentIssue = updatedIssue;
            document.getElementById('issueBranch').innerHTML = renderBranchDisplay(updatedIssue.branch);
            cancelBranchEdit();
        } else {
            alert('Failed to update branch');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('An error occurred');
    }
});

document.getElementById('cancelBranchBtn').addEventListener('click', cancelBranchEdit);

function cancelBranchEdit() {
    const branchDisplay = document.getElementById('issueBranch');
    const branchEdit = document.getElementById('issueBranchEdit');
    const editBtn = document.getElementById('editBranchBtn');
    const controls = document.getElementById('branchEditControls');

    branchDisplay.style.display = 'block';
    branchEdit.style.display = 'none';
    controls.style.display = 'none';
    editBtn.style.display = 'inline-block';
}

document.getElementById('deleteIssueBtn').addEventListener('click', async () => {
    if (!currentIssue) {
        return;
    }

    const confirmed = confirm(`Delete issue #${currentIssue.id} permanently? This will remove its comments and images too.`);
    if (!confirmed) {
        return;
    }

    try {
        const response = await fetch(`/api/issues/${issueId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            window.location.href = '/static/backlog.html';
        } else {
            const error = await response.json().catch(() => ({}));
            alert(error.detail || 'Failed to delete issue');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('An error occurred');
    }
});

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
        const response = await fetch(`/api/issues/${issueId}/images?source_type=issue&uploaded_by=${encodeURIComponent(username)}`, {
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
