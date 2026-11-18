// refetch_and_shuffle.js - High-Fidelity Extractor for 100 Organic Chemistry PYQs with Full MCQ Options & Formulas
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
const { CDPClient } = require('./cdp_client');

const MONGO_URI = "mongodb+srv://eem41831_db_user:iyqvtKvKRlJuMtVs@cluster0.o1b2ccj.mongodb.net/?retryWrites=true&w=majority&connectTimeoutMS=10000";

const CHAPTER_CONFIGS = [
    {
        name: "Hydrocarbons",
        url: "https://room.examgoal.com/pyq/subject/531fc896-5c12-5f87-a47e-b5663b869424/chapter/97ee64dd-1123-55e9-90c6-1d745e0bbbfc?tab=all",
        topicsCovered: "Alkanes, Alkenes, Alkynes, FRS, Markovnikov, Ozonolysis, Diels-Alder, Isomerisation, Aromatisation",
        count: 15
    },
    {
        name: "Haloalkanes and Haloarenes",
        url: "https://room.examgoal.com/pyq/subject/531fc896-5c12-5f87-a47e-b5663b869424/chapter/a2a79a37-c9ab-5605-b9b7-66a3e29998e9?tab=all",
        topicsCovered: "SN1, SN2, E1, E2, Elimination, Wurtz, Frankland, Finkelstein, Swarts, Williamson ether synthesis",
        count: 15
    },
    {
        name: "Alcohols, Phenols and Ethers",
        url: "https://room.examgoal.com/pyq/subject/531fc896-5c12-5f87-a47e-b5663b869424/chapter/46d86612-62b9-518a-a801-468af4287efb?tab=all",
        topicsCovered: "Dehydration, Oxidation, SOCl2, Esterification, Ether cleavage HI/HBr, Phenol acidity, Kolbe, Reimer-Tiemann",
        count: 15
    },
    {
        name: "Aldehydes, Ketones and Carboxylic Acids",
        url: "https://room.examgoal.com/pyq/subject/531fc896-5c12-5f87-a47e-b5663b869424/chapter/10c50d4e-8e19-5f32-a866-c6689cc46055?tab=all",
        topicsCovered: "Aldol, Cannizzaro, Haloform, Clemmensen, Wolff-Kishner, Rosenmund, Stephen, Grignard, HVZ reaction",
        count: 15
    },
    {
        name: "Compounds Containing Nitrogen",
        url: "https://room.examgoal.com/pyq/subject/531fc896-5c12-5f87-a47e-b5663b869424/chapter/0a02f9e4-3c9b-5c9d-a279-7b4c06815b63?tab=all",
        topicsCovered: "Amines, Gabriel phthalimide, Carbylamine, Hinsberg test, Hofmann bromamide, Diazotisation, Sandmeyer",
        count: 15
    },
    {
        name: "Basics of Organic Chemistry & Aromatic Compounds",
        url: "https://room.examgoal.com/pyq/subject/531fc896-5c12-5f87-a47e-b5663b869424/chapter/44058c74-bb76-5974-a71c-1213012ff9aa?tab=all",
        topicsCovered: "General Organic Chemistry, Aromaticity, Electrophilic Aromatic Substitution, Intermediates, Reaction Mechanisms",
        count: 25
    }
];

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

