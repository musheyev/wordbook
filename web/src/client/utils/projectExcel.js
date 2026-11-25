// Export to Excel (My Projects): the Gantt chart drawn in a spreadsheet's
// cells, so it looks much like the page and stays a normal spreadsheet
// (decided: option 1).
//
//        A                 B       C       D    E           F            | one column per day
//   1    Kitchen remodel
//   2                                                                    | Nov            Dec
//   3    Task              Starts  Ends    Days Who         Waits for    | 16 17 18 …
//   4    ▾ Prep                                                          | ████████        (group: its span)
//   5      Measure & plan  Nov 16  Nov 20   5                            | █████
//   6      Demolition      Nov 23  Nov 25   3   Mike        Measure & …  |        ███
//
// - Bars are filled cells in the project's colour; weekends and holidays are
//   shaded; today's column has a red line on its left.
// - Groups (and, on "All projects", projects) use Excel's own row grouping,
//   so they fold with Excel's +/−; what's folded on the page starts folded.
// - Arrows can't be drawn, so "Waits for" names the tasks instead.
// - A second sheet lists the holidays.
//
// ExcelJS builds the file in the browser; this file (and ExcelJS, ~1 MB) is
// only loaded when someone clicks "Export to Excel".
import ExcelJS from 'exceljs/dist/exceljs.min.js';
import { toDay, fromDay, weekday, todayDate } from './projectSchedule';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const TABLE = [
    { header: 'Task', width: 34 },
    { header: 'Starts', width: 10 },
    { header: 'Ends', width: 10 },
    { header: 'Days', width: 6 },
    { header: 'Who', width: 20 },
    { header: 'Waits for', width: 30 },
];
const FIRST_DAY_COL = TABLE.length + 1;
const HEAD_ROWS = 3;

const argb = (hex) => `FF${hex.replace('#', '').toUpperCase()}`;
const fill = (hex) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: argb(hex) } });
const SHADE = fill('#eef0f4');          // weekends and holidays
const GROUP_ROW = fill('#f6f8fb');
const HEAD = fill('#e9edf3');
const SPAN = fill('#545c6b');           // a group's or project's whole span
const TODAY_LINE = { left: { style: 'medium', color: { argb: 'FFEF4444' } } };
// A bar's cells get a white edge above and below, so the grey of weekends
// and holidays in the rows around never touches it (in Excel a fill covers
// the whole cell; on the page the bar is thinner than its row).
const GAP = { style: 'medium', color: { argb: 'FFFFFFFF' } };

/** "2026-11-28" → a date Excel shows as "Nov 28" (stored as UTC midnight). */
const excelDate = (date) => {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
};

/** The days shown: a Monday a little before the first start to a Sunday a little after the last end. */
function dayRange(placed, today) {
    const starts = [...placed.values()].map((p) => toDay(p.start));
    const ends = [...placed.values()].map((p) => toDay(p.end));
    let first = Math.min(today, ...starts) - 3;
    let last = Math.max(today, ...ends) + 3;
    while (weekday(first) !== 1) first -= 1;
    while (weekday(last) !== 0) last += 1;
    return { first, last, count: last - first + 1 };
}

/**
 * Which rows Excel should hide: those under a folded group or project.
 * Rows come in order with their level (0 = top), like the chart's.
 */
function hiddenRows(rows, folded) {
    const open = [];        // the groups above this row: { level, folded }
    return rows.map((r) => {
        while (open.length && open[open.length - 1].level >= r.level) open.pop();
        const hidden = open.some((g) => g.folded);
        if (r.kind === 'group') open.push({ level: r.level, folded: folded.has(r.key) });
        return hidden;
    });
}

/**
 * Build the workbook.
 *
 * @param {object} chart
 * @param {string} chart.title the project's name, or "My Projects"
 * @param {Array} chart.rows every row, none folded (ProjectsPage buildRows)
 * @param {Set<string>} chart.folded what's folded on the page
 * @param {Map<string, {start, end}>} chart.placed each task's dates
 * @param {Array<{date, name}>} chart.holidays
 * @returns {Promise<ExcelJS.Workbook>}
 */
