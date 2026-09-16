// Render the TipTap math nodes stored in card HTML. Cards store math as empty
// elements carrying the LaTeX in data-latex (block-math = <div>, inline-math =
// <span>); KaTeX renders them at display time.
import katex from 'katex';
import 'katex/dist/katex.min.css';

export function renderMathIn(container) {
    if (!container) return;
    container.querySelectorAll('[data-latex]').forEach((el) => {
        const latex = el.getAttribute('data-latex') || '';
        const displayMode = el.getAttribute('data-type') === 'block-math';
        try {
            katex.render(latex, el, { throwOnError: false, displayMode });
        } catch (e) {
            el.textContent = latex;
        }
    });
}
