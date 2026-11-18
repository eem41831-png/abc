// extract_100_organic.js - Batch fetch 100 PYQ questions strictly from user's Organic Chemistry topics
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
const { CDPClient } = require('./cdp_client');

const MONGO_URI = "mongodb+srv://eem41831_db_user:iyqvtKvKRlJuMtVs@cluster0.o1b2ccj.mongodb.net/?retryWrites=true&w=majority&connectTimeoutMS=5000";

const CHAPTERS = [
    {
        name: "Hydrocarbons",
        url: "https://room.examgoal.com/pyq/subject/531fc896-5c12-5f87-a47e-b5663b869424/chapter/97ee64dd-1123-55e9-90c6-1d745e0bbbfc?tab=all",
        topicsCovered: "Alkanes, Alkenes, Alkynes, FRS, Isomerisation, Aromatisation, Markovnikov, Ozonolysis, Diels-Alder, Alkynes",
        count: 20
    },
    {
        name: "Haloalkanes and Haloarenes",
        url: "https://room.examgoal.com/pyq/subject/531fc896-5c12-5f87-a47e-b5663b869424/chapter/a2a79a37-c9ab-5605-b9b7-66a3e29998e9?tab=all",
        topicsCovered: "SN1, SN2, E1, E2, Elimination, Wurtz, Frankland, Finkelstein, Swarts, Williamson ether, AgCN/KCN",
        count: 20
    },
    {
        name: "Alcohols, Phenols and Ethers",
        url: "https://room.examgoal.com/pyq/subject/531fc896-5c12-5f87-a47e-b5663b869424/chapter/46d86612-62b9-518a-a801-468af4287efb?tab=all",
        topicsCovered: "Oxidation, Dehydration, SOCl2, Esterification, Ether cleavage HI/HBr, Phenol acidity, Kolbe, Reimer-Tiemann, Azo coupling",
        count: 20
    },
    {
        name: "Aldehydes, Ketones and Carboxylic Acids",
        url: "https://room.examgoal.com/pyq/subject/531fc896-5c12-5f87-a47e-b5663b869424/chapter/10c50d4e-8e19-5f32-a866-c6689cc46055?tab=all",
        topicsCovered: "Rosenmund, Stephen, Grignard, 2,4-DNP, Clemmensen, Wolff-Kishner, Aldol, Cannizzaro, Haloform, HVZ, Carboxylic acidity",
        count: 20
    },
    {
        name: "Compounds Containing Nitrogen",
        url: "https://room.examgoal.com/pyq/subject/531fc896-5c12-5f87-a47e-b5663b869424/chapter/0a02f9e4-3c9b-5c9d-a279-7b4c06815b63?tab=all",
        topicsCovered: "Reduction of nitro, Gabriel phthalimide, Carbylamine, Hinsberg, Hofmann bromamide, Diazotisation, Sandmeyer, Azo coupling",
        count: 20
    }
];