export async function projectWorkbook({ title, rows, folded, placed, holidays }) {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Remembrancer';
    wb.created = new Date();
    // Not `fitToPage` in pageSetup: together with row grouping, ExcelJS 4.4
    // writes the sheet's settings in an order Excel refuses ("We found a
    // problem…", and the sheet is removed when repaired). Fitting the print to
    // one page wide is left to Excel's print dialog.
    const deepest = Math.max(0, ...rows.map((r) => r.level || 0));
    const ws = wb.addWorksheet('Chart', {
        views: [{ state: 'frozen', xSplit: TABLE.length, ySplit: HEAD_ROWS }],
        properties: { outlineLevelRow: deepest, outlineProperties: { summaryBelow: false, summaryRight: false } },
        pageSetup: { orientation: 'landscape' },
    });

    const today = toDay(todayDate());
    const range = dayRange(placed, today);
    const off = new Map((holidays || []).map((h) => [toDay(h.date), h.name || 'Holiday']));
    const isOff = (day) => weekday(day) === 0 || weekday(day) === 6 || off.has(day);
    const col = (day) => FIRST_DAY_COL + (day - range.first);

    // Columns: the table, then one narrow column per day.
    TABLE.forEach((c, i) => { ws.getColumn(i + 1).width = c.width; });
    for (let i = 0; i < range.count; i += 1) ws.getColumn(FIRST_DAY_COL + i).width = 3;

    // Row 1: the title. Row 2: months. Row 3: the table's headers, and each day's number.
    ws.getCell(1, 1).value = title;
    ws.getCell(1, 1).font = { bold: true, size: 14 };
    const head = ws.getRow(HEAD_ROWS);
    TABLE.forEach((c, i) => { head.getCell(i + 1).value = c.header; });
    let monthStart = null;
    for (let i = 0; i <= range.count; i += 1) {
        const day = range.first + i;
        const date = fromDay(day);
        if (i === range.count || (i > 0 && date.endsWith('-01'))) {
            // Close the month that's running: its name across its days.
            const from = FIRST_DAY_COL + monthStart;
            const to = FIRST_DAY_COL + i - 1;
            const name = fromDay(range.first + monthStart);
            ws.getCell(2, from).value = `${MONTHS[Number(name.slice(5, 7)) - 1]} ${name.slice(0, 4)}`;
            if (to > from) ws.mergeCells(2, from, 2, to);
            monthStart = i;
        }
        if (i === 0) monthStart = 0;
        if (i === range.count) break;
        const cell = head.getCell(FIRST_DAY_COL + i);
        cell.value = Number(date.slice(8));
        cell.font = { size: 7, color: { argb: off.has(day) ? 'FFB45309' : 'FF545C6B' } };
        cell.alignment = { horizontal: 'center' };
        if (off.has(day)) cell.note = off.get(day);
    }
    ws.getRow(2).font = { bold: true, color: { argb: 'FF545C6B' } };
    head.font = { bold: true };
    for (let c = 1; c <= TABLE.length; c += 1) head.getCell(c).fill = HEAD;

    // The rows.
    const hidden = hiddenRows(rows, folded || new Set());
    const nameOf = new Map();
    rows.forEach((r) => { if (r.kind === 'task') nameOf.set(r.task.id, r.task.name); });
    rows.forEach((r, i) => {
        const row = ws.getRow(HEAD_ROWS + 1 + i);
        row.outlineLevel = r.level;
        row.hidden = hidden[i];
        const isGroup = r.kind === 'group';
        const dates = isGroup ? r.span : placed.get(r.task.id);
        row.getCell(1).value = isGroup ? r.name : r.task.name;
        row.getCell(1).alignment = { indent: r.level * 2 };
        if (dates) {
            row.getCell(2).value = excelDate(dates.start);
            row.getCell(3).value = excelDate(dates.end);
            row.getCell(2).numFmt = 'mmm d';
            row.getCell(3).numFmt = 'mmm d';
        }
        if (isGroup) {
            row.getCell(4).value = `${r.count} ${r.count === 1 ? 'task' : 'tasks'}`;
            row.font = { bold: true };
            for (let c = 1; c <= TABLE.length; c += 1) row.getCell(c).fill = GROUP_ROW;
        } else {
            row.getCell(4).value = r.task.days;
            row.getCell(5).value = r.task.who || '';
            row.getCell(6).value = (r.task.after || []).map((id) => nameOf.get(id)).filter(Boolean).join(', ');
        }
        // The timeline: shaded days off, the bar, today's line.
        const barFrom = dates ? toDay(dates.start) : null;
        const barTo = dates ? toDay(dates.end) : null;
        for (let day = range.first; day <= range.last; day += 1) {
            const cell = row.getCell(col(day));
            const onBar = dates && day >= barFrom && day <= barTo;
            if (onBar) cell.fill = isGroup ? SPAN : fill(r.color || '#2563eb');
            else if (isOff(day)) cell.fill = SHADE;
            if (onBar || day === today) cell.border = { ...(onBar ? { top: GAP, bottom: GAP } : {}), ...(day === today ? TODAY_LINE : {}) };
        }
    });
    // Shade days off in the header too, and mark today there.
    for (let day = range.first; day <= range.last; day += 1) {
        const cell = head.getCell(col(day));
        if (isOff(day)) cell.fill = SHADE;
        if (day === today) cell.border = TODAY_LINE;
    }

    // Below the chart: what the shading means.
    const legend = ws.getRow(HEAD_ROWS + rows.length + 2);
    legend.getCell(1).value = 'Shaded days: weekends and holidays. Red line: today. Exported from My Projects.';
    legend.getCell(1).font = { italic: true, color: { argb: 'FF99A1AF' } };

    // A second sheet: the holidays.
    const hs = wb.addWorksheet('Holidays');
    hs.columns = [{ header: 'Date', key: 'date', width: 14 }, { header: 'Holiday', key: 'name', width: 30 }];
    hs.getRow(1).font = { bold: true };
    (holidays || []).forEach((h) => {
        const r = hs.addRow({ date: excelDate(h.date), name: h.name || '' });
        r.getCell(1).numFmt = 'ddd mmm d, yyyy';
    });
    return wb;
}

/** A file name from the title: "Kitchen remodel.xlsx". */
export const fileName = (title) => `${String(title || 'My Projects').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'My Projects'}.xlsx`;

/** Build the workbook and hand it to the browser as a download. */
export async function downloadProjectExcel(chart) {
    const wb = await projectWorkbook(chart);
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName(chart.title);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
