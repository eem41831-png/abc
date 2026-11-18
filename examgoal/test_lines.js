const { CDPClient } = require('./cdp_client');

async function testLines() {
    const cdp = new CDPClient();
    const tab = await cdp.findExamGoalTab();
    await cdp.connectToTab(tab.webSocketDebuggerUrl);

    const lines = await cdp.evaluate(`(() => {
        const all = Array.from(document.querySelectorAll('*'));
        const exp = all.find(e => e.innerText && e.innerText.trim() === 'Explanation');
        let container = exp;
        for (let i = 0; i < 4; i++) {
            if (container && container.parentElement) container = container.parentElement;
        }
        return container ? container.innerText.split('\\n').map(l => l.trim()).filter(Boolean) : [];
    })()`);

    console.log("Lines in container:\n", lines);
    cdp.close();
}

testLines().catch(console.error);
