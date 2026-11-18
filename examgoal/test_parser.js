const { CDPClient } = require('./cdp_client');

function browserExtractor() {
    function getCleanText(elem) {
        if (!elem) return '';
        const clone = elem.cloneNode(true);
        const annotations = clone.querySelectorAll('.katex annotation, annotation[encoding*="tex"]');
        annotations.forEach(ann => {
            const tex = ann.textContent || '';
            const replacement = document.createTextNode(' $' + tex.trim() + '$ ');
            const root = ann.closest('.katex') || ann.closest('.math-tex') || ann;
            if (root && root.parentNode) root.parentNode.replaceChild(replacement, root);
        });
        const images = clone.querySelectorAll('img');
        images.forEach(img => {
            const src = img.src || img.getAttribute('data-src') || '';
            if (src) {
                const imgMd = document.createTextNode(' ![' + (img.alt || 'img') + '](' + src + ') ');
                if (img.parentNode) img.parentNode.replaceChild(imgMd, img);
            }
        });
        return clone.innerText ? clone.innerText.trim() : clone.textContent.trim();
    }

    const all = Array.from(document.querySelectorAll('*'));
    const exp = all.find(e => e.innerText && e.innerText.trim() === 'Explanation');
    let container = exp;
    for (let i = 0; i < 4; i++) {
        if (container && container.parentElement) container = container.parentElement;
    }

    const fullRawText = container ? getCleanText(container) : '';
    const lines = fullRawText.split('\n').map(l => l.trim()).filter(Boolean);

    const metaIdx = lines.findIndex(l => l.includes('JEE Main') || l.includes('AIEEE'));
    const meta = metaIdx !== -1 ? lines[metaIdx] : '';

    let qStart = metaIdx !== -1 ? metaIdx + 1 : 0;
    while (qStart < lines.length && (
        lines[qStart].startsWith('+') || 
        lines[qStart].startsWith('-') || 
        lines[qStart].includes('MCQ') || 
        lines[qStart].includes('00:') ||
        lines[qStart] === '/'
    )) {
        qStart++;
    }

    const optAIdx = lines.findIndex((l, idx) => idx >= qStart && l === 'A');
    let qEnd = optAIdx !== -1 ? optAIdx : lines.length;
    const questionBody = lines.slice(qStart, qEnd).join('\n\n');

    const options = {};
    let currentOpt = null;
    let optText = [];
    let correctOpt = '';
    let expStartIdx = lines.findIndex(l => l === 'Explanation');

    for (let i = optAIdx; i < (expStartIdx !== -1 ? expStartIdx : lines.length); i++) {
        const line = lines[i];
        if (['A', 'B', 'C', 'D'].includes(line)) {
            if (currentOpt) {
                options[currentOpt] = optText.join(' ').trim();
            }
            currentOpt = line;
            optText = [];
        } else if (line.includes('CORRECT ANSWER')) {
            correctOpt = currentOpt;
        } else {
            optText.push(line);
        }
    }
    if (currentOpt) {
        options[currentOpt] = optText.join(' ').trim();
    }

    let explanation = '';
    if (expStartIdx !== -1) {
        const expLines = lines.slice(expStartIdx + 1).filter(l => !l.includes('Add a Note') && !l.includes('QUESTION MAP'));
        explanation = expLines.join('\n\n');
    }

    return {
        meta,
        questionBody,
        options,
        correctOpt,
        explanation
    };
}

async function testParser() {
    const cdp = new CDPClient();
    const tab = await cdp.findExamGoalTab();
    await cdp.connectToTab(tab.webSocketDebuggerUrl);

    const code = `(${browserExtractor.toString()})()`;
    const parsed = await cdp.evaluate(code);

    console.log("Parsed Question Object:\n", JSON.stringify(parsed, null, 2));
    cdp.close();
}

testParser().catch(console.error);
