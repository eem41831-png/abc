// functions/index.js - Firebase Cloud Function entry point for ExamGOAL API
const functions = require("firebase-functions");
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { MongoClient } = require("mongodb");
const nodemailer = require("nodemailer");
const path = require("path");
const fs = require("fs");

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || "examgoal_quantum_secure_jwt_key_2026";
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://eem41831_db_user:iyqvtKvKRlJuMtVs@cluster0.o1b2ccj.mongodb.net/?retryWrites=true&w=majority&connectTimeoutMS=10000";
const EVALUATOR_EMAIL = process.env.EVALUATOR_EMAIL || "shan01tnu@gmail.com";
let CURRENT_EXAM_PASSCODE = process.env.EXAM_PASSCODE || "ORGANIC2026";

app.use(cors({ origin: true }));
app.use(express.json({ limit: "10mb" }));

let mongoClient = null;
let mongoDb = null;

async function getDB() {
    if (mongoDb) return mongoDb;
    try {
        if (!mongoClient) {
            mongoClient = new MongoClient(MONGO_URI);
            await mongoClient.connect();
        }
        mongoDb = mongoClient.db("examgoal");
        return mongoDb;
    } catch (err) {
        console.warn("MongoDB connection warning:", err.message);
        return null;
    }
}

async function getAllQuestions() {
    const db = await getDB();
    if (db) {
        try {
            const docs = await db.collection("questions").find({}).toArray();
            if (docs && docs.length >= 75) return docs;
        } catch (e) {
            console.warn("Error fetching questions from DB:", e.message);
        }
    }
    const backupPath = path.join(__dirname, "questions.json");
    if (fs.existsSync(backupPath)) {
        return JSON.parse(fs.readFileSync(backupPath, "utf-8"));
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
    const authHeader = req.headers["authorization"];
    if (!authHeader) return res.status(401).json({ error: "Missing authorization token" });
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: "Session expired or invalid. Please sign in again." });
    }
}

// ----------------- AUTH & CODE VERIFICATION -----------------
app.post("/api/auth/candidate", (req, res) => {
    const { name, email, rollNo } = req.body;
    if (!name || !email) {
        return res.status(400).json({ error: "Candidate name and email are required" });
    }
    const token = jwt.sign(
        { name: name.trim(), email: email.trim().toLowerCase(), rollNo: (rollNo || "N/A").trim() },
        JWT_SECRET,
        { expiresIn: "24h" }
    );
    res.json({
        success: true,
        token,
        candidate: { name: name.trim(), email: email.trim().toLowerCase(), rollNo }
    });
});

app.post("/api/test/verify-code", requireAuth, (req, res) => {
    const { accessCode } = req.body;
    if (!accessCode || accessCode.trim().toUpperCase() !== CURRENT_EXAM_PASSCODE.trim().toUpperCase()) {
        return res.status(403).json({
            success: false,
            error: "Incorrect Exam Access Code. Please ask the test owner for the active passkey."
        });
    }
    res.json({ success: true, message: "Access Code Verified." });
});

app.get("/api/owner/code", (req, res) => {
    res.json({ currentPasscode: CURRENT_EXAM_PASSCODE });
});

app.post("/api/owner/set-code", (req, res) => {
    const { newCode } = req.body;
    if (newCode && newCode.trim().length >= 4) {
        CURRENT_EXAM_PASSCODE = newCode.trim().toUpperCase();
        return res.json({ success: true, passcode: CURRENT_EXAM_PASSCODE });
    }
    res.status(400).json({ error: "Invalid passcode format" });
});

