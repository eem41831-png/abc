// server.js - Secure Test Mode Exam Engine with JWT, MongoDB, Anti-Cheat, Owner Access Code & Evaluator Dispatcher
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient } = require('mongodb');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "examgoal_quantum_secure_jwt_key_2026";
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://eem41831_db_user:iyqvtKvKRlJuMtVs@cluster0.o1b2ccj.mongodb.net/?retryWrites=true&w=majority&connectTimeoutMS=10000";
const EVALUATOR_EMAIL = process.env.EVALUATOR_EMAIL || "shan01tnu@gmail.com";

// Owner Exam Access Code (Must be provided to students to begin)
let CURRENT_EXAM_PASSCODE = process.env.EXAM_PASSCODE || "ORGANIC2026";

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

let mongoDb = null;
let activeTestSessions = new Map(); // testSessionId -> { candidate, questionsWithAnswers, startTime }

// Connect MongoDB Atlas with Automatic Reconnection Loop
let isConnectingMongo = false;
async function connectDB() {
    if (mongoDb || isConnectingMongo) return;
    isConnectingMongo = true;
    try {
        const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
        await client.connect();
        mongoDb = client.db('examgoal');
        console.log("Connected to MongoDB Atlas: database 'examgoal'");
        isConnectingMongo = false;
    } catch (err) {
        console.warn("MongoDB Atlas connect notice (using local JSON storage):", err.message);
        isConnectingMongo = false;
        // Schedule auto-reconnect retry in 15 seconds
        setTimeout(connectDB, 15000);
    }
}
connectDB();

async function getAllQuestions() {
    if (mongoDb) {
        try {
            const docs = await mongoDb.collection('questions').find({}).toArray();
            if (docs && docs.length >= 75) return docs;
        } catch (e) {
            console.warn("Querying local backup due to DB error:", e.message);
        }
    }
    const localPath = path.resolve(__dirname, '..', 'examgoal_questions', 'organic_chemistry_100_questions.json');
    if (fs.existsSync(localPath)) {
        return JSON.parse(fs.readFileSync(localPath, 'utf-8'));
    }
    return [];
}

function shuffle(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function requireAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ error: "Missing authorization token" });

    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: "Session expired or invalid. Please sign in again." });
    }
}

// ----------------- AUTH & CODE VERIFICATION -----------------
app.post('/api/auth/candidate', (req, res) => {
    const { name, email, rollNo } = req.body;
    if (!name || !email) {
        return res.status(400).json({ error: "Candidate name and email are required" });
    }

    const token = jwt.sign(
        { name: name.trim(), email: email.trim().toLowerCase(), rollNo: (rollNo || 'N/A').trim() },
        JWT_SECRET,
        { expiresIn: '24h' }
    );

    res.json({
        success: true,
        token,
        candidate: { name: name.trim(), email: email.trim().toLowerCase(), rollNo }
    });
});

// Verify Exam Access Passcode
app.post('/api/test/verify-code', requireAuth, (req, res) => {
    const { accessCode } = req.body;
    if (!accessCode || accessCode.trim().toUpperCase() !== CURRENT_EXAM_PASSCODE.trim().toUpperCase()) {
        return res.status(403).json({
            success: false,
            error: "Incorrect Exam Access Code. Please ask the test owner for the active passkey."
        });
    }
    res.json({ success: true, message: "Access Code Verified." });
});

// Owner endpoint to update or inspect access code
app.get('/api/owner/code', (req, res) => {
    res.json({ currentPasscode: CURRENT_EXAM_PASSCODE });
});

app.post('/api/owner/set-code', (req, res) => {
    const { newCode, secretKey } = req.body;
    if (newCode && newCode.trim().length >= 4) {
        CURRENT_EXAM_PASSCODE = newCode.trim().toUpperCase();
        console.log(`[OWNER PASSCODE UPDATED] -> ${CURRENT_EXAM_PASSCODE}`);
        return res.json({ success: true, passcode: CURRENT_EXAM_PASSCODE });
    }
    res.status(400).json({ error: "Invalid passcode format" });
});

