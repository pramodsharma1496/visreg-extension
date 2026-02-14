// background.js

let creatingOffscreenParams = null;

// --- 1. Helper: Update Badge ---
function setBadge(tabId, text, color) {
    chrome.action.setBadgeText({ text: text, tabId: tabId });
    chrome.action.setBadgeBackgroundColor({ color: color, tabId: tabId });
}

// --- 2. Offscreen Document Management ---
async function setupOffscreenDocument(path) {
  const offscreenUrl = chrome.runtime.getURL(path);
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [offscreenUrl]
  });

  if (existingContexts.length > 0) return;

  if (creatingOffscreenParams) {
    await creatingOffscreenParams;
  } else {
    creatingOffscreenParams = chrome.offscreen.createDocument({
      url: path,
      reasons: ['BLOBS'],
      justification: 'Image comparison via Canvas API',
    });
    await creatingOffscreenParams;
    creatingOffscreenParams = null;
  }
}

// --- 3. Window State Management ---
async function setWindowSize(windowId, width, height, state = 'normal') {
    const win = await chrome.windows.get(windowId);

    console.log(`[VisReg] Restoring State: ${state} | Target Size: ${width}x${height}`);

    if (state === 'maximized' || state === 'fullscreen') {
        if (win.state !== state) {
            await chrome.windows.update(windowId, { state: state });
            await new Promise(r => setTimeout(r, 600)); 
        }
        return; 
    }

    if (win.state === 'maximized' || win.state === 'fullscreen') {
        await chrome.windows.update(windowId, { state: 'normal' });
        await new Promise(r => setTimeout(r, 200));
    }

    if (width && height) {
        if (win.width !== parseInt(width) || win.height !== parseInt(height)) {
            await chrome.windows.update(windowId, {
                width: parseInt(width),
                height: parseInt(height),
                state: 'normal'
            });
            await new Promise(r => setTimeout(r, 600)); 
        }
    }
}

// --- 4. Core Capture Logic ---
async function captureTab(tabId, windowId, options = {}) {
    const { 
        useMasks = true, 
        targetWidth = null, 
        targetHeight = null, 
        targetState = null 
    } = options;

    if (targetState) {
        await setWindowSize(windowId, targetWidth, targetHeight, targetState);
    }

    try {
        await chrome.tabs.sendMessage(tabId, { 
            action: 'PREPARE_CAPTURE',
            useMasks: useMasks
        });
    } catch (e) {
        console.warn("[VisReg] Content script not ready:", e); 
    }

    await new Promise(r => setTimeout(r, 200));

    const win = await chrome.windows.get(windowId);
    return new Promise((resolve) => {
        chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
            resolve({
                image: dataUrl,
                width: win.width,
                height: win.height,
                state: win.state 
            });
        });
    });
}

// --- 5. Message Routing ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    let tab, tabId, windowId;
    if (sender.tab) {
        tab = sender.tab;
    } else {
        [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    }
    
    if (!tab) return;
    tabId = tab.id;
    windowId = tab.windowId;
    const urlKey = message.url || tab.url; 
    
    const maskStorageKey = `masks_${urlKey}`;
    const baselineKey = `baseline_${urlKey}`;
    const useMasks = (message.useMasks !== undefined) ? message.useMasks : true;

    try {
        // --- MASKING ---
        if (message.action === 'SAVE_MASK') {
            const result = await chrome.storage.local.get(maskStorageKey);
            let masks = result[maskStorageKey] || [];
            if (!masks.includes(message.selector)) {
                masks.push(message.selector);
                await chrome.storage.local.set({ [maskStorageKey]: masks });
            }
            sendResponse({ success: true });
        }
        else if (message.action === 'GET_SAVED_MASKS') {
            const result = await chrome.storage.local.get(maskStorageKey);
            sendResponse({ selectors: result[maskStorageKey] || [] });
        }
        else if (message.action === 'RESET_MASKS') {
             await chrome.storage.local.remove(maskStorageKey);
             sendResponse({ success: true });
        }

        // --- CAPTURE BASELINE ---
        else if (message.action === 'CAPTURE_BASELINE') {
            const result = await captureTab(tabId, windowId, { useMasks });
            
            const storageData = {
                screenshot: result.image,
                width: result.width,
                height: result.height,
                state: result.state
            };
            
            await chrome.storage.local.set({ [baselineKey]: storageData });
            
            // --- UPDATED: Set Blue Badge for "New" ---
            setBadge(tabId, "NEW", "#2196F3");
            
            sendResponse({ success: true });
        } 
        
        // --- COMPARE UI ---
        else if (message.action === 'COMPARE_UI') {
            const data = await chrome.storage.local.get(baselineKey);
            const baselineData = data[baselineKey];

            if (!baselineData) {
                sendResponse({ success: false, error: 'No baseline found.' });
                return;
            }

            const baselineImg = baselineData.screenshot || baselineData;
            const targetW = baselineData.width || 1280; 
            const targetH = baselineData.height || 800; 
            const targetState = baselineData.state || 'normal'; 

            const currentResult = await captureTab(tabId, windowId, { 
                useMasks: useMasks,
                targetWidth: targetW,
                targetHeight: targetH,
                targetState: targetState 
            });
            
            await setupOffscreenDocument('offscreen.html');
            chrome.runtime.sendMessage({
                action: 'PROCESS_DIFF',
                baseline: baselineImg,
                current: currentResult.image
            }, async (result) => {
                
                const now = new Date();
                const offset = now.getTimezoneOffset() * 60000;
                const localIso = new Date(now.getTime() - offset).toISOString();
                const timestamp = localIso.slice(0, 19).replace(/[:T]/g, '-'); 
                
                await chrome.storage.local.set({
                    [`diff_${urlKey}`]: {
                        current: result.current,
                        diff: result.diff,
                        baseline: result.baseline,
                        timestamp: timestamp,
                        mismatch: result.mismatch
                    }
                });

                // --- UPDATED: Set Badge based on Result ---
                if (parseFloat(result.mismatch) > 0) {
                     setBadge(tabId, "FAIL", "#F44336"); // Red
                } else {
                     setBadge(tabId, "PASS", "#4CAF50"); // Green
                }

                sendResponse({ success: true, result: result });
            });
        }
        
        else if (message.action === 'CLEAR_STORAGE') {
            chrome.storage.local.clear(() => {
                // Clear badge on reset
                chrome.action.setBadgeText({ text: "", tabId: tabId });
                sendResponse({ success: true });
            });
        }

    } catch (err) {
        console.error("[VisReg] Background Error:", err);
        sendResponse({ success: false, error: err.message });
    }
  })();
  return true; 
});