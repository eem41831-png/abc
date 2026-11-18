const { CDPClient } = require('./cdp_client');

async function inspectPureQuestionDOM() {
    const cdp = new CDPClient();
    const tab = await cdp.findExamGoalTab();
    await cdp.connectToTab(tab.webSocketDebuggerUrl);

    const info = await cdp.evaluate(`(() => {
        // Let's inspect all classes and tags inside the question card/container
        const qContainer = document.querySelector('.question, [class*="question-text"], [class*="question_text"], [class*="questionContent"]');
        
        // Also look for elements containing the question statement
        const all = Array.from(document.querySelectorAll('div, section, p'));
        const qEl = all.find(e => e.className && (e.className.includes('question') || e.className.includes('q-body')) && e.innerText && e.innerText.length > 20);

        return {
            qContainerTag: qContainer ? qContainer.tagName : null,
            qContainerClass: qContainer ? qContainer.className : null,
            qContainerText: qContainer ? qContainer.innerText.slice(0, 300) : null,
            qElClass: qEl ? qEl.className : null,
            qElText: qEl ? qEl.innerText.slice(0, 300) : null,
            bodySnippet: document.body.innerText.slice(0, 500)
        };
    })()`);

    console.log(JSON.stringify(info, null, 2));
    cdp.close();
}

inspectPureQuestionDOM().catch(console.error);
