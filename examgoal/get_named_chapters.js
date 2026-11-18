const { CDPClient } = require('./cdp_client');

async function getNamedChapters() {
    const cdp = new CDPClient();
    const tab = await cdp.findExamGoalTab();
    await cdp.connectToTab(tab.webSocketDebuggerUrl);

    const list = await cdp.evaluate(`(() => {
        const results = [];
        // Look for headings or cards containing the chapter titles
        const links = Array.from(document.querySelectorAll('a[href*="tab=topic"]'));
        links.forEach((a, i) => {
            // Traverse up to find the card container
            let cur = a;
            let title = '';
            for (let depth = 0; depth < 8; depth++) {
                if (!cur) break;
                // Look for elements preceding this link or inside the container with chapter name
                const heading = cur.querySelector('h3, h4, h5, p, span');
                // Check all text in cur
                const lines = cur.innerText.split('\\n').map(l => l.trim()).filter(l => l.length > 0);
                // Usually the chapter title is one of the lines that doesn't say "Topic-wise Qs" or "Must Do Qs" or "Qs"
                const candidate = lines.find(l => !l.includes('Qs') && !l.includes('%ile') && !l.includes('–') && !l.includes('Syllabus') && l.length > 3);
                if (candidate) {
                    title = candidate;
                }
                cur = cur.parentElement;
            }
            results.push({
                index: i + 1,
                title: title,
                url: a.href
            });
        });
        return results;
    })()`);

    console.log(JSON.stringify(list, null, 2));
    cdp.close();
}

getNamedChapters().catch(console.error);
