const { CDPClient } = require('./cdp_client');

async function inspectSolution() {
    const cdp = new CDPClient();
    const tab = await cdp.findExamGoalTab();
    await cdp.connectToTab(tab.webSocketDebuggerUrl);

    console.log("Clicking 'View Solution' or 'Show Answer'...");
    await cdp.evaluate(`(() => {
        const btn = Array.from(document.querySelectorAll('button, a, span')).find(el => el.innerText && (el.innerText.includes('View Solution') || el.innerText.includes('Show Answer')));
        if (btn) btn.click();
    })()`);

    await new Promise(r => setTimeout(r, 2000));

    const state = await cdp.evaluate(`(() => {
        return {
            text: document.body.innerText.slice(0, 2000)
        };
    })()`);

    console.log("After clicking solution:", state.text.slice(0, 1000));
    cdp.close();
}

inspectSolution().catch(console.error);
