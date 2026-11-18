#!/usr/bin/env node
// examgoal_mcp_server.js - Stdio Model Context Protocol (MCP) server for ExamGoal Chrome automation
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const { CDPClient } = require('./cdp_client');
const { extractionScript } = require('./extractor');

const TOOLS = [
    {
        name: "examgoal_check_connection",
        description: "Checks if Chrome is running with remote debugging on port 9222 and inspects open ExamGoal tabs.",
        inputSchema: {
            type: "object",
            properties: {}
        }
    },
    {
        name: "examgoal_navigate",
        description: "Navigates the open Chrome tab to an ExamGoal URL (e.g. room.examgoal.com or a specific test/topic).",
        inputSchema: {
            type: "object",
            properties: {
                url: {
                    type: "string",
                    description: "The full URL to navigate to, e.g. https://room.examgoal.com"
                }
            },
            required: ["url"]
        }
    },
    {
        name: "examgoal_fetch_questions",
        description: "Extracts questions, formulas, options, and solutions from the active ExamGoal tab in Chrome.",
        inputSchema: {
            type: "object",
            properties: {
                topic: {
                    type: "string",
                    description: "Optional topic or chapter name to label the questions with."
                },
                save_to_markdown: {
                    type: "boolean",
                    description: "Whether to automatically save the questions to a Markdown file in the examgoal_questions folder (default: true)."
                }
            }
        }
    }
];

const cdp = new CDPClient('127.0.0.1', 9222);

async function handleToolCall(name, args) {
    if (name === "examgoal_check_connection") {
        const isUp = await cdp.isConnectedToDebugPort();
        if (!isUp) {
            return {
                content: [{
                    type: "text",
                    text: "Chrome is NOT connected on port 9222.\nPlease run 'launch_chrome.bat' in 'e:\\DSA\\abc\\examgoal\\' to start Chrome with remote debugging."
                }]
            };
        }
        const tabs = await cdp.getTabs();
        const pageTabs = tabs.filter(t => t.type === 'page');
        const examGoalTabs = pageTabs.filter(t => t.url && t.url.includes('examgoal.com'));

        let report = `Chrome is running with remote debugging active on port 9222.\n`;
        report += `Total open page tabs: ${pageTabs.length}\n`;
        if (examGoalTabs.length > 0) {
            report += `\nExamGoal tab detected:\n`;
            examGoalTabs.forEach(t => {
                report += `- "${t.title}": ${t.url}\n`;
            });
        } else {
            report += `\nNo ExamGoal tab is currently open. Available tabs:\n`;
            pageTabs.forEach(t => {
                report += `- "${t.title}": ${t.url}\n`;
            });
        }
        return {
            content: [{ type: "text", text: report }]
        };
    }

    if (name === "examgoal_navigate") {
        const isUp = await cdp.isConnectedToDebugPort();
        if (!isUp) {
            return {
                isError: true,
                content: [{
                    type: "text",
                    text: "Chrome is not running on port 9222. Run launch_chrome.bat first."
                }]
            };
        }
        const tab = await cdp.findExamGoalTab();
        if (!tab) {
            return {
                isError: true,
                content: [{ type: "text", text: "No active tab found in Chrome." }]
            };
        }
        await cdp.connectToTab(tab.webSocketDebuggerUrl);
        await cdp.navigate(args.url);
        cdp.close();
        return {
            content: [{
                type: "text",
                text: `Navigated Chrome tab "${tab.title}" to ${args.url}`
            }]
        };
    }

    if (name === "examgoal_fetch_questions") {
        const isUp = await cdp.isConnectedToDebugPort();
        if (!isUp) {
            return {
                isError: true,
                content: [{
                    type: "text",
                    text: "Chrome is not running on port 9222. Please run launch_chrome.bat first."
                }]
            };
        }
        const tab = await cdp.findExamGoalTab();
        if (!tab) {
            return {
                isError: true,
                content: [{ type: "text", text: "No open tab found in Chrome." }]
            };
        }

        await cdp.connectToTab(tab.webSocketDebuggerUrl);
        const data = await cdp.evaluate(extractionScript);
        cdp.close();

        if (!data || !data.questions || data.questions.length === 0) {
            return {
                content: [{
                    type: "text",
                    text: `ExamGoal tab found ("${tab.title}"), but no questions were detected on the page. Please ensure a test or practice room is loaded.`
                }]
            };
        }

        const topic = args.topic || 'ExamGoal_Questions';
        const saveToFile = args.save_to_markdown !== false;
        let filePath = '';

        if (saveToFile) {
            const safeTopic = topic.replace(/[^a-zA-Z0-9_\-]/g, '_');
            const outputDir = path.resolve(__dirname, '..', 'examgoal_questions');
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }
            filePath = path.join(outputDir, `${safeTopic}.md`);

            let md = `# ExamGoal Questions: ${topic}\n\n`;
            md += `- **Source URL**: [${data.title}](${data.url})\n`;
            md += `- **Extracted At**: ${new Date().toLocaleString()}\n`;
            md += `- **Total Questions**: ${data.questions.length}\n\n---\n\n`;

            data.questions.forEach((q, idx) => {
                md += `### Question ${q.index || idx + 1}`;
                if (q.meta) md += ` *(${q.meta})*`;
                md += `\n\n${q.question}\n\n`;

                if (q.options && q.options.length > 0) {
                    md += `**Options:**\n`;
                    q.options.forEach((opt, optIdx) => {
                        const label = String.fromCharCode(65 + optIdx);
                        md += `- **(${label})** ${opt}\n`;
                    });
                    md += `\n`;
                }

                if (q.solution) {
                    md += `<details>\n<summary><b>View Solution</b></summary>\n\n${q.solution}\n\n</details>\n\n`;
                }
                md += `---\n\n`;
            });

            fs.writeFileSync(filePath, md, 'utf-8');
        }

        let summary = `Fetched ${data.questions.length} questions from ExamGoal tab "${data.title}".\n`;
        if (filePath) {
            summary += `Saved to: ${filePath}\n\n`;
        }
        summary += `First question preview:\n${data.questions[0].question.slice(0, 300)}...`;

        return {
            content: [{
                type: "text",
                text: summary
            }]
        };
    }

    throw new Error(`Unknown tool: ${name}`);
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});

