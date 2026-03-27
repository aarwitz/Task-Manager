const username = localStorage.getItem('username');
if (!username) {
    window.location.href = '/static/index.html';
}

const statusMeta = {
    to_do: { title: 'Queued', icon: '◎' },
    in_progress: { title: 'Running', icon: '▶' },
    in_review: { title: 'Review', icon: '◌' },
    done: { title: 'Shipped', icon: '✓' }
};

const state = {
    users: [],
    sprints: [],
    sprint: null,
    issues: [],
    selectedIssue: null,
    refreshTimer: null,
    sprintId: new URLSearchParams(window.location.search).get('sprint_id')
};

const els = {
    currentUser: document.getElementById('currentUser'),
    sprintLabel: document.getElementById('sprintLabel'),
    lastSync: document.getElementById('lastSync'),
    heroTitle: document.getElementById('heroTitle'),
    heroSubtitle: document.getElementById('heroSubtitle'),
    statTotal: document.getElementById('statTotal'),
    statRunning: document.getElementById('statRunning'),
    statReview: document.getElementById('statReview'),
    statDone: document.getElementById('statDone'),
    boardColumns: document.getElementById('boardColumns'),
    agentsGrid: document.getElementById('agentsGrid'),
    activityStream: document.getElementById('activityStream'),
    detailDrawer: document.getElementById('detailDrawer'),
    drawerTitle: document.getElementById('drawerTitle'),
    drawerMeta: document.getElementById('drawerMeta'),
    drawerDescription: document.getElementById('drawerDescription'),
    drawerStatus: document.getElementById('drawerStatus'),
    drawerAssignedTo: document.getElementById('drawerAssignedTo'),
    drawerComments: document.getElementById('drawerComments'),
    legacyIssueLink: document.getElementById('legacyIssueLink'),
    createIssueModal: document.getElementById('createIssueModal'),
    createIssueBtn: document.getElementById('createIssueBtn'),
    closeModalBtn: document.getElementById('closeModalBtn'),
    cancelModalBtn: document.getElementById('cancelModalBtn'),
    createIssueForm: document.getElementById('createIssueForm'),
    issueTitle: document.getElementById('issueTitle'),
    issueDescription: document.getElementById('issueDescription'),
    issueAssignedTo: document.getElementById('issueAssignedTo'),
    logoutBtn: document.getElementById('logoutBtn'),
    closeDrawerBtn: document.getElementById('closeDrawerBtn'),
    saveIssueBtn: document.getElementById('saveIssueBtn')
};

els.currentUser.textContent = username;

els.logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('username');
    window.location.href = '/static/index.html';
});

els.createIssueBtn.addEventListener('click', () => openModal(true));
els.closeModalBtn.addEventListener('click', () => openModal(false));
els.cancelModalBtn.addEventListener('click', () => openModal(false));
els.closeDrawerBtn.addEventListener('click', closeDrawer);
els.saveIssueBtn.addEventListener('click', saveSelectedIssue);
els.createIssueForm.addEventListener('submit', createIssue);
window.addEventListener('click', (e) => {
    if (e.target === els.createIssueModal) openModal(false);
});

function openModal(show) {
    els.createIssueModal.classList.toggle('hidden', !show);
    if (show) els.issueTitle.focus();
}

function closeDrawer() {
    state.selectedIssue = null;
    els.detailDrawer.classList.add('hidden');
}

function api(path, options = {}) {
    return fetch(path, options).then(async (res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const type = res.headers.get('content-type') || '';
        return type.includes('application/json') ? res.json() : res.text();
    });
}

async function bootstrap() {
    await loadUsers();
    await syncFactory();
    state.refreshTimer = setInterval(syncFactory, 5000);
}

async function loadUsers() {
    state.users = await api('/api/users');
    const options = ['<option value="">Unassigned</option>']
        .concat(state.users.map(user => `<option value="${escapeHtml(user.username)}">${escapeHtml(user.username)}</option>`));
    els.issueAssignedTo.innerHTML = options.join('');
    els.drawerAssignedTo.innerHTML = options.join('');
}

