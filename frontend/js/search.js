// Check if user is logged in
const username = localStorage.getItem('username');
if (!username) {
    window.location.href = '/static/index.html';
}

document.getElementById('currentUser').textContent = username;

// Logout
document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('username');
    window.location.href = '/static/index.html';
});

// Create Issue Modal
const createIssueModal = document.getElementById('createIssueModal');
const createIssueBtn = document.getElementById('createIssueBtn');
const closeModal = document.querySelector('#createIssueModal .close');
const cancelBtn = document.querySelector('#createIssueModal .cancel-btn');

createIssueBtn.addEventListener('click', () => createIssueModal.classList.add('show'));
closeModal.addEventListener('click', () => createIssueModal.classList.remove('show'));
cancelBtn.addEventListener('click', () => createIssueModal.classList.remove('show'));
window.addEventListener('click', (e) => {
    if (e.target === createIssueModal) createIssueModal.classList.remove('show');
});

document.getElementById('createIssueForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('issueTitle').value;
    const description = document.getElementById('issueDescription').value;
    const assignedTo = document.getElementById('issueAssignedTo').value || null;
    try {
        const response = await fetch('/api/issues', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, description, created_by: username, assigned_to: assignedTo })
        });
        if (response.ok) {
            createIssueModal.classList.remove('show');
            document.getElementById('createIssueForm').reset();
            doSearch();
        } else {
            alert('Failed to create issue');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('An error occurred');
    }
});

// ——— Populate filter dropdowns ———

async function populateFilters() {
    // Sprints
    try {
        const resp = await fetch('/api/sprints');
        const sprints = await resp.json();
        const sprintSelect = document.getElementById('filterSprint');
        sprints.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.id;
            opt.textContent = `${s.name}${s.is_active ? ' (Active)' : ''}`;
            sprintSelect.appendChild(opt);
        });
    } catch (e) {
        console.error('Failed to load sprints', e);
    }

    // Users
    try {
        const resp = await fetch('/api/users');
        const users = await resp.json();
        const userSelect = document.getElementById('filterUser');
        const assignedSelect = document.getElementById('filterAssignedTo');
        users.forEach(u => {
            const opt = document.createElement('option');
            opt.value = u.username;
            opt.textContent = u.username;
            userSelect.appendChild(opt);

            const opt2 = document.createElement('option');
            opt2.value = u.username;
            opt2.textContent = u.username;
            assignedSelect.appendChild(opt2);
        });
    } catch (e) {
        console.error('Failed to load users', e);
    }
}

// ——— Search ———

let searchTimeout = null;

async function doSearch() {
    const q = document.getElementById('searchInput').value.trim();
    const searchIn = document.getElementById('filterSearchIn').value;
    const status = document.getElementById('filterStatus').value;
    const sprintVal = document.getElementById('filterSprint').value;
    const createdBy = document.getElementById('filterUser').value;
    const assignedTo = document.getElementById('filterAssignedTo').value;
    const dateFrom = document.getElementById('filterDateFrom').value;
    const dateTo = document.getElementById('filterDateTo').value;

    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (searchIn !== 'all') params.set('search_in', searchIn);
    if (status) params.set('status', status);
    if (sprintVal === 'backlog') {
        params.set('in_backlog', 'true');
    } else if (sprintVal) {
        params.set('sprint_id', sprintVal);
    }
    if (createdBy) params.set('created_by', createdBy);
    if (assignedTo) params.set('assigned_to', assignedTo);
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);

    try {
        const resp = await fetch(`/api/issues/search?${params.toString()}`);
        const issues = await resp.json();
        renderResults(issues, q);
    } catch (e) {
        console.error('Search failed', e);
    }
}

