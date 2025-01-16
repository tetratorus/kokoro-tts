#!/usr/bin/env node

const https = require('https');
const fs = require('fs');
const path = require('path');

const MODELS_DIR = path.join(__dirname, '..', 'models');
const BASE_URL = 'https://github.com/tetratorus/kokoro-tts/releases/download/v1';
const MODELS = {
    'kokoro-v0_19.onnx': `${BASE_URL}/kokoro-v0_19.onnx`
};

// Create models directory if it doesn't exist
if (!fs.existsSync(MODELS_DIR)) {
    fs.mkdirSync(MODELS_DIR, { recursive: true });
}

function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, response => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download: ${response.statusCode}`));
                return;
            }

            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', err => {
            fs.unlink(dest, () => {});
            reject(err);
        });
    });
}

async function downloadModels() {
    console.log('Downloading Kokoro TTS models...');
    
    for (const [filename, url] of Object.entries(MODELS)) {
        const dest = path.join(MODELS_DIR, filename);
        if (fs.existsSync(dest)) {
            console.log(`${filename} already exists, skipping...`);
            continue;
        }
        
        console.log(`Downloading ${filename}...`);
        try {
            await downloadFile(url, dest);
            console.log(`Downloaded ${filename}`);
        } catch (err) {
            console.error(`Failed to download ${filename}:`, err.message);
            process.exit(1);
        }
    }
}

downloadModels().catch(err => {
    console.error('Failed to download models:', err);
    process.exit(1);
});
