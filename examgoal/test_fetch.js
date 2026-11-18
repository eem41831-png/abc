const { CDPClient } = require('./cdp_client');

async function testChapters() {
    const cdp = new CDPClient();
    const tab = await cdp.findExamGoalTab();
    await cdp.connectToTab(tab.webSocketDebuggerUrl);

    // Let's do a fetch inside the page context to see chapters
    const chapters = await cdp.evaluate(`(async () => {
        try {
            // Find chapters by querying DOM or doing a fetch using the page's cookies
            const res = await fetch('/pyq/subject/99673506-f2c4-59c3-b166-d9543244d505');
            const html = await res.text();
            return {
                status: res.status,
                length: html.length,
                hasChapters: html.includes('chapter') || html.includes('Physics')
            };
        } catch(e) {
            return { error: e.message };
        }
    })()`);
    console.log("Subject page fetch:", chapters);
    cdp.close();
}

testChapters().catch(console.error);
