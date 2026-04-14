const tg = window.Telegram?.WebApp;
const params = new URLSearchParams(window.location.search);
const username = params.get('user') || tg?.initDataUnsafe?.user?.username || tg?.initDataUnsafe?.user?.first_name || 'telegram';
const meetingsConfig = [
  {
    title: params.get('meeting_title') || 'EWAG sync',
    when: params.get('meeting_when') || 'Today 3:00 PM',
    href: params.get('meeting_href') || '/static/factory.html',
    notes: params.get('meeting_notes') || 'Review priorities, blockers, and clean owner handoffs.'
  }
];

const els = {
  hudRight: document.getElementById('hudRight'),
  aaronLabel: document.getElementById('aaronLabel'),
  taylorLabel: document.getElementById('taylorLabel'),
  jerryLabel: document.getElementById('jerryLabel'),
  meetingsLabel: document.getElementById('meetingsLabel'),
  overlay: document.getElementById('detailOverlay'),
  closeModal: document.getElementById('closeModal'),
  modalIcon: document.getElementById('modalIcon'),
  modalEyebrow: document.getElementById('modalEyebrow'),
  modalTitle: document.getElementById('modalTitle'),
  modalSummary: document.getElementById('modalSummary'),
  modalDescription: document.getElementById('modalDescription'),
  modalMeta: document.getElementById('modalMeta'),
  modalPrimaryLink: document.getElementById('modalPrimaryLink'),
  modalSecondaryLink: document.getElementById('modalSecondaryLink')
};

const state = { sprint: null, issues: [], selected: {} };

const api = (path, options = {}) => fetch(path, options).then(async (r) => {
  if (!r.ok) throw new Error(`${r.status}`);
  const t = r.headers.get('content-type') || '';
  return t.includes('application/json') ? r.json() : r.text();
});

function setupTelegram() {
  if (!tg) return;
  tg.ready();
  tg.expand();
  tg.setHeaderColor('#79c7ff');
  tg.setBackgroundColor('#79c7ff');
}

function canonOwner(name) {
  const n = (name || '').toLowerCase();
  if (['jerry', 'agent', 'bot'].some(x => n.includes(x))) return 'Jerry';
  if (n.includes('aaron')) return 'Aaron';
  if (n.includes('taylor')) return 'Taylor';
  return name || 'Unassigned';
}
function short(text, n = 26) { return !text ? 'idle' : text.length > n ? `${text.slice(0, n - 1)}…` : text; }
function bridgeUrl(user, next) {
  return `/static/auth-bridge.html?user=${encodeURIComponent(user)}&next=${encodeURIComponent(next)}`;
}
function issueUrl(issue, user) { return bridgeUrl(user, `/static/issue.html?id=${issue.id}`); }
function managerUrl(owner, user) {
  const q = owner ? `?assigned_to=${encodeURIComponent(owner)}` : '';
  return bridgeUrl(user, `/static/factory.html${q}`);
}
function statusLabel(issue) {
  return issue?.status === 'in_progress' ? 'In progress' : issue?.status === 'in_review' ? 'In review' : issue?.status === 'done' ? 'Done' : 'Queued';
}
function blockerText(issue) {
  const text = `${issue?.title || ''} ${issue?.description || ''}`.toLowerCase();
  return /block|blocked|waiting|dependency/.test(text) ? 'Possible blocker' : 'None';
}
function latestFor(owner) {
  return state.issues
    .filter(i => canonOwner(i.assigned_to) === owner)
    .sort((a, b) => {
      const order = { in_progress: 0, in_review: 1, to_do: 2, done: 3 };
      return (order[a.status] - order[b.status]) || (new Date(b.created_at) - new Date(a.created_at));
    })[0] || null;
}

async function resolveSprint() {
  const sprintId = params.get('sprint_id');
  if (sprintId) {
    try { return await api(`/api/sprints/${sprintId}`); } catch {}
  }
  try { return await api('/api/sprints/active'); } catch {
    const all = await api('/api/sprints');
    return all.find(s => s.is_active) || all[0] || null;
  }
}