rl.on('line', async (line) => {
    if (!line.trim()) return;
    try {
        const msg = JSON.parse(line);
        const { id, method, params } = msg;

        if (method === "initialize") {
            const response = {
                jsonrpc: "2.0",
                id,
                result: {
                    protocolVersion: "2024-11-05",
                    capabilities: {
                        tools: {}
                    },
                    serverInfo: {
                        name: "examgoal-mcp",
                        version: "1.0.0"
                    }
                }
            };
            process.stdout.write(JSON.stringify(response) + '\n');
            return;
        }

        if (method === "notifications/initialized") {
            return;
        }

        if (method === "tools/list") {
            const response = {
                jsonrpc: "2.0",
                id,
                result: {
                    tools: TOOLS
                }
            };
            process.stdout.write(JSON.stringify(response) + '\n');
            return;
        }

        if (method === "tools/call") {
            try {
                const result = await handleToolCall(params.name, params.arguments || {});
                const response = {
                    jsonrpc: "2.0",
                    id,
                    result
                };
                process.stdout.write(JSON.stringify(response) + '\n');
            } catch (err) {
                const response = {
                    jsonrpc: "2.0",
                    id,
                    result: {
                        isError: true,
                        content: [{ type: "text", text: err.message || String(err) }]
                    }
                };
                process.stdout.write(JSON.stringify(response) + '\n');
            }
            return;
        }

        if (id) {
            process.stdout.write(JSON.stringify({
                jsonrpc: "2.0",
                id,
                error: { code: -32601, message: "Method not found" }
            }) + '\n');
        }
    } catch (e) {
        // Parse error
    }
});
