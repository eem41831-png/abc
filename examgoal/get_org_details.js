const { CDPClient } = require('./cdp_client');

async function getOrgDetails() {
    const cdp = new CDPClient();
    const tab = await cdp.findExamGoalTab();
    await cdp.connectToTab(tab.webSocketDebuggerUrl);

    const details = await cdp.evaluate(`(() => {
        const links = Array.from(document.querySelectorAll('a[href*="tab=topic"]'));
        const orgLinks = links.slice(22); // indices 23-32
        return orgLinks.map((a, idx) => {
            // Find card text by walking up
            let p = a;
            while (p && !p.className.includes('card') && p !== document.body) {
                p = p.parentElement;
            }
            return {
                idx: 23 + idx,
                url: a.href,
                text: p ? p.innerText.replace(/\\n/g, ' -- ') : a.innerText
            };
        });
    })()`);

    console.log(JSON.stringify(details, null, 2));
    cdp.close();
}

getOrgDetails().catch(console.error);
