const { CDPClient } = require('./cdp_client');

async function getChemistryChapters() {
    const cdp = new CDPClient();
    const tab = await cdp.findExamGoalTab();
    await cdp.connectToTab(tab.webSocketDebuggerUrl);

    console.log("Navigating to Chemistry PYQ page...");
    await cdp.navigate('https://room.examgoal.com/pyq/subject/531fc896-5c12-5f87-a47e-b5663b869424');

    // Wait 3 seconds for SPA to load
    await new Promise(r => setTimeout(r, 3000));

    const chapters = await cdp.evaluate(`(() => {
        const list = [];
        document.querySelectorAll('a, button, [role="button"], li, tr, h3, h4').forEach(el => {
            const t = el.innerText.trim();
            if (t && t.length < 80 && (
                t.toLowerCase().includes('hydrocarbon') ||
                t.toLowerCase().includes('haloalkane') ||
                t.toLowerCase().includes('alcohol') ||
                t.toLowerCase().includes('aldehyde') ||
                t.toLowerCase().includes('carboxylic') ||
                t.toLowerCase().includes('amine') ||
                t.toLowerCase().includes('organic') ||
                t.toLowerCase().includes('aromatic') ||
                t.toLowerCase().includes('chapter')
            )) {
                list.push({ tag: el.tagName, text: t.replace(/\\n/g, ' - '), href: el.href || el.getAttribute('href') || '' });
            }
        });
        return {
            title: document.title,
            url: window.location.href,
            chapters: list
        };
    })()`);

    console.log(JSON.stringify(chapters, null, 2));
    cdp.close();
}

getChemistryChapters().catch(console.error);
