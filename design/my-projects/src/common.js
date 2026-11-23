// Shared pieces for the My Projects sketches: side panel, dates, and a Gantt renderer.
const DAYS = 63;               // Nov 16 2026 .. Jan 17 2027
const T0 = new Date(2026, 10, 16);
const TODAY = 7;               // Nov 23
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const dt = (o) => new Date(T0.getFullYear(), T0.getMonth(), T0.getDate() + o);
const fmt = (o) => { const d = dt(o); return MON[d.getMonth()] + ' ' + d.getDate(); };

const ICON = {
  books: '<svg viewBox="0 0 24 24"><rect x="6" y="3" width="13" height="16" rx="2"/><path d="M4 7v12a2 2 0 0 0 2 2h11"/></svg>',
  book: '<svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="2"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5"/></svg>',
  tag: '<svg viewBox="0 0 24 24"><path d="M3 12V4h8l9 9-8 8z"/><circle cx="7.5" cy="8" r="1"/></svg>',
  inbox: '<svg viewBox="0 0 24 24"><path d="M3 13h5l1 3h6l1-3h5M5 5h14l2 8v6H3v-6z"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8 6.6 19.7l1.1-6.1L3.2 9.4l6.1-.8z"/></svg>',
  proj: '<svg viewBox="0 0 24 24"><path d="M4 6h9M7 12h10M10 18h10"/></svg>',
  note: '<svg viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6z"/><path d="M9 11h7M9 15h5"/></svg>',
  pen: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  full: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
};

/** Side panel: today's links, plus the new "My Projects" one. `below` is the HTML under the line. */
function side(below) {
  const nav = [['books','My Notebooks'],['book','My Wordbooks'],['search','Words'],['tag','Tags'],['inbox','Inbox'],['star','My Bookmarks']]
    .map(([i,t]) => `<div class="nav">${ICON[i]}${t}</div>`).join('');
  return `<div class="side">${nav}<div class="nav on">${ICON.proj}My Projects<span class="new">NEW</span></div><div class="sep"></div>${below}</div>`;
}

/** Works out each task's start: the latest end of the tasks it waits for, else its own fixed start. */
function schedule(tasks) {
  const by = Object.fromEntries(tasks.filter(t => t.id).map(t => [t.id, t]));
  const startOf = (t) => {
    if (t.start != null) return t.start;
    t.start = Math.max(...t.after.map(id => { const p = by[id]; return startOf(p) + p.len; }));
    return t.start;
  };
  tasks.filter(t => t.id).forEach(startOf);
  return by;
}

/**
 * Draws a Gantt chart.
 * rows: tasks or {group, from, to}; cols: [{h, w, cell(t)}] for the table on the left;
 * labelsOnBars: put the task name after the bar instead of in a column.
 */
