'use strict';
// Language detection helpers: ISO codes, names, and tokens found in file/folder names.

const LANGS = {
  // name        : [iso639-1, iso639-2 codes..., extra aliases...]
  English:   ['en', 'eng', 'english'],
  Tamil:     ['ta', 'tam', 'tamil'],
  Telugu:    ['te', 'tel', 'telugu'],
  Hindi:     ['hi', 'hin', 'hindi', 'bollywood'],
  Malayalam: ['ml', 'mal', 'malayalam'],
  Kannada:   ['kn', 'kan', 'kannada'],
  Bengali:   ['bn', 'ben', 'bengali', 'bangla'],
  Marathi:   ['mr', 'mar', 'marathi'],
  Gujarati:  ['gu', 'guj', 'gujarati'],
  Punjabi:   ['pa', 'pan', 'punjabi'],
  Urdu:      ['ur', 'urd', 'urdu'],
  Sinhala:   ['si', 'sin', 'sinhala', 'sinhalese'],
  French:    ['fr', 'fre', 'fra', 'french', 'francais'],
  Spanish:   ['es', 'spa', 'spanish', 'espanol', 'castellano', 'latino'],
  German:    ['de', 'ger', 'deu', 'german', 'deutsch'],
  Italian:   ['it', 'ita', 'italian'],
  Portuguese:['pt', 'por', 'portuguese'],
  Russian:   ['ru', 'rus', 'russian'],
  Arabic:    ['ar', 'ara', 'arabic'],
  Japanese:  ['ja', 'jpn', 'japanese'],
  Korean:    ['ko', 'kor', 'korean'],
  Chinese:   ['zh', 'chi', 'zho', 'chinese', 'mandarin', 'cantonese'],
  Thai:      ['th', 'tha', 'thai'],
  Turkish:   ['tr', 'tur', 'turkish'],
  Dutch:     ['nl', 'dut', 'nld', 'dutch'],
  Swedish:   ['sv', 'swe', 'swedish'],
  Polish:    ['pl', 'pol', 'polish'],
  Indonesian:['id', 'ind', 'indonesian'],
  Malay:     ['ms', 'may', 'msa', 'malay'],
  Vietnamese:['vi', 'vie', 'vietnamese'],
  Persian:   ['fa', 'per', 'fas', 'persian', 'farsi'],
  Hebrew:    ['he', 'heb', 'hebrew'],
  Greek:     ['el', 'gre', 'ell', 'greek'],
};

const CODE_TO_NAME = {};
const WORD_TO_NAME = {};
for (const [name, codes] of Object.entries(LANGS)) {
  for (const c of codes) {
    CODE_TO_NAME[c] = name;
    if (c.length > 3) WORD_TO_NAME[c] = name;
  }
  WORD_TO_NAME[name.toLowerCase()] = name;
}

/** Normalise any user/ffprobe value ("tam", "ta", "Tamil", "TAMIL") to a display name. */
function normalize(value) {
  if (!value) return null;
  const v = String(value).trim().toLowerCase();
  if (!v || v === 'und' || v === 'unknown' || v === 'mis' || v === 'zxx') return null;
  if (CODE_TO_NAME[v]) return CODE_TO_NAME[v];
  if (WORD_TO_NAME[v]) return WORD_TO_NAME[v];
  // "en-US", "pt_BR"
  const base = v.split(/[-_]/)[0];
  if (CODE_TO_NAME[base]) return CODE_TO_NAME[base];
  // Unknown but plausible: title-case it
  if (/^[a-z]{4,}$/.test(v)) return v[0].toUpperCase() + v.slice(1);
  return null;
}

/**
 * Find language names mentioned as whole words in a file or folder name.
 * Only full words ("Tamil", "Hindi") or bracketed codes ("[TAM]", "(hin)") count,
 * so short codes inside normal words don't produce false hits.
 */
function fromName(name) {
  const found = new Set();
  if (!name) return found;
  const lower = name.toLowerCase();
  const words = lower.split(/[^a-z]+/).filter(Boolean);
  for (const w of words) if (WORD_TO_NAME[w]) found.add(WORD_TO_NAME[w]);
  const br = lower.match(/[\[(]([a-z]{2,3}(?:[ ,+&/-]+[a-z]{2,3})*)[\])]/g) || [];
  for (const b of br) {
    for (const code of b.replace(/[\[\]()]/g, '').split(/[ ,+&/-]+/)) {
      if (code.length === 3 && CODE_TO_NAME[code]) found.add(CODE_TO_NAME[code]);
    }
  }
  // "Movie.Name.2019.TAM.1080p" - dotted 3-letter ISO 639-2 codes in caps in the original
  const caps = name.match(/(?:^|[ ._-])([A-Z]{3})(?=$|[ ._-])/g) || [];
  for (const c of caps) {
    const code = c.replace(/[ ._-]/g, '').toLowerCase();
    if (CODE_TO_NAME[code] && !['the', 'and', 'avi', 'mkv', 'mp4', 'dts', 'aac'].includes(code)) found.add(CODE_TO_NAME[code]);
  }
  return found;
}

/** Subtitle file language: "Movie.en.srt", "Movie.Tamil.srt", "Movie.eng.forced.srt" */
function fromSubtitleName(subBase, videoBase) {
  let rest = subBase;
  if (videoBase && subBase.toLowerCase().startsWith(videoBase.toLowerCase())) rest = subBase.slice(videoBase.length);
  for (const part of rest.split(/[._ -]+/).reverse()) {
    const n = normalize(part);
    if (n && (part.length <= 3 ? CODE_TO_NAME[part.toLowerCase()] : true)) return n;
  }
  return null;
}

module.exports = { normalize, fromName, fromSubtitleName };
