// app.js - Hardened Proctoring Engine & Anti-Circle-to-Search Client
let jwtToken = localStorage.getItem('examgoal_jwt') || null;
let candidate = JSON.parse(localStorage.getItem('examgoal_candidate') || 'null');
let currentAccessCode = localStorage.getItem('examgoal_passcode') || '';
let testSessionId = null;
let questions = [];
let currentIndex = 0;
let answers = {}; // testQId -> selectedOption (A,B,C,D) or numerical string
let reviewSet = new Set();
let remainingSeconds = 180 * 60; // 3 Hours (10,800 seconds)
let timerInterval = null;
let tabSwitches = 0;
let screenSearchAttempts = 0;
let testSubmitted = false;
let blurDebounceTimer = null;

// DOM Elements
const authView = document.getElementById('authView');
const testView = document.getElementById('testView');
const completionView = document.getElementById('completionView');
const candidateForm = document.getElementById('candidateForm');
const accessCodeInput = document.getElementById('accessCode');
const codeError = document.getElementById('codeError');
const timerDisplay = document.getElementById('timerDisplay');
const hudCandidate = document.getElementById('hudCandidate');
const qBadgeNum = document.getElementById('qBadgeNum');
const qBadgeChapter = document.getElementById('qBadgeChapter');
const qBadgeMeta = document.getElementById('qBadgeMeta');
const questionContent = document.getElementById('questionContent');
const optionsContainer = document.getElementById('optionsContainer');
const paletteGrid = document.getElementById('paletteGrid');
const paletteCountAnswered = document.getElementById('paletteCountAnswered');
const paletteDrawer = document.getElementById('paletteDrawer');
const togglePaletteBtn = document.getElementById('togglePaletteBtn');
const closePaletteBtn = document.getElementById('closePaletteBtn');
const violationModal = document.getElementById('violationModal');
const violationText = document.getElementById('violationText');
const violationCountEl = document.getElementById('violationCount');
const resumeTestBtn = document.getElementById('resumeTestBtn');
const confirmSubmitModal = document.getElementById('confirmSubmitModal');
const modalAnsweredCount = document.getElementById('modalAnsweredCount');
const imageLightboxModal = document.getElementById('imageLightboxModal');
const lightboxImg = document.getElementById('lightboxImg');

// -------------------------------------------------------------
// 1. HARDENED PROCTORING & CIRCLE-TO-SEARCH SHIELD SENSORS
// -------------------------------------------------------------
function initProctoringSensors() {
    // 1. Block Context Menu & Text Selection
    document.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('copy', e => e.preventDefault());
    document.addEventListener('cut', e => e.preventDefault());
    document.addEventListener('dragstart', e => e.preventDefault());
    document.addEventListener('selectstart', e => e.preventDefault());

    // 2. Block Keyboard Shortcuts & Screen Captures
    window.addEventListener('keydown', e => {
        const key = e.key.toLowerCase();
        if (
            (e.ctrlKey && ['c', 'v', 'u', 's', 'p', 'a'].includes(key)) ||
            (e.ctrlKey && e.shiftKey && ['i', 'j', 'c'].includes(key)) ||
            e.key === 'F12' ||
            e.key === 'PrintScreen'
        ) {
            e.preventDefault();
            triggerViolation("Prohibited keystroke or screenshot attempt detected", true);
        }
    });

    // 3. ANTI-CIRCLE-TO-SEARCH SENSORS:
    // When Circle to Search / Google Lens is invoked, the mobile OS triggers visibility loss
    // and blur. We immediately apply .screen-shielded to blank and blur out all content,
    // ensuring the OS overlay screenshot captures pure pitch black.
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && !testSubmitted && questions.length > 0) {
            document.body.classList.add('screen-shielded');
            triggerViolation("Tab or application switched out of view", false);
        }
    });

    window.addEventListener('blur', () => {
        if (!testSubmitted && questions.length > 0) {
            clearTimeout(blurDebounceTimer);
            blurDebounceTimer = setTimeout(() => {
                if (!document.hasFocus()) {
                    document.body.classList.add('screen-shielded');
                    triggerViolation("Window focus lost. Circle-to-Search / Assistant overlay detected", true);
                }
            }, 150);
        }
    });
}

