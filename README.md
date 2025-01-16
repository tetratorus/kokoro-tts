# Kokoro JS

A JavaScript implementation of the Kokoro text-to-speech model.

## Installation

1. Clone this repository
2. Install dependencies:
```bash
npm install
```

3. Create a `models` directory and copy the required model files:
```bash
mkdir -p models/voices
cp /path/to/kokoro-v0_19.onnx models/
cp /path/to/voices/af.npy models/voices/
```

## Usage

Basic usage example:

```javascript
const KokoroTTS = require('./src');
const path = require('path');

async function main() {
    const tts = new KokoroTTS();
    
    // Load model and voicepack
    await tts.loadModel(path.join(__dirname, 'models', 'kokoro-v0_19.onnx'));
    await tts.loadVoicepack(path.join(__dirname, 'models', 'voices', 'af.npy'));
    
    // Generate speech
    await tts.generateAndSave(
        "Hello world",  // text to speak
        "output.wav",   // output file
        'en-us',        // language
        1.0            // speed (1.0 = normal)
    );
}

main();
```

## API Reference

### Class: KokoroTTS

#### Methods

- `loadModel(modelPath)`: Load the ONNX model file
- `loadVoicepack(voicepackPath)`: Load the voice style file
- `generateSpeech(text, lang = 'en-us', speed = 1.0)`: Generate speech and return raw audio data
- `generateAndSave(text, outputPath, lang = 'en-us', speed = 1.0)`: Generate speech and save to WAV file

## Requirements

- Node.js v14 or later
- NPM dependencies (automatically installed):
  - onnxruntime-node
  - numpy-parser
  - phonemizer
  - wav
