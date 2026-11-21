import { useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { fetchRandomDefinitions } from '../actions';

// One random definition of each word in a notebook, for its word cards
// (NotebookOverview) and rows (NotebookItemList), in place of a plain
// "Word". The server picks it from the definitions it already keeps
// (api/random-definitions.js) and saves nothing, so every opening of the
// notebook shows a fresh pick.
//
// Asked once the list is in, and never holds the list up: the cards show at
// once and the definitions fill in. While the notebook stays open, only
// words that join it are asked about (re-sorting or a refreshed list keeps
// the definitions already shown). With no connection (the iPhone app
// offline) the request fails quietly and the cards show their titles.

/**
 * @param {string} name the notebook
 * @param {Array<{type: string, id: string}>} items its items
 * @returns {Object<string, string>} word id -> definition (only words that have one)
 */
export default function useRandomDefinitions(name, items) {
    const dispatch = useDispatch();
    const [definitions, setDefinitions] = useState({});
    // Which notebook the definitions are for, and the words already asked
    // about there.
    const asked = useRef({ name: null, words: new Set() });

    const words = items.filter((item) => item.type === 'word').map((item) => item.id);
    // Changes only when words join or leave, not when the order does.
    const wordsKey = [...words].sort().join('\n');

    useEffect(() => {
        if (asked.current.name !== name) {
            asked.current = { name, words: new Set() };
            setDefinitions({});
        }
        const fresh = words.filter((w) => !asked.current.words.has(w));
        if (fresh.length === 0) return;
        fresh.forEach((w) => asked.current.words.add(w));
        dispatch(fetchRandomDefinitions(fresh))
            .then((got) => {
                if (asked.current.name !== name) return; // another notebook by now
                setDefinitions((had) => ({ ...had, ...got }));
            })
            // Asked again next time the list changes (e.g. back online).
            .catch(() => fresh.forEach((w) => asked.current.words.delete(w)));
    }, [name, wordsKey]); // eslint-disable-line react-hooks/exhaustive-deps

    // Just after switching notebooks, before the effect clears them, the
    // last notebook's definitions are still here: show none.
    return asked.current.name === name ? definitions : {};
}
