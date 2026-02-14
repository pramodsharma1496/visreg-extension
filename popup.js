// popup.js

document.addEventListener('DOMContentLoaded', async () => {
  const btnMask = document.getElementById('btn-mask');
  const btnResetMasks = document.getElementById('btn-reset-masks');
  const cbUseMasks = document.getElementById('cb-use-masks');
  const btnBaseline = document.getElementById('btn-baseline');
  const btnCompare = document.getElementById('btn-compare');
  const btnExport = document.getElementById('btn-export');
  const btnClear = document.getElementById('btn-clear');
  const statusDiv = document.getElementById('status-msg');

  function setStatus(msg, type = 'loading') {
    statusDiv.textContent = msg;
    statusDiv.className = `status ${type}`;
  }

  async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  function injectContentScript(tabId) {
    return new Promise((resolve, reject) => {
      try {
        chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] }, (res) => {
          if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
          resolve(res);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  // --- Check masking status on load ---
  const tab = await getActiveTab();
  if (tab) {
      chrome.tabs.sendMessage(tab.id, { action: 'GET_MASKING_STATUS' }, (response) => {
          if (!chrome.runtime.lastError && response && response.isMasking) {
              updateMaskButton(true);
          }
      });
  }

  function updateMaskButton(isMasking) {
      if (isMasking) {
          btnMask.textContent = "Stop Masking Mode";
          btnMask.style.backgroundColor = "#b71c1c"; 
          btnMask.style.color = "white";
          btnMask.style.borderColor = "#ff5252";
      } else {
          btnMask.textContent = "Toggle Masking Mode";
          btnMask.style.backgroundColor = "#333"; 
          btnMask.style.color = "#ccc";
          btnMask.style.borderColor = "#444";
      }
  }

  // 1. Toggle Masking Mode
  btnMask.addEventListener('click', async () => {
    const tab = await getActiveTab();
    if (!tab) return;
    
    const handleToggleResponse = (res) => {
        if (chrome.runtime.lastError) {
             setStatus(chrome.runtime.lastError.message || "Unable to toggle", 'error');
             return;
        }
        updateMaskButton(res.isMasking);
        if (res.isMasking) window.close();
    };

    chrome.tabs.sendMessage(tab.id, { action: 'TOGGLE_MASKING' }, (res) => {
       if (chrome.runtime.lastError) {
         injectContentScript(tab.id).then(() => {
           chrome.tabs.sendMessage(tab.id, { action: 'TOGGLE_MASKING' }, handleToggleResponse);
         }).catch(err => setStatus(err.message || "Injection failed", 'error'));
       } else {
         handleToggleResponse(res);
       }
    });
  });

  // 2. Reset Masks
  btnResetMasks.addEventListener('click', async () => {
      const tab = await getActiveTab();
      if (!tab) return;
      chrome.runtime.sendMessage({ action: 'RESET_MASKS', url: tab.url }, (response) => {
        if (chrome.runtime.lastError) {
          setStatus(chrome.runtime.lastError.message || "Background unavailable", 'error');
          return;
        }
        chrome.tabs.reload(tab.id);
        window.close();
      });
  });

  // 3. Set Baseline
  btnBaseline.addEventListener('click', async () => {
    const tab = await getActiveTab();
    if (!tab) return;
    const useMasks = cbUseMasks.checked;

    setStatus("Resizing & Capturing...", 'loading');
    chrome.runtime.sendMessage({ 
        action: 'CAPTURE_BASELINE', 
        url: tab.url, 
        useMasks: useMasks 
    }, (response) => {
      if (chrome.runtime.lastError) {
        setStatus(chrome.runtime.lastError.message || "Capture failed", 'error');
        return;
      }
      if (response && response.success) {
        setStatus("Baseline Saved!", 'success');
        setTimeout(() => setStatus("Ready", 'loading'), 2000);
      } else {
        setStatus(response && response.error ? response.error : "Capture Failed", 'error');
      }
    });
  });

  // 4. Run Comparison
  btnCompare.addEventListener('click', async () => {
    const tab = await getActiveTab();
    if (!tab) return;
    const useMasks = cbUseMasks.checked;

    setStatus("Comparing...", 'loading');
    chrome.runtime.sendMessage({ 
        action: 'COMPARE_UI', 
        url: tab.url, 
        useMasks: useMasks 
    }, (response) => {
      if (chrome.runtime.lastError) {
        setStatus(chrome.runtime.lastError.message || "Compare failed", 'error');
        return;
      }
        if (response && response.success) {
        setStatus("Done!", 'success');
        chrome.tabs.sendMessage(tab.id, { action: 'SHOW_REPORT', data: response.result }, () => {
            if (chrome.runtime.lastError) {
                injectContentScript(tab.id).then(() => {
                    chrome.tabs.sendMessage(tab.id, { action: 'SHOW_REPORT', data: response.result }, () => {
                        if (chrome.runtime.lastError) setStatus("Unable to show report", 'error');
                    });
                }).catch(() => setStatus("Unable to show report", 'error'));
            }
        });
      } else {
        setStatus(response && response.error ? response.error : "Failed", 'error');
      }
    });
  });

  // 5. Export Report (FIXED)
  btnExport.addEventListener('click', () => {
    setStatus("Generating ZIP...", 'loading');
    
    chrome.storage.local.get(null, (items) => {
        if (Object.keys(items).length === 0) {
            setStatus("No data found", 'error');
            return;
        }

        const zip = new JSZip();
        const baselineFolder = zip.folder("Baselines");

        for (const [key, value] of Object.entries(items)) {
            const getSafeName = (k) => {
                let raw = k.replace('baseline_', '').replace('diff_', '');
                return raw.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            };

            // --- FIXED SECTION START ---
            if (key.startsWith('baseline_')) {
                // Determine if 'value' is the Old String or New Object
                let imageStr = null;
                
                if (typeof value === 'string') {
                    imageStr = value; // Old format
                } else if (typeof value === 'object' && value !== null && value.screenshot) {
                    imageStr = value.screenshot; // New format
                }

                // Only proceed if we found a valid image string
                if (imageStr && imageStr.includes(',')) {
                    const safeName = getSafeName(key);
                    const base64Data = imageStr.split(',')[1];
                    baselineFolder.file(`${safeName}.png`, base64Data, { base64: true });
                }
            }
            // --- FIXED SECTION END ---
            
            else if (key.startsWith('diff_')) {
                const data = value; 
                if(data && data.timestamp && data.current && data.diff) {
                    const safeName = getSafeName(key);
                    const runFolder = zip.folder(data.timestamp);
                    const urlFolder = runFolder.folder(safeName);
                    
                    urlFolder.file("baseline.png", data.baseline.split(',')[1], { base64: true });
                    urlFolder.file("current.png", data.current.split(',')[1], { base64: true });
                    urlFolder.file("diff.png", data.diff.split(',')[1], { base64: true });
                }
            }
        }

        zip.generateAsync({ type: "blob" }).then((content) => {
            const url = URL.createObjectURL(content);
            const a = document.createElement("a");
            a.href = url;
            a.download = `VisReg_Report_${new Date().toLocaleDateString('en-IN').slice(0,10)}.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            setStatus("Export Complete!", 'success');
        }).catch(err => {
            setStatus("Zip Error: " + err.message, 'error');
        });
    });
  });

  // 6. Clear Storage
  btnClear.addEventListener('click', () => {
    if(!confirm("Delete ALL baselines?")) return;
    setStatus("Clearing...", 'loading');
    chrome.runtime.sendMessage({ action: 'CLEAR_STORAGE' }, (response) => {
      if (chrome.runtime.lastError) {
        setStatus(chrome.runtime.lastError.message || "Clear failed", 'error');
        return;
      }
      if (response && response.success) setStatus("Storage Cleared", 'success');
    });
  });
});