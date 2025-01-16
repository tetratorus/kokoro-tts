const { phonemize } = require('phonemizer');

// Port of Python's get_vocab()
function getVocab() {
    const _pad = "$";
    const _punctuation = ';:,.!?¡¿—…"«»"" ';
    const _letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    const _letters_ipa = "ɑɐɒæɓʙβɔɕçɗɖðʤəɘɚɛɜɝɞɟʄɡɠɢʛɦɧħɥʜɨɪʝɭɬɫɮʟɱɯɰŋɳɲɴøɵɸθœɶʘɹɺɾɻʀʁɽʂʃʈʧʉʊʋⱱʌɣɤʍχʎʏʑʐʒʔʡʕʢǀǁǂǃˈˌːˑʼʴʰʱʲʷˠˤ˞↓↑→↗↘'̩'ᵻ";

    const symbols = [_pad, ..._punctuation, ..._letters, ..._letters_ipa];
    const vocab = {};
    symbols.forEach((symbol, i) => {
        vocab[symbol] = i;
    });
    return vocab;
}

// Port of Python's normalize_text()
function normalizeText(text) {
    // Replace smart quotes and other special characters
    text = text
        // Handle em dashes
        .replace(/—/g, ', ')
        // Smart quotes
        .replace(/[""]/g, '"')
        .replace(/['']/g, "'")
        // Clean up whitespace
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/«/g, '"').replace(/»/g, '"')
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/\(/g, '«').replace(/\)/g, '»');

    // Replace Chinese/Japanese punctuation with English equivalents
    const punctPairs = {
        '、': ',',
        '。': '.',
        '！': '!',
        '，': ',',
        '：': ':',
        '；': ';',
        '？': '?'
    };
    for (const [a, b] of Object.entries(punctPairs)) {
        text = text.replace(new RegExp(a, 'g'), b + ' ');
    }

    // Clean up whitespace
    text = text.replace(/[^\S \n]/g, ' ')  // Replace non-space whitespace with space
        .replace(/  +/g, ' ')              // Collapse multiple spaces
        .replace(/(?<=\n) +(?=\n)/g, '');  // Remove spaces between newlines

    // Handle titles and common abbreviations
    text = text
        .replace(/\b(?:D[Rr]|DR)\.(?= [A-Z])/g, 'Doctor')
        .replace(/\b(?:Mr\.|MR\.)(?= [A-Z])/g, 'Mister')
        .replace(/\b(?:Ms\.|MS\.)(?= [A-Z])/g, 'Miss')
        .replace(/\b(?:Mrs\.|MRS\.)(?= [A-Z])/g, 'Mrs')
        .replace(/\betc\.(?! [A-Z])/g, 'etc');

    // Handle "yeah" variations
    text = text.replace(/\b(?:yeah|yea)\b/gi, "ye'a");

    // Handle numbers and money
    text = text.replace(/\d*\.\d+|\b\d{4}s?\b|(?<!:)\b(?:[1-9]|1[0-2]):[0-5]\d\b(?!:)/g, (num) => {
        if (num.includes('.')) return num;
        if (num.includes(':')) {
            const [h, m] = num.split(':').map(Number);
            if (m === 0) return `${h} o'clock`;
            if (m < 10) return `${h} oh ${m}`;
            return `${h} ${m}`;
        }
        const year = parseInt(num.slice(0, 4));
        if (year < 1100 || year % 1000 < 10) return num;
        const left = num.slice(0, 2);
        const right = parseInt(num.slice(2, 4));
        const s = num.endsWith('s') ? 's' : '';
        if (100 <= year % 1000 && year % 1000 <= 999) {
            if (right === 0) return `${left} hundred${s}`;
            if (right < 10) return `${left} oh ${right}${s}`;
        }
        return `${left} ${right}${s}`;
    });

    // Clean up numbers and handle money
    text = text.replace(/(?<=\d),(?=\d)/g, '')  // Remove commas in numbers
        .replace(/[$£]\d+(?:\.\d+)?(?:(?: hundred| thousand| (?:[bm]|tr)illion)*)\b|[$£]\d+\.\d\d?\b/g, (m) => {
            const bill = m[0] === '$' ? 'dollar' : 'pound';
            if (m.match(/[a-z]$/)) return `${m.slice(1)} ${bill}s`;
            if (!m.includes('.')) {
                const s = m.slice(1) === '1' ? '' : 's';
                return `${m.slice(1)} ${bill}${s}`;
            }
            const [b, c] = m.slice(1).split('.');
            const s = b === '1' ? '' : 's';
            const cents = parseInt(c.padEnd(2, '0'));
            const coins = m[0] === '$' ?
                `cent${cents === 1 ? '' : 's'}` :
                (cents === 1 ? 'penny' : 'pence');
            return `${b} ${bill}${s} and ${cents} ${coins}`;
        });

    // Handle decimal numbers
    text = text.replace(/\d*\.\d+/g, (num) => {
        const [a, b] = num.split('.');
        return `${a} point ${[...b].join(' ')}`;
    });

    // Handle hyphens and other special cases
    text = text
        .replace(/(?<=\d)-(?=\d)/g, ' to ')
        .replace(/(?<=\d)S/g, ' S')
        .replace(/(?<=[BCDFGHJ-NP-TV-Z])'?s\b/g, "'S")
        .replace(/(?<=X')S\b/g, 's')
        .replace(/(?:[A-Za-z]\.){2,} [a-z]/g, m => m.replace(/\./g, '-'))
        .replace(/(?<=[A-Z])\.(?=[A-Z])/gi, '-');

    return text.trim();
}

// Port of Python's tokenize()
function tokenize(phonemes) {
    return [...phonemes].map(p => VOCAB[p]).filter(x => x !== undefined);
}

const VOCAB = getVocab();

async function textToTokens(text, lang = 'en-us') {
    try {
        // Normalize text first
        const normalizedText = normalizeText(text);

        // Convert to phonemes
        const phonemeResult = await phonemize(normalizedText, lang, {
            preserve_punctuation: true,
            with_stress: true,
            backend: 'espeak',
            language: lang,
            strip: false,
            separator: {
                word: ' ',
                syllable: '',
                phone: ''
            }
        });

        if (process.stdout.isTTY) {
            console.log('Raw phoneme result:', phonemeResult);
        }

        // Join all phonemes with proper spacing
        let phonemes = '';
        for (let i = 0; i < phonemeResult.length; i++) {
            // Add the current segment
            phonemes += phonemeResult[i];

            // If this isn't the last segment and it doesn't end with punctuation,
            // add a space between segments
            if (i < phonemeResult.length - 1 &&
                !/[,.!?;:]$/.test(phonemeResult[i].trim())) {
                phonemes += ' ';
            }
        }

        // Ensure proper spacing around punctuation
        phonemes = phonemes
            .replace(/\s+/g, ' ')  // normalize spaces
            .replace(/([,.!?;:])(?!\s)/g, '$1 ')  // ensure space after punctuation
            .replace(/\s+([,.!?;:])/g, '$1')  // remove space before punctuation
            .trim();  // remove any trailing space

        if (process.stdout.isTTY) {
            console.log('Reconstructed phonemes:', phonemes);
        }

        // Apply the same phoneme replacements as Python
        phonemes = phonemes
            .replace(/kəkˈoːɹoʊ/g, 'kˈoʊkəɹoʊ')
            .replace(/kəkˈɔːɹəʊ/g, 'kˈəʊkəɹəʊ')
            .replace(/ʲ/g, 'j')
            .replace(/r/g, 'ɹ')
            .replace(/x/g, 'k')
            .replace(/ɬ/g, 'l');

        // Apply regex replacements
        phonemes = phonemes
            .replace(/(?<=[a-zɹː])(?=hˈʌndɹɪd)/, ' ')
            .replace(/ z(?=[;:,.!?¡¿—…"«»"" ]|$)/, 'z');

        if (lang === 'en-us') {
            phonemes = phonemes.replace(/(?<=nˈaɪn)ti(?!ː)/, 'di');
        }

        // Filter to only include characters in VOCAB
        phonemes = [...phonemes].filter(p => p in VOCAB).join('');

        if (process.stdout.isTTY) {
            console.log('Final phonemes:', phonemes);
        }

        // Convert to tokens
        const tokens = tokenize(phonemes);

        return {
            text,
            phonemes,
            tokens
        };
    } catch (e) {
        console.error('Error in textToTokens:', e);
        throw e;
    }
}

module.exports = { textToTokens, VOCAB };
