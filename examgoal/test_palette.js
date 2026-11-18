const { CDPClient } = require('./cdp_client');

async function testPaletteClick() {
    const cdp = new CDPClient();
    const tab = await cdp.findExamGoalTab();
    await cdp.connectToTab(tab.webSocketDebuggerUrl);

    console.log("Checking palette buttons...");
    const palette = await cdp.evaluate(`(() => {
        // Find palette buttons
        const btns = Array.from(document.querySelectorAll('button')).filter(b => {
            const t = b.innerText.trim();
            return !isNaN(t) && parseInt(t) >= 1 && parseInt(t) <= 191;
        });
        return {
            count: btns.length,
            sample: btns.slice(0, 10).map(b => b.innerText.trim())
        };
    })()`);

    console.log("Palette found:", palette);

    // Click palette button 2!
    console.log("Clicking palette button 2...");
    await cdp.evaluate(`(() => {
        const btns = Array.from(document.querySelectorAll('button')).filter(b => b.innerText.trim() === '2');
        if (btns.length > 0) btns[0].click();
    })()`);

    await new Promise(r => setTimeout(r, 1500));

    // Show answer for question 2
    await cdp.evaluate(`(() => {
        const btn = Array.from(document.querySelectorAll('button, a, span')).find(el => el.innerText && (el.innerText.includes('View Solution') || el.innerText.includes('Show Answer')));
        if (btn) btn.click();
    })()`);

    await new Promise(r => setTimeout(r, 1000));

    const q2Data = await cdp.evaluate(`(() => {
        return {
            text: document.body.innerText.slice(0, 1500)
        };
    })()`);

    console.log("Question 2 loaded:", q2Data.text.slice(0, 800));
    cdp.close();
}

testPaletteClick().catch(console.error);
