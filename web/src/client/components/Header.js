import React from 'react';
import { createPortal } from 'react-dom';
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
import NewNotePopup from './NewNotePopup';

// Two choices about the side panel, remembered in this browser (like its
// width, NavRailResizer). localStorage can throw (private windows, blocked
// storage), so every read and write is guarded: the panel still works, it
// just won't remember.
//   nav-rail-collapsed  "yes" when the panel is folded down to its icons
//   nav-notes-open      "yes" once the notes list has been opened; closed
//                       until then (and again after closing it)
const COLLAPSED_KEY = 'nav-rail-collapsed';
const NOTES_OPEN_KEY = 'nav-notes-open';
const readYes = (key) => { try { return localStorage.getItem(key) === 'yes'; } catch (e) { return false; } };
const writeYes = (key, yes) => { try { localStorage.setItem(key, yes ? 'yes' : 'no'); } catch (e) { /* only a preference */ } };

const navClass = ({ isActive }) => `nav-item${isActive ? ' on' : ''}`;
// The main links (Words, My Wordbooks, My Notebooks, Tags, Inbox): first in
// the rail, in the order the site gives (utils/site.js).
const mainClass = (state) => `${navClass(state)} nav-main`;

// The phone's bottom bar has room for five tabs, so Tags, Admin and Log out
// move into the More page there (pages/MorePage.js). CSS hides them (and
// shows More) only on phones; the desktop rail keeps them all.
const phoneMore = (state) => `${mainClass(state)} nav-phone-more`;

