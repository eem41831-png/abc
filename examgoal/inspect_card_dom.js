const { CDPClient } = require('./cdp_client');

async function inspectFirstQuestionCard() {
    const cdp = new CDPClient();
    const tab = await cdp.findExamGoalTab();
    await cdp.connectToTab(tab.webSocketDebuggerUrl);

    const card = await cdp.evaluate(`(() => {
        // Find elements containing "rearrangement reaction"
        const els = Array.from(document.querySelectorAll('*')).filter(e => e.innerText && e.innerText.includes('rearrangement reaction') && e.children.length === 0);
        if (els.length === 0) return { error: "not found" };
        
        let p = els[0];
        // Go up 4 levels
        for (let i = 0; i < 5; i++) {
            if (p.parentElement) p = p.parentElement;
        }

        return {
            tagName: p.tagName,
            className: p.className,
            childrenCount: p.children.length,
            html: p.outerHTML.slice(0, 2000)
        };
    })()`);

    console.log(JSON.stringify(card, null, 2));
    cdp.close();
}

inspectFirstQuestionCard().catch(console.error);