// ----------------- TEST ENGINE -----------------
app.post("/api/test/start", requireAuth, async (req, res) => {
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

        const shuffledAll = shuffle(allQuestions);
        const selected75 = shuffledAll.slice(0, Math.min(75, shuffledAll.length));
        const finalShuffled = shuffle(selected75);
        const testSessionId = `SESSION_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

        const db = await getDB();
        if (db) {
            await db.collection("active_sessions").updateOne(
                { testSessionId },
                { $set: { testSessionId, candidate: req.user, questions: finalShuffled, startTime: Date.now() } },
                { upsert: true }
            );
        }

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
            durationMinutes: 180,
            totalQuestions: sanitizedForClient.length,
            questions: sanitizedForClient
        });
    } catch (e) {
        res.status(500).json({ error: "Failed to generate test session: " + e.message });
    }
});

app.post("/api/test/submit", requireAuth, async (req, res) => {
    const { testSessionId, answers, tabSwitches, screenSearchAttempts, timeTakenSeconds } = req.body;

    const db = await getDB();
    let session = null;
    if (db) {
        session = await db.collection("active_sessions").findOne({ testSessionId });
    }

    if (!session) {
        return res.status(400).json({ error: "Test session not found or already submitted." });
    }

    const { candidate, questions } = session;
    if (db) {
        await db.collection("active_sessions").deleteOne({ testSessionId }).catch(() => {});
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
        const candidateAns = (answers[testQId] || "").toString().trim().toUpperCase();
        const correctAns = (q.correctAnswer || "").toString().trim().toUpperCase();

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
        const candidateAns = (answers[testQId] || "").toString().trim().toUpperCase();
        const correctAns = (q.correctAnswer || "").toString().trim().toUpperCase();
        const isAttempted = Boolean(candidateAns);
        const isCorrect = isAttempted && (candidateAns === correctAns);
        const marksAwarded = !isAttempted ? 0 : (isCorrect ? 4 : -1);

        return {
            testQId,
            chapter: q.chapter,
            questionType: q.questionType,
            questionSnippet: (q.question || "").slice(0, 160).replace(/\n/g, " "),
            candidateAnswer: candidateAns || "UNATTEMPTED",
            correctAnswer: correctAns,
            isAttempted,
            isCorrect,
            marksAwarded
        };
    });

    const submissionRecord = {
        testSessionId,
        submittedAt: new Date().toISOString(),
        candidate,
        totalQuestions,
        maxMarks,
        totalMarks,
        correctCount,
        incorrectCount,
        unattemptedCount,
        accuracyPercent: accuracy,
        timeTakenSeconds: timeTakenSeconds || 0,
        tabSwitches: tabSwitches || 0,
        screenSearchAttempts: screenSearchAttempts || 0,
        chapterBreakdown: chapterStats,
        userResponses
    };

    if (db) {
        try {
            await db.collection("submissions").insertOne(submissionRecord);
        } catch (dbErr) {
            console.error("DB Insert Error:", dbErr.message);
        }
    }

    // Email Dispatcher
    try {
        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: "shantnu026@gmail.com",
                pass: "cgyr pyuk jnck yxfx"
            }
        });

        await transporter.sendMail({
            from: '"ExamGOAL Evaluator System" <shantnu026@gmail.com>',
            to: EVALUATOR_EMAIL,
            subject: `[EXAM SCORECARD] Candidate: ${candidate.name} | Marks: ${totalMarks}/${maxMarks}`,
            html: `<h2>Candidate: ${candidate.name} (${candidate.email})</h2>
                   <p><b>Total Score:</b> ${totalMarks} / ${maxMarks}</p>
                   <p><b>Rights:</b> ${correctCount} | <b>Wrongs:</b> ${incorrectCount} | <b>Total:</b> ${totalQuestions}</p>
                   <p><b>Proctoring:</b> Tab Switches: ${tabSwitches || 0}, Circle-to-Search Flags: ${screenSearchAttempts || 0}</p>`
        });
    } catch (mailErr) {
        console.warn("Mail dispatch error:", mailErr.message);
    }

    res.json({
        success: true,
        message: "Your responses have been securely submitted and logged. Best wishes for your upcoming JEE examination!",
        status: "SEALED_AND_DISPATCHED",
        candidateName: candidate.name
    });
});

app.post("/api/session/report-violation", requireAuth, (req, res) => {
    res.json({ acknowledged: true });
});

// ----------------- ADMIN DASHBOARD API -----------------
app.get("/api/admin/submissions", async (req, res) => {
    try {
        const db = await getDB();
        if (db) {
            const list = await db.collection("submissions")
                .find({})
                .project({
                    testSessionId: 1,
                    submittedAt: 1,
                    candidate: 1,
                    totalMarks: 1,
                    maxMarks: 1,
                    correctCount: 1,
                    incorrectCount: 1,
                    unattemptedCount: 1,
                    accuracyPercent: 1,
                    tabSwitches: 1,
                    screenSearchAttempts: 1
                })
                .sort({ submittedAt: -1 })
                .toArray();
            return res.json({ success: true, count: list.length, submissions: list });
        }
        res.json({ success: true, count: 0, submissions: [] });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get("/api/admin/submissions/:sessionId", async (req, res) => {
    try {
        const db = await getDB();
        if (db) {
            const item = await db.collection("submissions").findOne({ testSessionId: req.params.sessionId });
            if (item) return res.json({ success: true, submission: item });
        }
        res.status(404).json({ error: "Submission not found" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get("/api/admin/stats", async (req, res) => {
    try {
        const db = await getDB();
        let all = [];
        if (db) {
            all = await db.collection("submissions").find({}).toArray();
        }
        const total = all.length;
        if (total === 0) {
            return res.json({ totalCandidates: 0, averageMarks: 0, highestMarks: 0, flaggedCount: 0 });
        }
        let totalMarksSum = 0;
        let highest = -Infinity;
        let flagged = 0;
        all.forEach(s => {
            const m = s.totalMarks || 0;
            totalMarksSum += m;
            if (m > highest) highest = m;
            if ((s.tabSwitches || 0) > 0 || (s.screenSearchAttempts || 0) > 0) flagged++;
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

exports.api = functions.https.onRequest(app);
