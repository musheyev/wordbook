import React from 'react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { connect } from 'react-redux';
import { logoutCurrentUser, toggleNoteWindowMode, fetchTeacherRequestCount } from '../actions';
import WordList from './WordList';
import ConfirmDialog from './ConfirmDialog';
import NavRailResizer from './NavRailResizer';
import AddItemSheet from './AddItemSheet';
import { COGNITO_LOGIN, COGNITO_SIGNUP } from '../utils/cognito';
import { notebookFromPathname, isItemPathname } from '../utils/notebookPaths';
import { ADMIN_PAGES, TEACHER_REQUESTS_CHANGED } from '../utils/adminPages';
import { site } from '../utils/site';
import ClassroomsNav, { useClassroomsSummary } from './ClassroomsNav';

const navClass = ({ isActive }) => `nav-item${isActive ? ' on' : ''}`;
// The main links (Words, My Wordbooks, My Notebooks, Tags, Inbox): first in
// the rail, in the order the site gives (utils/site.js).
const mainClass = (state) => `${navClass(state)} nav-main`;

// The phone's bottom bar has room for five tabs, so Tags, Admin and Log out
// move into the More page there (pages/MorePage.js). CSS hides them (and
// shows More) only on phones; the desktop rail keeps them all.
const phoneMore = (state) => `${mainClass(state)} nav-phone-more`;

