# ExamGoal Question Fetcher & MCP Integration

This tool suite connects directly to your active Google Chrome browser over the Chrome DevTools Protocol (CDP) to fetch questions, choices, formulas (LaTeX), and solutions for any topic from ExamGoal.

---

## Quick Start (3 Steps)

### 1. Launch Chrome with Debugging
Double-click or run:
```cmd
e:\DSA\abc\examgoal\launch_chrome.bat
```
*(or run `launch_chrome.ps1` in PowerShell)*

This opens Google Chrome with remote debugging on port `9222` and navigates to [room.examgoal.com](https://room.examgoal.com).

### 2. Log In & Open Your Topic
- In that Chrome window, log in to ExamGoal with your account.
- Navigate to the exam, chapter, or topic you want questions from (e.g. JEE Main, NEET, etc.).

### 3. Fetch the Questions
You have two ways to fetch:

#### A. Tell Antigravity in Chat:
> *"Fetch questions for topic: [Your Topic Name]"*

Antigravity uses the registered `examgoal` MCP tools to inspect the active tab and extract the questions.

#### B. Or Run via Terminal:
```bash
node e:\DSA\abc\examgoal\fetch_questions.js --topic "Kinematics"
```

All extracted questions will be saved as clean Markdown files in:
`e:\DSA\abc\examgoal_questions\<Topic_Name>.md`

---

## File Overview
- `launch_chrome.bat` / `launch_chrome.ps1`: One-click scripts to open Chrome with remote debugging.
- `cdp_client.js`: Fast native WebSocket client to interact with Chrome tabs.
- `extractor.js`: In-browser DOM parsing for questions, KaTeX LaTeX math, diagrams, and options.
- `fetch_questions.js`: Command-line tool to pull questions and save to Markdown.
- `examgoal_mcp_server.js`: Standard MCP server registered in `~/.gemini/config/mcp_config.json`.
