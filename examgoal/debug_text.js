const { CDPClient } = require('./cdp_client');

async function debugPageText() {
    const cdp = new CDPClient();
    const tab = await cdp.findExamGoalTab();
    await cdp.connectToTab(tab.webSocketDebuggerUrl);

    const txt = await cdp.evaluate(`(() => {
        // Let's find buttons or clickable solution elements
        const btns = Array.from(document.querySelectorAll('button, a')).map(b => b.innerText.trim()).filter(Boolean);
        // Find text below question
        const qElem = document.querySelector('.question');
        let below = '';
        if (qElem && qElem.parentElement) {
            below = qElem.parentElement.innerText;
        }
        return {
            buttons: btns.slice(0, 20),
            belowQuestion: below.slice(0, 1000)
        };
    })()`);

    console.log(JSON.stringify(txt, null, 2));
    cdp.close();
}

debugPageText().catch(console.error);
