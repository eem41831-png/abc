// admin.js - Evaluator Dashboard & Search Engine
let allSubmissions = [];
let filteredSubmissions = [];
let currentFilter = 'all';
let currentSort = 'newest';
let activeSubmission = null;
let activeQuestionFilter = 'all';

// DOM Elements
const searchInput = document.getElementById('searchInput');
const filterChips = document.querySelectorAll('.filter-chip');
const sortSelect = document.getElementById('sortSelect');
const refreshBtn = document.getElementById('refreshBtn');
const resultsCount = document.getElementById('resultsCount');
const submissionsTableBody = document.getElementById('submissionsTableBody');
const dbStatus = document.getElementById('dbStatus');
const dbStatusText = document.getElementById('dbStatusText');

// KPI Elements
const statTotalCandidates = document.getElementById('statTotalCandidates');
const statAverageScore = document.getElementById('statAverageScore');
const statHighestScore = document.getElementById('statHighestScore');
const statFlaggedCount = document.getElementById('statFlaggedCount');

// Modal Elements
const detailModal = document.getElementById('detailModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const printModalBtn = document.getElementById('printModalBtn');
const mCandidateName = document.getElementById('mCandidateName');
const mCandidateEmail = document.getElementById('mCandidateEmail');
const mCandidateRoll = document.getElementById('mCandidateRoll');
const mSessionId = document.getElementById('mSessionId');
const mRights = document.getElementById('mRights');
const mWrongs = document.getElementById('mWrongs');
const mUnattempted = document.getElementById('mUnattempted');
const mTotalScore = document.getElementById('mTotalScore');
const mAccuracy = document.getElementById('mAccuracy');
const mDuration = document.getElementById('mDuration');
const mTabSwitches = document.getElementById('mTabSwitches');
const mCtsAttempts = document.getElementById('mCtsAttempts');
const mSource = document.getElementById('mSource');
const mChapterBody = document.getElementById('mChapterBody');
const mResponsesBody = document.getElementById('mResponsesBody');
const respFilterChips = document.querySelectorAll('.chip-small');

// -------------------------------------------------------------
// 1. DATA INITIALIZATION & STATS FETCH
// -------------------------------------------------------------
async function loadSubmissions() {
    submissionsTableBody.innerHTML = `
        <tr><td colspan="11" class="text-center text-muted py-8">Fetching assessment records from DB / Offline Storage...</td></tr>
    `;

    try {
        const [subRes, statRes] = await Promise.all([
            fetch('/api/admin/submissions'),
            fetch('/api/admin/stats')
        ]);

        const subData = await subRes.json();
        const statData = await statRes.json();

        if (subData.success) {
            allSubmissions = subData.submissions || [];
            updateDBStatus(allSubmissions);
            renderStats(statData);
            applyFilterAndSearch();
        } else {
            throw new Error(subData.error || "Failed to load submissions");
        }
    } catch (err) {
        console.error("Error loading submissions:", err);
        submissionsTableBody.innerHTML = `
            <tr><td colspan="11" class="text-center text-rose py-8">Failed to load records: ${err.message}</td></tr>
        `;
        dbStatus.className = 'status-indicator offline';
        dbStatusText.textContent = "Offline Mode (Local Storage Fallback)";
    }
}

function updateDBStatus(list) {
    const isAtlas = list.some(s => s.source && s.source.includes('MongoDB Atlas'));
    if (isAtlas) {
        dbStatus.className = 'status-indicator';
        dbStatusText.textContent = `MongoDB Atlas Connected (${list.length} Records)`;
    } else {
        dbStatus.className = 'status-indicator offline';
        dbStatusText.textContent = `Local Offline Storage (${list.length} Records)`;
    }
}

function renderStats(stats) {
    statTotalCandidates.textContent = stats.totalCandidates || allSubmissions.length;
    statAverageScore.innerHTML = `${stats.averageMarks || 0} <span class="stat-denom">/ 300</span>`;
    statHighestScore.innerHTML = `${stats.highestMarks || 0} <span class="stat-denom">/ 300</span>`;
    statFlaggedCount.textContent = stats.flaggedCount || 0;
}

// -------------------------------------------------------------
// 2. LIVE SEARCH, FILTER & SORT ENGINE
// -------------------------------------------------------------
function applyFilterAndSearch() {
    const query = (searchInput.value || '').trim().toLowerCase();

    // 1. Search Query Match
    filteredSubmissions = allSubmissions.filter(s => {
        const name = (s.candidate?.name || '').toLowerCase();
        const email = (s.candidate?.email || '').toLowerCase();
        const roll = (s.candidate?.rollNo || '').toLowerCase();
        const sid = (s.testSessionId || '').toLowerCase();

        const matchesQuery = !query || name.includes(query) || email.includes(query) || roll.includes(query) || sid.includes(query);
        if (!matchesQuery) return false;

        // 2. Filter Category
        if (currentFilter === 'clean') {
            return (s.tabSwitches || 0) === 0 && (s.screenSearchAttempts || 0) === 0;
        }
        if (currentFilter === 'flagged') {
            return (s.tabSwitches || 0) > 0 || (s.screenSearchAttempts || 0) > 0;
        }
        if (currentFilter === 'high') {
            return (s.totalMarks || 0) >= 100;
        }
        if (currentFilter === 'negative') {
            return (s.totalMarks || 0) < 0;
        }

        return true;
    });

    // 3. Sort Order
    filteredSubmissions.sort((a, b) => {
        if (currentSort === 'newest') {
            return new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0);
        }
        if (currentSort === 'score_desc') {
            return (b.totalMarks || 0) - (a.totalMarks || 0);
        }
        if (currentSort === 'score_asc') {
            return (a.totalMarks || 0) - (b.totalMarks || 0);
        }
        if (currentSort === 'violations') {
            const vA = (a.tabSwitches || 0) + (a.screenSearchAttempts || 0);
            const vB = (b.tabSwitches || 0) + (b.screenSearchAttempts || 0);
            return vB - vA;
        }
        if (currentSort === 'name') {
            return (a.candidate?.name || '').localeCompare(b.candidate?.name || '');
        }
        return 0;
    });

    resultsCount.textContent = `Showing ${filteredSubmissions.length} of ${allSubmissions.length} candidates`;
    renderTable(filteredSubmissions);
}

