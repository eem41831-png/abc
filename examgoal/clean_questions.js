// clean_questions.js - Clean and structure the 100 organic chemistry questions
const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '..', 'examgoal_questions', 'organic_chemistry_100_questions.json');
const rawQuestions = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

const cleaned = rawQuestions.map(item => {
    let raw = (item.question || '') + '\n' + (item.examMeta || '');
    // If examMeta was long or contained question parts
    let full = item.examMeta.length > item.question.length ? item.examMeta : item.question;
    if (item.question.length > 50 && item.examMeta.length > 50 && !item.question.includes(item.examMeta)) {
        full = item.examMeta + '\n' + item.question;
    }

    // 1. Extract Exam Meta
    const metaMatch = full.match(/(JEE Main \d{4}[^\n+]+|AIEEE \d{4}[^\n+]+)/i);
    let meta = metaMatch ? metaMatch[0].trim() : item.examMeta;
    // Clean meta
    meta = meta.replace(/\b(MCQ Single Answer|\d{2}:\d{2}|\+\d+\/-\d+)\b/g, '').trim();

    // 2. Extract Explanation
    let explanation = '';
    const expMatch = full.match(/Explanation([\s\S]*?)(?=Add a Note|QUESTION MAP|$)/i);
    if (expMatch) {
        explanation = expMatch[1].trim();
    }

    // 3. Extract Correct Answer
    let correct = '';
    const ansMatch1 = full.match(/Hence,?\s+(?:the\s+)?correct\s+(?:option|answer)\s+is\s+[\(]?([A-D])[\)]?/i);
    const ansMatch2 = full.match(/Correct answer\s*([A-D])/i);
    const ansMatch3 = full.match(/([A-D])\s*Correct answer/i);
    if (ansMatch1) correct = ansMatch1[1].toUpperCase();
    else if (ansMatch2) correct = ansMatch2[1].toUpperCase();
    else if (ansMatch3) correct = ansMatch3[1].toUpperCase();

    // 4. Extract Question Text
    let qText = full;
    // Remove meta
    if (metaMatch) {
        qText = qText.slice(qText.indexOf(metaMatch[0]) + metaMatch[0].length);
    }
    // Remove "+4/-1", timers, "MCQ Single Answer"
    qText = qText.replace(/MCQ Single Answer/g, '')
                 .replace(/\d{2}:\d{2}/g, '')
                 .replace(/\+\d+\s*\/\s*-\d+/g, '')
                 .trim();

    // If options exist (A, B, C, D)
    const options = {};
    const optMatch = qText.match(/(?:^|\n)(A\s+[\s\S]*?)(?:Explanation|Add a Note|$)/);
    let optionsText = optMatch ? optMatch[1] : '';

    if (optionsText) {
        // Cut question before option A
        qText = qText.slice(0, qText.indexOf(optionsText)).trim();

        // Split options
        const aPart = optionsText.match(/A\s+([\s\S]*?)(?=(?:\n|^)B\s+)/);
        const bPart = optionsText.match(/B\s+([\s\S]*?)(?=(?:\n|^)C\s+)/);
        const cPart = optionsText.match(/C\s+([\s\S]*?)(?=(?:\n|^)D\s+)/);
        const dPart = optionsText.match(/D\s+([\s\S]*?)(?=(?:Explanation|Add a Note|$))/);

        if (aPart) options['A'] = aPart[1].replace(/Correct answer/gi, '').trim();
        if (bPart) options['B'] = bPart[1].replace(/Correct answer/gi, '').trim();
        if (cPart) options['C'] = cPart[1].replace(/Correct answer/gi, '').trim();
        if (dPart) options['D'] = dPart[1].replace(/Correct answer/gi, '').trim();
    } else {
        // Cut question before Explanation if any
        if (expMatch) {
            qText = qText.slice(0, qText.indexOf('Explanation')).trim();
        }
    }

    // Clean question text from trailing "Practice this question" or "Add a Note"
    qText = qText.replace(/Practice this question/g, '')
                 .replace(/Add a Note/g, '')
                 .trim();

    return {
        id: item.id,
        chapter: item.chapter,
        topicsCovered: item.topicsCovered,
        examMeta: meta,
        question: qText || item.question,
        options: options,
        correctAnswer: correct || (item.correctAnswer !== 'View Solution' ? item.correctAnswer : 'See Solution'),
        explanation: explanation || item.explanation,
        createdAt: item.createdAt
    };
});

// Save updated JSON
fs.writeFileSync(filePath, JSON.stringify(cleaned, null, 2), 'utf-8');
console.log(`Updated JSON with ${cleaned.length} structured questions.`);

// Re-generate beautiful Markdown
const mdPath = path.resolve(__dirname, '..', 'examgoal_questions', 'organic_chemistry_100_questions.md');
let md = `# Organic Chemistry: 100 Selected PYQs (ExamGoal)\n\n`;
md += `> **Source**: [ExamGOAL Room](https://room.examgoal.com/)  \n`;
md += `> **Total Questions**: ${cleaned.length}  \n`;
md += `> **Topics**: Hydrocarbons, Haloalkanes & Haloarenes, Alcohols/Phenols/Ethers, Aldehydes/Ketones/Carboxylic Acids, Amines & Diazonium Salts, Named Reactions, Reaction Mechanisms  \n\n`;
md += `---\n\n`;

cleaned.forEach(q => {
    md += `### Q${q.id}. [${q.chapter}] ${q.examMeta}\n\n`;
    md += `*Topic tags: ${q.topicsCovered}*\n\n`;
    md += `${q.question}\n\n`;

    if (Object.keys(q.options).length > 0) {
        md += `**Options:**\n`;
        for (const [key, val] of Object.entries(q.options)) {
            const mark = (key === q.correctAnswer) ? " **(Correct Answer)**" : "";
            md += `- **(${key})** ${val}${mark}\n`;
        }
        md += `\n`;
    }

    if (q.correctAnswer && q.correctAnswer !== 'See Solution') {
        md += `**Correct Option:** \`${q.correctAnswer}\`\n\n`;
    }

    if (q.explanation) {
        md += `<details>\n<summary><b>View Explanation / Solution</b></summary>\n\n`;
        md += `${q.explanation}\n\n`;
        md += `</details>\n\n`;
    }

    md += `---\n\n`;
});

fs.writeFileSync(mdPath, md, 'utf-8');
console.log(`Updated Markdown saved to: ${mdPath}`);
