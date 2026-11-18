const { CDPClient } = require('./cdp_client');

async function getOrganicChapters() {
    const cdp = new CDPClient();
    const tab = await cdp.findExamGoalTab();
    await cdp.connectToTab(tab.webSocketDebuggerUrl);

    const organicChapters = await cdp.evaluate(`(() => {
        const chapters = [];
        // Find the H2 with "ORGANIC CHEMISTRY"
        const headers = Array.from(document.querySelectorAll('h2'));
        const orgHeader = headers.find(h => h.innerText.includes('ORGANIC CHEMISTRY'));
        if (!orgHeader) return { error: "Header not found" };

        let curr = orgHeader.nextElementSibling;
        while (curr && curr.tagName !== 'H2') {
            const card = curr;
            const titleElem = card.querySelector('h3, h4, [class*="title"], p, span');
            const topicLink = card.querySelector('a[href*="tab=topic"]');
            const title = titleElem ? titleElem.innerText.trim() : card.innerText.split('\\n')[0];
            if (topicLink) {
                chapters.push({
                    name: title,
                    fullCardText: card.innerText.replace(/\\n/g, ' | '),
                    topicUrl: topicLink.href
                });
            }
            curr = curr.nextElementSibling;
        }

        // If siblings aren't direct, inspect parent or following container
        if (chapters.length === 0) {
            // Find all cards following the organic header in DOM
            const allLinks = Array.from(document.querySelectorAll('a[href*="tab=topic"]'));
            allLinks.forEach(link => {
                const container = link.closest('div[class*="card"], li, div[class*="item"]') || link.parentElement;
                chapters.push({
                    text: container ? container.innerText.replace(/\\n/g, ' | ') : link.innerText,
                    url: link.href
                });
            });
        }

        return chapters;
    })()`);

    console.log(JSON.stringify(organicChapters, null, 2));
    cdp.close();
}

getOrganicChapters().catch(console.error);
