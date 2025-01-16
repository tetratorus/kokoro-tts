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

        // Run inference in chunks to avoid stack overflow
        const chunkSize = 200;  // Process 200 tokens at a time
        let output = [];

        for (let i = 0; i < fullTokens.length; i += chunkSize) {
            const endIdx = Math.min(i + chunkSize, fullTokens.length);
            const chunkTokens = fullTokens.slice(i, endIdx);

            const feeds = {
                'tokens': new ort.Tensor('int64', chunkTokens, [1, chunkTokens.length]),
                'style': new ort.Tensor('float32', this.voicepack.data.slice((fullTokens.length - 1) * 256, fullTokens.length * 256), [1, 256]),
                'speed': new ort.Tensor('float32', new Float32Array([speed]), [1])
            };

            if (process.stdout.isTTY) {
                console.log(`Processing chunk ${i} to ${endIdx} of ${fullTokens.length}`);
            }

            const outputData = await this.session.run(feeds);
            const chunkOutput = outputData['audio'].data;

            output.push(...chunkOutput);
        }

        // Normalize and convert to 16-bit PCM
        const audioFloat = new Float32Array(output);
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

    async generate(text, { speed = 1.0 } = {}) {
        // Convert text to phonemes
        const { phonemes, tokens } = await textToTokens(text);

        if (process.stdout.isTTY) {
            console.log('Phonemes:', phonemes);
            console.log('Tokens:', tokens);
        }

        // Add start/end tokens
        const fullTokens = [BigInt(0), ...tokens, BigInt(0)];

        if (process.stdout.isTTY) {
            console.log('Tokens:', fullTokens);
        }

        // Run inference in chunks to avoid stack overflow
        const chunkSize = 100;  // Process 100 tokens at a time
        let totalAudioLength = 0;
        const audioChunks = [];

        for (let i = 0; i < fullTokens.length; i += chunkSize) {
            const endIdx = Math.min(i + chunkSize, fullTokens.length);
            const chunkTokens = fullTokens.slice(i, endIdx);

            const feeds = {
                'tokens': new ort.Tensor('int64', chunkTokens, [1, chunkTokens.length]),
                'style': new ort.Tensor('float32', this.voicepack.data.slice((fullTokens.length - 1) * 256, fullTokens.length * 256), [1, 256]),
                'speed': new ort.Tensor('float32', new Float32Array([speed]), [1])
            };

            if (process.stdout.isTTY) {
                console.log(`Processing chunk ${i} to ${endIdx} of ${fullTokens.length}`);
            }

            const outputData = await this.session.run(feeds);

            // Process audio data in smaller chunks to avoid stack overflow
            const audioChunk = outputData['audio'].data;

            // Find max value without using map
            let maxValue = 0;
            for (let j = 0; j < audioChunk.length; j++) {
                const absValue = Math.abs(audioChunk[j]);
                if (absValue > maxValue) {
                    maxValue = absValue;
                }
            }

            const scale = Math.min(32767 / maxValue, 1);

            // Convert to 16-bit PCM in chunks
            const pcmChunk = new Int16Array(audioChunk.length);
            for (let j = 0; j < audioChunk.length; j += 1000) {
                const end = Math.min(j + 1000, audioChunk.length);
                for (let k = j; k < end; k++) {
                    pcmChunk[k] = Math.floor(audioChunk[k] * scale * 32767);
                }
            }

            // Trim off the last 220 samples (10ms at 22050Hz) if this isn't the last chunk
            const trimmedChunk = i + chunkSize < fullTokens.length ?
                pcmChunk.slice(0, pcmChunk.length - 4000) :
                pcmChunk;

            audioChunks.push(trimmedChunk);
            totalAudioLength += trimmedChunk.length;
        }

        // Combine all audio chunks
        const audioData = new Int16Array(totalAudioLength);
        let offset = 0;
        for (const chunk of audioChunks) {
            audioData.set(chunk, offset);
            offset += chunk.length;
        }

        // Create WAV buffer in memory
        const chunks = [];
        const writer = new wav.Writer({
            channels: 1,
            sampleRate: 22050,
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