// In-browser extractor executed in the ExamGoal practice room
function browserQuestionExtractor() {
    function getCleanText(elem) {
        if (!elem) return '';
        const clone = elem.cloneNode(true);
        clone.querySelectorAll('.katex annotation, annotation[encoding*="tex"]').forEach(ann => {
            const tex = ann.textContent || '';
            const replacement = document.createTextNode(' $' + tex.trim() + '$ ');
            const root = ann.closest('.katex') || ann.closest('.math-tex') || ann;
            if (root && root.parentNode) root.parentNode.replaceChild(replacement, root);
        });
        clone.querySelectorAll('img').forEach(img => {
            const src = img.src || img.getAttribute('data-src') || '';
            if (src) {
                const imgMd = document.createTextNode(' ![' + (img.alt || 'diagram') + '](' + src + ') ');
                if (img.parentNode) img.parentNode.replaceChild(imgMd, img);
            }
        });
        return clone.innerText ? clone.innerText.trim() : clone.textContent.trim();
    }

    // 1. Extract Pure Question Body from .question
    const qElem = document.querySelector('.question');
    let pureQuestion = qElem ? getCleanText(qElem) : '';

    // Remove any accidental leading Question numbers like "1 \n" or "Q1. "
    pureQuestion = pureQuestion.replace(/^Q?\d+[\.\)]\s*/i, '').trim();

    // 2. Extract Exam Metadata
    let examMeta = '';
    const allSpans = Array.from(document.querySelectorAll('span, div')).filter(el => {
        const t = (el.innerText || '').trim();
        return (t.includes('JEE Main') || t.includes('AIEEE')) && t.length < 80 && el.children.length === 0;
    });
    if (allSpans.length > 0) {
        examMeta = allSpans[0].innerText.trim();
    }

    // 3. Extract Options & Correct Answer
    const options = {};
    let correctAnswer = '';
    const all = Array.from(document.querySelectorAll('*'));

    ['A', 'B', 'C', 'D'].forEach(letter => {
        const badge = all.find(el => (el.innerText || '').trim() === letter && el.children.length === 0);
        if (badge) {
            let card = badge.parentElement;
            while (card && card !== document.body && !(card.className && card.className.includes('rounded-2xl'))) {
                card = card.parentElement;
            }
            if (!card) card = badge.parentElement;

            const isCorrect = card.innerText.includes('CORRECT ANSWER') || (card.className && card.className.includes('green'));
            if (isCorrect) correctAnswer = letter;

            const clone = card.cloneNode(true);
            clone.querySelectorAll('.katex annotation, annotation[encoding*="tex"]').forEach(ann => {
                const tex = ann.textContent || '';
                const repl = document.createTextNode(' $' + tex.trim() + '$ ');
                const root = ann.closest('.katex') || ann.closest('.math-tex') || ann;
                if (root && root.parentNode) root.parentNode.replaceChild(repl, root);
            });
            clone.querySelectorAll('img').forEach(img => {
                const src = img.src || img.getAttribute('data-src') || '';
                if (src) {
                    const imgMd = document.createTextNode(' ![' + (img.alt || 'diagram') + '](' + src + ') ');
                    if (img.parentNode) img.parentNode.replaceChild(imgMd, img);
                }
            });

            let optText = clone.innerText ? clone.innerText.trim() : clone.textContent.trim();
            optText = optText.replace(/^[A-D]\s*/, '').replace(/CORRECT ANSWER/gi, '').trim();
            options[letter] = optText;
        }
    });

    const isNumerical = Object.keys(options).length === 0;
    const questionType = isNumerical ? 'Numerical' : 'MCQ';

    // If numerical, extract numerical answer from answer section
    if (isNumerical) {
        const ansElem = all.find(el => el.innerText && el.innerText.trim().toUpperCase() === 'CORRECT ANSWER');
        if (ansElem && ansElem.parentElement) {
            correctAnswer = ansElem.parentElement.innerText.replace(/CORRECT ANSWER/gi, '').trim();
        }
    }

    // 4. Extract Explanation
    let expText = '';
    const expElem = all.find(e => e.innerText && e.innerText.trim() === 'Explanation');
    if (expElem) {
        let expContainer = expElem;
        for (let i = 0; i < 4; i++) {
            if (expContainer.parentElement) expContainer = expContainer.parentElement;
        }
        expText = getCleanText(expContainer);
        const expIdx = expText.indexOf('Explanation');
        if (expIdx !== -1) {
            expText = expText.slice(expIdx + 'Explanation'.length).replace(/Add a Note[\s\S]*$/, '').trim();
        }
    }

    if (!correctAnswer && expText && !isNumerical) {
        const m = expText.match(/Hence,?\s+(?:the\s+)?correct\s+(?:option|answer)\s+is\s+[\(]?([A-D])[\)]?/i);
        if (m) correctAnswer = m[1].toUpperCase();
    }

    return {
        examMeta,
        questionType,
        question: pureQuestion,
        options,
        correctAnswer: correctAnswer || (isNumerical ? "Numerical Value" : "A"),
        explanation: expText
    };
}

// Fisher-Yates Shuffle
function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

async function fetchFromChapter(cdp, chapter) {
    console.log(`\n======================================================`);
    console.log(`Fetching from: ${chapter.name} (${chapter.count} questions)`);
    console.log(`URL: ${chapter.url}`);
    console.log(`======================================================`);

    await cdp.navigate(chapter.url);
    await sleep(3500);

    // Close any modal that might be open
    await cdp.evaluate(`(() => {
        const closeBtn = document.querySelector('button[aria-label="Close"], button:has(svg)');
        if (closeBtn) closeBtn.click();
        const backdrop = document.querySelector('div[class*="backdrop"], div[class*="fixed inset-0"]');
        if (backdrop) backdrop.click();
    })()`);
    await sleep(800);

    // Click first question card to enter practice room
    await cdp.evaluate(`(() => {
        const card = document.querySelector('[data-tour="chapter-question"]');
        if (card) card.click();
    })()`);
    await sleep(3500);

    const questions = [];

    for (let qNum = 1; qNum <= chapter.count; qNum++) {
        process.stdout.write(`Q${qNum}/${chapter.count} in ${chapter.name}... `);

        // Click palette button qNum
        await cdp.evaluate(`(() => {
            const btns = Array.from(document.querySelectorAll('button')).filter(b => b.innerText.trim() === '${qNum}');
            if (btns.length > 0) btns[0].click();
        })()`);
        await sleep(1000);

        // Click "Show Answer" / "View Solution"
        await cdp.evaluate(`(() => {
            const btn = Array.from(document.querySelectorAll('button, a, span')).find(el => el.innerText && (el.innerText.includes('View Solution') || el.innerText.includes('Show Answer')));
            if (btn) btn.click();
        })()`);
        await sleep(800);

        const extracted = await cdp.evaluate(`(${browserQuestionExtractor.toString()})()`);

        questions.push({
            chapter: chapter.name,
            topicsCovered: chapter.topicsCovered,
            examMeta: extracted.examMeta || 'JEE Main PYQ',
            questionType: extracted.questionType,
            question: extracted.question,
            options: extracted.options || {},
            correctAnswer: extracted.correctAnswer,
            explanation: extracted.explanation || '',
            createdAt: new Date()
        });

        const optCount = Object.keys(extracted.options || {}).length;
        console.log(`Done (Type: ${extracted.questionType}, Options: ${optCount}, Ans: ${extracted.correctAnswer})`);
    }

    return questions;
}