// -------------------------------------------------------------
// 3. RENDER SUBMISSIONS TABLE
// -------------------------------------------------------------
function renderTable(list) {
    if (list.length === 0) {
        submissionsTableBody.innerHTML = `
            <tr><td colspan="11" class="text-center text-muted py-8">No candidate assessments found matching your search.</td></tr>
        `;
        return;
    }

    submissionsTableBody.innerHTML = list.map(sub => {
        const dateStr = sub.submittedAt ? formatDateTime(sub.submittedAt) : 'Recently';
        const mins = Math.floor((sub.timeTakenSeconds || 0) / 60);
        const secs = (sub.timeTakenSeconds || 0) % 60;
        const durationStr = `${mins}m ${secs}s`;

        const totalMarks = sub.totalMarks || 0;
        const maxMarks = sub.maxMarks || 300;
        const scoreClass = totalMarks >= 100 ? 'high' : (totalMarks < 0 ? 'negative' : '');

        const flags = (sub.tabSwitches || 0) + (sub.screenSearchAttempts || 0);
        let flagHtml = `<span class="flag-pill clean font-mono">Clean</span>`;
        if (flags > 0) {
            flagHtml = `<span class="flag-pill danger font-mono">${flags} Strike${flags > 1 ? 's' : ''}</span>`;
        }

        return `
            <tr>
                <td>
                    <span class="cand-name">${escapeHtml(sub.candidate?.name || 'Anonymous')}</span>
                    <span class="cand-email">${escapeHtml(sub.candidate?.email || '')}</span>
                </td>
                <td class="font-mono text-muted text-xs">${escapeHtml(sub.candidate?.rollNo || 'N/A')}</td>
                <td class="text-xs text-muted font-mono">${dateStr}</td>
                <td class="text-xs text-muted font-mono">${durationStr}</td>
                <td class="text-center font-mono badge-rights">${sub.correctCount || 0}</td>
                <td class="text-center font-mono badge-wrongs">${sub.incorrectCount || 0}</td>
                <td class="text-center font-mono text-dim">${sub.unattemptedCount || 0}</td>
                <td class="text-center">
                    <span class="score-pill ${scoreClass} font-mono">
                        ${totalMarks > 0 ? '+' : ''}${totalMarks} / ${maxMarks}
                    </span>
                </td>
                <td class="text-center font-mono text-xs">${sub.accuracyPercent || 0}%</td>
                <td class="text-center">${flagHtml}</td>
                <td class="text-right">
                    <button class="btn-primary btn-compact" onclick="openScorecard('${sub.testSessionId}')">
                        <span>Inspect</span>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/>
                        </svg>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// -------------------------------------------------------------
// 4. DETAILED SCORECARD INSPECTION MODAL
// -------------------------------------------------------------
window.openScorecard = async function(sessionId) {
    detailModal.classList.remove('hidden');
    mCandidateName.textContent = "Loading candidate responses...";
    mResponsesBody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-6">Loading full question responses...</td></tr>`;

    try {
        const res = await fetch(`/api/admin/submissions/${sessionId}`);
        const data = await res.json();
        if (!data.success || !data.submission) {
            throw new Error(data.error || "Scorecard details unavailable");
        }

        activeSubmission = data.submission;
        activeQuestionFilter = 'all';
        resetQuestionFilterChips();

        const s = activeSubmission;
        mCandidateName.textContent = s.candidate?.name || 'Anonymous';
        mCandidateEmail.textContent = s.candidate?.email || 'N/A';
        mCandidateRoll.textContent = `ROLL: ${s.candidate?.rollNo || 'N/A'}`;
        mSessionId.textContent = s.testSessionId || sessionId;

        mRights.textContent = s.correctCount || 0;
        mWrongs.textContent = s.incorrectCount || 0;
        mUnattempted.textContent = s.unattemptedCount || 0;
        mTotalScore.innerHTML = `${(s.totalMarks || 0) > 0 ? '+' : ''}${s.totalMarks || 0} <span class="denom">/ ${s.maxMarks || 300}</span>`;
        mAccuracy.textContent = `${s.accuracyPercent || 0}% Accuracy`;

        const mins = Math.floor((s.timeTakenSeconds || 0) / 60);
        const secs = (s.timeTakenSeconds || 0) % 60;
        mDuration.textContent = `${mins}m ${secs}s / 180m`;
        mTabSwitches.textContent = `${s.tabSwitches || 0} violation(s)`;
        mCtsAttempts.textContent = `${s.screenSearchAttempts || 0} attempt(s)`;
        mSource.textContent = s.source || 'MongoDB Atlas';

        // Render Chapter Breakdown
        mChapterBody.innerHTML = '';
        for (const [chName, chStats] of Object.entries(s.chapterBreakdown || {})) {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${escapeHtml(chName)}</strong></td>
                <td class="text-center font-mono">${chStats.total || 0}</td>
                <td class="text-center font-mono text-emerald">${chStats.correct || 0}</td>
                <td class="text-center font-mono text-rose">${chStats.incorrect || 0}</td>
                <td class="text-center font-mono text-dim">${chStats.unattempted || 0}</td>
            `;
            mChapterBody.appendChild(tr);
        }

        // Render Question Responses
        renderQuestionResponses();
    } catch (err) {
        mCandidateName.textContent = "Error loading scorecard";
        mResponsesBody.innerHTML = `<tr><td colspan="5" class="text-center text-rose py-6">${err.message}</td></tr>`;
    }
};

function renderQuestionResponses() {
    if (!activeSubmission || !activeSubmission.userResponses) {
        mResponsesBody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-6">No itemized responses recorded for this session.</td></tr>`;
        return;
    }

    const responses = activeSubmission.userResponses.filter(r => {
        if (activeQuestionFilter === 'correct') return r.isCorrect;
        if (activeQuestionFilter === 'incorrect') return r.isAttempted && !r.isCorrect;
        if (activeQuestionFilter === 'left') return !r.isAttempted;
        return true;
    });

    if (responses.length === 0) {
        mResponsesBody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-6">No questions found for this filter.</td></tr>`;
        return;
    }

    mResponsesBody.innerHTML = responses.map(r => {
        let outcomeHtml = '';
        if (!r.isAttempted) {
            outcomeHtml = `<span class="outcome-pill left font-mono">LEFT (0)</span>`;
        } else if (r.isCorrect) {
            outcomeHtml = `<span class="outcome-pill right font-mono">RIGHT (+4)</span>`;
        } else {
            outcomeHtml = `<span class="outcome-pill wrong font-mono">WRONG (-1)</span>`;
        }

        return `
            <tr>
                <td class="font-mono text-muted text-xs">Q${r.testQId}</td>
                <td>
                    <div class="text-xs text-dim font-mono mb-1">${escapeHtml(r.chapter)} • ${r.questionType}</div>
                    <div class="text-xs line-clamp-2">${escapeHtml(r.questionSnippet || 'Statement unavailable')}</div>
                </td>
                <td class="text-center font-mono font-bold">${escapeHtml(r.candidateAnswer || '-')}</td>
                <td class="text-center font-mono text-emerald font-bold">${escapeHtml(r.correctAnswer || '-')}</td>
                <td class="text-center">${outcomeHtml}</td>
            </tr>
        `;
    }).join('');
}

function resetQuestionFilterChips() {
    respFilterChips.forEach(c => {
        c.classList.toggle('active', c.getAttribute('data-qfilter') === 'all');
    });
}

// -------------------------------------------------------------
// 5. EVENT LISTENERS & SHORTCUTS
// -------------------------------------------------------------
searchInput.addEventListener('input', () => {
    applyFilterAndSearch();
});

filterChips.forEach(chip => {
    chip.addEventListener('click', () => {
        filterChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        currentFilter = chip.getAttribute('data-filter');
        applyFilterAndSearch();
    });
});

sortSelect.addEventListener('change', () => {
    currentSort = sortSelect.value;
    applyFilterAndSearch();
});

refreshBtn.addEventListener('click', () => {
    loadSubmissions();
});

closeModalBtn.addEventListener('click', () => {
    detailModal.classList.add('hidden');
});

detailModal.addEventListener('click', (e) => {
    if (e.target === detailModal) {
        detailModal.classList.add('hidden');
    }
});

printModalBtn.addEventListener('click', () => {
    window.print();
});

respFilterChips.forEach(chip => {
    chip.addEventListener('click', () => {
        respFilterChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        activeQuestionFilter = chip.getAttribute('data-qfilter');
        renderQuestionResponses();
    });
});

// Shortcut '/' to focus search input
window.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== searchInput) {
        e.preventDefault();
        searchInput.focus();
        searchInput.select();
    }
    if (e.key === 'Escape' && !detailModal.classList.contains('hidden')) {
        detailModal.classList.add('hidden');
    }
});

function formatDateTime(isoString) {
    try {
        const d = new Date(isoString);
        return d.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return 'Recently';
    }
}

function escapeHtml(text) {
    if (!text) return '';
    return text.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Initialize on Load
loadSubmissions();