function gantt(el, { rows, cols, dayW, sel, moving = [], labelsOnBars = false, rowH = 38, divider = false, tableFolded = false }) {
  const by = schedule(rows);
  const tableW = cols.reduce((s, c) => s + c.w, 0);
  const W = DAYS * dayW;
  let h = `<div class="ghead"><div class="cols">${cols.map(c => c.folded ? `<div class="fold-h" style="width:${c.w}px"><span>${c.h}</span></div>` : `<div style="width:${c.w}px;position:relative">${c.h}${c.chev ? '<span class="chev">«</span>' : ''}</div>`).join('')}</div><div class="scale" style="width:${W}px">`;
  for (let o = 0; o < DAYS; o++) {
    const d = dt(o);
    if (d.getDate() === 1 || o === 0) h += `<div class="month" style="left:${o * dayW + 3}px">${MON[d.getMonth()]}${d.getMonth() === 0 ? ' 2027' : ''}</div>`;
    if (o % 7 === 0) h += `<div class="week" style="left:${o * dayW}px">${d.getDate()}</div>`;
  }
  h += `</div></div><div class="body" style="position:relative">`;
  rows.forEach(t => {
    const cls = t.group ? 'group' : (t.id === sel ? 'sel' : '');
    h += `<div class="grow-row ${cls}">${cols.map(c => c.folded ? `<div class="cell fold-c" style="width:${c.w}px"></div>` : `<div class="cell ${c.dim ? 'dim' : ''}" style="width:${c.w}px">${c.cell(t)}</div>`).join('')}<div class="track" style="width:${W}px">`;
    if (t.group) {
      h += `<div class="bar sum" style="left:${t.from * dayW}px;width:${(t.to - t.from) * dayW}px"></div>`;
    } else {
      const k = [t.id === sel ? 'sel' : '', moving.includes(t.id) ? 'moving' : ''].join(' ');
      h += `<div class="bar ${k}" style="left:${t.start * dayW}px;width:${t.len * dayW}px;${t.color ? 'background:' + t.color : ''}"></div>`;
      if (labelsOnBars) h += `<div class="blabel" style="left:${(t.start + t.len) * dayW + 14}px">${t.name}${t.notes ? `<span class="nb noteic">${ICON.note}${t.notes}</span>` : ''}</div>`;
    }
    h += `</div></div>`;
  });
  // grid, today line, arrows sit on top of the timeline part
  h += `<div style="position:absolute;left:${tableW}px;top:0;bottom:0;width:${W}px;pointer-events:none">`;
  for (let o = 7; o < DAYS; o += 7) h += `<div class="gridline" style="left:${o * dayW}px"></div>`;
  h += `<div class="today" style="left:${TODAY * dayW}px"><span>Today</span></div>`;
  let paths = '';
  rows.forEach((t, i) => (t.after || []).forEach(pid => {
    const p = by[pid]; const j = rows.indexOf(p);
    const xe = (p.start + p.len) * dayW, xs = t.start * dayW, y1 = j * rowH + 19, y2 = i * rowH + 19;
    const col = t.color || '#7c8aa5';
    const d = xs >= xe + 14
      ? `M${xe} ${y1} H${xe + 7} V${y2} H${xs - 1}`
      : `M${xe} ${y1} H${xe + 7} V${y2 - rowH / 2 + (y2 > y1 ? 0 : rowH)} H${xs - 8} V${y2} H${xs - 1}`;
    paths += `<path d="${d}" fill="none" stroke="${col === '#7c8aa5' ? col : col}" stroke-width="1.5" marker-end="url(#ah)" opacity=".85"/>`;
  }));
  h += `<svg class="arrows" width="${W}" height="${rows.length * rowH}"><defs><marker id="ah" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 8 4 0 8z" fill="#7c8aa5"/></marker></defs>${paths}</svg></div></div>`;
  // resize line being dragged, and the line between the table and the timeline
  let x = 0;
  cols.forEach(c => { x += c.w; if (c.edge) h += `<div class="edge" style="left:${x}px"><span class="cur">↔</span></div>`; });
  if (divider) h += `<div class="divider" style="left:${tableW}px"><span class="dchev">${tableFolded ? '»' : '«'}</span></div>`;
  el.innerHTML = h;
}

/** The kitchen remodel project used in every sketch. `after` = waits for. */
const kitchen = () => [
  { id: 'plan', name: 'Measure & plan', start: 0, len: 5, after: [], notes: 2 },
  { id: 'demo', name: 'Demolition', len: 4, after: ['plan'], notes: 0 },
  { id: 'pick', name: 'Pick cabinets', len: 7, after: ['plan'], notes: 3 },
  { id: 'order', name: 'Order cabinets', len: 14, after: ['pick'], notes: 2 },
  { id: 'plumb', name: 'Plumbing & electric', len: 6, after: ['demo'], notes: 1 },
  { id: 'install', name: 'Install cabinets', len: 5, after: ['order', 'plumb'], notes: 0 },
  { id: 'counter', name: 'Countertops', len: 10, after: ['install'], notes: 1 },
  { id: 'paint', name: 'Paint', len: 4, after: ['counter'], notes: 0 },
];

/** People are just names (not Wordbook users). One person per task. */
const PEOPLE = { 'Mike (contractor)': '#7c3aed', 'Rosa (plumber)': '#0891b2', 'Stone Co.': '#b45309', 'Ana (tutor)': '#db2777' };
const WHO = { demo: 'Mike (contractor)', plumb: 'Rosa (plumber)', install: 'Mike (contractor)', counter: 'Stone Co.', paint: 'Mike (contractor)', talk: 'Ana (tutor)' };
const whoCell = (t) => t.who || WHO[t.id] ? (n => `<span class="who"><i style="background:${PEOPLE[n]}">${n[0]}</i>${n}</span>`)(t.who || WHO[t.id]) : '';
