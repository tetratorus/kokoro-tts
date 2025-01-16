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
    text = text.replace(/'/g, "'").replace(/'/g, "'")
        .replace(/«/g, '"').replace(/»/g, '"')
        .replace(/"/g, '"').replace(/"/g, '"');
    
    return text;
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
            with_stress: true
        });
        
        // Get the phoneme string (it comes in an array)
        let phonemes = phonemeResult[0];
        
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
