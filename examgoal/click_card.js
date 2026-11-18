const { CDPClient } = require('./cdp_client');

async function clickQuestionCard() {
    const cdp = new CDPClient();
    const tab = await cdp.findExamGoalTab();
    await cdp.connectToTab(tab.webSocketDebuggerUrl);

    console.log("Clicking the first question card...");
    await cdp.evaluate(`(() => {
        const card = document.querySelector('[data-tour="chapter-question"]');
        if (card) card.click();
    })()`);

    await new Promise(r => setTimeout(r, 4000));

    const state = await cdp.evaluate(`(() => ({
        url: window.location.href,
        title: document.title,
        textSample: document.body.innerText.slice(0, 1500)
    }))()`);

    console.log("State after clicking card:", state);
    cdp.close();
}

clickQuestionCard().catch(console.error);
