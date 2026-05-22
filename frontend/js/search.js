const username = localStorage.getItem('username');
if (!username) {
    window.location.href = '/static/index.html';
}

document.getElementById('currentUser').textContent = username;
const { fetchJson, fetchSprints, renderIssueCard, findDuplicateCandidates } = window.TM_SHARED;
let searchTimeout = null;
let searchSprints = [];
let searchSprintMap = new Map();

const createIssueModal = document.getElementById('createIssueModal');
const createIssueBtn = document.getElementById('createIssueBtn');
const closeModal = document.querySelector('#createIssueModal .close');
const cancelBtn = document.querySelector('#createIssueModal .cancel-btn');

document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('username');
    window.location.href = '/static/index.html';
});

createIssueBtn.addEventListener('click', () => createIssueModal.classList.add('show'));
closeModal.addEventListener('click', () => createIssueModal.classList.remove('show'));
cancelBtn.addEventListener('click', () => createIssueModal.classList.remove('show'));
window.addEventListener('click', (e) => {
    if (e.target === createIssueModal) createIssueModal.classList.remove('show');
});

document.getElementById('createIssueForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
        title: document.getElementById('issueTitle').value,
        description: document.getElementById('issueDescription').value,
        created_by: username,
        assigned_to: document.getElementById('issueAssignedTo').value || null,
        acceptance_criteria: document.getElementById('issueAcceptanceCriteria')?.value.trim() || null,
        story_points: document.getElementById('issueStoryPoints')?.value ? Number(document.getElementById('issueStoryPoints').value) : null,
        blocked_reason: document.getElementById('issueBlockedReason')?.value.trim() || null
    };
    try {
        await fetchJson('/api/issues', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        createIssueModal.classList.remove('show');
        document.getElementById('createIssueForm').reset();
        doSearch();
    } catch (error) {
        console.error('Error:', error);
        alert(error.message || 'An error occurred');
    }
});

async function populateFilters() {
    try {
        const { sprints, sprintMap } = await fetchSprints();
        searchSprints = sprints;
        searchSprintMap = sprintMap;
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

    try {
        const users = await fetchJson('/api/users');
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

async function doSearch() {
    const q = document.getElementById('searchInput').value.trim();
    const searchIn = document.getElementById('filterSearchIn').value;
    const status = document.getElementById('filterStatus').value;
    const sprintVal = document.getElementById('filterSprint').value;
    const createdBy = document.getElementById('filterUser').value;
    const assignedTo = document.getElementById('filterAssignedTo').value;
    const dateFrom = document.getElementById('filterDateFrom').value;
    const dateTo = document.getElementById('filterDateTo').value;
    const minPoints = document.getElementById('filterMinPoints').value;
    const maxPoints = document.getElementById('filterMaxPoints').value;
    const staleDays = document.getElementById('filterStaleDays').value;
    const blockedOnly = document.getElementById('filterBlockedOnly').checked;
    const needsReview = document.getElementById('filterNeedsReview').checked;

    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (searchIn !== 'all') params.set('search_in', searchIn);
    if (status) params.set('status', status);
    if (sprintVal === 'backlog') params.set('in_backlog', 'true');
    else if (sprintVal) params.set('sprint_id', sprintVal);
    if (createdBy) params.set('created_by', createdBy);
    if (assignedTo) params.set('assigned_to', assignedTo);
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    if (minPoints) params.set('min_story_points', minPoints);
    if (maxPoints) params.set('max_story_points', maxPoints);
    if (staleDays) params.set('stale_days', staleDays);
    if (blockedOnly) params.set('blocked_only', 'true');
    if (needsReview) params.set('needs_review', 'true');

    try {
        const issues = await fetchJson(`/api/issues/search?${params.toString()}`);
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
    const duplicateMap = findDuplicateCandidates(issues);
    container.innerHTML = issues.map(issue => renderIssueCard(issue, { sprints: searchSprints, sprintMap: searchSprintMap, duplicateMap, viewHandler: 'viewIssue' })).join('');
}

function viewIssue(issueId) {
    window.location.href = `/static/issue.html?id=${issueId}`;
}
window.viewIssue = viewIssue;

document.getElementById('searchInput').addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(doSearch, 300);
});
document.getElementById('searchInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        clearTimeout(searchTimeout);
        doSearch();
    }
});
document.getElementById('searchBtn').addEventListener('click', doSearch);
['filterSearchIn', 'filterStatus', 'filterSprint', 'filterUser', 'filterAssignedTo', 'filterDateFrom', 'filterDateTo', 'filterMinPoints', 'filterMaxPoints', 'filterStaleDays', 'filterBlockedOnly', 'filterNeedsReview'].forEach(id => {
    const element = document.getElementById(id);
    const eventName = element?.type === 'checkbox' ? 'change' : 'change';
    element?.addEventListener(eventName, doSearch);
});
document.getElementById('clearFiltersBtn').addEventListener('click', () => {
    document.getElementById('searchInput').value = '';
    document.getElementById('filterSearchIn').value = 'all';
    document.getElementById('filterStatus').value = '';
    document.getElementById('filterSprint').value = '';
    document.getElementById('filterUser').value = '';
    document.getElementById('filterAssignedTo').value = '';
    document.getElementById('filterDateFrom').value = '';
    document.getElementById('filterDateTo').value = '';
    document.getElementById('filterMinPoints').value = '';
    document.getElementById('filterMaxPoints').value = '';
    document.getElementById('filterStaleDays').value = '';
    document.getElementById('filterBlockedOnly').checked = false;
    document.getElementById('filterNeedsReview').checked = false;
    doSearch();
});

populateFilters().then(doSearch);
