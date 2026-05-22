window.TM_SHARED = (() => {
  const ASSIGNEE_OPTIONS = ['', 'Dwight', 'Jerry', 'Resi', 'Druck', 'Aaron', 'Taylor'];
  const STATUS_OPTIONS = [
    { value: 'to_do', label: 'To Do' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'in_review', label: 'In Review' },
    { value: 'blocked', label: 'Blocked' },
    { value: 'done', label: 'Done' }
  ];
  const PRIORITY_OPTIONS = [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
    { value: 'critical', label: 'Critical' }
  ];

  function escapeHtml(text) {
    return String(text ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatStatus(status) {
    return String(status || '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  function formatPriority(priority) {
    return String(priority || 'medium').replace(/\b\w/g, l => l.toUpperCase());
  }

  function isBlocked(issue) {
    return issue.status === 'blocked' || Boolean(issue.blocked_reason);
  }

  function getUpdatedAt(issue) {
    return issue.updated_at || issue.created_at;
  }

  function getDaysStale(issue) {
    const updatedAt = new Date(getUpdatedAt(issue));
    if (Number.isNaN(updatedAt.getTime())) return 0;
    return Math.floor((Date.now() - updatedAt.getTime()) / 86400000);
  }

  function sprintLabel(issue, sprintMap) {
    if (!issue.sprint_id) return 'Backlog';
    return sprintMap?.get?.(issue.sprint_id) || `Sprint ${issue.sprint_id}`;
  }

  function branchLabel(issue) {
    return issue.branch ? `Branch: ${escapeHtml(issue.branch)}` : 'No branch';
  }

  function activitySummary(issue) {
    const activity = issue.activity_events?.[0];
    if (!activity) return 'No recent activity';
    const actor = activity.actor ? `${escapeHtml(activity.actor)} ` : '';
    if (activity.event_type === 'created') return `${actor}created this issue`;
    if (activity.event_type === 'comment_added') return `${actor}commented`;
    if (activity.field_name) return `${actor}updated ${escapeHtml(activity.field_name.replace(/_/g, ' '))}`;
    return `${actor}updated this issue`;
  }

  function buildOptions(options, selectedValue, emptyLabel = null) {
    const values = [];
    if (emptyLabel !== null) {
      values.push(`<option value="">${escapeHtml(emptyLabel)}</option>`);
    }
    options.forEach((option) => {
      const value = typeof option === 'string' ? option : option.value;
      const label = typeof option === 'string' ? option : option.label;
      const selected = String(selectedValue ?? '') === String(value) ? ' selected' : '';
      values.push(`<option value="${escapeHtml(value)}"${selected}>${escapeHtml(label)}</option>`);
    });
    return values.join('');
  }

  async function fetchJson(url, options = {}) {
    const response = await fetch(url, options);
    const contentType = response.headers.get('content-type') || '';
    const body = contentType.includes('application/json') ? await response.json() : await response.text();
    if (!response.ok) {
      throw new Error(body?.detail || body || `Request failed: ${response.status}`);
    }
    return body;
  }

  async function patchIssue(issueId, fields) {
    return fetchJson(`/api/issues/${issueId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields)
    });
  }

  async function fetchSprints() {
    const sprints = await fetchJson('/api/sprints');
    const sprintMap = new Map(sprints.map((s) => [s.id, s.is_active ? `${s.name} (Active)` : s.name]));
    return { sprints, sprintMap };
  }

  function buildSprintSelectOptions(sprints, selectedSprintId, includeBacklog = true, includeAuto = false) {
    const options = [];
    if (includeAuto) options.push('<option value="">Auto (Active Sprint)</option>');
    else if (includeBacklog) options.push('<option value="">Backlog</option>');
    sprints.forEach((sprint) => {
      const selected = String(selectedSprintId ?? '') === String(sprint.id) ? ' selected' : '';
      const label = sprint.is_active ? `${sprint.name} (Active)` : sprint.name;
      options.push(`<option value="${sprint.id}"${selected}>${escapeHtml(label)}</option>`);
    });
    return options.join('');
  }

  function renderIssueCard(issue, context = {}) {
    const sprintOptions = buildSprintSelectOptions(context.sprints || [], issue.sprint_id, true, false);
    const statusOptions = buildOptions(STATUS_OPTIONS, issue.status);
    const assigneeOptions = buildOptions(ASSIGNEE_OPTIONS.filter(Boolean).map(v => ({ value: v, label: v })), issue.assigned_to, 'Unassigned');
    const priority = formatPriority(issue.priority || 'medium');
    const staleDays = getDaysStale(issue);
    const staleLabel = staleDays >= 3 ? `Stale ${staleDays}d` : `Updated ${new Date(getUpdatedAt(issue)).toLocaleDateString()}`;
    const blockedPill = isBlocked(issue) ? `<span class="issue-pill blocked">Blocked${issue.blocked_reason ? `: ${escapeHtml(issue.blocked_reason)}` : ''}</span>` : '';
    const reviewPill = issue.status === 'in_review' ? '<span class="issue-pill review">Needs review</span>' : '';
    const pointsPill = issue.story_points != null ? `<span class="issue-pill">${issue.story_points} pts</span>` : '<span class="issue-pill muted">No points</span>';
    const duplicates = context.duplicateMap?.get?.(issue.id) || [];
    const dupPill = duplicates.length ? `<span class="issue-pill duplicate">Possible dupes: ${duplicates.map(d => `#${d.id}`).join(', ')}</span>` : '';

    return `
      <div class="issue-card issue-card-rich" data-issue-id="${issue.id}" onclick="${context.viewHandler || 'viewIssue'}(${issue.id})">
        <div class="issue-card-header">
          <div>
            <div class="issue-id-badge">#${issue.id}</div>
            <div class="issue-card-title">${escapeHtml(issue.title)}</div>
          </div>
          <span class="status-badge ${escapeHtml(issue.status)}">${formatStatus(issue.status)}</span>
        </div>
        <div class="issue-card-description">${escapeHtml(issue.description || '').slice(0, 220)}${(issue.description || '').length > 220 ? '…' : ''}</div>
        <div class="issue-pills">${pointsPill}<span class="issue-pill priority-${escapeHtml(issue.priority || 'medium')}">${priority}</span>${reviewPill}${blockedPill}${dupPill}<span class="issue-pill muted">${escapeHtml(staleLabel)}</span></div>
        <div class="issue-card-meta">
          <span>Created: ${new Date(issue.created_at).toLocaleDateString()}</span>
          <span>By: ${escapeHtml(issue.created_by)}</span>
          <span>${escapeHtml(sprintLabel(issue, context.sprintMap))}</span>
          <span>${branchLabel(issue)}</span>
        </div>
        <div class="inline-edit-grid" onclick="event.stopPropagation()">
          <label>Status<select class="select issue-inline-control" data-field="status" data-issue-id="${issue.id}">${statusOptions}</select></label>
          <label>Sprint<select class="select issue-inline-control" data-field="sprint_id" data-issue-id="${issue.id}">${sprintOptions}</select></label>
          <label>Assignee<select class="select issue-inline-control" data-field="assigned_to" data-issue-id="${issue.id}">${assigneeOptions}</select></label>
        </div>
        <div class="issue-card-meta issue-card-footer">
          <span>${activitySummary(issue)}</span>
          <span class="inline-save-status" data-save-status="${issue.id}"></span>
        </div>
      </div>
    `;
  }

  function findDuplicateCandidates(issues) {
    const normalized = issues.map((issue) => ({
      issue,
      tokens: new Set(String(issue.title || '').toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 2))
    }));
    const duplicateMap = new Map();
    normalized.forEach(({ issue, tokens }, idx) => {
      const matches = [];
      normalized.forEach((other, otherIdx) => {
        if (idx === otherIdx) return;
        let overlap = 0;
        tokens.forEach((token) => { if (other.tokens.has(token)) overlap += 1; });
        if (overlap >= 3) matches.push({ id: other.issue.id, title: other.issue.title });
      });
      if (matches.length) duplicateMap.set(issue.id, matches.slice(0, 3));
    });
    return duplicateMap;
  }

  function attachInlineIssueEditors({ issues, onUpdated }) {
    document.querySelectorAll('.issue-inline-control').forEach((selectEl) => {
      selectEl.addEventListener('change', async (event) => {
        const issueId = Number(event.target.dataset.issueId);
        const field = event.target.dataset.field;
        const issue = issues.find((item) => item.id === issueId);
        const statusEl = document.querySelector(`[data-save-status="${issueId}"]`);
        if (!issue) return;
        const previousValue = field === 'sprint_id'
          ? (issue.sprint_id == null ? '' : String(issue.sprint_id))
          : String(issue[field] ?? '');
        const nextValue = event.target.value;
        if (previousValue === nextValue) return;
        statusEl.textContent = 'Saving...';
        event.target.disabled = true;
        try {
          const payload = { updated_by: localStorage.getItem('username') || 'unknown' };
          if (field === 'sprint_id') payload[field] = nextValue === '' ? null : Number(nextValue);
          else payload[field] = nextValue === '' ? null : nextValue;
          const updated = await patchIssue(issueId, payload);
          Object.assign(issue, updated);
          statusEl.textContent = 'Saved';
          statusEl.classList.remove('error');
          onUpdated?.(updated);
          setTimeout(() => { statusEl.textContent = ''; }, 1200);
        } catch (error) {
          event.target.value = previousValue;
          statusEl.textContent = error.message || 'Failed';
          statusEl.classList.add('error');
        } finally {
          event.target.disabled = false;
        }
      });
    });
  }

  return {
    ASSIGNEE_OPTIONS,
    STATUS_OPTIONS,
    PRIORITY_OPTIONS,
    escapeHtml,
    formatStatus,
    formatPriority,
    fetchJson,
    patchIssue,
    fetchSprints,
    buildSprintSelectOptions,
    renderIssueCard,
    attachInlineIssueEditors,
    findDuplicateCandidates,
    getDaysStale,
    isBlocked
  };
})();
