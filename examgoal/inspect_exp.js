const { CDPClient } = require('./cdp_client');

async function inspectExplanationDetails() {
    const cdp = new CDPClient();
    const tab = await cdp.findExamGoalTab();
    await cdp.connectToTab(tab.webSocketDebuggerUrl);

    const details = await cdp.evaluate(`(() => {
        const all = Array.from(document.querySelectorAll('*'));
        const exp = all.find(e => e.innerText && e.innerText.trim() === 'Explanation');
        let container = exp;
        for (let i = 0; i < 4; i++) {
            if (container && container.parentElement) container = container.parentElement;
        }

        // Look for answer key / correct answer
        const ansEls = all.filter(e => e.innerText && (e.innerText.includes('Correct Answer') || e.innerText.includes('Answer:')) && e.innerText.length < 50);

        return {
            ansText: ansEls.map(e => e.innerText),
            explanationText: container ? container.innerText.slice(0, 1000) : ''
        };
    })()`);

    console.log(JSON.stringify(details, null, 2));
    cdp.close();
}

inspectExplanationDetails().catch(console.error);