async function resolveSprint() {
    if (state.sprintId) {
        try {
            return await api(`/api/sprints/${state.sprintId}`);
        } catch (err) {
            console.warn('Requested sprint unavailable, falling back to active sprint', err);
        }
    }

    try {
        return await api('/api/sprints/active');
    } catch (_) {
        const all = await api('/api/sprints');
        return all[0] || null;
    }
}

async function syncFactory() {
    try {
        const sprint = await resolveSprint();
        state.sprint = sprint;
        if (!sprint) {
            renderEmptyState();
            return;
        }
        state.sprintId = sprint.id;
        state.issues = await api(`/api/issues?sprint_id=${sprint.id}`);
        renderAll();
    } catch (error) {
        console.error('Factory sync failed', error);
        els.heroTitle.textContent = 'Factory sync failed';
        els.heroSubtitle.textContent = 'The backend is online, but this view could not refresh. Check service logs if this persists.';
    }
}

function renderEmptyState() {
    els.sprintLabel.textContent = 'No sprint available';
    els.heroTitle.textContent = 'No active factory workload';
    els.heroSubtitle.textContent = 'Create a sprint or pass ?sprint_id=... to focus the control panel on a planned workstream.';
    els.boardColumns.innerHTML = '<div class="empty-column">No sprint detected. Create or activate one from the legacy backlog.</div>';
    els.agentsGrid.innerHTML = '';
    els.activityStream.innerHTML = '';
    els.lastSync.textContent = new Date().toLocaleTimeString();
}

function renderAll() {
    const sprint = state.sprint;
    const issues = state.issues;
    const grouped = {
        to_do: issues.filter(issue => issue.status === 'to_do'),
        in_progress: issues.filter(issue => issue.status === 'in_progress'),
        in_review: issues.filter(issue => issue.status === 'in_review'),
        done: issues.filter(issue => issue.status === 'done')
    };

    els.sprintLabel.textContent = sprint.name + (sprint.is_active ? ' · active' : ' · planned');
    els.heroTitle.textContent = sprint.name;
    els.heroSubtitle.textContent = `${issues.length} tasks under management across human operators, autonomous agents, and review/shipping stages.`;
    els.lastSync.textContent = new Date().toLocaleTimeString();

    els.statTotal.textContent = String(issues.length);
    els.statRunning.textContent = String(grouped.in_progress.length);
    els.statReview.textContent = String(grouped.in_review.length);
    els.statDone.textContent = String(grouped.done.length);

    renderBoard(grouped);
    renderAgents(issues);
    renderActivity(issues);

    if (state.selectedIssue) {
        const refreshed = issues.find(issue => issue.id === state.selectedIssue.id);
        if (refreshed) openDrawer(refreshed);
    }
}

function renderBoard(grouped) {
    els.boardColumns.innerHTML = Object.entries(grouped).map(([status, issues]) => {
        const meta = statusMeta[status];
        const cards = issues.length
            ? issues.map(renderCard).join('')
            : '<div class="empty-column">No tasks in this stage.</div>';

        return `
            <section class="pipeline-column" data-status="${status}">
                <div class="column-top">
                    <h4>${meta.icon} ${meta.title}</h4>
                    <span class="column-count">${issues.length}</span>
                </div>
                <div class="column-list">${cards}</div>
            </section>
        `;
    }).join('');

    document.querySelectorAll('.factory-card').forEach(card => {
        card.addEventListener('click', () => {
            const issue = state.issues.find(item => item.id === Number(card.dataset.issueId));
            if (issue) openDrawer(issue);
        });
    });
}

function renderCard(issue) {
    const owner = issue.assigned_to || 'Unassigned';
    const ownerClass = classifyActor(owner);
    const statusLabel = statusMeta[issue.status].title;
    return `
        <article class="factory-card" data-issue-id="${issue.id}">
            <div class="card-tags">
                <span class="chip ${ownerClass}">${escapeHtml(owner)}</span>
                <span class="chip status">${statusLabel}</span>
            </div>
            <h4>${escapeHtml(issue.title)}</h4>
            <div class="card-footer">
                <span class="card-id">#${issue.id}</span>
                <span class="card-time">${relativeTime(issue.created_at)}</span>
            </div>
        </article>
    `;
}

