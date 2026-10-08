// The admin pages, for the admin hub (pages/AdminPage.js) and the desktop
// rail (components/Header.js). Kept apart from the pages themselves so the
// rail doesn't pull admin code into everyone's download: the pages load only
// when opened (routes.jsx).
export const ADMIN_PAGES = [
    { to: '/users', icon: 'users', label: 'Users', hint: 'Everyone with an account' },
    { to: '/admins', icon: 'shield alternate', label: 'Admins', hint: 'Members of the admins group' },
    { to: '/admin/images', icon: 'image outline', label: 'Images', hint: 'Image search on/off; review and delete word images' },
    { to: '/admin/image-cleanup', icon: 'trash alternate outline', label: 'Image cleanup', hint: 'Archive, restore, or clear unused note and word images' },
    { to: '/admin/audio-cleanup', icon: 'volume off', label: 'Audio cleanup', hint: 'Archive, restore, or clear read-aloud audio no longer used' },
];