function triggerViolation(reason, isCircleToSearch = false) {
    if (testSubmitted || questions.length === 0) return;

    if (isCircleToSearch) {
        screenSearchAttempts++;
    } else {
        tabSwitches++;
    }

    const totalViolations = tabSwitches + screenSearchAttempts;
    violationCountEl.textContent = totalViolations;
    violationText.textContent = `${reason}. Screen blinding activated. Violation logged for evaluator.`;
    violationModal.classList.remove('hidden');

    if (totalViolations >= 3) {
        violationText.textContent = "Maximum security strikes (3/3) reached. Examination is being automatically sealed and submitted.";
        setTimeout(() => {
            submitTest(true);
        }, 1200);
    }
}

resumeTestBtn.addEventListener('click', () => {
    document.body.classList.remove('screen-shielded');
    violationModal.classList.add('hidden');

    // Attempt Fullscreen
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
    }
});

// Image Lightbox zoom listener for mobile
document.addEventListener('click', (e) => {
    if (e.target && e.target.classList.contains('zoomable-chem-img')) {
        lightboxImg.src = e.target.src;
        imageLightboxModal.classList.remove('hidden');
    }
});
if (imageLightboxModal) {
    imageLightboxModal.addEventListener('click', () => {
        imageLightboxModal.classList.add('hidden');
    });
}

// -------------------------------------------------------------
// 2. CANDIDATE AUTH & OWNER PASSCODE CHECK
// -------------------------------------------------------------
candidateForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    codeError.classList.add('hidden');

    const name = document.getElementById('candidateName').value.trim();
    const email = document.getElementById('candidateEmail').value.trim();
    const rollNo = document.getElementById('candidateRoll').value.trim();
    const accessCode = accessCodeInput.value.trim().toUpperCase();

    if (!accessCode) {
        codeError.textContent = "Please enter the Exam Access Code provided by the owner.";
        codeError.classList.remove('hidden');
        return;
    }

    try {
        // Authenticate Candidate (JWT)
        const authRes = await fetch('/api/auth/candidate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, rollNo })
        });
        const authData = await authRes.json();
        if (!authRes.ok) throw new Error(authData.error || "Authentication failed");

        jwtToken = authData.token;
        candidate = authData.candidate;
        currentAccessCode = accessCode;

        localStorage.setItem('examgoal_jwt', jwtToken);
        localStorage.setItem('examgoal_candidate', JSON.stringify(candidate));
        localStorage.setItem('examgoal_passcode', currentAccessCode);

        // Attempt mobile fullscreen
        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(() => {});
        }

        // Launch Test with Access Code
        await startTestSession(accessCode);
    } catch (err) {
        codeError.textContent = err.message;
        codeError.classList.remove('hidden');
    }
});

