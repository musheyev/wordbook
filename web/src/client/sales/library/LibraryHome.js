import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLibrary } from './LibraryShell';
import { forgetPurchases } from '../purchases';

// My notebooks, in the buyer's library: only the notebooks they bought.
//
//   My notebooks
//   ┌──────────────────────────────┐
//   │ Beginner          Purchased  │
//   │ Getting Around               │
//   │ Taxis, the metro, and …      │
//   │ 29 notes                     │
//   └──────────────────────────────┘
//
// Nothing bought yet: a link to the sales page instead.
export default function LibraryHome() {
    const { products, notebooks } = useLibrary();
    const [forgotten, setForgotten] = useState(false);

    // Localhost only: start over, as someone who hasn't bought anything.
    const forget = () => { forgetPurchases(); setForgotten(true); };

    return (
        <>
            <h1 className="lib-title">My notebooks</h1>
            {products.length === 0 || forgotten ? (
                <div className="lib-empty">
                    <p>You haven't bought any Spanish notebooks yet.</p>
                    <Link to="/learn-spanish" className="cb-btn cb-btn--accent sales-btn">See the notebooks</Link>
                </div>
            ) : (
                <div className="sales-products">
                    {products.map((product) => {
                        const notebook = notebooks[product.id] || { status: 'loading' };
                        return (
                            <Link key={product.id} to={`/learn-spanish/library/${product.id}`} className="sales-product lib-book">
                                <div className="sales-product__top">
                                    <span className="sales-badge sales-badge--level">{product.level}</span>
                                    <span className="sales-badge">Purchased</span>
                                </div>
                                <h2 className="sales-product__title">{product.title}</h2>
                                <p className="sales-product__pitch">{product.pitch}</p>
                                <p className="lib-book__count">
                                    {notebook.status === 'ready' ? `${notebook.notes.length} notes`
                                        : notebook.status === 'error' ? notebook.message : 'Loading…'}
                                </p>
                            </Link>
                        );
                    })}
                </div>
            )}
            <p className="lib-devnote">
                Localhost preview: purchases are pretend and kept in this browser only.
                {products.length > 0 && !forgotten && (
                    <> <button type="button" className="lib-link" onClick={forget}>Forget them</button></>
                )}
            </p>
        </>
    );
}
