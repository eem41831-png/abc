// cdp_client.js - Zero-dependency Chrome DevTools Protocol client using native Node.js
class CDPClient {
    constructor(host = '127.0.0.1', port = 9222) {
        this.host = host;
        this.port = port;
        this.ws = null;
        this.messageId = 1;
        this.pendingRequests = new Map();
    }

    async isConnectedToDebugPort() {
        try {
            const res = await fetch(`http://${this.host}:${this.port}/json/version`, { signal: AbortSignal.timeout(1500) });
            return res.ok;
        } catch {
            return false;
        }
    }

    async getTabs() {
        const res = await fetch(`http://${this.host}:${this.port}/json`);
        if (!res.ok) throw new Error(`Failed to list tabs: ${res.statusText}`);
        return await res.json();
    }

    async findExamGoalTab() {
        const tabs = await this.getTabs();
        const pageTabs = tabs.filter(t => t.type === 'page');
        const examGoalTab = pageTabs.find(t => t.url && t.url.includes('examgoal.com'));
        return examGoalTab || pageTabs[0] || null;
    }

    async connectToTab(webSocketUrl) {
        if (this.ws) {
            this.ws.close();
        }
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(webSocketUrl);
            this.ws = ws;

            ws.onopen = () => {
                resolve();
            };

            ws.onerror = (err) => {
                reject(err);
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.id && this.pendingRequests.has(data.id)) {
                        const { resolve, reject } = this.pendingRequests.get(data.id);
                        this.pendingRequests.delete(data.id);
                        if (data.error) {
                            reject(new Error(data.error.message || JSON.stringify(data.error)));
                        } else {
                            resolve(data.result);
                        }
                    }
                } catch (e) {
                    // Ignore non-json or events
                }
            };

            ws.onclose = () => {
                this.ws = null;
            };
        });
    }

    async send(method, params = {}) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            throw new Error("WebSocket connection to Chrome is not open");
        }
        const id = this.messageId++;
        return new Promise((resolve, reject) => {
            this.pendingRequests.set(id, { resolve, reject });
            this.ws.send(JSON.stringify({ id, method, params }));
        });
    }

    async evaluate(expression) {
        const res = await this.send("Runtime.evaluate", {
            expression,
            returnByValue: true,
            awaitPromise: true
        });
        if (res.exceptionDetails) {
            const errStr = res.exceptionDetails.exception ? (res.exceptionDetails.exception.description || res.exceptionDetails.exception.value) : res.exceptionDetails.text;
            throw new Error(errStr || "JS evaluation exception");
        }
        return res.result ? res.result.value : null;
    }

    async navigate(url) {
        return await this.send("Page.navigate", { url });
    }

    close() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}

module.exports = { CDPClient };
