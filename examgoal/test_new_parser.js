const { CDPClient } = require('./cdp_client');

function testParserFunction(fullText) {
    const metaMatch = fullText.match(/(JEE Main \d{4}[^\n+]+|AIEEE \d{4}[^\n+]+)/i);
    const meta = metaMatch ? metaMatch[0].trim().replace(/\b(MCQ Single Answer|\d{2}:\d{2}|\+\d+\/-\d+)\b/g, '').trim() : '';

    const isNumerical = fullText.includes('Numerical') && !fullText.includes('MCQ Single Answer');
    const questionType = isNumerical ? 'Numerical' : 'MCQ';

    let explanation = '';
    const expMatch = fullText.match(/Explanation([\s\S]*?)(?=Add a Note|QUESTION MAP|$)/i);
    if (expMatch) {
        explanation = expMatch[1].trim();
    }

    const options = {};
    let correctAnswer = '';

    const optMatch = fullText.match(/(?:^|\n)A\s*\n([\s\S]*?)(?=Explanation|Add a Note|QUESTION MAP|$)/);
    let questionBody = '';

    if (optMatch) {
        let textBeforeA = fullText.slice(0, fullText.indexOf(optMatch[0]));
        if (metaMatch) {
            textBeforeA = textBeforeA.slice(textBeforeA.indexOf(metaMatch[0]) + metaMatch[0].length);
        }
        questionBody = textBeforeA;

        const optsBlock = optMatch[0];
        const lines = optsBlock.split('\n').map(l => l.trim()).filter(Boolean);

        let currentOpt = null;
        let optLines = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (['A', 'B', 'C', 'D'].includes(line)) {
                if (currentOpt) {
                    options[currentOpt] = optLines.join(' ').replace(/CORRECT ANSWER/gi, '').trim();
                }
                currentOpt = line;
                optLines = [];
            } else if (line.toUpperCase() === 'CORRECT ANSWER' || line.toUpperCase().includes('CORRECT ANSWER')) {
                correctAnswer = currentOpt;
            } else {
                optLines.push(line);
            }
        }
        if (currentOpt) {
            options[currentOpt] = optLines.join(' ').replace(/CORRECT ANSWER/gi, '').trim();
        }
    } else {
        let textBeforeExp = fullText;
        if (expMatch) {
            textBeforeExp = fullText.slice(0, fullText.indexOf(expMatch[0]));
        }
        if (metaMatch) {
            textBeforeExp = textBeforeExp.slice(textBeforeExp.indexOf(metaMatch[0]) + metaMatch[0].length);
        }
        questionBody = textBeforeExp;
    }

    if (!correctAnswer && explanation) {
        const m1 = explanation.match(/Hence,?\s+(?:the\s+)?correct\s+(?:option|answer)\s+is\s+[\(]?([A-D])[\)]?/i);
        const m2 = fullText.match(/Correct answer\s*([A-D])/i);
        const m3 = fullText.match(/([A-D])\s*Correct answer/i);
        if (m1) correctAnswer = m1[1].toUpperCase();
        else if (m2) correctAnswer = m2[1].toUpperCase();
        else if (m3) correctAnswer = m3[1].toUpperCase();
    }

    questionBody = questionBody
        .replace(/MCQ Single Answer/g, '')
        .replace(/\bNumerical\b/g, '')
        .replace(/\d{2}:\d{2}/g, '')
        .replace(/\+\d+\s*\/\s*-\d+/g, '')
        .replace(/Practice this question/g, '')
        .replace(/Add a Note/g, '')
        .replace(/Select an option to check your answer/g, '')
        .replace(/^\s*\d+\s*\n+/, '')
        .trim();

    return {
        meta,
        questionType,
        question: questionBody,
        options,
        correctAnswer,
        explanationSnippet: explanation.slice(0, 150)
    };
}

async function testCurrent() {
    const cdp = new CDPClient();
    const tab = await cdp.findExamGoalTab();
    await cdp.connectToTab(tab.webSocketDebuggerUrl);

    const fullText = await cdp.evaluate(`(() => {
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
        return getCleanText(document.body);
    })()`);

    const result = testParserFunction(fullText);
    console.log("Parsed Result:\n", JSON.stringify(result, null, 2));
    cdp.close();
}

testCurrent().catch(console.error);
