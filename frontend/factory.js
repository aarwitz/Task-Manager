const username = localStorage.getItem('username');
if (!username) window.location.href = '/';

const state = { sprintId: new URLSearchParams(window.location.search).get('sprint_id'), sprint: null, issues: [], users: [], selectedIssue: null, timer: null };
const statusMeta = {
  to_do: { label: 'Queued', icon: '◎' },
  in_progress: { label: 'Executing', icon: '▶' },
  in_review: { label: 'Review Ready', icon: '◌' },
  done: { label: 'Completed', icon: '✓' }
};
const els = {
  heroTitle: document.getElementById('heroTitle'), heroSubtitle: document.getElementById('heroSubtitle'), lastSync: document.getElementById('lastSync'), sprintLabel: document.getElementById('sprintLabel'), statRunning: document.getElementById('statRunning'), statNeedsHuman: document.getElementById('statNeedsHuman'), statReview: document.getElementById('statReview'), statDone: document.getElementById('statDone'), statTotal: document.getElementById('statTotal'), statRunningMirror: document.getElementById('statRunningMirror'), statNeedsHumanMirror: document.getElementById('statNeedsHumanMirror'), statReviewMirror: document.getElementById('statReviewMirror'), laneRunning: document.getElementById('laneRunning'), laneNeedsHuman: document.getElementById('laneNeedsHuman'), laneQueued: document.getElementById('laneQueued'), laneReview: document.getElementById('laneReview'), laneCompleted: document.getElementById('laneCompleted'), agentsGrid: document.getElementById('agentsGrid'), activityStream: document.getElementById('activityStream'), factoryWorld: document.getElementById('factoryWorld'), detailDrawer: document.getElementById('detailDrawer'), drawerTitle: document.getElementById('drawerTitle'), drawerMeta: document.getElementById('drawerMeta'), drawerDescription: document.getElementById('drawerDescription'), drawerStatus: document.getElementById('drawerStatus'), drawerAssignedTo: document.getElementById('drawerAssignedTo'), drawerComments: document.getElementById('drawerComments'), legacyIssueLink: document.getElementById('legacyIssueLink'), createIssueBtn: document.getElementById('createIssueBtn'), logoutBtn: document.getElementById('logoutBtn'), closeDrawerBtn: document.getElementById('closeDrawerBtn'), saveIssueBtn: document.getElementById('saveIssueBtn'), createIssueModal: document.getElementById('createIssueModal'), closeModalBtn: document.getElementById('closeModalBtn'), cancelModalBtn: document.getElementById('cancelModalBtn'), createIssueForm: document.getElementById('createIssueForm'), issueTitle: document.getElementById('issueTitle'), issueDescription: document.getElementById('issueDescription'), issueAssignedTo: document.getElementById('issueAssignedTo'), toast: document.getElementById('toast'), commentForm: document.getElementById('commentForm'), commentInput: document.getElementById('commentInput'), addCommentBtn: document.getElementById('addCommentBtn')
};
const api = (path, options={}) => fetch(path, options).then(async r => { if (!r.ok) throw new Error(`${r.status}`); const t = r.headers.get('content-type')||''; return t.includes('application/json') ? r.json() : r.text(); });

