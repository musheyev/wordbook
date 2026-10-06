import React, { useEffect, useState } from 'react';
import { connect } from 'react-redux';
import { fetchImageSearchEnabled, saveImageSearchEnabled } from '../actions';

// Admin › Images: turn Brave image search on or off for the whole app
// (api/app-settings.js). Off: new words get no automatic images and
// "Refresh images" is unavailable; users can still add their own images.
function ImageSearchSwitch({ enabled, fetchImageSearchEnabled, saveImageSearchEnabled }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => { fetchImageSearchEnabled(); }, [fetchImageSearchEnabled]);

    const toggle = async (e) => {
        setBusy(true);
        setError('');
        try {
            await saveImageSearchEnabled(e.target.checked);
        } catch (err) {
            setError(err.message);
        }
        setBusy(false);
    };

    return (
        <div className="admin-setting">
            <div>
                <div className="admin-setting__label" id="image-search-label">Automatic image search (Brave)</div>
                <div className="admin-setting__hint">
                    {enabled === false
                        ? 'Off: new words get no automatic images, and Refresh images is unavailable. People can still add their own images.'
                        : 'On: new words get images automatically, and admins can use Refresh images.'}
                </div>
                {error && <div className="cb-sheet__error">{error}</div>}
            </div>
            <label className="cb-switch">
                <input type="checkbox" role="switch" aria-labelledby="image-search-label"
                    checked={enabled !== false} disabled={busy || enabled === null} onChange={toggle} />
                <span className="cb-switch__track" aria-hidden="true"></span>
            </label>
        </div>
    );
}

function mapStateToProps({ imageSearchEnabled }) {
    return { enabled: imageSearchEnabled };
}

export default connect(mapStateToProps, { fetchImageSearchEnabled, saveImageSearchEnabled })(ImageSearchSwitch);
