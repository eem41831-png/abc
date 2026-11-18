const { CDPClient } = require('./cdp_client');

async function getDirectChapterUrls() {
    const cdp = new CDPClient();
    const tab = await cdp.findExamGoalTab();
    await cdp.connectToTab(tab.webSocketDebuggerUrl);

    const mapping = await cdp.evaluate(`(() => {
        const results = [];
        // Grab all elements that contain chapter names
        const cards = Array.from(document.querySelectorAll('div, section, article')).filter(el => {
            const t = el.innerText || '';
            return (t.includes('Hydrocarbons') || t.includes('Haloalkanes') || t.includes('Alcohols') || t.includes('Aldehydes') || t.includes('Compounds Containing Nitrogen')) && t.includes('Topic-wise Qs') && t.length < 500;
        });

        // If specific cards found
        const chapterNames = [
            'Hydrocarbons',
            'Haloalkanes and Haloarenes',
            'Alcohols, Phenols and Ethers',
            'Aldehydes, Ketones and Carboxylic Acids',
            'Compounds Containing Nitrogen'
        ];

        chapterNames.forEach(name => {
            const allLinks = Array.from(document.querySelectorAll('a[href*="tab=topic"]'));
            allLinks.forEach(link => {
                let p = link.parentElement;
                while (p && p !== document.body) {
                    if (p.innerText && p.innerText.includes(name) && p.innerText.includes('Topic-wise Qs')) {
                        results.push({ name, url: link.href });
                        break;
                    }
                    p = p.parentElement;
                }
            });
        });

        return results;
    })()`);

    console.log(JSON.stringify(mapping, null, 2));
    cdp.close();
}

getDirectChapterUrls().catch(console.error);
