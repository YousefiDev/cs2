// Chat filter: blocks messages that contain common profanity (Persian, Finglish and English).
// Words are compared as whole words (or as a clear stem), after removing tricks such as repeated letters, zero-width characters,
// look-alike Arabic letters, leetspeak and spaced-out letters ("f u c k"), so harmless words like "class" or "کسی" are not blocked.
const PERSIAN_MAP = { 'ي': 'ی', 'ى': 'ی', 'ك': 'ک', 'ة': 'ه', 'ۀ': 'ه', 'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ؤ': 'و', 'ئ': 'ی' };
const DIGITS = { '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9', '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' };
const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i' };

// English: stems (match the start of a word) and exact words.
const EN_STEM = ['fuck', 'fuk', 'fvck', 'shit', 'bitch', 'cunt', 'whore', 'slut', 'nigg', 'faggot', 'asshole', 'bastard', 'motherf', 'dickhead', 'cocksuck', 'wanker', 'twat', 'retard'];
const EN_EXACT = new Set(['ass', 'dick', 'cock', 'pussy', 'fag', 'fags', 'tits', 'bullshit', 'dumbass', 'jackass', 'arse', 'prick']);
// Persian (and the same words written in Latin letters).
const FA_STEM = ['کسکش', 'کصکش', 'کسشر', 'مادرجنده', 'مادرقحبه', 'حرومزاده', 'حرامزاده', 'پدرسگ', 'گاییدم', 'گاییدن', 'گایید', 'جنده', 'قحبه', 'کیرخر', 'کیرم', 'کیری', 'کونی', 'کونده', 'خارکس', 'کسمادر', 'کسننه', 'کصننه', 'کسخل', 'ننهجنده', 'ننه‌جنده',
  'koskesh', 'kosshar', 'kosmadar', 'madarjende', 'harumzade', 'haramzade', 'pedarsag', 'gayidam', 'gaiidam', 'jende', 'jakesh', 'kirkhar', 'kiram', 'kosnane'];
const FA_EXACT = new Set(['کیر', 'کون', 'کس', 'کصه', 'کیرت', 'کونت', 'کونم', 'کیرشو', 'بگا', 'بگایی', 'جکش', 'kir', 'kos', 'kose', 'kosse', 'koon', 'kooon', 'bega']);

export function normalize(text) {
  let s = String(text || '').normalize('NFKC').toLowerCase();
  s = s.replace(/[\u064B-\u065F\u0670\u0640\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g, '');              // diacritics, tatweel, zero-width / bidi marks
  s = s.replace(/[يىكةۀأإآؤئ]/g, (c) => PERSIAN_MAP[c] || c).replace(/[۰-۹٠-٩]/g, (c) => DIGITS[c] || c);
  return s;
}
function tokens(text) {
  const raw = normalize(text).split(/[^\p{L}\p{N}@$!]+/u).filter(Boolean), out = [];
  for (let t of raw) {
    // leetspeak only counts when the word also has letters ("sh1t"); a plain number stays a number
    if (/\p{L}/u.test(t)) t = t.replace(/[013457@$!]/g, (c) => LEET[c] || c); else continue;
    out.push(t);
  }
  return out;
}
const squeeze = (w) => w.replace(/(.)\1{2,}/gu, '$1$1');       // fuuuuck -> fuuck
const squeezeAll = (w) => w.replace(/(.)\1+/gu, '$1');          // fuuuuck -> fuck
const SAFE = new Set(['shiitake', 'shitake', 'cocktail', 'cockatoo', 'cockatiel', 'cockney', 'dickens', 'dickinson']);
function badWord(w) {
  if (SAFE.has(w)) return false;
  for (const v of new Set([w, squeeze(w), squeezeAll(w)])) {
    if (EN_EXACT.has(v) || FA_EXACT.has(v)) return true;
    for (const s of EN_STEM) if (v.startsWith(s)) return true;
    for (const s of FA_STEM) if (v.startsWith(s) && v.length <= s.length + (s.length >= 6 ? 3 : 1)) return true;   // short stems tolerate one extra letter (کیرم+ی), long ones a few
  }
  return false;
}
export function isBad(text) {
  const parts = normalize(text).split(/\s+/u).filter(Boolean);
  // "f u c k" / "ک ی ر": join runs of single letters
  const joined = []; let run = '';
  for (const p of parts) { if ([...p.replace(/[^\p{L}\p{N}]/gu, '')].length === 1) run += p.replace(/[^\p{L}\p{N}]/gu, ''); else { if (run.length >= 3) joined.push(run); run = ''; } }
  if (run.length >= 3) joined.push(run);
  for (const j of joined) { const t = tokens(j)[0] || ''; for (let i = 0; i + 3 <= t.length; i++) if (badWord(t.slice(i))) return true; }   // "a f u c k": the first letter may belong to the previous word
  for (const w of tokens(text)) if (badWord(w)) return true;
  // letters separated by dots / dashes / stars: "f.u.c.k", "k*i*r"
  const dotted = normalize(text).match(/(?:\p{L}[.\-_*]){2,}\p{L}/gu) || [];
  for (const d of dotted) if (tokens(d.replace(/[.\-_*]/g, '')).some(badWord)) return true;
  return false;
}
