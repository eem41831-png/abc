// extractor.js - Browser-side DOM extraction script evaluated in ExamGoal tabs
const extractionScript = `(() => {
    // 1. Try to find any structured test / question data in window / state
    const structuredData = [];
    
    // Look into local/session storage for cached question lists
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.toLowerCase().includes('question') || key.toLowerCase().includes('test') || key.toLowerCase().includes('exam'))) {
                const val = localStorage.getItem(key);
                if (val && val.startsWith('{') || val.startsWith('[')) {
                    // Could contain parsed question lists
                }
            }
        }
    } catch(e) {}

    // 2. Helper to clean math and text from elements
    function getCleanContent(elem) {
        if (!elem) return '';
        // If KaTeX math is present, extract LaTeX from annotation tag
        const clone = elem.cloneNode(true);
        const katexAnnotations = clone.querySelectorAll('.katex annotation, annotation[encoding*="tex"]');
        katexAnnotations.forEach(ann => {
            const tex = ann.textContent || '';
            const replacement = document.createTextNode(' $' + tex.trim() + '$ ');
            const katexRoot = ann.closest('.katex') || ann.closest('.math-tex') || ann;
            if (katexRoot && katexRoot.parentNode) {
                katexRoot.parentNode.replaceChild(replacement, katexRoot);
            }
        });

        // Convert img tags to markdown image format
        const images = clone.querySelectorAll('img');
        images.forEach(img => {
            const src = img.src || img.getAttribute('data-src') || '';
            const alt = img.alt || 'diagram';
            if (src) {
                const imgMd = document.createTextNode(' ![' + alt + '](' + src + ') ');
                if (img.parentNode) {
                    img.parentNode.replaceChild(imgMd, img);
                }
            }
        });

        return clone.innerText ? clone.innerText.trim() : clone.textContent.trim();
    }

    // 3. Detect page mode: Multi-question list vs Single Question Room
    const questions = [];

    // Pattern A: Multi-question cards/list (e.g. PYQ list, Chapter practice list)
    const questionCards = document.querySelectorAll(
        '.question-card, .question-container, .q-card, [class*="question-item"], [class*="QuestionCard"], .card, article'
    );

    let foundCards = false;
    if (questionCards.length > 0) {
        questionCards.forEach((card, index) => {
            // Check if card looks like a real question
            const text = card.innerText || '';
            if (text.length < 15) return;

            const qTextElem = card.querySelector('[class*="question-text"], [class*="q-text"], [class*="questionBody"], .question, p') || card;
            const optionElems = card.querySelectorAll('[class*="option"], [class*="choice"], li, [class*="answer"]');
            
            const options = [];
            optionElems.forEach(opt => {
                const optText = getCleanContent(opt);
                if (optText && optText.length < 500) {
                    options.push(optText);
                }
            });

            const solutionElem = card.querySelector('[class*="solution"], [class*="explanation"], [class*="answer-key"]');
            const solution = solutionElem ? getCleanContent(solutionElem) : '';

            // Exam metadata if present (e.g., JEE Main 2024)
            const metaElem = card.querySelector('[class*="meta"], [class*="badge"], [class*="exam-info"], [class*="tag"]');
            const meta = metaElem ? metaElem.innerText.trim() : '';

            if (options.length > 0 || text.includes('?') || card.querySelector('img')) {
                foundCards = true;
                questions.push({
                    index: index + 1,
                    meta: meta,
                    question: getCleanContent(qTextElem),
                    options: options,
                    solution: solution
                });
            }
        });
    }

    // Pattern B: Active Single Question Test Room (room.examgoal.com)
    if (!foundCards || questions.length === 0) {
        const mainArea = document.querySelector(
            '[class*="test-screen"], [class*="question-view"], [class*="exam-container"], main, #root, #app'
        ) || document.body;

        const qNumberElem = document.querySelector('[class*="question-number"], [class*="q-num"], h2, h3, h4');
        const qNumber = qNumberElem ? qNumberElem.innerText.trim() : 'Active Question';

        const qBodyElem = document.querySelector(
            '[class*="question-body"], [class*="question-text"], [class*="question_content"], [class*="q-body"], .question-area'
        );

        const optionElems = document.querySelectorAll(
            '[class*="option-item"], [class*="option-container"], [class*="choice-item"], [class*="options"] > div, label.option'
        );

        const options = [];
        optionElems.forEach((opt, i) => {
            options.push(getCleanContent(opt));
        });

        // Solution if revealed
        const solElem = document.querySelector('[class*="solution"], [class*="explanation"]');
        const solution = solElem ? getCleanContent(solElem) : '';

        // Palette buttons (total question count available in test)
        const paletteBtns = document.querySelectorAll(
            '[class*="palette"] button, [class*="question-palette"] .btn, [class*="palette-item"]'
        );

        questions.push({
            index: 1,
            qNumber: qNumber,
            totalQuestionsInPalette: paletteBtns.length,
            question: qBodyElem ? getCleanContent(qBodyElem) : getCleanContent(mainArea).slice(0, 1000),
            options: options,
            solution: solution,
            url: window.location.href,
            pageTitle: document.title
        });
    }

    return {
        url: window.location.href,
        title: document.title,
        extractedCount: questions.length,
        questions: questions
    };
})()`;

module.exports = { extractionScript };
