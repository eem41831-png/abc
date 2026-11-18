const { CDPClient } = require('./cdp_client');

async function inspectOptionsDOM() {
    const cdp = new CDPClient();
    const tab = await cdp.findExamGoalTab();
    await cdp.connectToTab(tab.webSocketDebuggerUrl);

    const res = await cdp.evaluate(`(() => {
        function getCleanText(elem) {
            if (!elem) return '';
            const clone = elem.cloneNode(true);
            clone.querySelectorAll('.katex annotation, annotation[encoding*="tex"]').forEach(ann => {
                const tex = ann.textContent || '';
                const replacement = document.createTextNode(' $' + tex.trim() + '$ ');
                const root = ann.closest('.katex') || ann.closest('.math-tex') || ann;
                if (root && root.parentNode) root.parentNode.replaceChild(replacement, root);
            });
            clone.querySelectorAll('img').forEach(img => {
                const src = img.src || img.getAttribute('data-src') || '';
                if (src) {
                    const imgMd = document.createTextNode(' ![' + (img.alt || 'opt') + '](' + src + ') ');
                    if (img.parentNode) img.parentNode.replaceChild(imgMd, img);
                }
            });
            return clone.innerText ? clone.innerText.trim() : clone.textContent.trim();
        }

        // Look for option containers
        const qElem = document.querySelector('.question');
        const p = qElem.parentElement;
        const siblings = Array.from(p.children);
        const qIdx = siblings.indexOf(qElem);
        const following = siblings.slice(qIdx + 1);

        // Find correct answer indicator
        let correctAnswer = '';
        const all = Array.from(document.querySelectorAll('*'));
        const correctEl = all.find(e => e.innerText && e.innerText.trim().toUpperCase() === 'CORRECT ANSWER');
        if (correctEl) {
            let optParent = correctEl.parentElement;
            for (let i = 0; i < 4; i++) {
                if (optParent && (optParent.innerText.includes('A') || optParent.innerText.includes('B') || optParent.innerText.includes('C') || optParent.innerText.includes('D'))) {
                    // Check if starts with letter
                    const m = optParent.innerText.match(/\b([A-D])\b/);
                    if (m) {
                        correctAnswer = m[1];
                        break;
                    }
                }
                if (optParent) optParent = optParent.parentElement;
            }
        }

        // Explanation element
        const expElem = all.find(e => e.innerText && e.innerText.trim() === 'Explanation');
        let expText = '';
        if (expElem) {
            let expContainer = expElem;
            for (let i = 0; i < 4; i++) {
                if (expContainer.parentElement) expContainer = expContainer.parentElement;
            }
            expText = getCleanText(expContainer);
            // slice from "Explanation"
            const expIdx = expText.indexOf('Explanation');
            if (expIdx !== -1) {
                expText = expText.slice(expIdx + 'Explanation'.length).replace(/Add a Note[\s\S]*$/, '').trim();
            }
        }

        return {
            followingTags: following.map(el => ({ tag: el.tagName, class: el.className, text: getCleanText(el).slice(0, 100) })),
            correctAnswer: correctAnswer,
            explanationSnippet: expText.slice(0, 300)
        };
    })()`);

    console.log(JSON.stringify(res, null, 2));
    cdp.close();
}

inspectOptionsDOM().catch(console.error);