function setLabels() {
  const aaron = latestFor('Aaron');
  const taylor = latestFor('Taylor');
  const jerry = latestFor('Jerry');
  const meeting = meetingsConfig[0];

  els.aaronLabel.textContent = `Aaron · Next: ${short(aaron?.title || 'nothing assigned')}`;
  els.taylorLabel.textContent = `Taylor · Next: ${short(taylor?.title || 'nothing assigned')}`;
  els.jerryLabel.textContent = `Jerry HQ · Working on ${short(jerry?.title || 'dispatching')} · Blocker: ${blockerText(jerry)}`;
  els.meetingsLabel.textContent = `Meetings · ${meeting.when} ${meeting.title}`;
  els.hudRight.textContent = state.sprint ? `${state.sprint.name} · ${state.issues.length} live tasks` : 'Jerry dispatches today\'s quests';

  state.selected = {
    aaron: aaron ? {
      icon: '🧢', eyebrow: 'AARON QUEST', title: 'Aaron',
      summary: `Next task: ${aaron.title}`,
      description: aaron.description || 'No description yet.',
      meta: [`Status: ${statusLabel(aaron)}`, `Issue #${aaron.id}`, `Assigned to Aaron`],
      primaryHref: issueUrl(aaron, 'aaron'), primaryLabel: 'Open task ↗',
      secondaryHref: managerUrl('Aaron', 'aaron'), secondaryLabel: 'Open Aaron lane ↗'
    } : {
      icon: '🧢', eyebrow: 'AARON QUEST', title: 'Aaron',
      summary: 'No task assigned right now', description: 'Jerry has not assigned a current Aaron task in the active sprint.',
      meta: ['Status: Idle'], primaryHref: managerUrl('Aaron', 'aaron'), primaryLabel: 'Open Aaron lane ↗'
    },
    taylor: taylor ? {
      icon: '💁‍♀️', eyebrow: 'TAYLOR QUEST', title: 'Taylor',
      summary: `Next task: ${taylor.title}`,
      description: taylor.description || 'No description yet.',
      meta: [`Status: ${statusLabel(taylor)}`, `Issue #${taylor.id}`, `Assigned to Taylor`],
      primaryHref: issueUrl(taylor, 'taylor'), primaryLabel: 'Open task ↗',
      secondaryHref: managerUrl('Taylor', 'taylor'), secondaryLabel: 'Open Taylor lane ↗'
    } : {
      icon: '💁‍♀️', eyebrow: 'TAYLOR QUEST', title: 'Taylor',
      summary: 'No task assigned right now', description: 'Jerry has not assigned a current Taylor task in the active sprint.',
      meta: ['Status: Idle'], primaryHref: managerUrl('Taylor', 'taylor'), primaryLabel: 'Open Taylor lane ↗'
    },
    jerry: jerry ? {
      icon: '🤖', eyebrow: 'JERRY HQ', title: 'Jerry HQ',
      summary: `Working on: ${jerry.title}`,
      description: jerry.description || 'No description yet.',
      meta: [`Status: ${statusLabel(jerry)}`, `Issue #${jerry.id}`, `Blocker: ${blockerText(jerry)}`],
      primaryHref: issueUrl(jerry, 'jerry'), primaryLabel: 'Open Jerry task ↗',
      secondaryHref: managerUrl('Jerry', 'jerry'), secondaryLabel: 'Open factory map ↗'
    } : {
      icon: '🤖', eyebrow: 'JERRY HQ', title: 'Jerry HQ',
      summary: 'Working on: dispatching', description: 'Jerry currently has no explicit task ticket, so this node represents routing and assignment work.',
      meta: ['Status: Dispatching', 'Blocker: None'], primaryHref: managerUrl('Jerry', 'jerry'), primaryLabel: 'Open factory map ↗'
    },
    meetings: {
      icon: '📅', eyebrow: 'MEETING INFO', title: meeting.title,
      summary: `${meeting.when}`,
      description: meeting.notes,
      meta: [`When: ${meeting.when}`, 'Type: Meeting'],
      primaryHref: meeting.href, primaryLabel: 'Open meeting link ↗',
      secondaryHref: bridgeUrl('jerry', '/static/factory.html'), secondaryLabel: 'Open manager ↗'
    }
  };
}

function openModal(key) {
  const detail = state.selected[key];
  if (!detail) return;
  els.modalIcon.textContent = detail.icon;
  els.modalEyebrow.textContent = detail.eyebrow;
  els.modalTitle.textContent = detail.title;
  els.modalSummary.textContent = detail.summary;
  els.modalDescription.textContent = detail.description;
  els.modalMeta.innerHTML = (detail.meta || []).map(m => `<span class="meta-pill">${m}</span>`).join('');
  els.modalPrimaryLink.href = detail.primaryHref || '#';
  els.modalPrimaryLink.textContent = detail.primaryLabel || 'Open ↗';
  if (detail.secondaryHref) {
    els.modalSecondaryLink.href = detail.secondaryHref;
    els.modalSecondaryLink.textContent = detail.secondaryLabel || 'Open manager ↗';
    els.modalSecondaryLink.classList.remove('hidden');
  } else {
    els.modalSecondaryLink.classList.add('hidden');
  }
  els.overlay.classList.remove('hidden');
  if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
}
function closeModal() { els.overlay.classList.add('hidden'); }

async function bootstrap() {
  setupTelegram();
  try {
    try { await api('/api/users/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username }) }); } catch {}
    state.sprint = await resolveSprint();
    state.issues = state.sprint ? await api(`/api/issues?sprint_id=${state.sprint.id}`) : [];
    setLabels();
  } catch (err) {
    console.error(err);
    els.hudRight.textContent = 'Mini app sync failed';
    setLabels();
  }
}

document.querySelectorAll('.tappable').forEach(node => node.addEventListener('click', () => openModal(node.dataset.node)));
els.overlay.addEventListener('click', (event) => { if (event.target.dataset.close === 'true') closeModal(); });
els.closeModal.addEventListener('click', closeModal);
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeModal(); });
bootstrap();
