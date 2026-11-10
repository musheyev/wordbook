// The admin pages, for the admin hub (pages/AdminPage.js) and the desktop
// rail (components/Header.js). Kept apart from the pages themselves so the
// rail doesn't pull admin code into everyone's download: the pages load only
// when opened (routes.jsx).
//
// `computerOnly`: shown only in the desktop rail, not in the phone's admin
// hub (teacher tools are used on a computer; utils/computerOnly.js).
export const ADMIN_PAGES = [
    { to: '/users', icon: 'users', label: 'Users', hint: 'Everyone with an account' },
    { to: '/admins', icon: 'shield alternate', label: 'Admins', hint: 'Members of the admins group' },
    { to: '/admin/teachers', icon: 'graduation cap', label: 'Teachers', hint: 'Requests to become a teacher; teachers', computerOnly: true },
    { to: '/admin/images', icon: 'image outline', label: 'Images', hint: 'Image search on/off; review and delete word images' },
    { to: '/admin/image-cleanup', icon: 'trash alternate outline', label: 'Image cleanup', hint: 'Archive, restore, or clear unused note and word images' },
    { to: '/admin/audio-cleanup', icon: 'volume off', label: 'Audio cleanup', hint: 'Archive, restore, or clear read-aloud audio no longer used' },
];

// Sent (on window) when the Teachers page approves or declines a request,
// so the waiting count on the Teachers link updates (Header).
export const TEACHER_REQUESTS_CHANGED = 'teacher-requests-changed';
