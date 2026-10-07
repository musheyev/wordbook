// Render the TipTap math nodes stored in card HTML. Cards store math as empty
// elements carrying the LaTeX in data-latex (block-math = <div>, inline-math =
// <span>); KaTeX renders them at display time.
//
// KaTeX (and its stylesheet) is large, so it downloads only the first time a
// note actually contains math; rendering happens once it has arrived.
let katexLoading = null;
const loadKatex = () => {
    if (!katexLoading) {
        katexLoading = Promise.all([import('katex'), import('katex/dist/katex.min.css')])
            .then(([module]) => module.default)
            .catch((err) => { katexLoading = null; throw err; }); // try again next time
    }
    return katexLoading;
};

export function renderMathIn(container) {
    if (!container) return;
    const nodes = container.querySelectorAll('[data-latex]');
    if (nodes.length === 0) return;
    loadKatex().then((katex) => {
        nodes.forEach((el) => {
            const latex = el.getAttribute('data-latex') || '';
            const displayMode = el.getAttribute('data-type') === 'block-math';
            try {
                katex.render(latex, el, { throwOnError: false, displayMode });
            } catch (e) {
                el.textContent = latex;
            }
        });
    }).catch(() => {
        // Couldn't download KaTeX (connection dropped): show the LaTeX itself.
        nodes.forEach((el) => { if (!el.textContent) el.textContent = el.getAttribute('data-latex') || ''; });
    });
}
