const { CDPClient } = require('./cdp_client');

async function testAllTab() {
    const cdp = new CDPClient();
    const tab = await cdp.findExamGoalTab();
    await cdp.connectToTab(tab.webSocketDebuggerUrl);

    console.log("Navigating to Hydrocarbons tab=all...");
    await cdp.navigate('https://room.examgoal.com/pyq/subject/531fc896-5c12-5f87-a47e-b5663b869424/chapter/97ee64dd-1123-55e9-90c6-1d745e0bbbfc?tab=all');

    await new Promise(r => setTimeout(r, 3000));

    const res = await cdp.evaluate(`(() => {
        // Let's see how questions are displayed in tab=all
        const questions = [];
        // Look for question containers
        document.querySelectorAll('div, article, section').forEach(el => {
            const t = el.innerText || '';
            if (t.includes('JEE Main') && (t.includes('Shift') || t.includes('AIEEE')) && t.length > 50 && t.length < 1000) {
                questions.push({
                    text: t.replace(/\\n/g, ' -- ')
                });
            }
        });
        return {
            title: document.title,
            count: questions.length,
            sample: questions.slice(0, 5)
        };
    })()`);

    console.log(JSON.stringify(res, null, 2));
    cdp.close();
}

testAllTab().catch(console.error);
