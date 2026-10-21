import React, { useEffect, useState } from 'react';
import { useOffline } from './DownloadBadge';
import ConfirmDialog from './ConfirmDialog';
import { removeAllDownloads, storageUsed } from '../offline/downloads';

// "Downloads on this device", at the bottom of My Notebooks (iPhone app
// only): how many notebooks and notes are downloaded, roughly how much space
// that takes, and Remove all downloads — the phone's copies only; notebooks
// and notes stay in the account (offline/downloads.js). Notes written or
// edited offline and not yet sent are kept.
const formatSize = (bytes) => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB`
    : bytes >= 1e6 ? `${Math.round(bytes / 1e6)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`);

export default function DeviceDownloads() {
    const offline = useOffline();
    const [size, setSize] = useState(null);
    const [confirming, setConfirming] = useState(false);
    const notebooks = Object.keys(offline.registry.notebooks).length;
    const items = Object.keys(offline.registry.saved || {}).length; // actually on the device

    useEffect(() => {
        if (offline.enabled) storageUsed().then(setSize);
    }, [offline.enabled, offline.registry]);

    if (!offline.enabled) return null;
    const parts = [
        notebooks && `${notebooks} notebook${notebooks === 1 ? '' : 's'}`,
        items && `${items} ${items === 1 ? 'item' : 'items'}`,
    ].filter(Boolean);

    return (
        <div className="device-downloads">
            <div className="device-downloads__text">
                <i className="arrow alternate circle down outline icon" aria-hidden="true"></i>
                <span>
                    <strong>Downloads on this device</strong>
                    <span className="device-downloads__sub">
                        {parts.length ? parts.join(' · ') : 'Nothing downloaded'}
                        {size != null && parts.length ? ` · about ${formatSize(size)}` : ''}
                    </span>
                </span>
            </div>
            {parts.length > 0 && (
                <button type="button" className="cb-btn cb-btn--ghost" onClick={() => setConfirming(true)}>
                    Remove all downloads
                </button>
            )}
            <ConfirmDialog
                open={confirming}
                title="Remove all downloads?"
                message="This removes the copies kept on this device. Your notebooks and notes stay in your account, and you can download them again."
                confirmLabel="Remove"
                onConfirm={() => { setConfirming(false); removeAllDownloads(); }}
                onCancel={() => setConfirming(false)}
            />
        </div>
    );
}
