const { CDPClient } = require('./cdp_client');

async function testPureQAndOpts() {
    const cdp = new CDPClient();
    const tab = await cdp.findExamGoalTab();
    await cdp.connectToTab(tab.webSocketDebuggerUrl);

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
                    const imgMd = document.createTextNode(' ![' + (img.alt || 'diagram') + '](' + src + ') ');
                    if (img.parentNode) img.parentNode.replaceChild(imgMd, img);
                }
            });
            return clone.innerText ? clone.innerText.trim() : clone.textContent.trim();
        }

        const qElem = document.querySelector('.question');
        const pureQuestion = getCleanText(qElem);

        // Find metadata (exam name, year, shift)
        let examMeta = '';
        const allSpans = Array.from(document.querySelectorAll('span, div')).filter(el => {
            const t = el.innerText || '';
            return (t.includes('JEE Main') || t.includes('AIEEE')) && t.length < 80 && el.children.length === 0;
        });
        if (allSpans.length > 0) examMeta = allSpans[0].innerText.trim();

        // Check Numerical vs MCQ
        const isNumerical = document.body.innerText.includes('Numerical') && !document.body.innerText.includes('MCQ Single Answer');

        // Extract options by looking for option cards/elements or lines in text
        const bodyText = getCleanText(document.body);
        let expText = '';
        const expIdx = bodyText.indexOf('Explanation');
        if (expIdx !== -1) {
            expText = bodyText.slice(expIdx + 'Explanation'.length).replace(/Add a Note[\s\S]*$/, '').trim();
        }

        // Section between question and explanation contains the options
        let opts = {};
        let correctOpt = '';

        if (!isNumerical) {
            // Check for options A, B, C, D
            // Try matching "A ... B ... C ... D ... Explanation"
            const between = bodyText.slice(bodyText.indexOf(pureQuestion) + pureQuestion.length, expIdx !== -1 ? expIdx : bodyText.length);
            const aM = between.match(/A\s*([\s\S]*?)(?=B\s*)/);
            const bM = between.match(/B\s*([\s\S]*?)(?=C\s*)/);
            const cM = between.match(/C\s*([\s\S]*?)(?=D\s*)/);
            const dM = between.match(/D\s*([\s\S]*?)(?=$)/);

            if (aM && bM && cM && dM) {
                opts['A'] = aM[1].replace(/CORRECT ANSWER/gi, '').trim();
                opts['B'] = bM[1].replace(/CORRECT ANSWER/gi, '').trim();
                opts['C'] = cM[1].replace(/CORRECT ANSWER/gi, '').trim();
                opts['D'] = dM[1].replace(/CORRECT ANSWER/gi, '').trim();

                if (aM[1].toUpperCase().includes('CORRECT ANSWER')) correctOpt = 'A';
                else if (bM[1].toUpperCase().includes('CORRECT ANSWER')) correctOpt = 'B';
                else if (cM[1].toUpperCase().includes('CORRECT ANSWER')) correctOpt = 'C';
                else if (dM[1].toUpperCase().includes('CORRECT ANSWER')) correctOpt = 'D';
            }
        }

        if (!correctOpt && expText) {
            const m = expText.match(/Hence,?\s+(?:the\s+)?correct\s+(?:option|answer)\s+is\s+[\(]?([A-D])[\)]?/i);
            if (m) correctOpt = m[1].toUpperCase();
        }

        return {
            examMeta,
            questionType: isNumerical ? 'Numerical' : 'MCQ',
            pureQuestion,
            options: opts,
            correctOpt,
            explanationSnippet: expText.slice(0, 150)
        };
    })()`);

    console.log(JSON.stringify(data, null, 2));
    cdp.close();
}

testPureQAndOpts().catch(console.error);
