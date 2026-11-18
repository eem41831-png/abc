const { CDPClient } = require('./cdp_client');

async function testBetween() {
    const cdp = new CDPClient();
    const tab = await cdp.findExamGoalTab();
    await cdp.connectToTab(tab.webSocketDebuggerUrl);

    const data = await cdp.evaluate(`(() => {
        const full = document.body.innerText;
        const qIdx = full.indexOf("In the light of the above statements");
        const expIdx = full.indexOf("Explanation");
        return {
            between: full.slice(qIdx, expIdx)
        };
    })()`);

    console.log("BETWEEN TEXT:\n", data.between);
    cdp.close();
}

testBetween().catch(console.error);
