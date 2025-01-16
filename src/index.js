#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const KokoroTTS = require('./kokoro');

// Handle EPIPE errors when pipe is broken
process.stdout.on('error', (err) => {
    if (err.code === 'EPIPE') {
        process.exit(0);
    }
});

process.on('SIGPIPE', () => process.exit(0));

async function main() {
    try {
        const args = process.argv.slice(2);
        const usage = `
Usage: kokoro-tts <text> [options]

Options:
    --output, -o     Output WAV file (default: output.wav)
    --pipe, -p       Output to stdout for piping (e.g. kokoro-tts "hello" --pipe | afplay -)
    --lang, -l       Language (default: en-us)
    --speed, -s      Speech speed (default: 1.0)
    --model, -m      Path to model file (default: built-in kokoro-v0_19.onnx)
    --voice, -v      Path to voice file (default: built-in af.npy)
    --help, -h       Show this help message

Examples:
    kokoro-tts "Hello world"                    # Outputs to output.wav
    kokoro-tts "Hello world" -o hello.wav       # Outputs to hello.wav
    kokoro-tts "Hello world" --pipe | afplay -  # Pipes to afplay
`;

        if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
            console.log(usage);
            process.exit(0);
        }

        const text = args[0];
        const options = {
            output: 'output.wav',
            pipe: false,
            lang: 'en-us',
            speed: 1.0,
            model: path.join(__dirname, '..', 'models', 'kokoro-v0_19.onnx'),
            voice: path.join(__dirname, '..', 'static', 'af.npy')
        };

        // Parse arguments
        for (let i = 1; i < args.length; i++) {
            const arg = args[i];
            switch (arg) {
                case '--output':
                case '-o':
                    options.output = args[++i];
                    break;
                case '--pipe':
                case '-p':
                    options.pipe = true;
                    break;
                case '--lang':
                case '-l':
                    options.lang = args[++i];
                    break;
                case '--speed':
                case '-s':
                    options.speed = parseFloat(args[++i]);
                    break;
                case '--model':
                case '-m':
                    options.model = args[++i];
                    break;
                case '--voice':
                case '-v':
                    options.voice = args[++i];
                    break;
            }
        }

        // Initialize TTS
        const tts = new KokoroTTS();
        await tts.loadModel(options.model);
        await tts.loadVoicepack(options.voice);

        // Generate speech
        const wavBuffer = await tts.generate(text, options.lang, options.speed);

        if (options.pipe) {
            // Use process.stdout.write and ignore errors (handled by the error handler above)
            process.stdout.write(wavBuffer);
        } else {
            fs.writeFileSync(options.output, wavBuffer);
            if (process.stdout.isTTY) {
                console.log('Saved to:', options.output);
            }
        }
    } catch (error) {
        if (error.code === 'EPIPE') {
            process.exit(0);
        }
        console.error(error);
        process.exit(1);
    }
}

main();
