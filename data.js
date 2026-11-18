/* Data: date helpers and the sample data used ONLY on the first visit (when nothing is saved). */
const today = new Date();
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const off = n => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); }; // today + n days
const uid = () => Math.random().toString(36).slice(2, 9);

function buildSeed() {
  const q = (q, o, a) => ({ q, o, a }); // question, options, index of correct option
  return {
    name: 'Student',
    courses: [
      { id: 'c1', name: 'Mathematics', desc: 'Calculus and linear algebra', color: '#6d4aff' },
      { id: 'c2', name: 'Biology', desc: 'Cells, genetics and ecology', color: '#22b8cf' },
      { id: 'c3', name: 'World History', desc: 'Modern era essays and sources', color: '#ff9f6b' },
      { id: 'c4', name: 'Literature', desc: 'Poetry and close reading', color: '#3b82f6' }
    ],
    tasks: [
      { id: 't1', title: 'Problem set 6', desc: 'Derivatives and chain rule', course: 'c1', due: off(2), priority: 'high', status: 'doing' },
      { id: 't2', title: 'Lab report: osmosis', desc: 'Write up results and graphs', course: 'c2', due: off(4), priority: 'med', status: 'todo' },
      { id: 't3', title: 'Essay outline', desc: 'Causes of the Industrial Revolution', course: 'c3', due: off(-1), priority: 'high', status: 'todo' },
      { id: 't4', title: 'Poem analysis', desc: 'Close reading of two sonnets', course: 'c4', due: off(6), priority: 'low', status: 'todo' },
      { id: 't5', title: 'Chapter 4 quiz prep', desc: 'Review cell division', course: 'c2', due: off(-3), priority: 'med', status: 'done' },
      { id: 't6', title: 'Matrix worksheet', desc: 'Determinants and inverses', course: 'c1', due: off(-5), priority: 'low', status: 'done' },
      { id: 't7', title: 'Reading journal', desc: 'Entries for weeks 5 and 6', course: 'c4', due: off(9), priority: 'med', status: 'doing' }
    ],
    events: [
      { id: 'e1', title: 'Calculus study block', type: 'study', date: off(0), time: '16:00', notes: 'Chain rule practice' },
      { id: 'e2', title: 'Biology midterm', type: 'exam', date: off(8), time: '09:00', notes: 'Chapters 1-5' },
      { id: 'e3', title: 'Essay outline due', type: 'deadline', date: off(1), time: '23:59', notes: '' },
      { id: 'e4', title: 'History reading', type: 'study', date: off(3), time: '18:30', notes: 'Primary sources' },
      { id: 'e5', title: 'Literature quiz', type: 'exam', date: off(12), time: '11:00', notes: '' }
    ],
    notes: [
      { id: 'n1', title: 'Chain rule cheat sheet', course: 'c1', body: "d/dx f(g(x)) = f'(g(x)) · g'(x)\n\nWork from the outside in, then multiply.", updated: Date.now() - 3600e3 },
      { id: 'n2', title: 'Cell division summary', course: 'c2', body: 'Mitosis: prophase, metaphase, anaphase, telophase.\nMeiosis produces four genetically different cells.', updated: Date.now() - 86400e3 }
    ],
    decks: [
      { id: 'd1', name: 'Biology terms', cards: [
        { id: 'k1', q: 'What organelle makes ATP?', a: 'Mitochondria' },
        { id: 'k2', q: 'What is osmosis?', a: 'Movement of water across a semi-permeable membrane' },
        { id: 'k3', q: 'What do ribosomes build?', a: 'Proteins' }] },
      { id: 'd2', name: 'History dates', cards: [
        { id: 'k4', q: 'Year the French Revolution began?', a: '1789' },
        { id: 'k5', q: 'Year World War I ended?', a: '1918' },
        { id: 'k6', q: 'Year the Berlin Wall fell?', a: '1989' }] }
    ],
    quizzes: [
      { id: 'z1', title: 'Biology basics', qs: [
        q('Which organelle is the powerhouse of the cell?', ['Nucleus', 'Mitochondria', 'Golgi body', 'Ribosome'], 1),
        q('DNA stands for…', ['Deoxyribonucleic acid', 'Dinitrogen acid', 'Double nucleic acid', 'Dynamic nuclear acid'], 0),
        q('Photosynthesis mainly happens in the…', ['Roots', 'Chloroplasts', 'Vacuoles', 'Membrane'], 1)] },
      { id: 'z2', title: 'Calculus warm-up', qs: [
        q('d/dx of x² is…', ['x', '2x', 'x²', '2'], 1),
        q('The integral of 1/x is…', ['x⁻²', 'ln|x| + C', 'eˣ + C', '1'], 1),
        q('The limit of sin(x)/x as x→0 is…', ['0', '∞', '1', 'undefined'], 2)] }
    ],
    quizLog: [{ d: off(-4), title: 'Biology basics', pct: 67 }, { d: off(-2), title: 'Calculus warm-up', pct: 100 }, { d: off(-1), title: 'Biology basics', pct: 100 }],
    sessions: [
      { d: off(-6), m: 50, c: 'c1' }, { d: off(-5), m: 25, c: 'c2' }, { d: off(-3), m: 75, c: 'c1' },
      { d: off(-2), m: 50, c: 'c3' }, { d: off(-1), m: 100, c: 'c2' }, { d: off(0), m: 25, c: 'c4' }
    ],
    activity: [{ t: 'Completed Chapter 4 quiz prep', at: Date.now() - 7200e3 }, { t: 'Scored 100% on Biology basics', at: Date.now() - 86400e3 }],
    timer: { focus: 25, short: 5, long: 15 }
  };
}
