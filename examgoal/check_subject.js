const { CDPClient } = require('./cdp_client');

async function testSubject() {
    const cdp = new CDPClient();
    const tab = await cdp.findExamGoalTab();
    await cdp.connectToTab(tab.webSocketDebuggerUrl);

    // Let's inspect the current page's subject chapters or fetch API if any
    const res = await cdp.evaluate(`(() => {
        return {
            title: document.title,
            url: window.location.href,
            links: Array.from(document.querySelectorAll('a')).map(a => ({ text: a.innerText.trim(), href: a.href })).filter(x => x.text && x.href.includes('/pyq/'))
        };
    })()`);
    console.log(JSON.stringify(res, null, 2));
    cdp.close();
}

testSubject().catch(console.error);
