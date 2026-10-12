// "Markup Spanish" (admins, a note's toolbar; SpanishMarkupButton): find
// the Spanish in a note and mark it to be read in Spanish (Spain), or remove
// Spanish marks. Works on the note's saved HTML, with simple rules — no
// service is asked:
//
//   1. Each run of text is cut into pieces at quotes, brackets, colons,
//      commas, dashes, arrows and sentence ends:
//        “Fue” - was, from “ser,” another …  ->  Fue | was | from | ser | another …
//   2. Each piece is scored: accented letters, ñ, ¿ ¡ and common Spanish
//      words (esto, muy, fue, la, pregunta…) count for Spanish; common
//      English words and endings (-ing, -ly) count for English. A piece is
//      Spanish when it scores more for Spanish, with at least one clear sign.
//   3. Neighbouring Spanish pieces separated only by spaces or commas join
//      into one mark ("Esto es muy útil.", with its full stop).
//
// Text already marked (any read-aloud language, don't-read), code and
// formulas are left alone, so running it again only adds what's new.
// Words it doesn't know, or spelled the same in both languages, can be
// missed; the result can be changed in the editor as usual.

const ES_LANG = 'es-ES';

// Common Spanish words (and ones from typical lessons) that aren't also
// common English words. Accented forms are listed too: "¿qué?" vs "que".
const SPANISH = new Set(`
el la los las un una unos unas lo le les al del de que qué y o u e en con por para sin
pero porque como cómo cuando cuándo donde dónde adonde adónde cual cuál cuales cuáles quien quién quienes
cuanto cuánto cuanta cuánta cuantos cuántos cuantas cuántas
yo tú tu usted ustedes él ella ello ellos ellas nosotros nosotras vosotros vosotras mí mi mis tus su sus nuestro nuestra
nuestros nuestras te se nos os conmigo contigo esto este esta estos estas eso ese esa esos esas aquel aquella aquí ahí allí allá
es son eran fue fueron fui ser soy eres somos sido siendo será serán sería está están estar estoy estás estamos estaba
estaban estado estuve estuvo hay había hubo haber hemos han tengo tienes tiene tenemos tienen tener tenía
puedo puedes puede podemos pueden poder podría quiero quieres quiere queremos quieren querer voy vas va vamos van ir iba
hago haces hace hacemos hacen hacer hizo hecho sé sabe saber digo decir dijo veo ver doy dar dio llego llega
llegar llegué tomo toma tomar tengo necesito necesita necesitar gusta gustan me gustaría
muy mucho mucha muchos muchas poco poca pocos pocas más menos bien mal mejor peor también tampoco siempre nunca ya
todavía aún hoy mañana ayer ahora luego después antes entonces así sí claro gracias hola adiós buenos buenas días
tardes noches por favor perdón disculpe señor señora señorita
pregunta preguntas respuesta útil útiles centro ciudad calle metro tren taxi parada estación lejos cerca recto derecha
izquierda entrada salida tiempo hora horas cosa cosas mejor manera llegar ayudó ayuda mucho
qué cómo dónde cuál cuándo cuánto
`.trim().split(/\s+/));

// Words that are the same, or common, in both: no score either way.
const BOTH = new Set('a no me he has ha era ve da vi son come dice sale pie red solo mar hotel taxi plan once real fin van ten'.split(' '));

const ENGLISH = new Set(`
the a an is are was were be been being am this that these those of to in on at for from with by and or but not
it its it's i you he she we they me him her us them my your his our their mine yours what which who whom whose where
when why how do does did done doing have has had having will would can could should shall may might must
very more most some any all each every both either one two three first second here there then than also just only
too so as if about into over under after before again still even such same other another own new old good great
word words verb verbs noun meaning means mean change changes changed becomes become stays stay time thing things
several because common phrase phrases sentence while someone something somebody feels feel use uses used useful
question questions answer center downtown get gets got go goes going arrive arrives pronounced version natural
especially shorter short long asking ask asks alternative literally hi hello way speaker native express expresses
appreciation see say says said yes ok okay like way where much many little less well better best really
helped help helps lot was way this example examples means example spanish english translation translate
`.trim().split(/\s+/));

