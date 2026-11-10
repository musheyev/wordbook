// Teacher tools are used on a computer, so the phone stays simple (decided
// for teacher accounts): becoming a teacher, the teacher rules, the admin's
// Teachers page, and later running classrooms. A "computer" is a screen wider
// than 768px — the same line where the side panel turns into the phone's tab
// bar, so an iPad held sideways counts — and never the iPhone app.
//
// Phones show no links to these pages. If one is opened there anyway (a
// shared link), ComputerOnly shows a short note with the page's web address
// instead of the page.
import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { isNativeApp } from '../native/platform';
import { site } from './site';

const QUERY = '(min-width: 769px)';

const matches = () => typeof window !== 'undefined' && !isNativeApp()
    && !!window.matchMedia && window.matchMedia(QUERY).matches;

/** True on a computer-sized screen (not the iPhone app); follows resizing. */
export function useIsComputer() {
    const [is, setIs] = useState(matches);
    useEffect(() => {
        if (!window.matchMedia || isNativeApp()) return undefined;
        const mq = window.matchMedia(QUERY);
        const onChange = () => setIs(matches());
        mq.addEventListener('change', onChange);
        return () => mq.removeEventListener('change', onChange);
    }, []);
    return is;
}

/**
 * The page on a computer; elsewhere: "Teacher tools work on a computer. Open
 * https://makeyourwordbook.com/teacher on your computer."
 */
export function ComputerOnly({ children }) {
    const isComputer = useIsComputer();
    const location = useLocation();
    if (isComputer) return children;
    const address = `https://${site.domain}${location.pathname}`;
    return (
        <div className="computer-only">
            <i className="desktop icon computer-only__icon" aria-hidden="true"></i>
            <p className="computer-only__title">Teacher tools work on a computer.</p>
            <p className="computer-only__text">
                Open <span className="computer-only__url">{address}</span> on your computer.
            </p>
        </div>
    );
}