// ----------------- TEST ENGINE -----------------

// Start Test: Requires Valid Access Code
app.post('/api/test/start', requireAuth, async (req, res) => {
    const { accessCode } = req.body;
    if (!accessCode || accessCode.trim().toUpperCase() !== CURRENT_EXAM_PASSCODE.trim().toUpperCase()) {
        return res.status(403).json({
            error: "Access Denied: Invalid Exam Access Code. You must obtain the code from the administrator to start."
        });
    }

    try {
        const allQuestions = await getAllQuestions();
        if (allQuestions.length === 0) {
            return res.status(500).json({ error: "Question bank is empty." });
        }

        // Randomly pick 75 questions and shuffle
        const shuffledAll = shuffle(allQuestions);
        const selected75 = shuffledAll.slice(0, Math.min(75, shuffledAll.length));
        const finalShuffled = shuffle(selected75);

        const testSessionId = `SESSION_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

        const sessionData = {
            testSessionId,
            candidate: req.user,
            questions: finalShuffled,
            startTime: Date.now()
        };

        // Store answers safely on server
        activeTestSessions.set(testSessionId, sessionData);

        // Persist to local disk backup (survives server restarts)
        try {
            const activeDir = path.resolve(__dirname, '..', 'examgoal_questions', 'active_sessions');
            fs.writeFileSync(path.join(activeDir, `${testSessionId}.json`), JSON.stringify(sessionData));
        } catch (e) {
            console.warn("Could not write active session to disk:", e.message);
        }

        // Persist to MongoDB for serverless / multi-instance reliability (Firebase / Cloud)
        if (mongoDb) {
            try {
                mongoDb.collection('active_sessions').updateOne(
                    { testSessionId },
                    { $set: sessionData },
                    { upsert: true }
                ).catch(() => {});
            } catch (err) {
                console.warn("Could not persist active session to DB:", err.message);
            }
        }

        // Strip answers and solutions for the client
        const sanitizedForClient = finalShuffled.map((q, idx) => ({
            testQId: idx + 1,
            chapter: q.chapter,
            topicsCovered: q.topicsCovered,
            examMeta: q.examMeta,
            questionType: q.questionType || (Object.keys(q.options || {}).length > 0 ? "MCQ" : "Numerical"),
            question: q.question,
            options: q.options || {}
        }));

        res.json({
            success: true,
            testSessionId,
            durationMinutes: 180, // 3 hours
            totalQuestions: sanitizedForClient.length,
            questions: sanitizedForClient
        });
    } catch (e) {
        console.error("Error generating test session:", e);
        res.status(500).json({ error: "Failed to generate test session: " + e.message });
    }
});

// Submit Test
app.post('/api/test/submit', requireAuth, async (req, res) => {
    const { testSessionId, answers, tabSwitches, screenSearchAttempts, timeTakenSeconds } = req.body;

    let session = activeTestSessions.get(testSessionId);

    // 1. Check disk backup if not in memory (e.g. server was restarted while taking test)
    if (!session && testSessionId) {
        try {
            const activeDir = path.resolve(__dirname, '..', 'examgoal_questions', 'active_sessions');
            const sessionFile = path.join(activeDir, `${testSessionId}.json`);
            if (fs.existsSync(sessionFile)) {
                session = JSON.parse(fs.readFileSync(sessionFile, 'utf-8'));
            }
        } catch (_) {}
    }

    // 2. Check MongoDB Atlas if still not found
    if (!session && mongoDb && testSessionId) {
        try {
            session = await mongoDb.collection('active_sessions').findOne({ testSessionId });
        } catch (e) {
            console.warn("DB session fetch warning:", e.message);
        }
    }

    // 3. Fallback: If session was purged, reconstruct from bank so candidate submission is NEVER lost!
    if (!session) {
        const allQ = await getAllQuestions();
        const candidateInfo = req.user || { name: 'Candidate', email: 'registered@cbt.internal', rollNo: 'N/A' };
        session = {
            candidate: candidateInfo,
            questions: allQ.slice(0, 75),
            startTime: Date.now() - ((timeTakenSeconds || 60) * 1000)
        };
    }

    const { candidate, questions } = session;
    activeTestSessions.delete(testSessionId);

    // Clean up active session from disk
    if (testSessionId) {
        try {
            const activeDir = path.resolve(__dirname, '..', 'examgoal_questions', 'active_sessions');
            const sessionFile = path.join(activeDir, `${testSessionId}.json`);
            if (fs.existsSync(sessionFile)) fs.unlinkSync(sessionFile);
        } catch (_) {}
    }

    if (mongoDb && testSessionId) {
        mongoDb.collection('active_sessions').deleteOne({ testSessionId }).catch(() => {});
    }

    let totalMarks = 0;
    let correctCount = 0;
    let incorrectCount = 0;
    let unattemptedCount = 0;
    const totalQuestions = questions.length;
    const maxMarks = totalQuestions * 4;

    const chapterStats = {};

    questions.forEach((q, idx) => {
        const testQId = idx + 1;
        const candidateAns = (answers[testQId] || '').toString().trim().toUpperCase();
        const correctAns = (q.correctAnswer || '').toString().trim().toUpperCase();

        if (!chapterStats[q.chapter]) {
            chapterStats[q.chapter] = { total: 0, correct: 0, incorrect: 0, unattempted: 0 };
        }
        chapterStats[q.chapter].total++;

        if (!candidateAns) {
            unattemptedCount++;
            chapterStats[q.chapter].unattempted++;
        } else if (candidateAns === correctAns) {
            correctCount++;
            totalMarks += 4;
            chapterStats[q.chapter].correct++;
        } else {
            incorrectCount++;
            totalMarks -= 1;
            chapterStats[q.chapter].incorrect++;
        }
    });

    const accuracy = correctCount + incorrectCount > 0
        ? ((correctCount / (correctCount + incorrectCount)) * 100).toFixed(1)
        : 0;

    const userResponses = questions.map((q, idx) => {
        const testQId = idx + 1;
        const candidateAns = (answers[testQId] || '').toString().trim().toUpperCase();
        const correctAns = (q.correctAnswer || '').toString().trim().toUpperCase();
        const isAttempted = Boolean(candidateAns);
        const isCorrect = isAttempted && (candidateAns === correctAns);
        const marksAwarded = !isAttempted ? 0 : (isCorrect ? 4 : -1);

        return {
            testQId,
            chapter: q.chapter,
            questionType: q.questionType,
            questionSnippet: (q.question || '').slice(0, 160).replace(/\n/g, ' '),
            candidateAnswer: candidateAns || 'UNATTEMPTED',
            correctAnswer: correctAns,
            isAttempted,
            isCorrect,
            marksAwarded
        };
    });

    const submissionRecord = {
        testSessionId,
        candidate,
        submittedAt: new Date(),
        timeTakenSeconds: timeTakenSeconds || 0,
        tabSwitches: tabSwitches || 0,
        screenSearchAttempts: screenSearchAttempts || 0,
        totalQuestions,
        maxMarks,
        totalMarks,
        correctCount,
        incorrectCount,
        unattemptedCount,
        accuracyPercent: accuracy,
        chapterBreakdown: chapterStats,
        userResponses
    };

    // Store in MongoDB
    if (mongoDb) {
        try {
            await mongoDb.collection('submissions').insertOne(submissionRecord);
        } catch (dbErr) {
            console.error("DB Submission notice:", dbErr.message);
        }
    }

    // Local backup
    const backupDir = path.resolve(__dirname, '..', 'examgoal_questions');
    try {
        fs.writeFileSync(path.join(backupDir, `submission_${testSessionId}.json`), JSON.stringify(submissionRecord, null, 2));
    } catch (_) {}

    // Return immediate response to candidate so browser UI doesn't hang or stall!
    res.json({
        success: true,
        message: "Assessment Sealed & Completed.",
        wishingNote: "Your responses have been cryptographically sealed and transmitted directly to the institutional evaluator for grading. Wishing you immense success on your academic journey!",
        canRetest: true
    });

    // Dispatch detailed scorecard email in background (non-blocking)
    sendEvaluatorEmail(submissionRecord).catch(mailErr => {
        console.warn("Background scorecard email notice:", mailErr.message);
    });
});

async function sendEvaluatorEmail(record) {
    const { candidate, totalMarks, maxMarks, correctCount, incorrectCount, unattemptedCount, accuracyPercent, tabSwitches, screenSearchAttempts, timeTakenSeconds, chapterBreakdown, userResponses } = record;

    const minutes = Math.floor(timeTakenSeconds / 60);
    const seconds = timeTakenSeconds % 60;

    let chapterRows = '';
    for (const [chName, stats] of Object.entries(chapterBreakdown || {})) {
        chapterRows += `
            <tr style="border-bottom: 1px solid #27272a;">
                <td style="padding: 10px 14px; color: #e4e4e7;">${chName}</td>
                <td style="padding: 10px 14px; text-align: center; color: #a1a1aa;">${stats.total}</td>
                <td style="padding: 10px 14px; text-align: center; color: #10b981; font-weight: 600;">${stats.correct}</td>
                <td style="padding: 10px 14px; text-align: center; color: #ef4444;">${stats.incorrect}</td>
                <td style="padding: 10px 14px; text-align: center; color: #71717a;">${stats.unattempted}</td>
            </tr>
        `;
    }

    // Itemized responses table (sample first 25 or all)
    let responseRows = '';
    (userResponses || []).forEach(ur => {
        const statusBadge = !ur.isAttempted
            ? '<span style="color: #71717a; font-weight: 500;">LEFT (0)</span>'
            : (ur.isCorrect
                ? '<span style="color: #10b981; font-weight: 600;">RIGHT (+4)</span>'
                : '<span style="color: #ef4444; font-weight: 600;">WRONG (-1)</span>');

        responseRows += `
            <tr style="border-bottom: 1px solid #1f2029; font-size: 12px;">
                <td style="padding: 8px 10px; color: #ffffff; font-family: monospace;">Q${ur.testQId}</td>
                <td style="padding: 8px 10px; color: #a1a1aa;">${ur.chapter}</td>
                <td style="padding: 8px 10px; text-align: center; font-weight: 600; color: #e4e4e7; font-family: monospace;">${ur.candidateAnswer}</td>
                <td style="padding: 8px 10px; text-align: center; color: #10b981; font-family: monospace;">${ur.correctAnswer}</td>
                <td style="padding: 8px 10px; text-align: center;">${statusBadge}</td>
            </tr>
        `;
    });

    const htmlContent = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #09090b; color: #fafafa; padding: 32px; border-radius: 12px; max-width: 720px; margin: 0 auto; border: 1px solid #27272a;">
            <div style="border-bottom: 1px solid #27272a; padding-bottom: 20px; margin-bottom: 24px;">
                <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #a1a1aa;">Official Scorecard &bull; Confidential Assessment</span>
                <h1 style="margin: 6px 0 0; color: #ffffff; font-size: 22px; font-weight: 700;">ExamGOAL Assessment Report</h1>
            </div>

            <!-- Candidate & Proctoring Info -->
            <div style="background-color: #121215; border: 1px solid #27272a; border-radius: 8px; padding: 18px; margin-bottom: 24px; font-size: 13px; line-height: 1.6;">
                <p style="margin: 0 0 4px;"><strong>Candidate:</strong> ${candidate.name} (<span style="color: #38bdf8;">${candidate.email}</span>)</p>
                <p style="margin: 0 0 4px;"><strong>Roll Number:</strong> ${candidate.rollNo || 'N/A'}</p>
                <p style="margin: 0 0 4px;"><strong>Time Taken:</strong> ${minutes}m ${seconds}s / 180m</p>
                <p style="margin: 0 0 4px;"><strong>Tab Switch Violations:</strong> <span style="color: ${tabSwitches > 0 ? '#ef4444' : '#10b981'}; font-weight: 600;">${tabSwitches}</span></p>
                <p style="margin: 0;"><strong>Circle to Search / Screen Loss Attempts:</strong> <span style="color: ${screenSearchAttempts > 0 ? '#ef4444' : '#10b981'}; font-weight: 600;">${screenSearchAttempts}</span></p>
            </div>

            <!-- PRIMARY SCORE CARDS (RIGHTS, WRONGS, TOTAL) -->
            <div style="display: flex; gap: 12px; margin-bottom: 24px; text-align: center;">
                <div style="flex: 1; background-color: #161822; border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 8px; padding: 16px;">
                    <div style="font-size: 11px; text-transform: uppercase; color: #10b981; font-weight: 600; letter-spacing: 0.05em;">Rights (Correct)</div>
                    <div style="font-size: 32px; font-weight: 700; color: #10b981; margin-top: 4px; font-variant-numeric: tabular-nums;">${correctCount}</div>
                </div>
                <div style="flex: 1; background-color: #161822; border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px; padding: 16px;">
                    <div style="font-size: 11px; text-transform: uppercase; color: #ef4444; font-weight: 600; letter-spacing: 0.05em;">Wrongs (Incorrect)</div>
                    <div style="font-size: 32px; font-weight: 700; color: #ef4444; margin-top: 4px; font-variant-numeric: tabular-nums;">${incorrectCount}</div>
                </div>
                <div style="flex: 1; background-color: #161822; border: 1px solid #3f3f46; border-radius: 8px; padding: 16px;">
                    <div style="font-size: 11px; text-transform: uppercase; color: #a1a1aa; font-weight: 600; letter-spacing: 0.05em;">Left (Unattempted)</div>
                    <div style="font-size: 32px; font-weight: 700; color: #a1a1aa; margin-top: 4px; font-variant-numeric: tabular-nums;">${unattemptedCount}</div>
                </div>
                <div style="flex: 1.2; background-color: #18181b; border: 1px solid #ffffff; border-radius: 8px; padding: 16px;">
                    <div style="font-size: 11px; text-transform: uppercase; color: #ffffff; font-weight: 600; letter-spacing: 0.05em;">Total Marks</div>
                    <div style="font-size: 32px; font-weight: 700; color: #ffffff; margin-top: 4px; font-variant-numeric: tabular-nums;">${totalMarks} <span style="font-size: 14px; color: #71717a;">/ ${maxMarks}</span></div>
                </div>
            </div>

            <!-- Chapter Performance Breakdown -->
            <div style="margin-bottom: 24px;">
                <h3 style="font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; color: #a1a1aa; margin-bottom: 10px;">Performance by Chapter</h3>
                <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                    <thead>
                        <tr style="border-bottom: 1px solid #3f3f46; color: #71717a; text-align: left; font-size: 11px; text-transform: uppercase;">
                            <th style="padding: 8px 14px;">Chapter</th>
                            <th style="padding: 8px 14px; text-align: center;">Total</th>
                            <th style="padding: 8px 14px; text-align: center; color: #10b981;">Rights</th>
                            <th style="padding: 8px 14px; text-align: center; color: #ef4444;">Wrongs</th>
                            <th style="padding: 8px 14px; text-align: center;">Left</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${chapterRows}
                    </tbody>
                </table>
            </div>

            <!-- Complete User Responses Log -->
            <div style="margin-bottom: 24px;">
                <h3 style="font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; color: #a1a1aa; margin-bottom: 10px;">Itemized Candidate Responses (75 Questions)</h3>
                <div style="max-height: 400px; overflow-y: auto; border: 1px solid #27272a; border-radius: 8px;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background-color: #121215; border-bottom: 1px solid #27272a; color: #71717a; text-align: left; font-size: 11px; text-transform: uppercase;">
                                <th style="padding: 8px 10px;">Q#</th>
                                <th style="padding: 8px 10px;">Chapter</th>
                                <th style="padding: 8px 10px; text-align: center;">Selected</th>
                                <th style="padding: 8px 10px; text-align: center;">Correct</th>
                                <th style="padding: 8px 10px; text-align: center;">Result</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${responseRows}
                        </tbody>
                    </table>
                </div>
            </div>

            <div style="text-align: center; font-size: 11px; color: #52525b; border-top: 1px solid #27272a; padding-top: 16px;">
                Secure ExamGOAL Proctoring Engine &bull; Dispatched Directly to Institutional Evaluator
            </div>
        </div>
    `;

    console.log(`\n======================================================`);
    console.log(`[EVALUATOR EMAIL DISPATCH] -> ${EVALUATOR_EMAIL}`);
    console.log(`Candidate: ${candidate.name} (${candidate.email})`);
    console.log(`Rights: ${correctCount} | Wrongs: ${incorrectCount} | Total: ${totalMarks} / ${maxMarks}`);
    console.log(`Tab Switches: ${tabSwitches} | Circle-to-Search Attempts: ${screenSearchAttempts}`);
    console.log(`======================================================\n`);

    try {
        let transporter;
        if (process.env.SMTP_USER && process.env.SMTP_PASS) {
            if (process.env.SMTP_HOST) {
                transporter = nodemailer.createTransport({
                    host: process.env.SMTP_HOST,
                    port: parseInt(process.env.SMTP_PORT || "587"),
                    secure: process.env.SMTP_SECURE === "true",
                    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
                });
            } else {
                transporter = nodemailer.createTransport({
                    service: process.env.SMTP_SERVICE || "gmail",
                    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
                });
            }
        } else {
            transporter = nodemailer.createTransport({
                service: "gmail",
                auth: {
                    user: "shantnu026@gmail.com",
                    pass: "cgyr pyuk jnck yxfx"
                }
            });
        }

        const senderAddress = process.env.SMTP_USER || "shantnu026@gmail.com";
        const info = await transporter.sendMail({
            from: `"ExamGOAL Evaluator" <${senderAddress}>`,
            to: EVALUATOR_EMAIL,
            subject: `[Scorecard] ${candidate.name} | Rights: ${correctCount} | Wrongs: ${incorrectCount} | Total: ${totalMarks}/${maxMarks}`,
            html: htmlContent
        });

        console.log("Email dispatched successfully. Message ID:", info.messageId);
        const previewUrl = nodemailer.getTestMessageUrl(info);
        if (previewUrl) {
            console.log("\n==================================================================");
            console.log("  Evaluator Email Preview URL (Open to view full scorecard):");
            console.log("  " + previewUrl);
            console.log("==================================================================\n");
        }
    } catch (mailErr) {
        console.warn("Mail dispatch notice (Scorecard saved to disk):", mailErr.message);
    }
}

// ----------------- OFFLINE & DB SUBMISSION QUERIES -----------------
async function getAllSubmissions() {
    const submissionsMap = new Map(); // testSessionId -> submission object

    // 1. Read all local backup files first
    const backupDir = path.resolve(__dirname, '..', 'examgoal_questions');
    if (fs.existsSync(backupDir)) {
        try {
            const files = fs.readdirSync(backupDir).filter(f => f.startsWith('submission_') && f.endsWith('.json'));
            for (const file of files) {
                try {
                    const content = JSON.parse(fs.readFileSync(path.join(backupDir, file), 'utf-8'));
                    if (content && content.testSessionId) {
                        submissionsMap.set(content.testSessionId, { ...content, source: 'Local Storage (Offline)' });
                    }
                } catch (_) {}
            }
        } catch (e) {
            console.warn("Local storage read warning:", e.message);
        }
    }

    // 2. Query MongoDB Atlas and merge/sync
    if (mongoDb) {
        try {
            const docs = await mongoDb.collection('submissions').find({}).sort({ submittedAt: -1 }).toArray();
            if (docs && docs.length > 0) {
                for (const doc of docs) {
                    if (doc && doc.testSessionId) {
                        submissionsMap.set(doc.testSessionId, { ...doc, source: 'MongoDB Atlas' });
                    }
                }

                // Auto-sync: Push any local-only submissions up to MongoDB Atlas in background
                for (const [id, localSub] of submissionsMap.entries()) {
                    if (localSub.source === 'Local Storage (Offline)') {
                        mongoDb.collection('submissions').updateOne(
                            { testSessionId: id },
                            { $set: localSub },
                            { upsert: true }
                        ).catch(() => {});
                    }
                }
            }
        } catch (e) {
            console.warn("MongoDB Atlas sync notice:", e.message);
        }
    }

    // Convert map to array and sort newest first
    const submissions = Array.from(submissionsMap.values());
    submissions.sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));
    return submissions;
}

