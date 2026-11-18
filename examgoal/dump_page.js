const { CDPClient } = require('./cdp_client');

async function dumpPage() {
    const cdp = new CDPClient();
    const tab = await cdp.findExamGoalTab();
    await cdp.connectToTab(tab.webSocketDebuggerUrl);

    const info = await cdp.evaluate(`(() => {
        const textElements = [];
        document.querySelectorAll('h1, h2, h3, h4, h5, h6, a, button, tr, div[role="button"]').forEach(el => {
            const txt = el.innerText ? el.innerText.trim() : '';
            if (txt && txt.length > 2 && txt.length < 120 && !txt.includes('\\n\\n')) {
                textElements.push({
                    tag: el.tagName,
                    text: txt.replace(/\\n/g, ' | '),
                    href: el.href || ''
                });
            }
        });
        return {
            title: document.title,
            count: textElements.length,
            elements: textElements.slice(0, 60)
        };
    })()`);
    console.log(JSON.stringify(info, null, 2));
    cdp.close();
}

dumpPage().catch(console.error);
