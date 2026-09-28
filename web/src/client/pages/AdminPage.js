import React from 'react';
import { Link } from 'react-router-dom';
import requireAdmin from '../components/hocs/requireAdmin';

// Admin hub (/admin): the phone tab bar has a single Admin tab that opens this
// list of admin pages. On desktop the rail lists the same pages directly.
export const ADMIN_PAGES = [
    { to: '/users', icon: 'users', label: 'Users', hint: 'Everyone with an account' },
    { to: '/admins', icon: 'shield alternate', label: 'Admins', hint: 'Members of the admins group' },
    { to: '/admin/images', icon: 'image outline', label: 'Images', hint: 'Review and delete word images' },
];

function AdminPage() {
    return (
        <div className="admin-page">
            <div className="admin-page__head">
                <h1 className="cb-page-title">Admin</h1>
            </div>
            <ul className="admin-hub">
                {ADMIN_PAGES.map((page) => (
                    <li key={page.to}>
                        <Link className="admin-hub__row" to={page.to}>
                            <i className={`${page.icon} icon admin-hub__icon`} aria-hidden="true"></i>
                            <span className="admin-hub__text">
                                <span className="admin-hub__label">{page.label}</span>
                                <span className="admin-hub__hint">{page.hint}</span>
                            </span>
                            <i className="chevron right icon admin-hub__chev" aria-hidden="true"></i>
                        </Link>
                    </li>
                ))}
            </ul>
        </div>
    );
}

export default requireAdmin(AdminPage);