function renderAgents(issues) {
    const actors = new Map();
    issues.forEach(issue => {
        const name = issue.assigned_to || 'Unassigned';
        if (!actors.has(name)) {
            actors.set(name, { name, role: classifyActor(name), active: 0, total: 0 });
        }
        const actor = actors.get(name);
        actor.total += 1;
        if (issue.status === 'in_progress') actor.active += 1;
    });

    const sorted = Array.from(actors.values()).sort((a, b) => (b.active - a.active) || (b.total - a.total));
    els.agentsGrid.innerHTML = sorted.map(actor => `
        <article class="agent-card">
            <div class="agent-avatar ${actor.role}">${escapeHtml(initials(actor.name))}</div>
            <div>
                <strong>${escapeHtml(actor.name)}</strong>
                <div class="agent-role">${actor.role === 'human' ? 'Human operator' : actor.role === 'agent' ? 'Autonomous agent' : 'Unassigned capacity'}</div>
            </div>
            <div class="agent-metrics">
                <strong>${actor.active}</strong>
                <span>${actor.total} total</span>
            </div>
        </article>
    `).join('');
}

function renderActivity(issues) {
    const recent = [...issues].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 10);
    els.activityStream.innerHTML = recent.map(issue => {
        const owner = issue.assigned_to || 'Unassigned';
        const action = issue.status === 'done'
            ? 'completed a work unit'
            : issue.status === 'in_review'
                ? 'pushed work into review'
                : issue.status === 'in_progress'
                    ? 'is actively executing'
                    : 'queued a new task';
        return `
            <article class="activity-item">
                <div class="activity-icon">${statusMeta[issue.status].icon}</div>
                <div class="activity-copy">
                    <strong>${escapeHtml(issue.title)}</strong>
                    <p>${escapeHtml(owner)} ${action}</p>
                    <span>#${issue.id} · ${relativeTime(issue.created_at)}</span>
                </div>
            </article>
        `;
    }).join('');
}

function openDrawer(issue) {
    state.selectedIssue = issue;
    els.drawerTitle.textContent = issue.title;
    els.drawerMeta.textContent = `#${issue.id} · created by ${issue.created_by} · ${relativeTime(issue.created_at)}`;
    els.drawerDescription.textContent = issue.description || 'No description provided.';
    els.drawerStatus.value = issue.status;
    els.drawerAssignedTo.value = issue.assigned_to || '';
    els.legacyIssueLink.href = `/static/issue.html?id=${issue.id}`;
    els.drawerComments.innerHTML = issue.comments?.length
        ? issue.comments.map(comment => `
            <article class="comment-item">
                <strong>${escapeHtml(comment.username)}</strong>
                <p>${escapeHtml(comment.content)}</p>
                <span>${new Date(comment.created_at).toLocaleString()}</span>
            </article>
        `).join('')
        : '<div class="empty-column">No comments yet.</div>';
    els.detailDrawer.classList.remove('hidden');
}

async function saveSelectedIssue() {
    if (!state.selectedIssue) return;
    const payload = {
        status: els.drawerStatus.value,
        assigned_to: els.drawerAssignedTo.value || null
    };
    await api(`/api/issues/${state.selectedIssue.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    await syncFactory();
}

async function createIssue(e) {
    e.preventDefault();
    if (!state.sprint) return;
    const issue = await api('/api/issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            title: els.issueTitle.value.trim(),
            description: els.issueDescription.value.trim(),
            created_by: username,
            assigned_to: els.issueAssignedTo.value || null
        })
    });

    await api(`/api/issues/${issue.id}/assign-to-sprint?sprint_id=${state.sprint.id}`, { method: 'POST' });
    els.createIssueForm.reset();
    openModal(false);
    await syncFactory();
}

function classifyActor(name) {
    const lowered = (name || '').toLowerCase();
    if (!name || lowered === 'unassigned') return 'unassigned';
    if (['aaron', 'taylor', 'luis', 'human'].some(token => lowered.includes(token))) return 'human';
    if (['claw', 'agent', 'bot', 'subagent', 'codex'].some(token => lowered.includes(token))) return 'agent';
    return 'human';
}

function initials(name) {
    return (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0].toUpperCase()).join('');
}

function relativeTime(value) {
    const time = new Date(value).getTime();
    const diff = Date.now() - time;
    const mins = Math.round(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    return `${days}d ago`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text ?? '';
    return div.innerHTML;
}

bootstrap();
