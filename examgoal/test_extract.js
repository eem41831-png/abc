const { CDPClient } = require('./cdp_client');

async function testExtractCurrentQuestion() {
    const cdp = new CDPClient();
    const tab = await cdp.findExamGoalTab();
    await cdp.connectToTab(tab.webSocketDebuggerUrl);

    const questionData = await cdp.evaluate(`(() => {
        // Clean text with math preservation
        function getCleanHtml(elem) {
            if (!elem) return '';
            const clone = elem.cloneNode(true);
            clone.querySelectorAll('.katex annotation, annotation[encoding*=\"tex\"]').forEach(ann => {
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

        // 1. Exam meta (JEE Main 2026 ...)
        let meta = '';
        const metaEl = Array.from(document.querySelectorAll('*')).find(e => e.innerText && e.innerText.includes('JEE Main') && e.children.length === 0);
        if (metaEl) meta = metaEl.innerText.trim();

        // 2. Question body
        // Find element that has the question class or p tags
        let questionText = '';
        const qContainer = document.querySelector('.question, [class*=\"question_text\"], [class*=\"question-text\"]');
        if (qContainer) {
            questionText = getCleanHtml(qContainer);
        } else {
            // Find main area
            const main = document.querySelector('main') || document.body;
            questionText = main.innerText.slice(0, 500);
        }

        // 3. Options
        const options = [];
        let correctAnswer = '';
        const optionEls = document.querySelectorAll('[class*=\"option\"], label, [role=\"radio\"]');
        optionEls.forEach((opt, idx) => {
            const txt = getCleanHtml(opt);
            if (txt && (txt.startsWith('A') || txt.startsWith('B') || txt.startsWith('C') || txt.startsWith('D') || txt.length < 300)) {
                if (opt.innerText.includes('CORRECT ANSWER') || opt.className.includes('correct') || opt.className.includes('success')) {
                    correctAnswer = String.fromCharCode(65 + options.length);
                }
                options.push(txt.replace('CORRECT ANSWER', '').trim());
            }
        });

        // 4. Explanation
        let explanation = '';
        const expEl = Array.from(document.querySelectorAll('*')).find(e => e.innerText && e.innerText.startsWith('Explanation') && e.children.length === 0);
        if (expEl && expEl.parentElement) {
            explanation = getCleanHtml(expEl.parentElement);
        }

        return {
            meta: meta,
            question: questionText,
            optionsCount: options.length,
            options: options.slice(0, 4),
            correctAnswer: correctAnswer,
            explanationSnippet: explanation.slice(0, 200)
        };
    })()`);

    console.log("Extracted current question:", JSON.stringify(questionData, null, 2));
    cdp.close();
}

testExtractCurrentQuestion().catch(console.error);
