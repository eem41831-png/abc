const { CDPClient } = require('./cdp_client');

async function getAllChapters() {
    const cdp = new CDPClient();
    const tab = await cdp.findExamGoalTab();
    await cdp.connectToTab(tab.webSocketDebuggerUrl);

    const list = await cdp.evaluate(`(() => {
        const results = [];
        // Each chapter card has a topic-wise Qs link
        const links = Array.from(document.querySelectorAll('a[href*="tab=topic"]'));
        links.forEach(a => {
            // Traverse up to find the card container
            let parent = a.parentElement;
            let cardText = '';
            for (let i = 0; i < 5; i++) {
                if (parent) {
                    if (parent.innerText.includes('Qs') && parent.innerText.length < 300) {
                        cardText = parent.innerText;
                        break;
                    }
                    parent = parent.parentElement;
                }
            }
            results.push({
                cardText: (cardText || a.innerText).replace(/\\n/g, ' | '),
                url: a.href
            });
        });
        return results;
    })()`);

    console.log(JSON.stringify(list, null, 2));
    cdp.close();
}

getAllChapters().catch(console.error);
