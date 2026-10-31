import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { findProduct, formatPrice } from './catalog';
import useNotebook from './useNotebook';

// Checkout for one notebook (/learn-spanish/checkout/<id>, localhost only for
// now). It only PRETENDS to be Square's payment form: nothing typed here is
// sent anywhere or saved, and no payment is taken.
//
//   TEST MODE — no real payment is taken
//   Your order                  │ Payment
//   Getting Around              │ Email  [            ]
//   Beginner · 29 notes         │ Card   [4111 1111 1111 1111 | MM/YY | CVV | ZIP]
//   Total            $9.99      │ [ Pay $9.99 ]
//                               │ 🔒 Secured by Square (pretend)
//
// The card box starts with Square's published sandbox test card, so it can
// be paid as is. Pay shows "Processing…", then the thank-you screen.
//
// Later, the real thing would put Square's own card field (Web Payments SDK)
// in place of these boxes, and the server would take the payment.
const TEST_CARD = { number: '4111 1111 1111 1111', expiry: '12/30', cvv: '111', zip: '11111' };
const PRETEND_DELAY_MS = 1500;

export default function CheckoutPage() {
    const { id } = useParams();
    const product = findProduct(id);
    const notebook = useNotebook(product);
    const [email, setEmail] = useState('');
    const [card, setCard] = useState(TEST_CARD);
    const [problem, setProblem] = useState('');
    const [step, setStep] = useState('form'); // 'form' | 'processing' | 'paid'
    const [order] = useState(() => `TEST-${Math.random().toString(36).slice(2, 8).toUpperCase()}`);

    if (!product) {
        return (
            <div className="sales-wrap sales-checkout">
                <BackLink />
                <h1 className="sales-h2">This notebook isn't for sale</h1>
            </div>
        );
    }

    const count = notebook.status === 'ready' ? notebook.notes.length : null;
    const setField = (key) => (e) => setCard({ ...card, [key]: e.target.value });

    const pay = (e) => {
        e.preventDefault();
        setProblem('');
        if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setProblem('Enter your email address.'); return; }
        if (card.number.replace(/\D/g, '').length < 15 || !/^\d{2}\/\d{2}$/.test(card.expiry.trim())
            || !/^\d{3,4}$/.test(card.cvv.trim()) || !card.zip.trim()) {
            setProblem('Check the card details.');
            return;
        }
        setStep('processing');
        setTimeout(() => setStep('paid'), PRETEND_DELAY_MS);
    };

    if (step === 'paid') {
        return (
            <div className="sales-wrap sales-wrap--narrow sales-checkout">
                <TestModeBanner />
                <div className="sales-thanks">
                    <span className="sales-thanks__check"><i className="check icon" aria-hidden="true"></i></span>
                    <h1>You now have {product.title}</h1>
                    <p>A receipt would be sent to <strong>{email.trim()}</strong>.</p>
                    <dl className="sales-thanks__receipt">
                        <div><dt>Order</dt><dd>{order}</dd></div>
                        <div><dt>{product.title}{count != null ? ` · ${count} notes` : ''}</dt><dd>{formatPrice(product.price)}</dd></div>
                        <div><dt>Paid with</dt><dd>Card ending {card.number.replace(/\D/g, '').slice(-4)}</dd></div>
                    </dl>
                    <Link to={`/wordbook/${encodeURIComponent(product.notebook)}`} className="cb-btn cb-btn--accent sales-btn sales-btn--wide">
                        Start learning
                    </Link>
                    <p className="sales-thanks__aside">
                        On localhost this opens your own copy of the notebook. Buyer accounts come in a later step.
                    </p>
                    <BackLink />
                </div>
            </div>
        );
    }

    const busy = step === 'processing';

    return (
        <div className="sales-wrap sales-checkout">
            <BackLink />
            <TestModeBanner />
            <div className="sales-checkout__grid">
                <section className="sales-order" aria-labelledby="sales-order-title">
                    <h2 id="sales-order-title" className="sales-checkout__h">Your order</h2>
                    <div className="sales-order__item">
                        <div>
                            <p className="sales-order__name">Spanish – {product.title}</p>
                            <p className="sales-order__meta">{product.level}{count != null ? ` · ${count} notes` : ''}</p>
                        </div>
                        <span>{formatPrice(product.price)}</span>
                    </div>
                    <div className="sales-order__total">
                        <span>Total</span>
                        <strong>{formatPrice(product.price)}</strong>
                    </div>
                </section>

                <form className="sales-pay" onSubmit={pay} noValidate aria-labelledby="sales-pay-title">
                    <h2 id="sales-pay-title" className="sales-checkout__h">Payment</h2>
                    <label className="sales-pay__label" htmlFor="sales-email">Email</label>
                    <input id="sales-email" className="sales-pay__input" type="email" inputMode="email" autoComplete="off"
                        placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} />

                    <span className="sales-pay__label" id="sales-card-label">Card</span>
                    {/* Looks like Square's single-line card field. */}
                    <div className="sq-card" role="group" aria-labelledby="sales-card-label">
                        <i className="credit card outline icon sq-card__icon" aria-hidden="true"></i>
                        <input className="sq-card__number" aria-label="Card number" inputMode="numeric" autoComplete="off"
                            value={card.number} onChange={setField('number')} disabled={busy} />
                        <input className="sq-card__small" aria-label="Expiry (MM/YY)" placeholder="MM/YY" autoComplete="off"
                            value={card.expiry} onChange={setField('expiry')} disabled={busy} />
                        <input className="sq-card__small" aria-label="Security code" placeholder="CVV" inputMode="numeric" autoComplete="off"
                            value={card.cvv} onChange={setField('cvv')} disabled={busy} />
                        <input className="sq-card__small" aria-label="ZIP code" placeholder="ZIP" autoComplete="off"
                            value={card.zip} onChange={setField('zip')} disabled={busy} />
                    </div>
                    <p className="sales-pay__hint">Square's test card is filled in. Nothing you type here is sent or saved.</p>

                    {problem && <p className="sales-pay__problem" role="alert">{problem}</p>}

                    <button type="submit" className="sq-pay" disabled={busy}>
                        {busy ? <><i className="spinner loading icon" aria-hidden="true"></i> Processing…</> : `Pay ${formatPrice(product.price)}`}
                    </button>
                    <p className="sales-pay__secure"><i className="lock icon" aria-hidden="true"></i> Secured by Square (pretend)</p>
                </form>
            </div>
        </div>
    );
}

const TestModeBanner = () => (
    <p className="sales-testmode" role="note">TEST MODE — no real payment is taken</p>
);

const BackLink = () => (
    <Link to="/learn-spanish" className="sales-back">
        <i className="arrow left icon" aria-hidden="true"></i> Spanish notebooks
    </Link>
);
