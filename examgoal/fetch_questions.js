// fetch_questions.js - CLI & automation script to fetch questions from ExamGoal via Chrome CDP
const fs = require('fs');
const path = require('path');
const { CDPClient } = require('./cdp_client');
const { extractionScript } = require('./extractor');

async function main() {
    const args = process.argv.slice(2);
    let topic = 'ExamGoal_Questions';
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--topic' || args[i] === '-t') {
            topic = args[i + 1] || topic;
        }
    }

    const cdp = new CDPClient('127.0.0.1', 9222);

    console.log("Checking connection to Chrome on port 9222...");
    const isAvailable = await cdp.isConnectedToDebugPort();
    if (!isAvailable) {
        console.error("\n[ERROR] Chrome is not running with remote debugging on port 9222.");
        console.error("Please run 'launch_chrome.bat' in 'e:\\DSA\\abc\\examgoal' first.");
        console.error("Then open ExamGoal in that Chrome window and run this script again.\n");
        process.exit(1);
    }

    console.log("Connecting to Chrome DevTools...");
    const tab = await cdp.findExamGoalTab();
    if (!tab) {
        console.error("\n[ERROR] No active ExamGoal or browser tab found in Chrome.");
        process.exit(1);
    }

    console.log(`Connected to tab: "${tab.title}" (${tab.url})`);
    await cdp.connectToTab(tab.webSocketDebuggerUrl);

    console.log("Extracting questions from page...");
    const data = await cdp.evaluate(extractionScript);

    if (!data || !data.questions || data.questions.length === 0) {
        console.log("No questions detected on the current page.");
        cdp.close();
        return;
    }

    console.log(`Found ${data.questions.length} question(s). Formatting to Markdown...`);

    const safeTopicName = topic.replace(/[^a-zA-Z0-9_\-]/g, '_');
    const outputDir = path.resolve(__dirname, '..', 'examgoal_questions');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputFile = path.join(outputDir, `${safeTopicName}.md`);

    let md = `# ExamGoal Questions: ${topic}\n\n`;
    md += `- **Source URL**: [${data.title}](${data.url})\n`;
    md += `- **Extracted At**: ${new Date().toLocaleString()}\n`;
    md += `- **Total Questions**: ${data.questions.length}\n\n`;
    md += `---\n\n`;

    data.questions.forEach((q, idx) => {
        md += `### Question ${q.index || idx + 1}`;
        if (q.meta) md += ` *(${q.meta})*`;
        md += `\n\n`;

        md += `${q.question}\n\n`;

        if (q.options && q.options.length > 0) {
            md += `**Options:**\n`;
            q.options.forEach((opt, optIdx) => {
                const label = String.fromCharCode(65 + optIdx);
                md += `- **(${label})** ${opt}\n`;
            });
            md += `\n`;
        }

        if (q.solution) {
            md += `<details>\n<summary><b>View Solution</b></summary>\n\n`;
            md += `${q.solution}\n\n`;
            md += `</details>\n\n`;
        }

        md += `---\n\n`;
    });

    fs.writeFileSync(outputFile, md, 'utf-8');
    console.log(`\nSuccessfully saved ${data.questions.length} questions to:`);
    console.log(`>> ${outputFile}\n`);

    cdp.close();
}

if (require.main === module) {
    main().catch(err => {
        console.error("Error during extraction:", err);
        process.exit(1);
    });
}

module.exports = { main };
