const { CDPClient } = require('./cdp_client');

async function dumpFirstQuestion() {
    const cdp = new CDPClient();
    const tab = await cdp.findExamGoalTab();
    await cdp.connectToTab(tab.webSocketDebuggerUrl);

    const info = await cdp.evaluate(`(() => {
        // Find elements with MathJax or LaTeX
        const allWithText = Array.from(document.querySelectorAll('*')).filter(el => {
            return el.innerText && el.innerText.includes('The major product of which') && el.children.length === 0;
        });

        if (allWithText.length === 0) return { notFound: true };

        const target = allWithText[0];
        let p = target;
        while (p && p.parentElement && p.parentElement !== document.body && !p.className.includes('card')) {
            p = p.parentElement;
        }

        return {
            text: p ? p.innerText : '',
            outerHTML: p ? p.outerHTML.slice(0, 1000) : ''
        };
    })()`);

    console.log(JSON.stringify(info, null, 2));
    cdp.close();
}

dumpFirstQuestion().catch(console.error);
