const { CDPClient } = require('./cdp_client');

async function testTopicPage() {
    const cdp = new CDPClient();
    const tab = await cdp.findExamGoalTab();
    await cdp.connectToTab(tab.webSocketDebuggerUrl);

    console.log("Navigating to Hydrocarbons topic tab...");
    await cdp.navigate('https://room.examgoal.com/pyq/subject/531fc896-5c12-5f87-a47e-b5663b869424/chapter/97ee64dd-1123-55e9-90c6-1d745e0bbbfc?tab=topic');

    // Wait for SPA render
    await new Promise(r => setTimeout(r, 3000));

    const topics = await cdp.evaluate(`(() => {
        const list = [];
        document.querySelectorAll('a, button, [role="button"], tr, div').forEach(el => {
            const txt = el.innerText ? el.innerText.trim() : '';
            if (txt && (txt.includes('Practice') || txt.includes('Take Test') || txt.includes('Qs')) && txt.length < 150) {
                list.push({
                    tag: el.tagName,
                    text: txt.replace(/\\n/g, ' -- '),
                    href: el.href || el.getAttribute('href') || ''
                });
            }
        });
        return {
            title: document.title,
            count: list.length,
            topics: list.slice(0, 30)
        };
    })()`);

    console.log(JSON.stringify(topics, null, 2));
    cdp.close();
}

testTopicPage().catch(console.error);
