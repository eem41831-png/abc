const { CDPClient } = require('./cdp_client');

async function clickStartPractice() {
    const cdp = new CDPClient();
    const tab = await cdp.findExamGoalTab();
    await cdp.connectToTab(tab.webSocketDebuggerUrl);

    console.log("Clicking Start Practice button...");
    await cdp.evaluate(`(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(el => el.innerText && el.innerText.includes('Start Practice'));
        if (btn) btn.click();
    })()`);

    await new Promise(r => setTimeout(r, 4000));

    const state = await cdp.evaluate(`(() => ({
        url: window.location.href,
        title: document.title,
        textSample: document.body.innerText.slice(0, 1500)
    }))()`);

    console.log("State after clicking Start Practice:", state);
    cdp.close();
}

clickStartPractice().catch(console.error);
