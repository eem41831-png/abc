const { CDPClient } = require('./cdp_client');

async function inspectPracticeClick() {
    const cdp = new CDPClient();
    const tab = await cdp.findExamGoalTab();
    await cdp.connectToTab(tab.webSocketDebuggerUrl);

    // Let's find the first "Practice this question" element
    const practiceLink = await cdp.evaluate(`(() => {
        const all = Array.from(document.querySelectorAll('*'));
        const el = all.find(e => e.innerText && e.innerText.trim() === 'Practice this question' && e.children.length === 0);
        if (!el) return null;
        let p = el;
        while (p && p.tagName !== 'A' && p.tagName !== 'BUTTON' && p !== document.body) {
            p = p.parentElement;
        }
        return {
            tag: p.tagName,
            href: p.href || p.getAttribute('href') || '',
            text: el.innerText
        };
    })()`);

    console.log("Practice button/link:", practiceLink);

    // Let's click it!
    console.log("Clicking first 'Practice this question'...");
    await cdp.evaluate(`(() => {
        const all = Array.from(document.querySelectorAll('*'));
        const el = all.find(e => e.innerText && e.innerText.trim() === 'Practice this question' && e.children.length === 0);
        if (el) el.click();
    })()`);

    await new Promise(r => setTimeout(r, 3000));

    const stateAfterClick = await cdp.evaluate(`(() => ({
        url: window.location.href,
        title: document.title,
        textSample: document.body.innerText.slice(0, 1000)
    }))()`);

    console.log("State after click:", stateAfterClick);
    cdp.close();
}

inspectPracticeClick().catch(console.error);
