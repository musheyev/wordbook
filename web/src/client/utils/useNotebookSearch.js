import { useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { searchNotebook } from '../actions';

// Searching a notebook's items (the desktop overview and the phone list).
//
//   titles  matches titles as you type, on the device (instant)
//   all     everything: notes' whole text, words, your notes on words —
//           searched by the server (api/notebook-search.js) once typing pauses
//   defs    everything + the words' dictionary definitions
//
// The mode is remembered per device. Text results come back as the matching
// items, each with the passage around the match and where it was found.
export const SEARCH_MODES = [
    { key: 'titles', label: 'Titles' },
    { key: 'all', label: 'Everything' },
    { key: 'defs', label: 'Everything + definitions' },
];
export const WHERE_LABEL = {
    title: 'in title',
    note: 'in note',
    'word-note': 'in your note',
    definition: 'in definition',
};

const MODE_KEY = 'notebook-search-mode';
const DELAY_MS = 350;
const readMode = () => {
    try { const m = localStorage.getItem(MODE_KEY); return SEARCH_MODES.some((x) => x.key === m) ? m : 'titles'; } catch (e) { return 'titles'; }
};

const keyOf = (item) => `${item.type}:${item.id}`;

/**
 * @param {string} wordbook
 * @param {Array} items the notebook's items
 * @returns {{ query, setQuery, mode, setMode, searching: boolean, textSearch: boolean,
 *   results: Array<{item, where?, snippet?}>, loading: boolean, error: string, tooShort: boolean }}
 */
export default function useNotebookSearch(wordbook, items) {
    const dispatch = useDispatch();
    const [query, setQuery] = useState('');
    const [mode, setModeState] = useState(readMode);
    const [found, setFound] = useState({ for: null, results: [] });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const latest = useRef(0);

    const setMode = (m) => {
        setModeState(m);
        try { localStorage.setItem(MODE_KEY, m); } catch (e) { /* ignore */ }
    };

    const q = query.trim();
    const textSearch = mode !== 'titles' && q.length > 0;
    const tooShort = textSearch && q.length < 2;
    const searchKey = `${wordbook}\n${mode}\n${q}`;

    useEffect(() => {
        if (!textSearch || tooShort) { setLoading(false); setError(''); return undefined; }
        const ticket = ++latest.current;
        setLoading(true);
        setError('');
        const timer = setTimeout(async () => {
            try {
                const results = await dispatch(searchNotebook(wordbook, q, mode === 'defs'));
                if (ticket !== latest.current) return; // a newer search started
                setFound({ for: searchKey, results });
            } catch (err) {
                if (ticket !== latest.current) return;
                setError(err.message);
            }
            if (ticket === latest.current) setLoading(false);
        }, DELAY_MS);
        return () => clearTimeout(timer);
    }, [searchKey]);

    let results;
    if (!q) {
        results = items.map((item) => ({ item }));
    } else if (mode === 'titles') {
        const lower = q.toLowerCase();
        results = items.filter((item) => (item.title || '').toLowerCase().includes(lower)).map((item) => ({ item }));
    } else {
        // Server matches, shown with the notebook's own item data (e.g. a
        // note's preview), in notebook order.
        const byKey = new Map(items.map((item) => [keyOf(item), item]));
        results = found.for === searchKey
            ? found.results.map((r) => ({ item: byKey.get(keyOf(r)) || r, where: r.where, snippet: r.snippet }))
            : [];
    }

    return {
        query, setQuery, mode, setMode,
        searching: q.length > 0, textSearch, tooShort,
        results, loading: textSearch && !tooShort && (loading || found.for !== searchKey) && !error, error,
    };
}
