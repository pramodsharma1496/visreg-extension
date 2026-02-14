# 👁️ VisReg: Local Visual Regression Testing

![License](https://img.shields.io/badge/license-GPLv3-blue.svg)
![Chrome Extension](https://img.shields.io/badge/platform-Chrome-green.svg)
![Version](https://img.shields.io/badge/version-3.1.0-brightgreen.svg)

**VisReg** is a privacy-focused Chrome Extension that helps developers catch UI bugs before they commit code. It performs pixel-perfect visual regression testing directly in your browser, without the need for cloud servers or complex CI/CD pipelines.

---

## 🚀 Why VisReg?

Most visual testing tools (like Percy or Chromatic) require uploading your data to the cloud. **VisReg** is built for the **individual developer** workflow:

* **🔒 100% Local:** No images leave your machine. Your data stays in your browser.
* **⚡ Instant Feedback:** Get results in seconds, not minutes.
* **📱 Dynamic Viewports:** Automatically handles mobile, tablet, and desktop sizes.
* **🛠️ Zero Config:** No API keys, no YAML files. Just install and go.

---

## ✨ Key Features

### 1. 📱 Dynamic Viewport Handling
VisReg records the exact window dimensions and state (Normal vs. Maximized) when you set a baseline. It forces the browser to match those dimensions during comparison to ensure 100% accuracy.

### 2. 🎭 Smart Masking
Dynamic content (ads, timestamps, user names) often causes false positives. 
* **Click-to-Mask:** Enter "Masking Mode" and click any element to ignore it.
* **Persistence:** Masks are saved per URL and apply to all future tests on that page.

### 3. ⚡ Real-time Status Badges
The extension icon communicates test results instantly:
* 🔵 **Blue Badge:** New Baseline Saved.
* 🟢 **Green Badge:** PASS (Match).
* 🔴 **Red Badge:** FAIL (Mismatch).

### 4. 📂 Robust Reporting
* **Overlay Mode:** View a "Baseline vs. Diff vs. Current" comparison injected directly into the web page.
* **Zip Export:** Download a full report containing all test images, organized by local timestamp.

---

## 🛠️ Installation

1.  **Clone the Repository:**
    ```bash
    git clone [https://github.com/pramodsharma1496/visreg-extension.git](https://github.com/pramodsharma1496/visreg-extension.git)
    cd visreg-extension
    ```

2.  **Load the Extension in Chrome:**
    * Open Chrome and go to `chrome://extensions/`.
    * Enable **Developer mode** in the top right.
    * Click **Load unpacked** and select the `visreg-extension` folder.

3.  **Pin for Access:** 📌 Pin **VisReg** to your browser toolbar.

---

## 🏗️ Tech Stack
* **Manifest V3:** Modern Chrome extension architecture.
* **Offscreen API:** High-performance background image processing.
* **Pixelmatch:** Industry-standard pixel-level comparison library.
* **JSZip:** Client-side report generation.

---

## 🤝 Contributing
Pull requests are welcome! We are currently focusing on:
* Full-Page Scrolling Screenshots
* "Quick Mode" for auto-capturing new pages
* Storage optimization

## 📄 License
This project is licensed under the **GNU GPLv3 License**. See `LICENSE` for more information.
