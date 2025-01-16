const ort = require('onnxruntime-node');
const path = require('path');
const wav = require('wav');
const fs = require('fs');
const { fromArrayBuffer } = require('numpy-parser');
const { textToTokens } = require('./phonemes');

class KokoroTTS {
    constructor() {
        this.session = null;
        this.voicepack = null;
    }

    async loadModel(modelPath) {
        try {
            if (process.stdout.isTTY) {
                console.log('Loading model from:', modelPath);
            }
            this.session = await ort.InferenceSession.create(modelPath);
        } catch (error) {
            if (error.code !== 'EPIPE') {
                throw error;
            }
        }
    }

    async loadVoicepack(voicepackPath) {
        try {
            if (process.stdout.isTTY) {
                console.log('Loading voicepack from:', voicepackPath);
            }
            const voicepackBuffer = fs.readFileSync(voicepackPath);
            this.voicepack = fromArrayBuffer(voicepackBuffer.buffer);
            if (process.stdout.isTTY) {
                console.log('Voicepack shape:', this.voicepack.shape);
            }
        } catch (error) {
            if (error.code !== 'EPIPE') {
                throw error;
            }
        }
    }

    async generateSpeech(text, lang = 'en-us', speed = 1.0) {
        if (!this.session || !this.voicepack) {
            throw new Error('Model and voicepack must be loaded before generating speech');
        }

        // Convert text to tokens
        if (process.stdout.isTTY) {
            console.log('Converting text:', text);
        }
        const { tokens, phonemes } = await textToTokens(text, lang);
        if (process.stdout.isTTY) {
            console.log('Phonemes:', phonemes);
        }

        // Add start/end tokens (0)
        const fullTokens = new BigInt64Array([0n, ...tokens.map(t => BigInt(t)), 0n]);
        if (process.stdout.isTTY) {
            console.log('Tokens:', fullTokens);
        }

        // Get style vector for our sequence length
        const seqIdx = fullTokens.length - 1; // 0-based index
        const styleVector = this.voicepack.data.slice(seqIdx * 256, (seqIdx + 1) * 256);
        const speedTensor = new Float32Array([speed]);

        // Create ONNX tensors
        const feeds = {
            'tokens': new ort.Tensor('int64', fullTokens, [1, fullTokens.length]),
            'style': new ort.Tensor('float32', styleVector, [1, 256]),
            'speed': new ort.Tensor('float32', speedTensor, [1])
        };

        if (process.stdout.isTTY) {
            console.log('Running inference...');
        }
        const results = await this.session.run(feeds);
        if (process.stdout.isTTY) {
            console.log('Output shape:', results.audio.dims);
        }

        // Normalize and convert to 16-bit PCM
        const audioFloat = results.audio.data;
        const maxValue = Math.max(...audioFloat.map(Math.abs));
        const audioData = new Int16Array(audioFloat.length);
        for (let i = 0; i < audioFloat.length; i++) {
            audioData[i] = Math.floor((audioFloat[i] / maxValue) * 32767);
        }

        return {
            sampleRate: 24000,
            audioData
        };
    }

    async generateAndSave(text, outputPath, lang = 'en-us', speed = 1.0) {
        const wavBuffer = await this.generate(text, lang, speed);
        fs.writeFileSync(outputPath, wavBuffer);
        if (process.stdout.isTTY) {
            console.log('Saved audio to', outputPath);
        }
    }

    async generate(text, lang = 'en-us', speed = 1.0) {
        const { sampleRate, audioData } = await this.generateSpeech(text, lang, speed);

        // Create WAV buffer in memory
        const chunks = [];
        const writer = new wav.Writer({
            channels: 1,
            sampleRate: sampleRate,
            bitDepth: 16
        });

        writer.on('data', chunk => chunks.push(chunk));
        writer.write(Buffer.from(audioData.buffer));
        writer.end();

        // Wait for writer to finish and combine chunks
        await new Promise(resolve => writer.on('end', resolve));
        return Buffer.concat(chunks);
    }
}

module.exports = KokoroTTS;