async function startTestSession(accessCode) {
    try {
        const res = await fetch('/api/test/start', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${jwtToken}`
            },
            body: JSON.stringify({ accessCode })
        });

        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.error || "Could not launch examination.");
        }

        testSessionId = data.testSessionId;
        questions = data.questions;
        remainingSeconds = (data.durationMinutes || 180) * 60;
        answers = {};
        reviewSet = new Set();
        currentIndex = 0;
        tabSwitches = 0;
        screenSearchAttempts = 0;
        testSubmitted = false;

        // View Transition
        authView.classList.add('hidden');
        completionView.classList.add('hidden');
        testView.classList.remove('hidden');
        document.body.classList.remove('screen-shielded');

        hudCandidate.textContent = candidate.name.split(' ')[0];
        initPalette(questions.length);
        renderQuestion(currentIndex);
        startTimer();
    } catch (err) {
        codeError.textContent = err.message;
        codeError.classList.remove('hidden');
        throw err;
    }
}

// -------------------------------------------------------------
// 3. 3-HOUR COUNTDOWN TIMER (180 MINUTES)
// -------------------------------------------------------------
function startTimer() {
    clearInterval(timerInterval);
    updateTimerDisplay();

    timerInterval = setInterval(() => {
        remainingSeconds--;
        updateTimerDisplay();

        if (remainingSeconds <= 0) {
            clearInterval(timerInterval);
            alert("Examination time has elapsed (3 Hours). Submitting your responses now.");
            submitTest(true);
        }
    }, 1000);
}

function updateTimerDisplay() {
    const hrs = Math.floor(remainingSeconds / 3600);
    const mins = Math.floor((remainingSeconds % 3600) / 60);
    const secs = remainingSeconds % 60;

    const formatted = `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    timerDisplay.textContent = formatted;

    if (remainingSeconds < 600) {
        timerDisplay.className = "timer-text font-mono timer-danger";
    } else if (remainingSeconds < 1800) {
        timerDisplay.className = "timer-text font-mono timer-warning";
    } else {
        timerDisplay.className = "timer-text font-mono";
    }
}

// -------------------------------------------------------------
// 4. QUESTION RENDERING & ROBUST FORMULA / DIAGRAM FORMATTER
// -------------------------------------------------------------
function renderQuestion(index) {
    if (!questions[index]) return;
    const q = questions[index];
    const testQId = q.testQId;

    qBadgeNum.textContent = `Q ${testQId} / ${questions.length}`;
    qBadgeChapter.textContent = q.chapter || 'Organic Chemistry';
    qBadgeMeta.textContent = q.examMeta || 'JEE Main PYQ';

    // Render Question Text with High-Contrast Chemical Diagrams
    questionContent.innerHTML = formatContent(q.question);

    // Render Options
    optionsContainer.innerHTML = '';
    const opts = q.options || {};
    const optKeys = Object.keys(opts);

    if (optKeys.length > 0) {
        // MCQ Options
        optKeys.sort().forEach(key => {
            const optVal = opts[key];
            const isSelected = answers[testQId] === key;

            const row = document.createElement('div');
            row.className = `option-row ${isSelected ? 'selected' : ''}`;
            row.innerHTML = `
                <div class="option-radio font-mono">${key}</div>
                <div class="option-body">${formatContent(optVal)}</div>
            `;

            row.addEventListener('click', () => {
                answers[testQId] = key;
                renderQuestion(currentIndex);
                updatePaletteButton(testQId);
            });

            optionsContainer.appendChild(row);
        });
    } else {
        // Numerical Answer Input
        const numPanel = document.createElement('div');
        numPanel.className = "numerical-panel";
        numPanel.innerHTML = `
            <label class="form-label">Numerical Answer Input</label>
            <input type="text" id="numValInput" value="${answers[testQId] || ''}" placeholder="Enter numerical response..." class="form-input font-mono" style="max-width: 320px;" autocomplete="off">
        `;

        const numInput = numPanel.querySelector('#numValInput');
        numInput.addEventListener('input', (e) => {
            answers[testQId] = e.target.value.trim();
            updatePaletteButton(testQId);
        });

        optionsContainer.appendChild(numPanel);
    }

    // Auto-render KaTeX formulas (with mhchem support)
    if (window.renderMathInElement) {
        try {
            renderMathInElement(questionContent, {
                delimiters: [
                    { left: "$$", right: "$$", display: true },
                    { left: "$", right: "$", display: false },
                    { left: "\\(", right: "\\)", display: false },
                    { left: "\\[", right: "\\]", display: true }
                ],
                throwOnError: false
            });
            renderMathInElement(optionsContainer, {
                delimiters: [
                    { left: "$$", right: "$$", display: true },
                    { left: "$", right: "$", display: false },
                    { left: "\\(", right: "\\)", display: false },
                    { left: "\\[", right: "\\]", display: true }
                ],
                throwOnError: false
            });
        } catch (_) {}
    }

    // Highlight Current Palette Button
    highlightActivePalette(testQId);

    // Update Review Button State
    const reviewBtn = document.getElementById('reviewBtn');
    if (reviewSet.has(testQId)) {
        reviewBtn.textContent = "Unmark Review";
        reviewBtn.classList.add('active-marked');
    } else {
        reviewBtn.textContent = "Mark for Review";
        reviewBtn.classList.remove('active-marked');
    }
}

// Convert markdown images `![alt](url)` to high-contrast white-background framed cards with mobile zoom
function formatContent(text) {
    if (!text) return '';

    // Replace image markdown with crisp, framed, white-background diagram card
    let html = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, url) => {
        const cleanUrl = url.replace('@width', '800');
        return `
            <div class="chem-diagram-card">
                <img src="${cleanUrl}" alt="${alt || 'Chemical Diagram'}" class="zoomable-chem-img" loading="eager" onerror="this.onerror=null; this.src='${cleanUrl.replace('/800/', '/600/')}';">
                <span class="img-zoom-hint font-mono">Tap to zoom</span>
            </div>
        `;
    });

    // Replace double newlines with breaks
    html = html.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');
    return html;
}

// -------------------------------------------------------------
// 5. QUESTION PALETTE SYSTEM (75 QUESTIONS)
// -------------------------------------------------------------
function initPalette(total) {
    paletteGrid.innerHTML = '';
    for (let i = 1; i <= total; i++) {
        const item = document.createElement('button');
        item.id = `palette-btn-${i}`;
        item.className = 'palette-item font-mono';
        item.textContent = i;
        item.addEventListener('click', () => {
            currentIndex = i - 1;
            renderQuestion(currentIndex);
            if (window.innerWidth <= 1024) {
                paletteDrawer.classList.remove('open');
            }
        });
        paletteGrid.appendChild(item);
    }
}