const ACCENT = /[áéíóúüñ¿¡]/i;
const SPANISH_ENDING = /(ción|ciones|mente|ando|iendo|aron|ieron|amos|emos|imos|ísimo|ísima)$/i;
const ENGLISH_ENDING = /(ing|ly|ness|ment|ful|less|'s|’s)$/i;

const wordsOf = (s) => s.toLowerCase().match(/[\p{L}'’]+/gu) || [];

function isSpanish(piece) {
    let es = 0;
    let en = 0;
    let sure = false;
    if (/[¿¡]/.test(piece)) { es += 2; sure = true; }
    for (const w of wordsOf(piece)) {
        if (BOTH.has(w)) continue;
        if (ACCENT.test(w)) { es += 2; sure = true; continue; }
        // A word in both lists counts as English: better to miss a word
        // than to mark English as Spanish.
        if (ENGLISH.has(w)) { en += 1.5; continue; }
        if (SPANISH.has(w)) { es += 1.5; sure = true; continue; }
        if (SPANISH_ENDING.test(w)) es += 1;
        else if (ENGLISH_ENDING.test(w)) en += 1;
    }
    return sure && es > en;
}

// Where a run of text splits into pieces: quotes, brackets, colons,
// semicolons, commas, dashes, arrows, and after a sentence's end.
const SPLIT = /[“”"«»()[\]:;,→–—]|\s-\s|(?<=[.!?…])\s+/g;

// [from, to) of each Spanish stretch in `text`.
function spanishRanges(text) {
    const pieces = [];
    let at = 0;
    SPLIT.lastIndex = 0;
    for (let m = SPLIT.exec(text); m; m = SPLIT.exec(text)) {
        pieces.push([at, m.index]);
        at = m.index + m[0].length;
    }
    pieces.push([at, text.length]);

    const ranges = [];
    pieces.forEach(([a, z]) => {
        let s = a;
        let e = z;
        while (s < e && /\s/.test(text[s])) s += 1;
        while (e > s && /\s/.test(text[e - 1])) e -= 1;
        if (s >= e || !/\p{L}/u.test(text.slice(s, e)) || !isSpanish(text.slice(s, e))) return;
        const last = ranges[ranges.length - 1];
        // Join with the previous Spanish piece across spaces and commas only.
        if (last && /^[\s,]*$/.test(text.slice(last[1], s))) last[1] = e;
        else ranges.push([s, e]);
    });
    return ranges;
}

const SKIP = '.tts-lang, .tts-skip, code, pre, [data-type="inline-math"], [data-type="block-math"], .katex';

/**
 * Mark the Spanish in a note.
 * @param {string} html the note's HTML
 * @returns {{ html: string, count: number }} count = stretches marked
 */
export function markSpanish(html) {
    const doc = new DOMParser().parseFromString(html || '', 'text/html');
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.parentElement.closest(SKIP)) nodes.push(n);
    }
    let count = 0;
    nodes.forEach((node) => {
        const text = node.nodeValue;
        const ranges = spanishRanges(text);
        if (!ranges.length) return;
        const frag = doc.createDocumentFragment();
        let at = 0;
        ranges.forEach(([s, e]) => {
            if (s > at) frag.appendChild(doc.createTextNode(text.slice(at, s)));
            const span = doc.createElement('span');
            span.className = 'tts-lang';
            span.setAttribute('lang', ES_LANG);
            span.textContent = text.slice(s, e);
            frag.appendChild(span);
            at = e;
            count += 1;
        });
        if (at < text.length) frag.appendChild(doc.createTextNode(text.slice(at)));
        node.replaceWith(frag);
    });
    return { html: doc.body.innerHTML, count };
}

/**
 * Remove Spanish marks (Spain or Latin America) from a note. A mark that also
 * sets a speed keeps the speed.
 * @returns {{ html: string, count: number }} count = marks removed
 */
export function removeSpanish(html) {
    const doc = new DOMParser().parseFromString(html || '', 'text/html');
    let count = 0;
    doc.querySelectorAll('span.tts-lang[lang^="es-"]').forEach((span) => {
        count += 1;
        if (span.hasAttribute('data-speed')) {
            span.removeAttribute('lang');
            span.removeAttribute('data-voice');
        } else {
            span.replaceWith(...span.childNodes);
        }
    });
    return { html: doc.body.innerHTML, count };
}