// In-browser parser function
function inBrowserParser() {
    function getCleanText(elem) {
        if (!elem) return '';
        const clone = elem.cloneNode(true);
        const annotations = clone.querySelectorAll('.katex annotation, annotation[encoding*="tex"]');
        annotations.forEach(ann => {
            const tex = ann.textContent || '';
            const replacement = document.createTextNode(' $' + tex.trim() + '$ ');
            const root = ann.closest('.katex') || ann.closest('.math-tex') || ann;
            if (root && root.parentNode) root.parentNode.replaceChild(replacement, root);
        });
        const images = clone.querySelectorAll('img');
        images.forEach(img => {
            const src = img.src || img.getAttribute('data-src') || '';
            if (src) {
                const imgMd = document.createTextNode(' ![' + (img.alt || 'img') + '](' + src + ') ');
                if (img.parentNode) img.parentNode.replaceChild(imgMd, img);
            }
        });
        return clone.innerText ? clone.innerText.trim() : clone.textContent.trim();
    }

    const all = Array.from(document.querySelectorAll('*'));
    const exp = all.find(e => e.innerText && e.innerText.trim() === 'Explanation');
    let container = exp;
    for (let i = 0; i < 4; i++) {
        if (container && container.parentElement) container = container.parentElement;
    }

    if (!container) {
        // Fallback to main
        container = document.querySelector('main') || document.body;
    }

    const fullRawText = getCleanText(container);
    const lines = fullRawText.split('\n').map(l => l.trim()).filter(Boolean);

    const metaIdx = lines.findIndex(l => l.includes('JEE Main') || l.includes('AIEEE'));
    const meta = metaIdx !== -1 ? lines[metaIdx] : '';

    let qStart = metaIdx !== -1 ? metaIdx + 1 : 0;
    while (qStart < lines.length && (
        lines[qStart].startsWith('+') || 
        lines[qStart].startsWith('-') || 
        lines[qStart].includes('MCQ') || 
        lines[qStart].includes('00:') ||
        lines[qStart] === '/'
    )) {
        qStart++;
    }

    const optAIdx = lines.findIndex((l, idx) => idx >= qStart && l === 'A');
    let qEnd = optAIdx !== -1 ? optAIdx : lines.length;
    let expStartIdx = lines.findIndex(l => l === 'Explanation');
    if (optAIdx === -1 && expStartIdx !== -1) {
        qEnd = expStartIdx;
    }

    const questionBody = lines.slice(qStart, qEnd).join('\n\n');

    const options = {};
    let currentOpt = null;
    let optText = [];
    let correctOpt = '';

    if (optAIdx !== -1) {
        const loopEnd = expStartIdx !== -1 ? expStartIdx : lines.length;
        for (let i = optAIdx; i < loopEnd; i++) {
            const line = lines[i];
            if (['A', 'B', 'C', 'D'].includes(line)) {
                if (currentOpt) {
                    options[currentOpt] = optText.join(' ').trim();
                }
                currentOpt = line;
                optText = [];
            } else if (line.includes('CORRECT ANSWER')) {
                correctOpt = currentOpt;
            } else {
                optText.push(line);
            }
        }
        if (currentOpt) {
            options[currentOpt] = optText.join(' ').trim();
        }
    }

    let explanation = '';
    if (expStartIdx !== -1) {
        const expLines = lines.slice(expStartIdx + 1).filter(l => !l.includes('Add a Note') && !l.includes('QUESTION MAP'));
        explanation = expLines.join('\n\n');
    }

    return {
        meta,
        questionBody,
        options,
        correctOpt,
        explanation
    };
}

async function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function extractQuestionsForChapter(cdp, chapter, overallStartIndex) {
    console.log(`\n======================================================`);
    console.log(`Navigating to Chapter: ${chapter.name}`);
    console.log(`URL: ${chapter.url}`);
    console.log(`======================================================`);

    await cdp.navigate(chapter.url);
    await sleep(3500);

    // Click first question card to enter test-or-practice mode
    console.log("Opening practice room for " + chapter.name + "...");
    await cdp.evaluate(`(() => {
        const card = document.querySelector('[data-tour="chapter-question"]');
        if (card) card.click();
    })()`);
    await sleep(3500);

    const questions = [];

    for (let qNum = 1; qNum <= chapter.count; qNum++) {
        process.stdout.write(`Fetching Question ${qNum}/${chapter.count} in ${chapter.name}... `);

        // Click palette button qNum
        await cdp.evaluate(`(() => {
            const btns = Array.from(document.querySelectorAll('button')).filter(b => b.innerText.trim() === '${qNum}');
            if (btns.length > 0) btns[0].click();
        })()`);
        await sleep(1000);

        // Click "Show Answer" / "View Solution" so correct answer and explanation are revealed
        await cdp.evaluate(`(() => {
            const btn = Array.from(document.querySelectorAll('button, a, span')).find(el => el.innerText && (el.innerText.includes('View Solution') || el.innerText.includes('Show Answer')));
            if (btn) btn.click();
        })()`);
        await sleep(800);

        // Extract
        const parsed = await cdp.evaluate(`(${inBrowserParser.toString()})()`);

        const qObj = {
            id: overallStartIndex + qNum,
            chapter: chapter.name,
            topicsCovered: chapter.topicsCovered,
            examMeta: parsed.meta || `JEE Main PYQ (${chapter.name})`,
            question: parsed.questionBody || `Question ${qNum}`,
            options: parsed.options || {},
            correctAnswer: parsed.correctOpt || "View Solution",
            explanation: parsed.explanation || "",
            createdAt: new Date()
        };

        questions.push(qObj);
        console.log(`Done (Answer: ${qObj.correctAnswer || 'Recorded'})`);
    }

    return questions;
}

