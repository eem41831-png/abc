const { CDPClient } = require('./cdp_client');

async function inspect() {
    const cdp = new CDPClient();
    const tab = await cdp.findExamGoalTab();
    if (!tab) {
        console.log("No tab found");
        return;
    }
    await cdp.connectToTab(tab.webSocketDebuggerUrl);
    const result = await cdp.evaluate(`(() => {
        const items = [];
        document.querySelectorAll('a, button, [role="button"]').forEach(el => {
            const t = el.innerText.trim();
            if (t && t.length < 50) {
                items.push({ tag: el.tagName, text: t.replace(/\\n/g, ' '), href: el.href || '' });
            }
        });
        return {
            url: window.location.href,
            title: document.title,
            items: items.slice(0, 40)
        };
    })()`);
    console.log(JSON.stringify(result, null, 2));
    cdp.close();
}

inspect().catch(console.error);
