const { CDPClient } = require('./cdp_client');

async function testBasicsChapter() {
    const cdp = new CDPClient();
    const tab = await cdp.findExamGoalTab();
    await cdp.connectToTab(tab.webSocketDebuggerUrl);

    console.log("Navigating to Basics of Organic Chemistry tab=all...");
    await cdp.navigate('https://room.examgoal.com/pyq/subject/531fc896-5c12-5f87-a47e-b5663b869424/chapter/44058c74-bb76-5974-a71c-1213012ff9aa?tab=all');

    await new Promise(r => setTimeout(r, 3500));

    console.log("Clicking first question card in Basics of Organic Chemistry...");
    await cdp.evaluate(`(() => {
        const card = document.querySelector('[data-tour="chapter-question"]');
        if (card) card.click();
    })()`);

    await new Promise(r => setTimeout(r, 3500));

    const state = await cdp.evaluate(`(() => ({
        url: window.location.href,
        title: document.title,
        qSnippet: document.querySelector('.question') ? document.querySelector('.question').innerText.slice(0, 200) : 'not found'
    }))()`);

    console.log("Basics state:", state);
    cdp.close();
}

testBasicsChapter().catch(console.error);