function showToast(message, timeout=2200){ els.toast.textContent = message; els.toast.classList.remove('hidden'); clearTimeout(showToast._t); showToast._t = setTimeout(() => els.toast.classList.add('hidden'), timeout); }
function openModal(show){ els.createIssueModal.classList.toggle('hidden', !show); if (show) els.issueTitle.focus(); }
function closeDrawer(){ state.selectedIssue = null; els.detailDrawer.classList.add('hidden'); }
els.createIssueBtn.onclick = () => openModal(true); els.closeModalBtn.onclick = () => openModal(false); els.cancelModalBtn.onclick = () => openModal(false); els.closeDrawerBtn.onclick = closeDrawer; els.logoutBtn.onclick = () => { localStorage.removeItem('username'); window.location.href = '/'; }; window.addEventListener('click', e => { if (e.target === els.createIssueModal) openModal(false); });
async function bootstrap(){ await loadUsers(); await sync(); state.timer = setInterval(sync, 5000); }
async function loadUsers(){ state.users = await api('/api/users'); const opts = ['<option value="">Unassigned</option>'].concat(state.users.map(u => `<option value="${escapeHtml(u.username)}">${escapeHtml(u.username)}</option>`)); els.issueAssignedTo.innerHTML = opts.join(''); els.drawerAssignedTo.innerHTML = opts.join(''); }
async function resolveSprint(){ if (state.sprintId) { try { return await api(`/api/sprints/${state.sprintId}`); } catch {} } try { return await api('/api/sprints/active'); } catch { const all = await api('/api/sprints'); return all.find(s => s.is_active) || all[0] || null; } }
function needsHuman(issue){ const owner = (issue.assigned_to || '').toLowerCase(); return owner.includes('aaron') || owner.includes('taylor') || owner.includes('human'); }
function actorClass(name){ const n = (name || '').toLowerCase(); if (!name) return 'unassigned'; if (['claw','agent','bot','subagent','codex','jerry'].some(x => n.includes(x))) return 'agent'; return 'human'; }
function canonOwner(name){ const n = (name || '').toLowerCase(); if (['claw','jerry','agent','bot'].some(x => n.includes(x))) return 'Jerry'; if (n.includes('aaron')) return 'Aaron'; if (n.includes('taylor')) return 'Taylor'; return name || 'Unassigned'; }
function relTime(v){ const d = Date.now() - new Date(v).getTime(); const m = Math.round(d/60000); if (m < 1) return 'just now'; if (m < 60) return `${m}m ago`; const h = Math.round(m/60); if (h < 24) return `${h}h ago`; return `${Math.round(h/24)}d ago`; }
function escapeHtml(text){ const div = document.createElement('div'); div.textContent = text ?? ''; return div.innerHTML; }
function shortTitle(text, n=34){ const t = text || ''; return t.length > n ? t.slice(0,n-1) + '…' : t; }
function taskGlyph(issue){ if (issue.status === 'done') return '◈'; if (issue.status === 'in_review') return '⬡'; if (issue.status === 'in_progress') return '⚙'; return '▣'; }
function taskTheme(issue){
  const text = `${issue.title || ''} ${issue.description || ''}`.toLowerCase();
  if (/(ui|ux|design|dashboard|screen|branding|visual)/.test(text)) return { cls:'design', label:'design studio' };
  if (/(robot|motor|sensor|hardware|jetson|arduino|encoder|i2c|pid)/.test(text)) return { cls:'hardware', label:'mech bay' };
  if (/(api|backend|infra|pipeline|data|database|sync|automation|openclaw)/.test(text)) return { cls:'systems', label:'systems forge' };
  if (/(review|artifact|screenshot|client|naming|strategy|business)/.test(text)) return { cls:'review', label:'review deck' };
  return { cls:'general', label:'work cell' };
}
function laneCard(issue, emphasize=false){ const owner = canonOwner(issue.assigned_to || 'Unassigned'); const cls = actorClass(owner); return `<article class="run-card ${emphasize ? 'needs-human' : ''}" data-id="${issue.id}"><div class="run-top"><div class="chip-row"><span class="chip ${cls}">${escapeHtml(owner)}</span>${emphasize ? '<span class="chip needs">Human</span>' : ''}</div><span class="run-id">#${issue.id}</span></div><h4>${taskGlyph(issue)} ${escapeHtml(shortTitle(issue.title, 44))}</h4><div class="run-bottom"><span class="chip">${statusMeta[issue.status].label}</span><span class="run-time">${relTime(issue.created_at)}</span></div></article>`; }
function renderLane(el, issues, emphasize=false){ el.innerHTML = issues.length ? issues.slice(0,6).map(i => laneCard(i, emphasize)).join('') : '<div class="empty-block">No tasks.</div>'; el.querySelectorAll('.run-card').forEach(node => node.onclick = () => { const issue = state.issues.find(i => i.id === Number(node.dataset.id)); if (issue) openDrawer(issue); }); }
function renderAgents(){ const map = new Map(); state.issues.forEach(issue => { const name = canonOwner(issue.assigned_to || 'Unassigned'); if (!map.has(name)) map.set(name, { name, cls: actorClass(name), total: 0, running: 0, review: 0 }); const row = map.get(name); row.total++; if (issue.status === 'in_progress') row.running++; if (issue.status === 'in_review') row.review++; }); const preferred = ['Jerry','Aaron','Taylor']; const rows = preferred.map(name => map.get(name) || { name, cls: actorClass(name), total: 0, running: 0, review: 0 }).filter(Boolean); els.agentsGrid.innerHTML = rows.map(row => `<article class="agent-card"><div class="agent-avatar ${row.cls}">${row.name[0]}</div><div><strong>${escapeHtml(row.name)}</strong><div class="agent-role">${row.cls === 'agent' ? 'autonomous' : 'human'}</div></div><div class="agent-metrics"><strong>${row.running}</strong><span>${row.total} total</span></div></article>`).join(''); }
function renderActivity(){ const recent = [...state.issues].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,6); els.activityStream.innerHTML = recent.map(issue => { const owner = canonOwner(issue.assigned_to || 'Unassigned'); const text = issue.status === 'done' ? 'shipped work' : issue.status === 'in_review' ? 'moved to review' : issue.status === 'in_progress' ? 'is building' : 'queued task'; return `<article class="activity-item"><div class="activity-icon">${statusMeta[issue.status].icon}</div><div class="activity-copy"><strong>${escapeHtml(shortTitle(issue.title, 34))}</strong><p>${escapeHtml(owner)} ${text}</p><span>#${issue.id} · ${relTime(issue.created_at)}</span></div></article>`; }).join(''); }
function tasksFor(name){ return state.issues.filter(i => canonOwner(i.assigned_to || 'Unassigned') === name); }
function zoneTasks(issues, limit=3){ return issues.slice(0, limit).map(issue => `<div class="task-orb" data-id="${issue.id}"><span class="task-dot ${issue.status}"></span><span>${escapeHtml(shortTitle(issue.title, 30))}</span></div>`).join('') || '<div class="empty-block">No live tasks.</div>'; }
function sprite(name, cls, left, top, counts){ return `<div class="operator-sprite ${name.toLowerCase()} ${cls}" style="left:${left}px;top:${top}px" data-owner="${escapeHtml(name)}"><div class="label">${escapeHtml(name)}</div><div class="pixel-person"><div class="halo"></div><div class="head"></div><div class="body"></div><div class="screen"></div><div class="tool"></div><div class="legs"></div></div><div class="load-bubbles"><span class="load-bubble">▶ ${counts.running}</span><span class="load-bubble">◎ ${counts.total}</span></div></div>`; }
function site(issue, x, y, cls, label){ const theme = taskTheme(issue); return `<article class="job-site ${cls} ${theme.cls}" style="left:${x}px;top:${y}px" data-id="${issue.id}"><h4>${taskGlyph(issue)} ${escapeHtml(shortTitle(issue.title, 24))}</h4><p>${escapeHtml(label)} · ${escapeHtml(theme.label)}</p></article>`; }
function groupByOwnerCounts(name){ const owned = tasksFor(name); return { total: owned.length, running: owned.filter(i => i.status === 'in_progress').length }; }
function renderMobileWorld(running, human, queued, review, done){
  els.factoryWorld.innerHTML = `
    <div class="mobile-world">
      <div class="mobile-crew-row">
        <div class="mobile-operator agent" data-owner="Jerry">${sprite('Jerry','agent', 0, 0, groupByOwnerCounts('Jerry'))}</div>
        <div class="mobile-operator human" data-owner="Aaron">${sprite('Aaron','human', 0, 0, groupByOwnerCounts('Aaron'))}</div>
        <div class="mobile-operator human" data-owner="Taylor">${sprite('Taylor','human', 0, 0, groupByOwnerCounts('Taylor'))}</div>
      </div>
      <div class="mobile-zones">
        <section class="mobile-zone queue-zone"><div class="mobile-zone-head"><h3>Queue Gate</h3><span>${queued.length}</span></div><div class="mobile-zone-body">${zoneTasks(queued,2)}</div></section>
        <section class="mobile-zone build-zone"><div class="mobile-zone-head"><h3>Build Bay</h3><span>${running.length}</span></div><div class="mobile-zone-body">${zoneTasks(running,2)}</div></section>
        <section class="mobile-zone human-zone"><div class="mobile-zone-head"><h3>Human Checkpoint</h3><span>${human.length}</span></div><div class="mobile-zone-body">${zoneTasks(human,2)}</div></section>
        <section class="mobile-zone output-zone"><div class="mobile-zone-head"><h3>Output Dock</h3><span>${review.length + done.length}</span></div><div class="mobile-zone-body">${zoneTasks([...review, ...done],2)}</div></section>
      </div>
    </div>`;
  els.factoryWorld.querySelectorAll('[data-id]').forEach(node => node.onclick = () => {
    const issue = state.issues.find(i => i.id === Number(node.dataset.id));
    if (issue) openDrawer(issue);
  });
}
function renderDesktopWorld(running, human, queued, review, done){
  const buildVisuals = running.map((issue, idx) => site(issue, 302 + (idx%2)*138, 362 + Math.floor(idx/2)*88, 'build', `${canonOwner(issue.assigned_to)} building`));
  const humanVisuals = human.map((issue, idx) => site(issue, 640, 366 + idx*86, 'human', `${canonOwner(issue.assigned_to)} reviewing`));
  const reviewVisuals = review.map((issue, idx) => site(issue, 842, 390 + idx*78, 'review', 'output staged'));
  const doneVisuals = done.slice(0,2).map((issue, idx) => site(issue, 842, 212 + idx*78, 'done', 'shipment complete'));
  const queueVisuals = queued.slice(0,3).map((issue, idx) => site(issue, 46, 374 + idx*72, 'queue', 'awaiting routing'));
  els.factoryWorld.innerHTML = `
    <div class="factory-landscape">
      <div class="world-skyline">
        <div class="tower" style="left:72px;height:88px"></div>
        <div class="tower" style="left:146px;height:122px"></div>
        <div class="tower" style="left:226px;height:74px"></div>
        <div class="tower" style="right:210px;height:108px"></div>
        <div class="tower" style="right:132px;height:136px"></div>
        <div class="tower" style="right:58px;height:92px"></div>
      </div>
      <div class="terrain-band band-1"></div>
      <div class="terrain-band band-2"></div>
      <div class="terrain-band band-3"></div>
      <div class="path" style="left:170px;top:286px;width:760px"><span class="packet p1"></span><span class="packet p2"></span></div>
      <div class="path" style="left:140px;top:430px;width:760px"><span class="packet p3"></span><span class="packet p4"></span></div>
      <div class="path vertical" style="left:478px;top:236px;width:8px;height:200px"><span class="packet pv1"></span></div>
      <div class="path vertical" style="left:776px;top:222px;width:8px;height:232px"><span class="packet pv2"></span></div>
      <section class="zone zone-queue"><h3>Queue Gate</h3><p>Incoming jobs and unslotted work.</p><div class="zone-tasks">${zoneTasks(queued)}</div><div class="zone-glow"></div></section>
      <section class="zone zone-build"><h3>Build Bay</h3><p>Active engineering, code, wiring, and system assembly.</p><div class="zone-tasks">${zoneTasks(running)}</div><div class="zone-glow"></div></section>
      <section class="zone zone-human"><h3>Human Checkpoint</h3><p>Judgment, decisions, unblockers, and approvals.</p><div class="zone-tasks">${zoneTasks(human)}</div><div class="zone-glow"></div></section>
      <section class="zone zone-output"><h3>Output Dock</h3><p>Review-ready work and shipped artifacts.</p><div class="zone-tasks">${zoneTasks([...review, ...done], 4)}</div><div class="zone-glow"></div></section>
      ${sprite('Jerry','agent', 386, 250, groupByOwnerCounts('Jerry'))}
      ${sprite('Aaron','human', 620, 282, groupByOwnerCounts('Aaron'))}
      ${sprite('Taylor','human', 734, 300, groupByOwnerCounts('Taylor'))}
      ${queueVisuals.join('')}
      ${buildVisuals.join('')}
      ${humanVisuals.join('')}
      ${reviewVisuals.join('')}
      ${doneVisuals.join('')}
    </div>`;
  els.factoryWorld.querySelectorAll('[data-id]').forEach(node => node.onclick = () => {
    const issue = state.issues.find(i => i.id === Number(node.dataset.id));
    if (issue) openDrawer(issue);
  });
}
function renderWorld(running, human, queued, review, done){
  if (window.innerWidth <= 760) return renderMobileWorld(running, human, queued, review, done);
  return renderDesktopWorld(running, human, queued, review, done);
}
function openDrawer(issue){ state.selectedIssue = issue; els.drawerTitle.textContent = issue.title; els.drawerMeta.textContent = `#${issue.id} · created by ${issue.created_by} · ${relTime(issue.created_at)}`; els.drawerDescription.textContent = issue.description || 'No description.'; els.drawerStatus.value = issue.status; els.drawerAssignedTo.value = issue.assigned_to || ''; els.commentInput.value = ''; els.legacyIssueLink.href = `/static/issue.html?id=${issue.id}`; els.drawerComments.innerHTML = issue.comments?.length ? issue.comments.map(c => `<article class="comment-item"><strong>${escapeHtml(c.username)}</strong><p>${escapeHtml(c.content)}</p><span>${new Date(c.created_at).toLocaleString()}</span></article>`).join('') : '<div class="empty-block">No logs yet.</div>'; els.detailDrawer.classList.remove('hidden'); }
els.saveIssueBtn.onclick = async () => { if (!state.selectedIssue) return; const original = els.saveIssueBtn.textContent; els.saveIssueBtn.disabled = true; els.saveIssueBtn.textContent = 'Saving…'; try { await api(`/api/issues/${state.selectedIssue.id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ status: els.drawerStatus.value, assigned_to: els.drawerAssignedTo.value || null }) }); await sync(); showToast('Task updated'); closeDrawer(); } catch (e) { console.error(e); showToast('Update failed'); } finally { els.saveIssueBtn.disabled = false; els.saveIssueBtn.textContent = original; } };
els.createIssueForm.onsubmit = async (e) => { e.preventDefault(); if (!state.sprint) return; const submitBtn = els.createIssueForm.querySelector('button[type="submit"]'); const original = submitBtn.textContent; submitBtn.disabled = true; submitBtn.textContent = 'Launching…'; try { const issue = await api('/api/issues', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ title: els.issueTitle.value.trim(), description: els.issueDescription.value.trim(), created_by: username, assigned_to: els.issueAssignedTo.value || null }) }); await api(`/api/issues/${issue.id}/assign-to-sprint?sprint_id=${state.sprint.id}`, { method:'POST' }); els.createIssueForm.reset(); openModal(false); await sync(); showToast('Task created'); } catch (err) { console.error(err); showToast('Create failed'); } finally { submitBtn.disabled = false; submitBtn.textContent = original; } };
async function sync(){ try { state.sprint = await resolveSprint(); if (!state.sprint) return; state.sprintId = state.sprint.id; state.issues = await api(`/api/issues?sprint_id=${state.sprint.id}`); const running = state.issues.filter(i => i.status === 'in_progress'); const review = state.issues.filter(i => i.status === 'in_review'); const done = state.issues.filter(i => i.status === 'done'); const queued = state.issues.filter(i => i.status === 'to_do' && !needsHuman(i)); const human = state.issues.filter(i => i.status !== 'done' && needsHuman(i)); els.heroTitle.textContent = `${state.sprint.name} // Factory Sim`; els.heroSubtitle.textContent = `Jerry, Aaron, and Taylor moving live work through a digital production world.`; els.sprintLabel.textContent = state.sprint.name; els.statRunning.textContent = String(running.length); els.statNeedsHuman.textContent = String(human.length); els.statReview.textContent = String(review.length); els.statDone.textContent = String(done.length); els.statTotal.textContent = String(state.issues.length); if (els.statRunningMirror) els.statRunningMirror.textContent = String(running.length); if (els.statNeedsHumanMirror) els.statNeedsHumanMirror.textContent = String(human.length); if (els.statReviewMirror) els.statReviewMirror.textContent = String(review.length); els.lastSync.textContent = new Date().toLocaleTimeString(); renderWorld(running, human, queued, review, done); renderLane(els.laneRunning, running); renderLane(els.laneNeedsHuman, human, true); renderLane(els.laneQueued, queued); renderLane(els.laneReview, review); renderLane(els.laneCompleted, done.slice(0,6)); renderAgents(); renderActivity(); if (state.selectedIssue) { const refreshed = state.issues.find(i => i.id === state.selectedIssue.id); if (refreshed) openDrawer(refreshed); } } catch (e) { console.error(e); els.heroTitle.textContent = 'Factory sync failed'; els.heroSubtitle.textContent = 'Unable to refresh the live world from backend.'; } }
bootstrap();
els.commentForm.onsubmit = async (e) => { e.preventDefault(); if (!state.selectedIssue) return; const content = els.commentInput.value.trim(); if (!content) { showToast('Enter a comment first'); return; } const original = els.addCommentBtn.textContent; els.addCommentBtn.disabled = true; els.addCommentBtn.textContent = 'Adding…'; try { await api(`/api/issues/${state.selectedIssue.id}/comments`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ content, username }) }); await sync(); const refreshed = state.issues.find(i => i.id === state.selectedIssue.id); if (refreshed) openDrawer(refreshed); showToast('Comment added'); } catch (err) { console.error(err); showToast('Comment failed'); } finally { els.addCommentBtn.disabled = false; els.addCommentBtn.textContent = original; } };