function updatePaletteButton(testQId) {
    const btn = document.getElementById(`palette-btn-${testQId}`);
    if (!btn) return;

    const hasAns = !!answers[testQId];
    const isReview = reviewSet.has(testQId);

    btn.className = 'palette-item font-mono';

    if (hasAns && isReview) {
        btn.classList.add('answered', 'marked');
    } else if (hasAns) {
        btn.classList.add('answered');
    } else if (isReview) {
        btn.classList.add('marked');
    }

    if (testQId === currentIndex + 1) {
        btn.classList.add('current');
    }

    // Update answered count
    const answeredCount = Object.values(answers).filter(Boolean).length;
    paletteCountAnswered.textContent = answeredCount;
}

function highlightActivePalette(testQId) {
    document.querySelectorAll('.palette-item').forEach(b => b.classList.remove('current'));
    const btn = document.getElementById(`palette-btn-${testQId}`);
    if (btn) btn.classList.add('current');
}

// -------------------------------------------------------------
// 6. NAVIGATION & CONTROLS
// -------------------------------------------------------------
document.getElementById('prevBtn').addEventListener('click', () => {
    if (currentIndex > 0) {
        currentIndex--;
        renderQuestion(currentIndex);
    }
});

document.getElementById('nextBtn').addEventListener('click', () => {
    if (currentIndex < questions.length - 1) {
        currentIndex++;
        renderQuestion(currentIndex);
    }
});

document.getElementById('clearBtn').addEventListener('click', () => {
    const testQId = questions[currentIndex].testQId;
    delete answers[testQId];
    renderQuestion(currentIndex);
    updatePaletteButton(testQId);
});

document.getElementById('reviewBtn').addEventListener('click', () => {
    const testQId = questions[currentIndex].testQId;
    if (reviewSet.has(testQId)) {
        reviewSet.delete(testQId);
    } else {
        reviewSet.add(testQId);
    }
    renderQuestion(currentIndex);
    updatePaletteButton(testQId);
});

// Mobile Palette Drawer Toggle
togglePaletteBtn.addEventListener('click', () => {
    paletteDrawer.classList.toggle('open');
});
if (closePaletteBtn) {
    closePaletteBtn.addEventListener('click', () => {
        paletteDrawer.classList.remove('open');
    });
}

// -------------------------------------------------------------
// 7. SUBMISSION & SEALED COMPLETION VIEW (ZERO SCORE DISCLOSED)
// -------------------------------------------------------------
function openConfirmModal() {
    const answeredTotal = Object.values(answers).filter(Boolean).length;
    modalAnsweredCount.textContent = answeredTotal;
    confirmSubmitModal.classList.remove('hidden');
}

document.getElementById('openSubmitModalBtn').addEventListener('click', openConfirmModal);
document.getElementById('drawerSubmitBtn').addEventListener('click', openConfirmModal);
document.getElementById('cancelSubmitBtn').addEventListener('click', () => {
    confirmSubmitModal.classList.add('hidden');
});

document.getElementById('confirmFinalSubmitBtn').addEventListener('click', () => {
    confirmSubmitModal.classList.add('hidden');
    submitTest(false);
});

async function submitTest(isAutoSubmit = false) {
    if (testSubmitted) return;
    testSubmitted = true;
    clearInterval(timerInterval);

    const timeTaken = (180 * 60) - remainingSeconds;

    try {
        const res = await fetch('/api/test/submit', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${jwtToken}`
            },
            body: JSON.stringify({
                testSessionId,
                answers,
                tabSwitches,
                screenSearchAttempts,
                timeTakenSeconds: timeTaken
            })
        });

        const data = await res.json();

        // Switch to Completion View (STRICTLY NO SCORE REVEALED)
        testView.classList.add('hidden');
        completionView.classList.remove('hidden');
        document.body.classList.remove('screen-shielded');
        document.getElementById('completionCandidateName').textContent = candidate.name;

        if (document.fullscreenElement && document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
        }
    } catch (err) {
        console.error("Submission notice:", err);
        testView.classList.add('hidden');
        completionView.classList.remove('hidden');
        document.body.classList.remove('screen-shielded');
    }
}

// Retest Trigger (Prompts for code / resets to initial state)
document.getElementById('retestBtn').addEventListener('click', () => {
    completionView.classList.add('hidden');
    authView.classList.remove('hidden');
    if (accessCodeInput) accessCodeInput.value = currentAccessCode || '';
});

// Initialize Sensor Listeners
initProctoringSensors();
