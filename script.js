'use strict';
const STORAGE_KEY = 'dailyNotes.tasks.v1';
let tasks = [];
let filter = 'all', query = '', editingId = null, pendingId = null, dragId = null;

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const nowIso = () => { const d = new Date(); return `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Persistence ---------- */
function saveToLocalStorage() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); } catch (e) { console.warn('Could not save', e); }
}
function loadFromLocalStorage() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    tasks = Array.isArray(data) ? data.filter(t => t && t.id && t.title) : [];
  } catch (e) { tasks = []; }
}
function commit() { saveToLocalStorage(); render(); }

/* ---------- Helpers ---------- */
function dueInfo(t) {
  if (t.completed) return { cls: 'done', label: 'Completed' };
  if (!t.dueDate) return null;
  const today = ymd(new Date());
  if (t.dueDate < today) return { cls: 'overdue', label: 'Overdue' };
  if (t.dueDate === today) return { cls: 'today', label: 'Due today' };
  return { cls: 'upcoming', label: 'Upcoming' };
}
function fmtDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
function visibleTasks() {
  const q = query.trim().toLowerCase();
  return tasks.filter(t => {
    if (filter === 'active' && t.completed) return false;
    if (filter === 'completed' && !t.completed) return false;
    if (!q) return true;
    return [t.title, t.description, t.category].some(v => (v || '').toLowerCase().includes(q));
  });
}

/* ---------- CRUD ---------- */
function addTask(data) {
  tasks.unshift({ id: uid(), title: data.title, description: data.description, category: data.category,
    dueDate: data.dueDate, priority: data.priority, completed: false, createdAt: nowIso(), completedAt: null });
  commit();
  $('#list').firstElementChild?.classList.add('settle');
}
function editTask(id, data) {
  const t = tasks.find(x => x.id === id);
  if (!t) return;
  Object.assign(t, data);   // id and createdAt are never touched
  commit();
}
function deleteTask(id) { tasks = tasks.filter(t => t.id !== id); commit(); }
function toggleTask(id, done, box) {
  const t = tasks.find(x => x.id === id);
  if (!t) return;
  t.completed = done;
  t.completedAt = done ? nowIso() : null;
  commit();
  if (done && box) burst(box);
}
function moveTask(id, targetId, after = false) {
  if (id === targetId) return;
  const from = tasks.findIndex(t => t.id === id);
  const [item] = tasks.splice(from, 1);
  let to = tasks.findIndex(t => t.id === targetId);
  if (after) to++;
  tasks.splice(to, 0, item);
  commit();
  document.querySelector(`[data-id="${CSS.escape(id)}"]`)?.classList.add('settle');
}
function nudge(id, dir) {
  const vis = visibleTasks(), i = vis.findIndex(t => t.id === id), n = vis[i + dir];
  if (n) moveTask(id, n.id, dir > 0);
}

/* ---------- Rendering ---------- */
function taskHTML(t, i, arr) {
  const info = dueInfo(t);
  const label = esc(t.title);
  return `<li class="task ${t.completed ? 'done' : ''}" data-id="${esc(t.id)}" data-cat="${esc(t.category)}" draggable="true">
    <span class="grip" aria-hidden="true" title="Drag to reorder">⋮⋮</span>
    <input class="chk" type="checkbox" aria-label="Mark “${label}” as completed" ${t.completed ? 'checked' : ''}>
    <div class="body">
      <h3>${label}</h3>
      ${t.description ? `<p>${esc(t.description)}</p>` : ''}
      <div class="meta">
        <span class="tag">${esc(t.category)}</span>
        ${t.priority ? `<span class="pill ${esc(t.priority)}">${esc(t.priority)} priority</span>` : ''}
        ${t.dueDate ? `<span class="pill">Due ${fmtDate(t.dueDate)}</span>` : ''}
        ${info ? `<span class="pill ${info.cls}">${info.label}</span>` : ''}
      </div>
    </div>
    <div class="acts">
      <button class="act mv" data-act="up" aria-label="Move “${label}” up" ${i === 0 ? 'disabled' : ''}>↑</button>
      <button class="act mv" data-act="down" aria-label="Move “${label}” down" ${i === arr.length - 1 ? 'disabled' : ''}>↓</button>
      <button class="act" data-act="edit" aria-label="Edit “${label}”" title="Edit">✎</button>
      <button class="act" data-act="delete" aria-label="Delete “${label}”" title="Delete">🗑</button>
    </div></li>`;
}
const EMPTY_ICON = '<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="12" y="8" width="34" height="46" rx="3"/><path d="M20 20h18M20 28h18M20 36h10M44 40l10-10 5 5-10 10-7 2z"/></g></svg>';
function emptyHTML() {
  if (!tasks.length) return `${EMPTY_ICON}<p>Your page is still blank. Let’s fill it with little wins!</p><button class="btn primary" id="firstBtn">Add Your First Task</button>`;
  if (query.trim()) return `${EMPTY_ICON}<p>We couldn’t find that task. Try another word.</p>`;
  if (filter === 'active') return `${EMPTY_ICON}<p>Everything is done. You deserve a little break!</p>`;
  return `${EMPTY_ICON}<p>Your completed tasks will find their home here.</p>`;
}
function render() {
  const vis = visibleTasks();
  $('#list').innerHTML = vis.map(taskHTML.bind(null)).join('');
  const empty = $('#empty');
  empty.hidden = vis.length > 0;
  if (!vis.length) empty.innerHTML = emptyHTML();
  $('#clearQ').hidden = !query;
  document.querySelectorAll('.tab').forEach(b => {
    const on = b.dataset.filter === filter;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on);
  });
  updateStats();
}
function updateStats() {
  const total = tasks.length, done = tasks.filter(t => t.completed).length, left = total - done;
  const pct = total ? Math.round(done / total * 100) : 0;
  const today = ymd(new Date());
  const dueToday = tasks.filter(t => t.dueDate === today);
  const dueDone = dueToday.filter(t => t.completed).length;
  $('#sTotal').textContent = total; $('#sDone').textContent = done; $('#sLeft').textContent = left;
  $('#cAll').textContent = total; $('#cActive').textContent = left; $('#cDone').textContent = done;
  $('#ringPct').textContent = $('#miniPct').textContent = pct + '%';
  $('#ringFg').style.strokeDashoffset = 213.6 * (1 - pct / 100);
  $('#barFill').style.width = pct + '%';
  $('#todayLine').textContent = dueToday.length ? `Today: ${dueDone} of ${dueToday.length} due tasks finished.` : 'Nothing due today.';
}
function updateHeader() {
  const d = new Date(), h = d.getHours();
  $('#greeting').textContent = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  $('#dateNow').textContent = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}
function burst(el) {
  if (reduceMotion()) return;
  const r = el.getBoundingClientRect(), colors = ['#b8ccb2', '#d6cce8', '#f6d5c2', '#f7ebb4', '#bfd2e4'];
  for (let i = 0; i < 10; i++) {
    const s = document.createElement('span'), a = Math.random() * Math.PI * 2, dist = 24 + Math.random() * 28;
    s.className = 'conf';
    s.style.cssText = `left:${r.left + r.width / 2}px;top:${r.top + r.height / 2}px;background:${colors[i % 5]};--x:${Math.cos(a) * dist}px;--y:${Math.sin(a) * dist}px`;
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 750);
  }
}

/* ---------- Events ---------- */
$('#addForm').addEventListener('submit', e => {
  e.preventDefault();
  const title = $('#title').value.trim();
  if (!title) { $('#err').textContent = 'Please give your task a title first.'; $('#title').focus(); return; }
  $('#err').textContent = '';
  addTask({ title, description: $('#desc').value.trim(), category: $('#cat').value, dueDate: $('#due').value || null, priority: $('#prio').value || null });
  e.target.reset();
  $('#title').focus();
});
$('#title').addEventListener('input', () => { $('#err').textContent = ''; });

document.querySelector('.tabs').addEventListener('click', e => {
  const b = e.target.closest('.tab'); if (!b) return;
  filter = b.dataset.filter; render();
});
$('#q').addEventListener('input', e => { query = e.target.value; render(); });
$('#clearQ').addEventListener('click', () => { query = ''; $('#q').value = ''; render(); $('#q').focus(); });
$('#empty').addEventListener('click', e => { if (e.target.id === 'firstBtn') $('#title').focus(); });

const list = $('#list');
list.addEventListener('change', e => {
  if (!e.target.classList.contains('chk')) return;
  toggleTask(e.target.closest('.task').dataset.id, e.target.checked, e.target);
});
list.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const id = b.closest('.task').dataset.id, act = b.dataset.act;
  if (act === 'edit') openEdit(id);
  else if (act === 'delete') openDelete(id);
  else nudge(id, act === 'up' ? -1 : 1);
});
// Drag and drop (desktop); arrow buttons cover touch screens
list.addEventListener('dragstart', e => {
  const li = e.target.closest('.task'); if (!li) return;
  dragId = li.dataset.id; li.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragId);
});
list.addEventListener('dragover', e => {
  const li = e.target.closest('.task'); if (!li || !dragId) return;
  e.preventDefault();
  list.querySelectorAll('.over').forEach(x => x.classList.remove('over'));
  if (li.dataset.id !== dragId) li.classList.add('over');
});
list.addEventListener('drop', e => {
  const li = e.target.closest('.task'); if (!li || !dragId) return;
  e.preventDefault();
  const after = tasks.findIndex(t => t.id === dragId) < tasks.findIndex(t => t.id === li.dataset.id);
  moveTask(dragId, li.dataset.id, after);
});
list.addEventListener('dragend', () => { dragId = null; list.querySelectorAll('.dragging,.over').forEach(x => x.classList.remove('dragging', 'over')); });

/* Edit modal */
function openEdit(id) {
  const t = tasks.find(x => x.id === id); if (!t) return;
  editingId = id;
  $('#eTitle').value = t.title; $('#eDesc').value = t.description || ''; $('#eCat').value = t.category;
  $('#eDue').value = t.dueDate || ''; $('#ePrio').value = t.priority || ''; $('#eErr').textContent = '';
  $('#editDlg').showModal(); $('#eTitle').focus();
}
$('#editForm').addEventListener('submit', e => {
  e.preventDefault();
  const title = $('#eTitle').value.trim();
  if (!title) { $('#eErr').textContent = 'The title can’t be empty.'; return; }
  editTask(editingId, { title, description: $('#eDesc').value.trim(), category: $('#eCat').value, dueDate: $('#eDue').value || null, priority: $('#ePrio').value || null });
  $('#editDlg').close();
});
$('#eCancel').addEventListener('click', () => $('#editDlg').close());

/* Delete confirmation */
function openDelete(id) {
  const t = tasks.find(x => x.id === id); if (!t) return;
  pendingId = id;
  $('#delText').textContent = `“${t.title}” will be removed.`;
  $('#delDlg').showModal(); $('#delNo').focus();
}
$('#delYes').addEventListener('click', () => { deleteTask(pendingId); $('#delDlg').close(); });
$('#delNo').addEventListener('click', () => $('#delDlg').close());
document.querySelectorAll('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));

/* ---------- Init ---------- */
loadFromLocalStorage();
updateHeader();
render();
setInterval(updateHeader, 60000);
