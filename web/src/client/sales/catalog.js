// The Spanish notebooks for sale on the sales page (/learn-spanish, on
// localhost only for now: see routes.jsx).
//
// Each entry is one of YOUR notebooks, plus what the sales page says about
// it. The notes themselves are loaded from your account when the page opens
// (sales/useNotebook.js), so the note count and titles are always current.
//
//   id        the address of its checkout page: /learn-spanish/checkout/<id>
//   notebook  the notebook's exact name in My Notebooks
//   title     the name shown to buyers
//   level     e.g. "Beginner"
//   pitch     one line under the title
//   price     in US dollars
//   samples   titles of the notes anyone can open for free in Preview. A
//             title that isn't in the notebook is skipped; with none found,
//             the first 3 notes are the samples.
//
// To sell another notebook, add another entry.
const CATALOG = [
    {
        id: 'getting-around',
        notebook: 'Spanish-Getting Around',
        title: 'Getting Around',
        level: 'Beginner',
        pitch: 'Taxis, the metro, and asking the way.',
        price: 9.99,
        samples: ['Where would I be able to get a taxi?', 'How do I get downtown?', 'How long would it take?'],
    },
];

export default CATALOG;

export const findProduct = (id) => CATALOG.find((p) => p.id === id);

// "$9.99"
export const formatPrice = (amount) => `$${amount.toFixed(2)}`;
