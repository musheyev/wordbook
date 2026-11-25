import { SET_PROJECTS, PROJECT_SAVED, PROJECT_DELETED, TASKS_SAVED, TASK_DELETED, PROJECTS_LAYOUT_SET, PROJECT_STATE, HOLIDAYS_SET } from '../actions';

// My Projects: { projects: [{ id, name, created_at }], tasks: [{ id,
// projectId, name, days, after, start, who, notes, order, group }], groups:
// [{ id, projectId, name, order }], holidays: [{ date, name }], layout: { widths,
// folded, tableFolded } }, or null until
// loaded (api/projects.js). Saves come back one task or project at a time and
// replace the old copy in place, so the chart redraws without a reload.
export default function projectsReducer(state = null, action) {
    switch (action.type) {
        case SET_PROJECTS:
            return { groups: [], holidays: [], ...action.payload };
        case PROJECT_STATE: {
            if (!state) return state;
            const { projectId, tasks, groups } = action.payload;
            return {
                ...state,
                tasks: [...state.tasks.filter((t) => t.projectId !== projectId), ...tasks].sort((a, b) => a.order - b.order),
                groups: [...(state.groups || []).filter((g) => g.projectId !== projectId), ...groups].sort((a, b) => a.order - b.order),
            };
        }
        case PROJECT_SAVED: {
            if (!state) return state;
            const p = action.payload;
            const has = state.projects.some((x) => x.id === p.id);
            return { ...state, projects: has ? state.projects.map((x) => (x.id === p.id ? { ...x, ...p } : x)) : [...state.projects, p] };
        }
        case PROJECT_DELETED:
            if (!state) return state;
            return {
                ...state,
                projects: state.projects.filter((p) => p.id !== action.payload),
                tasks: state.tasks.filter((t) => t.projectId !== action.payload),
                groups: (state.groups || []).filter((g) => g.projectId !== action.payload),
            };
        case TASKS_SAVED: {
            if (!state) return state;
            let tasks = state.tasks;
            action.payload.forEach((t) => {
                tasks = tasks.some((x) => x.id === t.id) ? tasks.map((x) => (x.id === t.id ? t : x)) : [...tasks, t];
            });
            return { ...state, tasks: [...tasks].sort((a, b) => a.order - b.order) };
        }
        case TASK_DELETED:
            if (!state) return state;
            return { ...state, tasks: state.tasks.filter((t) => t.id !== action.payload) };
        case HOLIDAYS_SET:
            if (!state) return state;
            return { ...state, holidays: action.payload };
        case PROJECTS_LAYOUT_SET:
            if (!state) return state;
            return { ...state, layout: action.payload };
        default:
            return state;
    }
}
