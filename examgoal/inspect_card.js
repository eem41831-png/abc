const { CDPClient } = require('./cdp_client');

async function inspectQuestionCard() {
    const cdp = new CDPClient();
    const tab = await cdp.findExamGoalTab();
    await cdp.connectToTab(tab.webSocketDebuggerUrl);

    const cardInfo = await cdp.evaluate(`(() => {
        // Find links or buttons inside the first question
        const cards = [];
        // Look for buttons that say "Practice this question"
        const btns = Array.from(document.querySelectorAll('a, button, div, span')).filter(el => el.innerText && el.innerText.includes('Practice this question') && el.children.length === 0);
        
        btns.slice(0, 3).forEach((b, i) => {
            let container = b;
            for (let d = 0; d < 5; d++) {
                if (container.parentElement && container.parentElement.innerText.includes('JEE Main')) {
                    container = container.parentElement;
                }
            }
            cards.push({
                index: i + 1,
                tag: b.tagName,
                href: b.href || b.getAttribute('href') || '',
                text: container.innerText.replace(/\\n/g, ' -- '),
                html: container.outerHTML.slice(0, 500)
            });
        });

        return {
            totalPracticeBtns: btns.length,
            cards: cards
        };
    })()`);

    console.log(JSON.stringify(cardInfo, null, 2));
    cdp.close();
}

inspectQuestionCard().catch(console.error);
