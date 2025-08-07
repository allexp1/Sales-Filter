// Sales Filter v0.8 Chrome Extension - Background Service Worker

class SalesFilterBackground {
    constructor() {
        this.init();
    }

    init() {
        this.setupEventListeners();
        console.log('🎯 Sales Filter v0.8 Background Service Worker initialized');
    }

    setupEventListeners() {
        // Handle extension installation
        chrome.runtime.onInstalled.addListener((details) => {
            this.handleInstallation(details);
        });

        // Handle tab updates to potentially trigger analysis
        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            this.handleTabUpdate(tabId, changeInfo, tab);
        });

        // Handle messages from content scripts or popup
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            this.handleMessage(request, sender, sendResponse);
            return true; // Keep message channel open for async response
        });

        // Handle browser action click
        chrome.action.onClicked.addListener((tab) => {
            this.handleActionClick(tab);
        });
    }

    handleInstallation(details) {
        if (details.reason === 'install') {
            console.log('Sales Filter v0.8 installed successfully');
            
            // Set default settings
            chrome.storage.sync.set({
                autoAnalyze: true,
                showWidget: true,
                enabledPlatforms: {
                    linkedin: true,
                    github: true,
                    didww: true,
                    crunchbase: true,
                    generic: true
                },
                scoreThresholds: {
                    premium: 100,
                    high: 70,
                    medium: 40,
                    low: 0
                }
            });

            // Open welcome page
            chrome.tabs.create({
                url: chrome.runtime.getURL('welcome.html')
            });
        } else if (details.reason === 'update') {
            console.log(`Sales Filter updated from ${details.previousVersion} to v0.8`);
        }
    }

    async handleTabUpdate(tabId, changeInfo, tab) {
        // Only process when page is fully loaded
        if (changeInfo.status !== 'complete' || !tab.url) return;

        // Skip non-http(s) pages
        if (!tab.url.startsWith('http')) return;

        // Get user settings
        const settings = await this.getSettings();
        if (!settings.autoAnalyze) return;

        // Check if this is a relevant page type
        if (this.isRelevantPage(tab.url)) {
            // Small delay to ensure page is fully rendered
            setTimeout(() => {
                this.injectContentScript(tabId);
            }, 1000);
        }
    }

    isRelevantPage(url) {
        const relevantPatterns = [
            'linkedin.com/in/',
            'github.com/',
            'crunchbase.com/',
            'console.in.didww.com',
            '/contact',
            '/about',
            '/team',
            '/people'
        ];

        return relevantPatterns.some(pattern => url.includes(pattern));
    }

    async injectContentScript(tabId) {
        try {
            await chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: ['content.js']
            });

            await chrome.scripting.insertCSS({
                target: { tabId: tabId },
                files: ['styles.css']
            });

            console.log(`Sales Filter injected into tab ${tabId}`);
        } catch (error) {
            console.warn(`Failed to inject into tab ${tabId}:`, error);
        }
    }

    async handleMessage(request, sender, sendResponse) {
        switch (request.action) {
            case 'getSettings':
                const settings = await this.getSettings();
                sendResponse({ settings });
                break;

            case 'saveSettings':
                await this.saveSettings(request.settings);
                sendResponse({ success: true });
                break;

            case 'analyzeCurrentPage':
                if (sender.tab) {
                    await this.injectContentScript(sender.tab.id);
                    sendResponse({ success: true });
                } else {
                    sendResponse({ success: false, error: 'No active tab' });
                }
                break;

            case 'saveAnalysis':
                await this.saveAnalysisResult(request.data);
                sendResponse({ success: true });
                break;

            case 'getAnalysisHistory':
                const history = await this.getAnalysisHistory();
                sendResponse({ history });
                break;

            default:
                sendResponse({ success: false, error: 'Unknown action' });
        }
    }

    handleActionClick(tab) {
        // This is called when user clicks the extension icon
        // The popup will handle the interaction
        console.log('Extension icon clicked for tab:', tab.id);
    }

    async getSettings() {
        return new Promise((resolve) => {
            chrome.storage.sync.get([
                'autoAnalyze',
                'showWidget',
                'enabledPlatforms',
                'scoreThresholds'
            ], (result) => {
                resolve({
                    autoAnalyze: result.autoAnalyze ?? true,
                    showWidget: result.showWidget ?? true,
                    enabledPlatforms: result.enabledPlatforms ?? {
                        linkedin: true,
                        github: true,
                        didww: true,
                        crunchbase: true,
                        generic: true
                    },
                    scoreThresholds: result.scoreThresholds ?? {
                        premium: 100,
                        high: 70,
                        medium: 40,
                        low: 0
                    }
                });
            });
        });
    }

    async saveSettings(settings) {
        return new Promise((resolve) => {
            chrome.storage.sync.set(settings, () => {
                console.log('Settings saved:', settings);
                resolve();
            });
        });
    }

    async saveAnalysisResult(analysisData) {
        return new Promise((resolve) => {
            // Get existing history
            chrome.storage.local.get(['analysisHistory'], (result) => {
                const history = result.analysisHistory || [];
                
                // Add new analysis with timestamp
                const newAnalysis = {
                    ...analysisData,
                    id: Date.now(),
                    timestamp: new Date().toISOString()
                };
                
                history.unshift(newAnalysis);
                
                // Keep only last 100 analyses
                if (history.length > 100) {
                    history.splice(100);
                }
                
                // Save updated history
                chrome.storage.local.set({ analysisHistory: history }, () => {
                    console.log('Analysis result saved to history');
                    resolve();
                });
            });
        });
    }

    async getAnalysisHistory() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['analysisHistory'], (result) => {
                resolve(result.analysisHistory || []);
            });
        });
    }

    // Utility method to create notifications
    createNotification(title, message, type = 'basic') {
        chrome.notifications.create({
            type: type,
            iconUrl: 'icons/icon48.png',
            title: title,
            message: message
        });
    }

    // Handle context menu (if needed in future)
    setupContextMenu() {
        chrome.contextMenus.create({
            id: 'analyzeContact',
            title: 'Analyze with Sales Filter',
            contexts: ['selection', 'link']
        });

        chrome.contextMenus.onClicked.addListener((info, tab) => {
            if (info.menuItemId === 'analyzeContact') {
                this.injectContentScript(tab.id);
            }
        });
    }
}

// Initialize the background service worker
new SalesFilterBackground();