// Cardbook navigation. A left rail on desktop, a bottom tab bar on mobile.
//
// On desktop the rail can be collapsed to a narrow column of icons
// ("Collapse panel" at the bottom; the same spot opens it again). Collapsed,
// the labels are hidden and each link shows its name as a tooltip.
// Inside a cardbook, while one of its notes (or words) is open, the rail
// (desktop only) shows the notebook's items under the main links, to jump
// between them, with open-in-windows and add. On the notebook's own page the
// cards show the items, and its title, toolbar and menu are in the page
// (NotebookOverview), so the rail shows just the main links. Admin links and
// the account stay at the bottom; styles.css (.nav-rail--ctx) orders them.
const Header = ({ auth, isAdmin, inboxCount, noteWindowMode, notesFor, notesLength, logoutCurrentUser, toggleNoteWindowMode, fetchTeacherRequestCount }) => {
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
    // The + beside Notes: a new note in a popup (NewNotePopup). Its "look up
    // a word" link swaps it for the Add sheet (AddItemSheet).
    const [newNoteOpen, setNewNoteOpen] = React.useState(false);
    const [addOpen, setAddOpen] = React.useState(false);
    const [collapsed, setCollapsed] = React.useState(() => readYes(COLLAPSED_KEY));
    const [notesOpen, setNotesOpen] = React.useState(() => readYes(NOTES_OPEN_KEY));

    const toggleCollapsed = () => {
        setCollapsed((was) => { writeYes(COLLAPSED_KEY, !was); return !was; });
    };
    const toggleNotes = () => {
        setNotesOpen((was) => { writeYes(NOTES_OPEN_KEY, !was); return !was; });
    };
    // The notes icon in the collapsed panel: open the panel on the notes.
    const showNotes = () => {
        setCollapsed(false); writeYes(COLLAPSED_KEY, false);
        setNotesOpen(true); writeYes(NOTES_OPEN_KEY, true);
    };
    // How many notes and words the notebook has, once its list has loaded.
    const notesCount = notesFor === cardbookName ? notesLength : null;
    // Collapsed, each link's name shows as a tooltip instead of a label.
    const tip = (label) => (collapsed ? label : undefined);

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
        <nav className={`nav-rail${inCardbook ? ' nav-rail--ctx' : ''}${collapsed ? ' nav-rail--collapsed' : ''}`}>
            <Link to={site.homePath} className="nav-brand" title={tip(site.name)}>
                <i className={`${site.icon} icon`}></i>
                <span className="nav-label">{site.name}</span>
            </Link>

            {inCardbook && userExists && (
                <div className={`nav-ctx${notesOpen ? ' nav-ctx--open' : ''}`}>
                    {itemOpen && (
                        <>
                            {/* Collapsed panel: one icon that opens the panel on the notes. */}
                            <button type="button" className="nav-item nav-ctx__icon" title={`${cardbookName} notes`}
                                aria-label={`Show ${cardbookName} notes`} onClick={showNotes}>
                                <i className="list ul icon"></i>
                            </button>
                            {/* The notebook's notes: a header row that opens and
                                closes the list (closed until you open it, then
                                remembered), with the window and + buttons. */}
                            <div className="nav-ctx__labelrow">
                                <button type="button" className="nav-ctx__toggle" aria-expanded={notesOpen}
                                    onClick={toggleNotes} title={notesOpen ? 'Hide notes' : 'Show notes'}>
                                    <i className={`${notesOpen ? 'angle down' : 'angle right'} icon`} aria-hidden="true"></i>
                                    <span className="nav-ctx__name">{cardbookName}</span>
                                    {notesCount !== null && <span className="nav-ctx__count">{notesCount}</span>}
                                </button>
                                <span className="nav-ctx__tools">
                                    <button type="button"
                                        className={`nav-ctx__winbtn${noteWindowMode ? ' on' : ''}`}
                                        aria-pressed={noteWindowMode}
                                        title={noteWindowMode ? 'Notes open in windows (click to turn off)' : 'Open notes in windows'}
                                        aria-label="Open notes in windows"
                                        onClick={toggleNoteWindowMode}>
                                        <i className="window maximize outline icon"></i>
                                    </button>
                                    <button type="button" className="nav-ctx__add" title="New note"
                                        aria-label="New note" onClick={() => setNewNoteOpen(true)}>
                                        <i className="plus icon"></i>
                                    </button>
                                </span>
                            </div>
                            {notesOpen && (
                                <div className="nav-ctx__list">
                                    <WordList wordbook={cardbookName} />
                                </div>
                            )}
                        </>
                    )}
                    {/* The popups are drawn at the end of <body> (a portal), not
                        here: the rail is position: sticky, which makes it its own
                        stacking layer, so anything inside it, however high its
                        z-index, is painted UNDER the page next to it. */}
                    {createPortal(
                        <>
                            <NewNotePopup open={newNoteOpen} wordbook={cardbookName}
                                onClose={() => setNewNoteOpen(false)}
                                onLookUpWord={() => { setNewNoteOpen(false); setAddOpen(true); }} />
                            <AddItemSheet open={addOpen} wordbook={cardbookName} onClose={() => setAddOpen(false)} />
                        </>,
                        document.body,
                    )}
                </div>
            )}

            <div className="nav-items">
                {site.nav.map((key) => {
                    switch (key) {
                        case 'words':
                            return (
                                <NavLink key={key} to={site.wordsPath} end className={mainClass} title={tip('Words')}>
                                    <i className="search icon"></i>
                                    <span className="nav-label">Words</span>
                                </NavLink>
                            );
                        case 'wordbooks':
                            return (
                                <NavLink key={key} to="/wordbooks" className={mainClass} title={tip('My Wordbooks')}>
                                    <i className="book icon"></i>
                                    {/* "My" is dropped on phones, to fit the tab. */}
                                    <span className="nav-label"><span className="nav-desk-only">My </span>Wordbooks</span>
                                </NavLink>
                            );
                        case 'notebooks':
                            return (
                                <NavLink key={key} to="/account" className={mainClass} title={tip('My Notebooks')}>
                                    <i className="clone outline icon"></i>
                                    {/* "My" is dropped on phones, to fit the tab. */}
                                    <span className="nav-label"><span className="nav-desk-only">My </span>Notebooks</span>
                                </NavLink>
                            );
                        case 'tags':
                            return (
                                <NavLink key={key} to="/tags" className={phoneMore} title={tip('Tags')}>
                                    <i className="tags icon"></i>
                                    <span className="nav-label">Tags</span>
                                </NavLink>
                            );
                        case 'inbox':
                            return (
                                <NavLink key={key} to="/inbox" className={mainClass} title={tip('Inbox')}>
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
                <ClassroomsNav signedIn={userExists} collapsed={collapsed} />

                {/* My Bookmarks: in the desktop rail; on phones, in More. */}
                {userExists && (
                    <NavLink to="/bookmarks" className={phoneMore} title={tip('My Bookmarks')}>
                        <i className="star outline icon"></i>
                        <span className="nav-label">My Bookmarks</span>
                    </NavLink>
                )}

                {/* My Quizzes (admins for now): in the desktop rail; on phones, in More. */}
                {userExists && isAdmin && (
                    <NavLink to="/quizzes" className={phoneMore} title={tip('My Quizzes')}>
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
                            <NavLink key={page.to} to={page.to} className={navClass} title={tip(page.label)}>
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
                        <span className="nav-user" title={tip(auth)}>
                            <i className="user circle icon"></i>
                            <span className="nav-label">{auth}</span>
                        </span>
                        <button type="button" className="nav-item nav-logout" title={tip('Log out')}
                            onClick={() => setConfirmingLogout(true)}>
                            <i className="sign out icon"></i>
                            <span className="nav-label">Log out</span>
                        </button>
                        {/* Desktop only: fold the panel down to its icons, or open it again. */}
                        <button type="button" className="nav-item nav-collapse" onClick={toggleCollapsed}
                            title={tip('Expand panel')} aria-label={collapsed ? 'Expand panel' : 'Collapse panel'}
                            aria-expanded={!collapsed}>
                            <i className={`angle double ${collapsed ? 'right' : 'left'} icon`}></i>
                            <span className="nav-label">Collapse panel</span>
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

            {/* Drag handle to resize the rail (desktop only; hidden on mobile,
                and while collapsed). */}
            {!collapsed && <NavRailResizer />}
        </nav>
    );
};

function mapStateToProps({ auth, isAdmin, inbox, noteWindows, wordbookWords, wordbookWordsFor }) {
    return {
        auth, isAdmin,
        inboxCount: Array.isArray(inbox) ? inbox.length : 0,
        noteWindowMode: noteWindows.mode,
        // Which notebook's list is loaded, and how many items it has (the
        // count beside the notebook's name above its notes).
        notesFor: wordbookWordsFor,
        notesLength: (wordbookWords || []).length,
    };
}

export default connect(mapStateToProps, { logoutCurrentUser, toggleNoteWindowMode, fetchTeacherRequestCount })(Header);