function renderResults(issues, query) {
    const container = document.getElementById('searchResults');
    const countEl = document.getElementById('resultCount');

    if (issues.length === 0) {
        countEl.textContent = 'No results found';
        container.innerHTML = '<div class="no-data"><h3>No matching issues</h3><p>Try adjusting your search or filters.</p></div>';
        return;
    }

    countEl.textContent = `${issues.length} result${issues.length !== 1 ? 's' : ''}`;

    container.innerHTML = issues.map(issue => {
        // Highlight matching text
        const title = highlightMatch(escapeHtml(issue.title), query);
        const descSnippet = getSnippet(issue.description, query);
        const commentMatch = getCommentMatch(issue.comments, query);

        return `
            <div class="issue-card" onclick="viewIssue(${issue.id})">
                <div class="issue-card-header">
                    <div>
                        <div class="issue-id-badge">#${issue.id}</div>
                        <div class="issue-card-title">${title}</div>
                    </div>
                    <span class="status-badge ${issue.status}">${formatStatus(issue.status)}</span>
                </div>
                ${descSnippet ? `<div class="search-snippet">${descSnippet}</div>` : ''}
                ${commentMatch ? `<div class="search-snippet comment-match"><strong>Comment:</strong> ${commentMatch}</div>` : ''}
                <div class="issue-card-meta">
                    <span>Created: ${new Date(issue.created_at).toLocaleDateString()}</span>
                    <span>By: ${issue.created_by}</span>
                    <span>Assigned: ${issue.assigned_to || 'Unassigned'}</span>
                    <span>${issue.sprint_id ? 'In Sprint' : 'Backlog'}</span>
                    ${issue.comments.length ? `<span>${issue.comments.length} comment${issue.comments.length !== 1 ? 's' : ''}</span>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function highlightMatch(text, query) {
    if (!query) return text;
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>');
}

function getSnippet(description, query) {
    if (!description) return '';
    const safe = escapeHtml(description);
    if (!query) {
        return safe.length > 150 ? safe.substring(0, 150) + '...' : safe;
    }
    const idx = description.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) {
        return safe.length > 150 ? safe.substring(0, 150) + '...' : safe;
    }
    const start = Math.max(0, idx - 60);
    const end = Math.min(description.length, idx + query.length + 60);
    let snippet = (start > 0 ? '...' : '') +
                  escapeHtml(description.substring(start, end)) +
                  (end < description.length ? '...' : '');
    return highlightMatch(snippet, query);
}

function getCommentMatch(comments, query) {
    if (!query || !comments || comments.length === 0) return '';
    for (const c of comments) {
        const idx = c.content.toLowerCase().indexOf(query.toLowerCase());
        if (idx !== -1) {
            const start = Math.max(0, idx - 40);
            const end = Math.min(c.content.length, idx + query.length + 40);
            let snippet = (start > 0 ? '...' : '') +
                          escapeHtml(c.content.substring(start, end)) +
                          (end < c.content.length ? '...' : '');
            return highlightMatch(snippet, query);
        }
    }
    return '';
}

function formatStatus(status) {
    return status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function viewIssue(issueId) {
    window.location.href = `/static/issue.html?id=${issueId}`;
}

// ——— Event listeners ———

// Live search on typing (debounced 300ms)
document.getElementById('searchInput').addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(doSearch, 300);
});

// Enter key
document.getElementById('searchInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        clearTimeout(searchTimeout);
        doSearch();
    }
});

// Search button
document.getElementById('searchBtn').addEventListener('click', doSearch);

// Filters trigger immediate search
['filterSearchIn', 'filterStatus', 'filterSprint', 'filterUser', 'filterAssignedTo', 'filterDateFrom', 'filterDateTo'].forEach(id => {
    document.getElementById(id).addEventListener('change', doSearch);
});

// Clear filters
document.getElementById('clearFiltersBtn').addEventListener('click', () => {
    document.getElementById('searchInput').value = '';
    document.getElementById('filterSearchIn').value = 'all';
    document.getElementById('filterStatus').value = '';
    document.getElementById('filterSprint').value = '';
    document.getElementById('filterUser').value = '';
    document.getElementById('filterAssignedTo').value = '';
    document.getElementById('filterDateFrom').value = '';
    document.getElementById('filterDateTo').value = '';
    doSearch();
});

// ——— Init ———
populateFilters();
doSearch(); // show all issues initially
