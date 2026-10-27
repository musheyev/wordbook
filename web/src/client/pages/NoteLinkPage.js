import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import requireAuth from '../components/hocs/requireAuth';
import SearchResult from '../components/SearchResult';
import Spinner from '../components/Spinner';
import { findNoteLinkNotebook, fetchWordData } from '../actions';
import { itemPath } from '../utils/notebookPaths';
import { site } from '../utils/site';

// A note link's own address (/note/<type>/<id>; utils/noteLinks.js). A tap on
// a link inside the app doesn't come here (components/NoteLinks.js opens the
// note directly); this is for a link opened in a new tab, or typed.
//
// It finds a notebook that has the note or word and moves there, as if the
// note had been opened from that notebook. A word no notebook has any more
// is shown here instead (its definitions and your note, as on Words). A note
// that can't be found says so.
function NoteLinkPage() {
    const { type, id } = useParams();
    const navigate = useNavigate();
    const dispatch = useDispatch();
    // 'finding' | 'word' (shown here) | 'missing' | 'error'
    const [state, setState] = useState('finding');

    useEffect(() => {
        let cancelled = false;
        setState('finding');
        dispatch(findNoteLinkNotebook({ type, id }))
            .then((notebook) => {
                if (cancelled) return;
                if (notebook) navigate(itemPath(notebook, { type, id }), { replace: true });
                else if (type === 'word') { dispatch(fetchWordData(id)); setState('word'); }
                else setState('missing');
            })
            .catch(() => { if (!cancelled) setState('error'); });
        return () => { cancelled = true; };
    }, [type, id]);

    if (state === 'finding') return <Spinner label="Opening…" />;
    if (state === 'word') {
        return <section id="worddefinition"><SearchResult /></section>;
    }
    return (
        <div className="cb-empty">
            {state === 'missing'
                ? 'That note was deleted, or isn’t in any of your notebooks.'
                : 'Couldn’t open that link. Check your connection and try again.'}
            {' '}<Link to={site.homePath}>Go to the home page</Link>
        </div>
    );
}

export default requireAuth(NoteLinkPage);
