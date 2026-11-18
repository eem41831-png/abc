const { CDPClient } = require('./cdp_client');

async function inspectStartPractice() {
    const cdp = new CDPClient();
    const tab = await cdp.findExamGoalTab();
    await cdp.connectToTab(tab.webSocketDebuggerUrl);

    const btnInfo = await cdp.evaluate(`(() => {
        const btns = Array.from(document.querySelectorAll('a, button')).filter(el => el.innerText && el.innerText.includes('Start Practice'));
        return btns.map(b => ({
            tag: b.tagName,
            text: b.innerText,
            href: b.href || b.getAttribute('href') || ''
        }));
    })()`);

    console.log("Start Practice buttons:", btnInfo);
    cdp.close();
}

inspectStartPractice().catch(console.error);