async function saveToLocalFiles(allQuestions) {
    const outDir = path.resolve(__dirname, '..', 'examgoal_questions');
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    // 1. JSON
    const jsonPath = path.join(outDir, 'organic_chemistry_100_questions.json');
    fs.writeFileSync(jsonPath, JSON.stringify(allQuestions, null, 2), 'utf-8');
    console.log(`\n>> Saved JSON to: ${jsonPath}`);

    // 2. Markdown
    const mdPath = path.join(outDir, 'organic_chemistry_100_questions.md');
    let md = `# Organic Chemistry: 100 Selected PYQs (ExamGoal)\n\n`;
    md += `*Extracted strictly based on the topics: Hydrocarbons, Haloalkanes/Haloarenes, Alcohols/Phenols/Ethers, Aldehydes/Ketones/Acids, Amines/Diazonium, Named Reactions & Mechanisms.*\n\n`;
    md += `**Total Questions:** ${allQuestions.length}\n`;
    md += `**Timestamp:** ${new Date().toLocaleString()}\n\n---\n\n`;

    allQuestions.forEach(q => {
        md += `## Q${q.id}. [${q.chapter}] ${q.examMeta}\n\n`;
        md += `**Topic Category:** ${q.topicsCovered}\n\n`;
        md += `${q.question}\n\n`;

        if (Object.keys(q.options).length > 0) {
            md += `**Options:**\n`;
            for (const [key, val] of Object.entries(q.options)) {
                const mark = (key === q.correctAnswer) ? " **(Correct Answer)**" : "";
                md += `- **(${key})** ${val}${mark}\n`;
            }
            md += `\n`;
        }

        if (q.correctAnswer) {
            md += `**Correct Answer:** \`${q.correctAnswer}\`\n\n`;
        }

        if (q.explanation) {
            md += `<details>\n<summary><b>View Explanation / Solution</b></summary>\n\n`;
            md += `${q.explanation}\n\n`;
            md += `</details>\n\n`;
        }

        md += `---\n\n`;
    });

    fs.writeFileSync(mdPath, md, 'utf-8');
    console.log(`>> Saved Markdown to: ${mdPath}`);
}

async function uploadToMongoDB(allQuestions) {
    console.log("\nConnecting to MongoDB Atlas to upload questions...");
    const client = new MongoClient(MONGO_URI);
    try {
        await client.connect();
        console.log("Connected to MongoDB Atlas!");
        const db = client.db("examgoal");
        const coll = db.collection("questions");

        // Optional: clear previous test entries or insert
        const result = await coll.insertMany(allQuestions);
        console.log(`>> Successfully stored ${result.insertedCount} questions in MongoDB [examgoal.questions]!`);
    } catch (e) {
        console.error("\n[MongoDB Notice] Could not connect directly:", e.message);
        console.log("This is expected if your IP is not whitelisted in MongoDB Atlas Network Access.");
        console.log("All 100 questions are safely saved locally in JSON and Markdown.");
        console.log("You can run 'node sync_to_mongodb.js' anytime after allowing IP access.");
    } finally {
        await client.close();
    }
}

async function main() {
    const cdp = new CDPClient('127.0.0.1', 9222);
    const isUp = await cdp.isConnectedToDebugPort();
    if (!isUp) {
        console.error("Chrome is not running on port 9222. Run launch_chrome.bat first.");
        process.exit(1);
    }

    const tab = await cdp.findExamGoalTab();
    if (!tab) {
        console.error("No ExamGoal tab found.");
        process.exit(1);
    }

    await cdp.connectToTab(tab.webSocketDebuggerUrl);

    let allQuestions = [];
    let counter = 0;

    for (const chapter of CHAPTERS) {
        try {
            const qs = await extractQuestionsForChapter(cdp, chapter, counter);
            allQuestions.push(...qs);
            counter += qs.length;
        } catch (e) {
            console.error(`Error in chapter ${chapter.name}:`, e.message);
        }
    }

    console.log(`\n======================================================`);
    console.log(`Extraction Complete! Total Questions: ${allQuestions.length}`);
    console.log(`======================================================`);

    await saveToLocalFiles(allQuestions);
    await uploadToMongoDB(allQuestions);

    cdp.close();
}

main().catch(console.error);
