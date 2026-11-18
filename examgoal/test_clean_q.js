const { CDPClient } = require('./cdp_client');

async function testCleanQuestion() {
    const cdp = new CDPClient();
    const tab = await cdp.findExamGoalTab();
    await cdp.connectToTab(tab.webSocketDebuggerUrl);

    const clean = await cdp.evaluate(`(() => {
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
                    const imgMd = document.createTextNode(' ![' + (img.alt || 'diagram') + '](' + src + ') ');
                    if (img.parentNode) img.parentNode.replaceChild(imgMd, img);
                }
            });
            return clone.innerText ? clone.innerText.trim() : clone.textContent.trim();
        }

        const qElem = document.querySelector('.question');
        return {
            cleanQuestion: getCleanText(qElem)
        };
    })()`);

    console.log(JSON.stringify(clean, null, 2));
    cdp.close();
}

testCleanQuestion().catch(console.error);
