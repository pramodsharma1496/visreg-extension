// content.js

// Global variables
let isMasking = false;
let highlightBox = null;

// --- Message Routing ---
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'TOGGLE_MASKING') {
        toggleMasking();
        // Send back the new state so popup can update the button
        sendResponse({ success: true, isMasking: isMasking });
    } 
    else if (msg.action === 'GET_MASKING_STATUS') {
        // Allow popup to check status on open
        sendResponse({ isMasking: isMasking });
    }
    else if (msg.action === 'SHOW_REPORT') {
        showComparisonOverlay(msg.data);
        sendResponse({ success: true });
    } 
    else if (msg.action === 'PREPARE_CAPTURE') {
        const applyMasks = (msg.useMasks !== undefined) ? msg.useMasks : true;
        waitForStableDOM(500, 4000, applyMasks).then((status) => sendResponse({ success: true, status }));
        return true; 
    }
});

// --- 1. Masking Interaction ---
function toggleMasking() {
    if (isMasking) {
        disableMaskingMode();
    } else {
        enableMaskingMode();
    }
}

function enableMaskingMode() {
    isMasking = true;
    document.body.style.cursor = 'crosshair';
    document.addEventListener('click', maskElement, true);
    document.addEventListener('mouseover', highlightElement, true);
    document.addEventListener('keydown', handleKeydown, true); // Listen for Esc
    showToast("Masking Mode ON: Click elements to hide. Press ESC to stop.");
}

function disableMaskingMode() {
    isMasking = false;
    document.body.style.cursor = 'default';
    document.removeEventListener('click', maskElement, true);
    document.removeEventListener('mouseover', highlightElement, true);
    document.removeEventListener('keydown', handleKeydown, true);
    removeHighlight();
    showToast("Masking Mode OFF.");
}

// Escape Key Handler
function handleKeydown(e) {
    if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        disableMaskingMode();
    }
}

function maskElement(e) {
    e.preventDefault();
    e.stopPropagation();
    
    const selector = getCssPath(e.target);
    
    // Visual feedback
    e.target.style.outline = "2px dashed #ff00ff";
    e.target.style.opacity = "0.5";
    
    chrome.runtime.sendMessage({ action: 'SAVE_MASK', selector: selector });
    console.log("Masked:", selector);
}

// --- 2. Smart Wait & Auto-Masking ---
function waitForStableDOM(stabilityDuration = 500, maxWait = 4000, applyMasks = true) {
    return new Promise((resolve) => {
        
        const proceed = (savedSelectors = []) => {
            const styleId = 'vis-reg-freeze';
            let style = document.getElementById(styleId);
            if (!style) {
                style = document.createElement('style');
                style.id = styleId;
                document.head.appendChild(style);
            }
            
            let css = `
                *, *::before, *::after {
                    transition: none !important;
                    animation: none !important;
                    caret-color: transparent !important;
                }
            `;

            if (applyMasks && savedSelectors.length > 0) {
                css += `
                    ${savedSelectors.join(', ')} {
                        opacity: 0 !important;
                        visibility: hidden !important;
                    }
                `;
            }

            style.textContent = css;

            let timer;
            let totalTime = 0;
            const observer = new MutationObserver(() => {
                clearTimeout(timer);
                totalTime += 100;
                if (totalTime >= maxWait) finish('timeout');
                else timer = setTimeout(() => finish('stable'), stabilityDuration);
            });

            observer.observe(document.body, {
                attributes: true, childList: true, subtree: true, characterData: true
            });

            timer = setTimeout(() => finish('stable'), stabilityDuration);

            function finish(status) {
                observer.disconnect();
                clearTimeout(timer);
                resolve(status);
            }
        };

        if (applyMasks) {
            chrome.runtime.sendMessage({ action: 'GET_SAVED_MASKS' }, (response) => {
                proceed(response.selectors || []);
            });
        } else {
            proceed([]);
        }
    });
}

// --- 3. Utilities ---
function getCssPath(el) {
    if (!(el instanceof Element)) return;
    const path = [];
    while (el.nodeType === Node.ELEMENT_NODE) {
        let selector = el.nodeName.toLowerCase();
        if (el.id) {
            selector += '#' + el.id;
            path.unshift(selector);
            break;
        } else {
            let sib = el, nth = 1;
            while (sib = sib.previousElementSibling) {
                if (sib.nodeName.toLowerCase() == selector) nth++;
            }
            if (nth != 1) selector += ":nth-of-type("+nth+")";
        }
        path.unshift(selector);
        el = el.parentNode;
    }
    return path.join(" > ");
}

function highlightElement(e) {
    if(!highlightBox) {
        highlightBox = document.createElement('div');
        highlightBox.style.cssText = 'position:fixed;pointer-events:none;border:2px solid #ff00ff;z-index:99999;box-shadow: 0 0 10px #ff00ff;';
        document.body.appendChild(highlightBox);
    }
    const rect = e.target.getBoundingClientRect();
    highlightBox.style.top = rect.top + 'px';
    highlightBox.style.left = rect.left + 'px';
    highlightBox.style.width = rect.width + 'px';
    highlightBox.style.height = rect.height + 'px';
}

function removeHighlight() {
    if(highlightBox) highlightBox.remove();
    highlightBox = null;
}

function showToast(msg) {
    const toast = document.createElement('div');
    toast.textContent = msg;
    toast.style.cssText = `
        position: fixed; top: 20px; right: 20px; background: #333; color: #fff;
        padding: 10px 20px; border-radius: 5px; z-index: 2147483647; font-family: sans-serif;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function showComparisonOverlay(data) {
    const id = 'vis-reg-overlay';
    if(document.getElementById(id)) document.getElementById(id).remove();

    const container = document.createElement('div');
    container.id = id;
    container.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(10,10,10,0.98); z-index: 2147483647; color: #e0e0e0;
        font-family: sans-serif; display: flex; flex-direction: column;
    `;

    const header = document.createElement('div');
    header.style.cssText = 'padding: 15px 25px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #333; background: #1a1a1a;';
    header.innerHTML = `
        <h2 style="margin:0; font-size: 18px;color: #ffffff;">Mismatch: <span style="color: #ff00ff; font-weight: bold;">${data.mismatch}%</span></h2>
        <button id="close-vis-reg" style="padding: 8px 16px; cursor: pointer; background: #333; color: white; border: none; border-radius: 4px;">Close</button>
    `;

    const images = document.createElement('div');
    images.style.cssText = 'flex: 1; display: flex; padding: 20px; gap: 20px; overflow: auto; justify-content: center; align-items: flex-start;';
    
    const createImgCol = (title, src, borderColor) => `
        <div style="display:flex; flex-direction:column; min-width: 300px; max-width: 33%;">
            <h3 style="text-align:center; color:${borderColor}; margin-bottom: 10px; font-size: 14px; text-transform: uppercase;">${title}</h3>
            <div style="border: 2px solid ${borderColor};">
                <img src="${src}" style="width: 100%; display: block;">
            </div>
        </div>
    `;

    images.innerHTML = `
        ${createImgCol('Baseline', data.baseline, '#888')}
        ${createImgCol('Diff', data.diff, '#ff00ff')}
        ${createImgCol('Current', data.current, '#888')}
    `;

    container.appendChild(header);
    container.appendChild(images);
    document.body.appendChild(container);
    document.getElementById('close-vis-reg').onclick = () => container.remove();
}