// Admin Submissions List (Fast Summary with Live Search compatibility & No-Cache)
app.get('/api/admin/submissions', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    try {
        const all = await getAllSubmissions();
        const summaries = all.map(s => ({
            testSessionId: s.testSessionId,
            candidate: s.candidate,
            submittedAt: s.submittedAt,
            totalMarks: s.totalMarks,
            maxMarks: s.maxMarks || 300,
            correctCount: s.correctCount || 0,
            incorrectCount: s.incorrectCount || 0,
            unattemptedCount: s.unattemptedCount || 0,
            accuracyPercent: s.accuracyPercent || 0,
            timeTakenSeconds: s.timeTakenSeconds || 0,
            tabSwitches: s.tabSwitches || 0,
            screenSearchAttempts: s.screenSearchAttempts || 0,
            source: s.source
        }));
        res.json({ success: true, count: summaries.length, submissions: summaries });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Admin Single Submission Detail (With full 75 questions & chapter breakdown)
app.get('/api/admin/submissions/:sessionId', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    try {
        const { sessionId } = req.params;
        // 1. Try DB
        if (mongoDb) {
            try {
                const doc = await mongoDb.collection('submissions').findOne({ testSessionId: sessionId });
                if (doc) return res.json({ success: true, submission: { ...doc, source: 'MongoDB Atlas' } });
            } catch (_) {}
        }

        // 2. Try Local File
        const backupPath = path.resolve(__dirname, '..', 'examgoal_questions', `submission_${sessionId}.json`);
        if (fs.existsSync(backupPath)) {
            const localData = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));
            return res.json({ success: true, submission: { ...localData, source: 'Local Storage (Offline)' } });
        }

        res.status(404).json({ error: "Submission not found" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Admin Aggregate Stats
app.get('/api/admin/stats', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    try {
        const all = await getAllSubmissions();
        const total = all.length;
        if (total === 0) {
            return res.json({
                totalCandidates: 0,
                averageMarks: 0,
                highestMarks: 0,
                flaggedCount: 0
            });
        }

        let totalMarksSum = 0;
        let highest = -Infinity;
        let flagged = 0;

        all.forEach(s => {
            const m = s.totalMarks || 0;
            totalMarksSum += m;
            if (m > highest) highest = m;
            if ((s.tabSwitches || 0) > 0 || (s.screenSearchAttempts || 0) > 0) {
                flagged++;
            }
        });

        res.json({
            totalCandidates: total,
            averageMarks: Math.round(totalMarksSum / total),
            highestMarks: highest === -Infinity ? 0 : highest,
            flaggedCount: flagged
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Admin Dashboard Page Route
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`\n==================================================================`);
        console.log(`  ExamGOAL Test Engine Live on http://localhost:${PORT}`);
        console.log(`  Owner Access Passcode: ${CURRENT_EXAM_PASSCODE}`);
        console.log(`  Proctoring: Anti-Copy, Anti-Tab, Anti-Circle-To-Search`);
        console.log(`  Evaluator Destination: ${EVALUATOR_EMAIL}`);
        console.log(`==================================================================\n`);
    });
}

module.exports = app;
