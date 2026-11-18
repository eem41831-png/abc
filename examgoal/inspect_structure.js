const { CDPClient } = require('./cdp_client');

async function inspectQuestionStructure() {
    const cdp = new CDPClient();
    const tab = await cdp.findExamGoalTab();
    await cdp.connectToTab(tab.webSocketDebuggerUrl);

    const res = await cdp.evaluate(`(() => {
        const qElem = document.querySelector('.question');
        const parent = qElem ? qElem.parentElement : null;

        // Find metadata (exam name, year, shift)
        let examMeta = '';
        const allSpans = Array.from(document.querySelectorAll('span, div')).filter(el => {
            const t = el.innerText || '';
            return (t.includes('JEE Main') || t.includes('AIEEE')) && t.length < 80 && el.children.length === 0;
        });
        if (allSpans.length > 0) examMeta = allSpans[0].innerText.trim();

        // Options
        // In ExamGoal, options are usually rendered as radio items or cards below .question
        const optionCards = Array.from(document.querySelectorAll('[data-slot="option"], [class*="option-item"], [class*="option"], label')).filter(el => {
            const t = el.innerText || '';
            return (t.startsWith('A') || t.startsWith('B') || t.startsWith('C') || t.startsWith('D')) && t.length < 500 && el.children.length > 0;
        });

        // Solution
        const expElem = Array.from(document.querySelectorAll('*')).find(el => el.innerText && el.innerText.trim() === 'Explanation');
        let expContainer = expElem;
        if (expContainer) {
            for (let i = 0; i < 3; i++) {
                if (expContainer.parentElement) expContainer = expContainer.parentElement;
            }
        }

        return {
            examMeta: examMeta,
            questionText: qElem ? qElem.innerText : null,
            optionsCount: optionCards.length,
            optionsSample: optionCards.slice(0, 4).map(o => o.innerText.replace(/\\n/g, ' ')),
            hasExplanation: !!expElem
        };
    })()`);

    console.log(JSON.stringify(res, null, 2));
    cdp.close();
}

inspectQuestionStructure().catch(console.error);
