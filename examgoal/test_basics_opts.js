const { CDPClient } = require('./cdp_client');

async function inspectOptionsInBasics() {
    const cdp = new CDPClient();
    const tab = await cdp.findExamGoalTab();
    await cdp.connectToTab(tab.webSocketDebuggerUrl);

    // Click Show Answer / View Solution
    await cdp.evaluate(`(() => {
        const btn = Array.from(document.querySelectorAll('button, a, span')).find(el => el.innerText && (el.innerText.includes('View Solution') || el.innerText.includes('Show Answer')));
        if (btn) btn.click();
    })()`);

    await new Promise(r => setTimeout(r, 1500));

    const data = await cdp.evaluate(`(() => {
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
                    const imgMd = document.createTextNode(' ![' + (img.alt || 'img') + '](' + src + ') ');
                    if (img.parentNode) img.parentNode.replaceChild(imgMd, img);
                }
            });
            return clone.innerText ? clone.innerText.trim() : clone.textContent.trim();
        }

        const qElem = document.querySelector('.question');
        const questionText = getCleanText(qElem);

        // Find metadata line (e.g. JEE Main...)
        const metaSpan = Array.from(document.querySelectorAll('*')).find(e => e.innerText && (e.innerText.includes('JEE Main') || e.innerText.includes('AIEEE')) && e.children.length === 0);
        const meta = metaSpan ? metaSpan.innerText.trim() : '';

        // Check if Numerical or MCQ
        const isNumerical = document.body.innerText.includes('Numerical') && !document.body.innerText.includes('MCQ Single Answer');

        // Look for options in body
        const allText = getCleanText(document.body);
        const lines = allText.split('\\n').map(l => l.trim()).filter(Boolean);

        // Options A, B, C, D
        const options = {};
        let currentOpt = null;
        let optLines = [];
        let correctOpt = '';
        let expStartIdx = lines.findIndex(l => l === 'Explanation');

        const optAIdx = lines.findIndex(l => l === 'A');
        if (optAIdx !== -1) {
            const endIdx = expStartIdx !== -1 ? expStartIdx : lines.length;
            for (let i = optAIdx; i < endIdx; i++) {
                const line = lines[i];
                if (['A', 'B', 'C', 'D'].includes(line)) {
                    if (currentOpt) {
                        options[currentOpt] = optLines.join(' ').trim();
                    }
                    currentOpt = line;
                    optLines = [];
                } else if (line.toUpperCase().includes('CORRECT ANSWER')) {
                    correctOpt = currentOpt;
                } else {
                    optLines.push(line);
                }
            }
            if (currentOpt) {
                options[currentOpt] = optLines.join(' ').trim();
            }
        }

        // Explanation
        let explanation = '';
        if (expStartIdx !== -1) {
            const expContainer = Array.from(document.querySelectorAll('*')).find(e => e.innerText && e.innerText.trim() === 'Explanation');
            let p = expContainer;
            for (let i = 0; i < 4; i++) {
                if (p && p.parentElement) p = p.parentElement;
            }
            if (p) {
                const fullExp = getCleanText(p);
                const idx = fullExp.indexOf('Explanation');
                if (idx !== -1) {
                    explanation = fullExp.slice(idx + 'Explanation'.length).replace(/Add a Note[\s\S]*$/, '').trim();
                }
            }
        }

        return {
            meta,
            isNumerical,
            questionText,
            options,
            correctOpt,
            explanationSnippet: explanation.slice(0, 300)
        };
    })()`);

    console.log(JSON.stringify(data, null, 2));
    cdp.close();
}

inspectOptionsInBasics().catch(console.error);
