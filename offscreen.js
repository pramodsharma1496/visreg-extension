// offscreen.js
import {pixelmatch} from './pixelmatch.js';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'PROCESS_DIFF') {
        compareImages(msg.baseline, msg.current)
            .then(result => sendResponse(result))
            .catch(err => sendResponse({ error: err.message }));
        return true; 
    }
});

async function compareImages(baselineSrc, currentSrc) {
    const img1 = await loadImage(baselineSrc);
    const img2 = await loadImage(currentSrc);

    const width = img1.width;
    const height = img1.height;

    // Set up canvas for diffing
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // Get pixel data from images
    const c1 = new OffscreenCanvas(width, height).getContext('2d');
    c1.drawImage(img1, 0, 0);
    const data1 = c1.getImageData(0, 0, width, height).data;

    const c2 = new OffscreenCanvas(width, height).getContext('2d');
    c2.drawImage(img2, 0, 0);
    const data2 = c2.getImageData(0, 0, width, height).data;

    const diffData = ctx.createImageData(width, height);

    // Run Pixelmatch
    const numDiffPixels = pixelmatch(data1, data2, diffData.data, width, height, {
        threshold: 0.1, 
        diffColor: [255, 0, 255], // Neon Pink
        alpha: 0.1 
    });

    ctx.putImageData(diffData, 0, 0);
    const diffUrl = canvas.toDataURL();
    const mismatchPercent = ((numDiffPixels / (width * height)) * 100).toFixed(2);

    return {
        baseline: baselineSrc,
        current: currentSrc,
        diff: diffUrl,
        mismatch: mismatchPercent
    };
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}