// Cardbook navigation. A left rail on desktop, a bottom tab bar on mobile.
// Inside a cardbook, while one of its notes (or words) is open, the rail
// (desktop only) shows the notebook's items under the main links, to jump
// between them, with open-in-windows and add. On the notebook's own page the
// cards show the items, and its title, toolbar and menu are in the page
// (NotebookOverview), so the rail shows just the main links. Admin links and
// the account stay at the bottom; styles.css (.nav-rail--ctx) orders them.
const Header = ({ auth, isAdmin, inboxCount, noteWindowMode, logoutCurrentUser, toggleNoteWindowMode, fetchTeacherRequestCount }) => {
    const navigate = useNavigate();
    const location = useLocation();
    // Admins: how many teacher requests wait for review, shown on the
    // Teachers link. Checked on each page change (a cheap count), and when
    // the Teachers page approves or declines one (TEACHER_REQUESTS_CHANGED).
    const [teacherRequests, setTeacherRequests] = React.useState(0);
    const classroomInvitations = useClassroomsSummary().invitations;
    React.useEffect(() => {
        if (!isAdmin) return undefined;
        const refresh = () => Promise.resolve(fetchTeacherRequestCount()).then(setTeacherRequests);
        refresh();
        window.addEventListener(TEACHER_REQUESTS_CHANGED, refresh);
        return () => window.removeEventListener(TEACHER_REQUESTS_CHANGED, refresh);
    }, [isAdmin, location.pathname, fetchTeacherRequestCount]);

    const userExists = auth != null && auth !== '' && auth !== false;

    const cardbookName = notebookFromPathname(location.pathname);
    const inCardbook = cardbookName !== '';
    const itemOpen = isItemPathname(location.pathname);
    // The phone's More tab stays highlighted on every admin page, and on
    // Tags and More itself (reached from More on phones).
    const inAdminArea = ADMIN_PAGES.some((page) => location.pathname.startsWith(page.to))
        || location.pathname === '/admin';
    const inMoreArea = inAdminArea || location.pathname === '/more' || location.pathname === '/tags'
        || location.pathname === '/quizzes' || location.pathname === '/bookmarks';

    const [confirmingLogout, setConfirmingLogout] = React.useState(false);
    const [addOpen, setAddOpen] = React.useState(false);

    const onLogoutConfirmed = () => {
        setConfirmingLogout(false);
        logoutCurrentUser();
        navigate('/');
    };

    // Before login there is no nav: the landing page carries the brand and the
    // sign-up / log-in actions, so the rail (and mobile tab bar) is hidden.
    if (!userExists) {
        return null;
    }

    return (
        <nav className={`nav-rail${inCardbook ? ' nav-rail--ctx' : ''}`}>
            <Link to={site.homePath} className="nav-brand">
                <i className={`${site.icon} icon`}></i>
                {site.name}
            </Link>

            {inCardbook && userExists && (
                <div className="nav-ctx">
                    {itemOpen && (
                        <>
                            <div className="nav-ctx__labelrow">
                                <span className="nav-ctx__label">Notes</span>
                                <span className="nav-ctx__tools">
                                    <button type="button"
                                        className={`nav-ctx__winbtn${noteWindowMode ? ' on' : ''}`}
                                        aria-pressed={noteWindowMode}
                                        title={noteWindowMode ? 'Notes open in windows (click to turn off)' : 'Open notes in windows'}
                                        aria-label="Open notes in windows"
                                        onClick={toggleNoteWindowMode}>
                                        <i className="window maximize outline icon"></i>
                                    </button>
                                    <button type="button" className="nav-ctx__add" title="Add a word or note"
                                        aria-label="Add a word or note" onClick={() => setAddOpen(true)}>
                                        <i className="plus icon"></i>
                                    </button>
                                </span>
                            </div>
                            <div className="nav-ctx__list">
                                <WordList wordbook={cardbookName} />
                            </div>
                        </>
                    )}
                    <AddItemSheet open={addOpen} wordbook={cardbookName} onClose={() => setAddOpen(false)} />
                </div>
            )}

            <div className="nav-items">
                {site.nav.map((key) => {
                    switch (key) {
                        case 'words':
                            return (
                                <NavLink key={key} to={site.wordsPath} end className={mainClass}>
                                    <i className="search icon"></i>
                                    <span className="nav-label">Words</span>
                                </NavLink>
                            );
                        case 'wordbooks':
                            return (
                                <NavLink key={key} to="/wordbooks" className={mainClass}>
                                    <i className="book icon"></i>
                                    {/* "My" is dropped on phones, to fit the tab. */}
                                    <span className="nav-label"><span className="nav-desk-only">My </span>Wordbooks</span>
                                </NavLink>
                            );
                        case 'notebooks':
                            return (
                                <NavLink key={key} to="/account" className={mainClass}>
                                    <i className="clone outline icon"></i>
                                    {/* "My" is dropped on phones, to fit the tab. */}
                                    <span className="nav-label"><span className="nav-desk-only">My </span>Notebooks</span>
                                </NavLink>
                            );
                        case 'tags':
                            return (
                                <NavLink key={key} to="/tags" className={phoneMore}>
                                    <i className="tags icon"></i>
                                    <span className="nav-label">Tags</span>
                                </NavLink>
                            );
                        case 'inbox':
                            return (
                                <NavLink key={key} to="/inbox" className={mainClass}>
                                    <span className="nav-icon-wrap">
                                        <i className="inbox icon"></i>
                                        {inboxCount > 0 && (
                                            <span className="nav-badge" aria-label={`${inboxCount} new`}>
                                                {inboxCount > 99 ? '99+' : inboxCount}
                                            </span>
                                        )}
                                    </span>
                                    <span className="nav-label">Inbox</span>
                                </NavLink>
                            );
                        default:
                            return null;
                    }
                })}

                {/* My Classrooms, as a tree (desktop rail; on phones, in More). */}
                <ClassroomsNav signedIn={userExists} />

                {/* My Bookmarks: in the desktop rail; on phones, in More. */}
                {userExists && (
                    <NavLink to="/bookmarks" className={phoneMore}>
                        <i className="star outline icon"></i>
                        <span className="nav-label">My Bookmarks</span>
                    </NavLink>
                )}

                {/* My Quizzes (admins for now): in the desktop rail; on phones, in More. */}
                {userExists && isAdmin && (
                    <NavLink to="/quizzes" className={phoneMore}>
                        <i className="question circle outline icon"></i>
                        <span className="nav-label">My Quizzes</span>
                    </NavLink>
                )}

                {/* Phones only: Tags, My Bookmarks, My Quizzes, Admin and Log out, on one page. */}
                <NavLink to="/more" className={() => `nav-item nav-main nav-more-tab${inMoreArea ? ' on' : ''}`}>
                    <span className="nav-icon-wrap">
                        <i className="ellipsis horizontal icon"></i>
                        {/* Classroom invitations wait in More → My Classrooms. */}
                        {classroomInvitations > 0 && (
                            <span className="nav-badge" aria-label={`${classroomInvitations} invitations`}>{classroomInvitations}</span>
                        )}
                    </span>
                    <span className="nav-label">More</span>
                </NavLink>

                {/* Admin area, admins only: an "Admin" group listing each
                    admin page, in the desktop rail. On phones it's hidden;
                    More links to the /admin hub instead. */}
                {userExists && isAdmin && (
                    <div className="nav-admin-group">
                        <div className="nav-group-label">Admin</div>
                        {ADMIN_PAGES.map((page) => (
                            <NavLink key={page.to} to={page.to} className={navClass}>
                                <span className="nav-icon-wrap">
                                    <i className={`${page.icon} icon`}></i>
                                    {page.to === '/admin/teachers' && teacherRequests > 0 && (
                                        <span className="nav-badge" aria-label={`${teacherRequests} waiting`}>{teacherRequests}</span>
                                    )}
                                </span>
                                <span className="nav-label">{page.label}</span>
                            </NavLink>
                        ))}
                    </div>
                )}

                <div className="nav-spacer" />

                {userExists ? (
                    <>
                        <span className="nav-user">
                            <i className="user circle icon"></i>
                            <span className="nav-label">{auth}</span>
                        </span>
                        <button type="button" className="nav-item nav-logout"
                            onClick={() => setConfirmingLogout(true)}>
                            <i className="sign out icon"></i>
                            <span className="nav-label">Log out</span>
                        </button>
                    </>
                ) : (
                    <>
                        <a className="nav-item" href={COGNITO_LOGIN}>
                            <i className="sign in icon"></i>
                            <span className="nav-label">Login</span>
                        </a>
                        <a className="nav-item" href={COGNITO_SIGNUP}>
                            <i className="edit outline icon"></i>
                            <span className="nav-label">Sign up</span>
                        </a>
                    </>
                )}
            </div>

            <ConfirmDialog
                open={confirmingLogout}
                title="Log out?"
                message="You'll need to sign in again to open your notebooks."
                confirmLabel="Log out"
                cancelLabel="Cancel"
                tone="accent"
                onConfirm={onLogoutConfirmed}
                onCancel={() => setConfirmingLogout(false)}
            />

            {/* Drag handle to resize the rail (desktop only; hidden on mobile). */}
            <NavRailResizer />
        </nav>
    );
};

function mapStateToProps({ auth, isAdmin, inbox, noteWindows }) {
    return {
        auth, isAdmin,
        inboxCount: Array.isArray(inbox) ? inbox.length : 0,
        noteWindowMode: noteWindows.mode,
    };
}

export default connect(mapStateToProps, { logoutCurrentUser, toggleNoteWindowMode, fetchTeacherRequestCount })(Header);