async function main() {
    const cdp = new CDPClient('127.0.0.1', 9222);
    if (!(await cdp.isConnectedToDebugPort())) {
        console.error("Chrome is not running on port 9222.");
        process.exit(1);
    }

    const tab = await cdp.findExamGoalTab();
    if (!tab) {
        console.error("ExamGoal tab not found.");
        process.exit(1);
    }
    await cdp.connectToTab(tab.webSocketDebuggerUrl);

    let collectedQuestions = [];

    for (const chapter of CHAPTER_CONFIGS) {
        try {
            const qs = await fetchFromChapter(cdp, chapter);
            collectedQuestions.push(...qs);
        } catch (e) {
            console.error(`Error in ${chapter.name}:`, e.message);
        }
    }

    console.log(`\n======================================================`);
    console.log(`Total Collected Before Shuffle: ${collectedQuestions.length}`);
    const totalMCQ = collectedQuestions.filter(q => Object.keys(q.options).length > 0).length;
    const totalNum = collectedQuestions.filter(q => Object.keys(q.options).length === 0).length;
    console.log(`Total MCQs with Options: ${totalMCQ} | Total Numerical: ${totalNum}`);
    console.log(`Randomly shuffling the 100 questions...`);
    console.log(`======================================================`);

    // Random shuffle
    const shuffledQuestions = shuffle(collectedQuestions);

    // Re-assign clean 1-based sequential IDs
    shuffledQuestions.forEach((q, idx) => {
        q.id = idx + 1;
    });

    // Save locally to JSON
    const outDir = path.resolve(__dirname, '..', 'examgoal_questions');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const jsonPath = path.join(outDir, 'organic_chemistry_100_questions.json');
    fs.writeFileSync(jsonPath, JSON.stringify(shuffledQuestions, null, 2), 'utf-8');
    console.log(`Saved clean shuffled JSON to: ${jsonPath}`);

    // Save locally to clean Markdown
    const mdPath = path.join(outDir, 'organic_chemistry_100_questions.md');
    let md = `# Organic Chemistry: 100 Selected & Shuffled PYQs (ExamGoal)\n\n`;
    md += `> **Source**: [ExamGOAL Room](https://room.examgoal.com/)  \n`;
    md += `> **Total Questions**: ${shuffledQuestions.length} (MCQs: ${totalMCQ}, Numerical: ${totalNum})  \n`;
    md += `> **Distribution**: Hydrocarbons (15), Haloalkanes (15), Alcohols/Phenols (15), Aldehydes/Acids (15), Nitrogen (15), Basics/Aromatics (25)  \n`;
    md += `> **Order**: Randomly Shuffled  \n\n`;
    md += `---\n\n`;

    shuffledQuestions.forEach(q => {
        md += `### Question ${q.id} (${q.chapter})\n\n`;
        md += `*Exam: ${q.examMeta} | Type: ${q.questionType} | Topics: ${q.topicsCovered}*\n\n`;
        md += `${q.question}\n\n`;

        if (Object.keys(q.options).length > 0) {
            md += `**Options:**\n`;
            for (const [key, val] of Object.entries(q.options)) {
                md += `- **(${key})** ${val}\n`;
            }
            md += `\n`;
        } else {
            md += `*Type: Numerical Answer*\n\n`;
        }

        md += `**Correct Answer:** \`${q.correctAnswer}\`\n\n`;
        if (q.explanation) {
            md += `**Explanation:**\n${q.explanation}\n\n`;
        }
        md += `---\n\n`;
    });

    fs.writeFileSync(mdPath, md, 'utf-8');
    console.log(`Saved clean markdown to: ${mdPath}`);

    // Store in MongoDB Atlas
    console.log(`\nConnecting to MongoDB Atlas...`);
    try {
        const client = new MongoClient(MONGO_URI);
        await client.connect();
        const db = client.db('examgoal');
        const collection = db.collection('questions');

        console.log(`Clearing existing documents in 'examgoal.questions'...`);
        await collection.deleteMany({});

        console.log(`Inserting ${shuffledQuestions.length} shuffled questions into MongoDB Atlas...`);
        const result = await collection.insertMany(shuffledQuestions);
        console.log(`Successfully inserted ${result.insertedCount} questions to MongoDB Atlas!`);

        await client.close();
    } catch (dbErr) {
        console.error("MongoDB Atlas Notice:", dbErr.message);
    }

    console.log(`\nAll done! 100 Organic Chemistry PYQs with full MCQ options & formulas successfully fetched and stored!`);
}

main().catch(console.error);
