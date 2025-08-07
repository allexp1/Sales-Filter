// Sales Filter v0.8 Chrome Extension - Popup Script

class PopupController {
    constructor() {
        this.currentData = null;
        this.init();
    }

    async init() {
        await this.loadCurrentPageData();
        this.setupEventListeners();
    }

    async loadCurrentPageData() {
        try {
            // Get the active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            // Execute script to get the score data from content script
            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                function: () => {
                    // Try to get data from the existing SalesFilterExtractor instance
                    if (window.salesFilterExtractor && window.salesFilterExtractor.scoreData) {
                        return window.salesFilterExtractor.scoreData;
                    }
                    
                    // If no existing instance, trigger a new analysis
                    return null;
                }
            });

            const scoreData = results[0]?.result;

            if (scoreData) {
                this.currentData = scoreData;
                this.displayResults();
            } else {
                // Trigger content script analysis
                await this.triggerAnalysis(tab.id);
            }

        } catch (error) {
            console.error('Failed to load page data:', error);
            this.showError('Unable to analyze the current page');
        }
    }

    async triggerAnalysis(tabId) {
        try {
            // Inject and execute the content script
            await chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: ['content.js']
            });

            // Wait a bit for analysis to complete
            setTimeout(async () => {
                const results = await chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    function: () => {
                        return window.salesFilterExtractor ? window.salesFilterExtractor.scoreData : null;
                    }
                });

                const scoreData = results[0]?.result;
                if (scoreData) {
                    this.currentData = scoreData;
                    this.displayResults();
                } else {
                    this.showError('No analyzable data found on this page');
                }
            }, 2000);

        } catch (error) {
            console.error('Failed to trigger analysis:', error);
            this.showError('Analysis failed');
        }
    }

    displayResults() {
        const loadingDiv = document.getElementById('loading');
        const resultsDiv = document.getElementById('results');
        const errorDiv = document.getElementById('error');

        loadingDiv.style.display = 'none';
        errorDiv.style.display = 'none';
        resultsDiv.style.display = 'block';

        // Update score display
        this.updateScoreDisplay();
        this.updateIntelligenceGrid();
        this.updateDataGrid();
    }

    updateScoreDisplay() {
        const scoreValue = document.getElementById('score-value');
        const qualityBadge = document.getElementById('quality-badge');

        if (!this.currentData) return;

        const score = this.currentData.score || 0;
        scoreValue.textContent = score;
        scoreValue.className = `current-score ${this.getScoreClass(score)}`;

        const quality = this.getScoreQuality(score);
        qualityBadge.textContent = quality.label;
        qualityBadge.className = `quality-badge ${quality.class}`;
    }

    updateIntelligenceGrid() {
        const grid = document.getElementById('intelligence-grid');
        if (!this.currentData?.intelligenceData) return;

        const intelligence = this.currentData.intelligenceData;
        const items = [];

        if (intelligence.emailPatternScore !== undefined) {
            items.push({ label: 'Email Intelligence', value: `+${intelligence.emailPatternScore}` });
        }
        if (intelligence.executiveScore !== undefined && intelligence.executiveScore > 0) {
            items.push({ label: 'Executive Level', value: `+${intelligence.executiveScore}` });
        }
        if (intelligence.technicalScore !== undefined && intelligence.technicalScore > 0) {
            items.push({ label: 'Technical Pro', value: `+${intelligence.technicalScore}` });
        }
        if (intelligence.industryScore !== undefined) {
            items.push({ label: 'Industry Match', value: `+${intelligence.industryScore}` });
        }
        if (intelligence.geographicScore !== undefined) {
            items.push({ label: 'Geographic', value: `+${intelligence.geographicScore}` });
        }
        if (intelligence.detectedIndustry) {
            items.push({ label: 'Industry', value: intelligence.detectedIndustry });
        }

        grid.innerHTML = items.map(item => `
            <div class="info-item">
                <span class="info-label">${item.label}</span>
                <span class="info-value">${item.value}</span>
            </div>
        `).join('');
    }

    updateDataGrid() {
        const grid = document.getElementById('data-grid');
        if (!this.currentData?.extractedData) return;

        const data = this.currentData.extractedData;
        const items = [];

        if (data.email) items.push({ label: 'Email', value: data.email });
        if (data.name || (data.firstName && data.lastName)) {
            const name = data.name || `${data.firstName} ${data.lastName}`.trim();
            items.push({ label: 'Name', value: name });
        }
        if (data.company || data.companyName) {
            items.push({ label: 'Company', value: data.company || data.companyName });
        }
        if (data.jobTitle) items.push({ label: 'Title', value: data.jobTitle });
        if (data.country || data.addressCountry) {
            items.push({ label: 'Country', value: data.country || data.addressCountry });
        }
        if (data.phone) items.push({ label: 'Phone', value: data.phone });
        if (data.platform) items.push({ label: 'Platform', value: data.platform });
        if (data.balance) items.push({ label: 'Balance', value: data.balance });
        if (data.industry) items.push({ label: 'Industry', value: data.industry });

        // Limit to top 8 items
        const displayItems = items.slice(0, 8);

        grid.innerHTML = displayItems.map(item => `
            <div class="info-item">
                <span class="info-label">${item.label}</span>
                <span class="info-value">${this.truncateText(item.value, 20)}</span>
            </div>
        `).join('');
    }

    setupEventListeners() {
        document.getElementById('refresh-btn')?.addEventListener('click', () => {
            this.refreshAnalysis();
        });

        document.getElementById('export-btn')?.addEventListener('click', () => {
            this.exportData();
        });

        document.getElementById('settings-btn')?.addEventListener('click', () => {
            this.openSettings();
        });
    }

    async refreshAnalysis() {
        const loadingDiv = document.getElementById('loading');
        const resultsDiv = document.getElementById('results');

        resultsDiv.style.display = 'none';
        loadingDiv.style.display = 'block';

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        await this.triggerAnalysis(tab.id);
    }

    exportData() {
        if (!this.currentData) return;

        const exportData = {
            timestamp: new Date().toISOString(),
            url: window.location.href,
            score: this.currentData.score,
            quality: this.getScoreQuality(this.currentData.score).label,
            reasons: this.currentData.reasons,
            extractedData: this.currentData.extractedData,
            intelligenceData: this.currentData.intelligenceData
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { 
            type: 'application/json' 
        });
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sales-filter-analysis-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);

        this.showSuccess('Analysis data exported successfully');
    }

    openSettings() {
        // Open the extension's options page
        chrome.runtime.openOptionsPage();
    }

    showError(message) {
        const loadingDiv = document.getElementById('loading');
        const resultsDiv = document.getElementById('results');
        const errorDiv = document.getElementById('error');

        loadingDiv.style.display = 'none';
        resultsDiv.style.display = 'none';
        errorDiv.style.display = 'block';
        
        errorDiv.querySelector('div').textContent = message;
    }

    showSuccess(message) {
        // Create a temporary success message
        const successDiv = document.createElement('div');
        successDiv.className = 'success';
        successDiv.textContent = message;
        
        const content = document.querySelector('.content');
        content.insertBefore(successDiv, content.firstChild);

        setTimeout(() => {
            successDiv.remove();
        }, 3000);
    }

    getScoreClass(score) {
        if (score >= 100) return 'sf-score-premium';
        if (score >= 70) return 'sf-score-high';
        if (score >= 40) return 'sf-score-medium';
        if (score >= 0) return 'sf-score-low';
        return 'sf-score-negative';
    }

    getScoreQuality(score) {
        if (score >= 100) return { label: 'Premium Quality', class: 'premium' };
        if (score >= 70) return { label: 'High Quality', class: 'high' };
        if (score >= 40) return { label: 'Medium Quality', class: 'medium' };
        if (score >= 0) return { label: 'Low Quality', class: 'low' };
        return { label: 'Problematic', class: 'negative' };
    }

    truncateText(text, maxLength) {
        if (!text || text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }
}

// Initialize the popup when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new PopupController();
});