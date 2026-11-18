const { CDPClient } = require('./cdp_client');

async function dumpFullBody() {
    const cdp = new CDPClient();
    const tab = await cdp.findExamGoalTab();
    await cdp.connectToTab(tab.webSocketDebuggerUrl);

    const txt = await cdp.evaluate(`(() => {
        const full = document.body.innerText;
        // Find where "Given below are two statements" is
        const idx = full.indexOf("Given below are two statements");
        return {
            snippetAroundQuestion: idx !== -1 ? full.slice(idx, idx + 1500) : full.slice(0, 1500)
        };
    })()`);

    console.log(txt.snippetAroundQuestion);
    cdp.close();
}

dumpFullBody().catch(console.error);
