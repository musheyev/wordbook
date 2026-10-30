import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { requestErrorMessage } from '../actions';

// A notebook for sale, loaded from your account: its notes (in your order)
// and which of them are free samples (sales/catalog.js).
//
// For now this uses the ordinary signed-in API (POST /wordbook/words), so it
// only works on localhost while you're signed in. A public sales page would
// need a read-only route for signed-out visitors instead.
//
//   { status: 'loading' }
//   { status: 'error', message }
//   { status: 'ready', notes: [{ id, title, preview }], sampleIds: Set }
const NO_NOTES = "No notes found. For now they come from your account: sign in at localhost:3000 "
    + "(in this browser), and check the notebook's name in sales/catalog.js.";

export default function useNotebook(product) {
    const dispatch = useDispatch();
    const [state, setState] = useState({ status: 'loading' });

    useEffect(() => {
        if (!product) return undefined;
        let cancelled = false;
        setState({ status: 'loading' });
        // A thunk gets the app's API client (main.jsx) as its third argument.
        dispatch(async (_d, _getState, api) => {
            try {
                const res = await api.post('/wordbook/words', { wordbook: product.notebook });
                const notes = (res.data || []).filter((item) => item.type === 'card');
                if (cancelled) return;
                // Signed out, the server answers with an empty list.
                if (!notes.length) {
                    setState({ status: 'error', message: NO_NOTES });
                    return;
                }
                const byTitle = notes.filter((n) => product.samples.includes(n.title));
                const samples = byTitle.length ? byTitle : notes.slice(0, 3);
                setState({ status: 'ready', notes, sampleIds: new Set(samples.map((n) => n.id)) });
            } catch (err) {
                if (cancelled) return;
                const signedOut = err.response && err.response.status === 401;
                setState({
                    status: 'error',
                    message: signedOut ? NO_NOTES : requestErrorMessage(err, "Couldn't load this notebook."),
                });
            }
        });
        return () => { cancelled = true; };
    }, [product, dispatch]);

    return state;
}
