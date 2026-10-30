import React, { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import CATALOG, { formatPrice } from './catalog';
import useNotebook from './useNotebook';
import NotebookPreview from './NotebookPreview';

// The Spanish sales page (/learn-spanish, localhost only for now): one page
// for all the Spanish notebooks for sale (sales/catalog.js).
//
//   Spanish for real-life situations
//   [See the notebooks]  [Try a free note]
//   How it works: Listen · Understand word by word · Quiz yourself
//   Spanish notebooks: a card per notebook, with [Preview] and [Buy]
//   Questions
//
// Preview (and "Try a free note") opens NotebookPreview over the page.
export default function SalesPage() {
    // The notebook being previewed: { id, sample } or null. `sample` (a note
    // id, or true for "the first free one") opens that sample to begin with.
    const [preview, setPreview] = useState(null);
    const closePreview = useCallback(() => setPreview(null), []);

    const seeNotebooks = () => {
        const el = document.getElementById('sales-notebooks');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
    };

    return (
        <>
            <section className="sales-hero">
                <div className="sales-wrap">
                    <p className="sales-eyebrow">Spanish notebooks</p>
                    <h1 className="sales-hero__title">Spanish for real-life situations</h1>
                    <p className="sales-hero__lead">
                        Short phrases you'll actually use, read aloud, explained word by word.
                    </p>
                    <div className="sales-hero__actions">
                        <button type="button" className="cb-btn cb-btn--accent sales-btn" onClick={seeNotebooks}>
                            See the notebooks
                        </button>
                        {CATALOG.length > 0 && (
                            <button type="button" className="cb-btn cb-btn--ghost sales-btn"
                                onClick={() => setPreview({ id: CATALOG[0].id, sample: true })}>
                                <i className="play icon" aria-hidden="true"></i> Try a free note
                            </button>
                        )}
                    </div>
                </div>
            </section>

            <section className="sales-section">
                <div className="sales-wrap">
                    <h2 className="sales-h2">How it works</h2>
                    <ol className="sales-steps">
                        <li>
                            <span className="sales-steps__icon"><i className="headphones icon" aria-hidden="true"></i></span>
                            <h3>Listen</h3>
                            <p>Every phrase is read aloud, so you hear how it really sounds.</p>
                        </li>
                        <li>
                            <span className="sales-steps__icon"><i className="list icon" aria-hidden="true"></i></span>
                            <h3>Understand word by word</h3>
                            <p>Each phrase is broken down, so you know why it says what it says.</p>
                        </li>
                        <li>
                            <span className="sales-steps__icon"><i className="check circle outline icon" aria-hidden="true"></i></span>
                            <h3>Quiz yourself</h3>
                            <p>Test what you remember, one phrase at a time.</p>
                        </li>
                    </ol>
                </div>
            </section>

            <section className="sales-section sales-section--tinted" id="sales-notebooks">
                <div className="sales-wrap">
                    <h2 className="sales-h2">Spanish notebooks</h2>
                    <div className="sales-products">
                        {CATALOG.map((product) => (
                            <ProductCard key={product.id} product={product}
                                preview={preview && preview.id === product.id ? preview : null}
                                onPreview={() => setPreview({ id: product.id })} onClosePreview={closePreview} />
                        ))}
                        <div className="sales-product sales-product--soon">
                            <i className="clock outline icon" aria-hidden="true"></i>
                            <p>More notebooks coming soon</p>
                        </div>
                    </div>
                </div>
            </section>

            <section className="sales-section">
                <div className="sales-wrap sales-wrap--narrow">
                    <h2 className="sales-h2">Questions</h2>
                    <div className="sales-faq">
                        <details>
                            <summary>What do I get?</summary>
                            <p>Every note in the notebook, each one read aloud and explained word by word,
                                plus quizzes to practice with.</p>
                        </details>
                        <details>
                            <summary>Can I use it on my phone and my computer?</summary>
                            <p>Yes. Sign in from your computer or your phone.</p>
                        </details>
                        <details>
                            <summary>Can I get a refund?</summary>
                            <p>Refund terms will go here.</p>
                        </details>
                    </div>
                </div>
            </section>
        </>
    );
}

// A notebook for sale, and its Preview when open.
function ProductCard({ product, preview, onPreview, onClosePreview }) {
    const notebook = useNotebook(product);
    const count = notebook.status === 'ready' ? notebook.notes.length : null;
    // "Try a free note" asks for the first free sample.
    const openSample = preview && preview.sample === true && notebook.status === 'ready'
        ? notebook.notes.find((n) => notebook.sampleIds.has(n.id))?.id
        : preview && preview.sample;

    return (
        <article className="sales-product">
            <div className="sales-product__top">
                <span className="sales-badge sales-badge--level">{product.level}</span>
                {count != null && <span className="sales-product__count">{count} notes</span>}
            </div>
            <h3 className="sales-product__title">{product.title}</h3>
            <p className="sales-product__pitch">{product.pitch}</p>
            <p className="sales-product__price">{formatPrice(product.price)}</p>
            <div className="sales-product__actions">
                <button type="button" className="cb-btn cb-btn--ghost sales-btn" onClick={onPreview}>Preview</button>
                <Link to={`/learn-spanish/checkout/${product.id}`} className="cb-btn cb-btn--accent sales-btn">Buy</Link>
            </div>
            {preview && (
                // Wait for the notes when a sample should open first, so it opens.
                (preview.sample === true && notebook.status === 'loading') ? null : (
                    <NotebookPreview product={product} notebook={notebook}
                        openSample={openSample} onClose={onClosePreview} />
                )
            )}
        </article>
    );
}
