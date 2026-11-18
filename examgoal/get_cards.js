const { CDPClient } = require('./cdp_client');

async function getPreciseCards() {
    const cdp = new CDPClient();
    const tab = await cdp.findExamGoalTab();
    await cdp.connectToTab(tab.webSocketDebuggerUrl);

    const cards = await cdp.evaluate(`(() => {
        const results = [];
        // Look for all links with tab=topic
        const links = Array.from(document.querySelectorAll('a[href*="tab=topic"]'));
        links.forEach(a => {
            // Find the closest parent that contains ONLY ONE "tab=topic" link
            let el = a.parentElement;
            while (el && el.querySelectorAll('a[href*="tab=topic"]').length === 1) {
                if (el.parentElement && el.parentElement.querySelectorAll('a[href*="tab=topic"]').length > 1) {
                    break;
                }
                el = el.parentElement;
            }
            if (el) {
                const text = el.innerText.replace(/\\n/g, ' -- ');
                results.push({
                    text: text,
                    url: a.href
                });
            }
        });
        return results;
    })()`);

    console.log(JSON.stringify(cards, null, 2));
    cdp.close();
}

getPreciseCards().catch(console.error);
