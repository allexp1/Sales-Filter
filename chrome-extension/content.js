// Sales Filter v0.8 Chrome Extension - Content Script
// Advanced OSINT Lead Scoring Engine

class SalesFilterExtractor {
    constructor() {
        this.extractedData = {};
        this.patterns = {
            email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
            phone: /(\+?\d{1,4}[-.\s]?)?(\(?\d{1,4}\)?[-.\s]?)?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g,
            name: /\b([A-Z][a-z]+ [A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
            company: /\b([A-Z][A-Za-z\s&,.-]{2,50}(?:Inc|LLC|Ltd|Corp|Company|Co\.|Corporation|Group|Services|Solutions|Technologies|Tech|Systems|Consulting|Partners|Associates|Enterprises|Industries|International|Global|Limited|Corporation|GmbH|AG|SA|BV|Oy|AB|AS|Sp\.\s*z\s*o\.o\.|S\.L\.|S\.A\.|Ltda\.|Pty\.|P\.L\.C\.))\b/g,
            jobTitle: /\b(CEO|CTO|CFO|COO|CMO|President|Vice President|VP|Director|Manager|Head of|Lead|Senior|Principal|Chief|Founder|Co-Founder|Owner|Partner)\b/gi,
            location: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*([A-Z]{2}|\w+)\b/g,
            domain: /https?:\/\/(?:www\.)?([a-zA-Z0-9-]+\.[a-zA-Z]{2,})/g
        };
        this.init();
    }

    init() {
        this.detectPageType();
        this.extractData();
        this.createScoreWidget();
        this.calculateScore();
    }

    detectPageType() {
        const url = window.location.href.toLowerCase();
        const hostname = window.location.hostname.toLowerCase();
        
        // Detect platform type for specialized extraction
        if (hostname.includes('linkedin.com')) {
            this.pageType = 'linkedin';
        } else if (hostname.includes('console.in.didww.com')) {
            this.pageType = 'didww_kyc';
        } else if (hostname.includes('crunchbase.com')) {
            this.pageType = 'crunchbase';
        } else if (hostname.includes('github.com')) {
            this.pageType = 'github';
        } else if (hostname.includes('facebook.com') || hostname.includes('fb.com')) {
            this.pageType = 'facebook';
        } else if (url.includes('contact') || url.includes('about') || url.includes('team')) {
            this.pageType = 'contact_page';
        } else {
            this.pageType = 'generic';
        }
        
        console.log('🎯 Sales Filter: Detected page type:', this.pageType);
    }

    extractData() {
        // Get page text content
        const pageText = document.body.innerText;
        const pageHTML = document.body.innerHTML;

        // Platform-specific extraction
        switch (this.pageType) {
            case 'didww_kyc':
                this.extractDIDWWData();
                break;
            case 'linkedin':
                this.extractLinkedInData();
                break;
            case 'crunchbase':
                this.extractCrunchbaseData();
                break;
            case 'github':
                this.extractGitHubData();
                break;
            default:
                this.extractGenericData(pageText, pageHTML);
        }
    }

    extractDIDWWData() {
        console.log('🔍 Extracting DIDWW KYC data...');
        
        // Extract from structured tables
        const identityTable = document.querySelector('#attributes_table_regulation_identity_342093');
        const addressTable = document.querySelector('#attributes_table_regulation_address_298382');
        const customerTable = document.querySelector('#attributes_table_kyc_verification_396702');
        const paymentsTable = document.querySelector('#payments-1 .index_table');

        if (identityTable) {
            this.extractedData.firstName = this.getTableValue(identityTable, 'First Name');
            this.extractedData.lastName = this.getTableValue(identityTable, 'Last Name');
            this.extractedData.email = this.getTableValue(identityTable, 'Contact Email');
            this.extractedData.phone = this.getTableValue(identityTable, 'Phone Number');
            this.extractedData.country = this.getTableValue(identityTable, 'Country');
            this.extractedData.companyName = this.getTableValue(identityTable, 'Company Name');
            this.extractedData.vatNumber = this.getTableValue(identityTable, 'VAT/TAX Number');
            this.extractedData.fraudStatus = this.getTableValue(identityTable, 'Fraud');
            this.extractedData.identityType = this.getTableValue(identityTable, 'Type');
        }

        if (addressTable) {
            this.extractedData.addressCountry = this.getTableValue(addressTable, 'Country');
            this.extractedData.state = this.getTableValue(addressTable, 'State/Province/Region');
            this.extractedData.city = this.getTableValue(addressTable, 'City Name');
            this.extractedData.address = this.getTableValue(addressTable, 'Address');
            this.extractedData.postalCode = this.getTableValue(addressTable, 'Postal Code');
        }

        if (customerTable) {
            this.extractedData.customerId = this.getTableValue(customerTable, 'Id');
            this.extractedData.username = this.getTableValue(customerTable, 'Username');
            this.extractedData.identityStatus = this.getTableValue(customerTable, 'Identity Status');
            this.extractedData.billingStatus = this.getTableValue(customerTable, 'Billing Status');
            this.extractedData.registeredAt = this.getTableValue(customerTable, 'Customer Registered At');
            this.extractedData.balance = this.getTableValue(customerTable, 'Balance');
            this.extractedData.credit = this.getTableValue(customerTable, 'Credit');
            this.extractedData.availableBalance = this.getTableValue(customerTable, 'Available Balance');
        }

        // Extract payment information
        if (paymentsTable) {
            const paymentRow = paymentsTable.querySelector('tbody tr');
            if (paymentRow) {
                this.extractedData.paymentAmount = this.getCellValue(paymentRow, 'col-amount');
                this.extractedData.paymentMethod = this.getCellValue(paymentRow, 'col-payment_method');
                this.extractedData.paymentStatus = this.getCellValue(paymentRow, 'col-status');
                this.extractedData.payerEmail = this.getCellValue(paymentRow, 'col-payer_email');
                this.extractedData.payerName = this.getCellValue(paymentRow, 'col-payer_name');
                this.extractedData.ccType = this.getCellValue(paymentRow, 'col-cc_type');
                this.extractedData.ccNumber = this.getCellValue(paymentRow, 'col-cc_number');
                this.extractedData.autoCharge = this.getCellValue(paymentRow, 'col-auto_charge');
            }
        }

        // Set industry context
        this.extractedData.industry = 'Telecommunications';
        this.extractedData.platform = 'DIDWW';
        this.extractedData.customerType = 'Telecom/VoIP';
        
        console.log('📊 Extracted DIDWW data:', this.extractedData);
    }

    extractLinkedInData() {
        console.log('🔍 Extracting LinkedIn data...');
        
        // LinkedIn profile extraction
        this.extractedData.name = this.querySelector('h1')?.textContent?.trim();
        this.extractedData.jobTitle = this.querySelector('.text-body-medium.break-words')?.textContent?.trim();
        this.extractedData.company = this.querySelector('button[aria-label*="Current company"]')?.textContent?.trim();
        this.extractedData.location = this.querySelector('.text-body-small.inline.t-black--light.break-words')?.textContent?.trim();
        
        // Extract from experience section
        const experienceSection = document.querySelector('#experience');
        if (experienceSection) {
            this.extractedData.experience = [];
            const jobs = experienceSection.querySelectorAll('li');
            jobs.forEach(job => {
                const title = job.querySelector('h3')?.textContent?.trim();
                const company = job.querySelector('h4')?.textContent?.trim();
                if (title && company) {
                    this.extractedData.experience.push({ title, company });
                }
            });
        }

        this.extractedData.platform = 'LinkedIn';
    }

    extractCrunchbaseData() {
        console.log('🔍 Extracting Crunchbase data...');
        
        this.extractedData.companyName = this.querySelector('h1')?.textContent?.trim();
        this.extractedData.industry = this.querySelector('[data-testid="categories"] span')?.textContent?.trim();
        this.extractedData.founded = this.querySelector('[data-testid="founded-date"]')?.textContent?.trim();
        this.extractedData.funding = this.querySelector('[data-testid="funding-total"]')?.textContent?.trim();
        this.extractedData.employeeCount = this.querySelector('[data-testid="employee-count"]')?.textContent?.trim();
        this.extractedData.platform = 'Crunchbase';
    }

    extractGitHubData() {
        console.log('🔍 Extracting GitHub data...');
        
        this.extractedData.name = this.querySelector('h1 span')?.textContent?.trim();
        this.extractedData.username = this.querySelector('h1 .p-nickname')?.textContent?.trim();
        this.extractedData.company = this.querySelector('[itemprop="worksFor"]')?.textContent?.trim();
        this.extractedData.location = this.querySelector('[itemprop="homeLocation"]')?.textContent?.trim();
        this.extractedData.repositories = document.querySelectorAll('[data-testid="repositories-tab"] .Counter')?.textContent?.trim();
        this.extractedData.followers = document.querySelectorAll('a[href*="/followers"] .text-bold')?.textContent?.trim();
        this.extractedData.platform = 'GitHub';
        this.extractedData.isDeveloper = true;
    }

    extractGenericData(pageText, pageHTML) {
        console.log('🔍 Extracting generic page data...');
        
        // Extract using regex patterns
        this.extractedData.emails = [...new Set(pageText.match(this.patterns.email) || [])];
        this.extractedData.phones = [...new Set(pageText.match(this.patterns.phone) || [])];
        this.extractedData.names = [...new Set(pageText.match(this.patterns.name) || [])];
        this.extractedData.companies = [...new Set(pageText.match(this.patterns.company) || [])];
        this.extractedData.jobTitles = [...new Set(pageText.match(this.patterns.jobTitle) || [])];
        this.extractedData.locations = [...new Set(pageText.match(this.patterns.location) || [])];
        
        // Extract primary contact info
        if (this.extractedData.emails.length > 0) {
            this.extractedData.email = this.extractedData.emails[0];
        }
        if (this.extractedData.names.length > 0) {
            this.extractedData.name = this.extractedData.names[0];
        }
        if (this.extractedData.companies.length > 0) {
            this.extractedData.company = this.extractedData.companies[0];
        }

        // Extract domain from URL
        const domain = window.location.hostname.replace('www.', '');
        this.extractedData.domain = domain;
        
        this.extractedData.platform = 'Generic Web Page';
    }

    getTableValue(table, label) {
        const row = Array.from(table.querySelectorAll('tr')).find(tr => 
            tr.querySelector('th')?.textContent?.trim() === label
        );
        return row?.querySelector('td')?.textContent?.trim()?.replace('Empty', '') || '';
    }

    getCellValue(row, className) {
        return row.querySelector(`.${className}`)?.textContent?.trim() || '';
    }

    querySelector(selector) {
        return document.querySelector(selector);
    }

    calculateScore() {
        console.log('🧮 Calculating lead score...');
        
        let score = 0;
        let reasons = [];
        let intelligenceData = {};

        // Extract domain from email
        let domain = '';
        if (this.extractedData.email) {
            domain = this.extractedData.email.split('@')[1] || '';
        } else if (this.extractedData.domain) {
            domain = this.extractedData.domain;
        }

        // Advanced Email Intelligence (0-35 points)
        const emailScore = this.analyzeEmailPattern(this.extractedData.email);
        score += emailScore.score;
        if (emailScore.reasons) reasons.push(emailScore.reasons);
        intelligenceData.emailPatternScore = emailScore.score;

        // Name-Email Consistency (0-10 points)  
        const consistencyScore = this.analyzeNameEmailConsistency(this.extractedData.name, this.extractedData.email);
        score += consistencyScore.score;
        if (consistencyScore.reasons) reasons.push(consistencyScore.reasons);
        intelligenceData.consistencyScore = consistencyScore.score;

        // Executive Detection (0-25 points)
        const executiveScore = this.detectExecutiveIndicators(this.extractedData);
        score += executiveScore.score;
        if (executiveScore.reasons) reasons.push(executiveScore.reasons);
        intelligenceData.executiveScore = executiveScore.score;

        // Technical Professional Detection (0-15 points)
        const techScore = this.detectTechnicalProfessional(this.extractedData);
        score += techScore.score;
        if (techScore.reasons) reasons.push(techScore.reasons);
        intelligenceData.technicalScore = techScore.score;

        // Industry Vertical Detection (0-20 points)
        const industryScore = this.detectIndustryVertical(this.extractedData, domain);
        score += industryScore.score;
        if (industryScore.reasons) reasons.push(industryScore.reasons);
        intelligenceData.industryScore = industryScore.score;
        intelligenceData.detectedIndustry = industryScore.industry;

        // Geographic Intelligence (0-15 points)
        const geoScore = this.analyzeGeographicIntelligence(domain, this.extractedData);
        score += geoScore.score;
        if (geoScore.reasons) reasons.push(geoScore.reasons);
        intelligenceData.geographicScore = geoScore.score;

        // Platform-specific bonuses
        const platformScore = this.calculatePlatformBonus();
        score += platformScore.score;
        if (platformScore.reasons) reasons.push(platformScore.reasons);

        // Verification Status Bonus (DIDWW specific)
        if (this.pageType === 'didww_kyc') {
            const verificationScore = this.calculateVerificationBonus();
            score += verificationScore.score;
            if (verificationScore.reasons) reasons.push(verificationScore.reasons);
        }

        // Cap score between -50 and 150
        score = Math.max(-50, Math.min(150, score));

        this.scoreData = {
            score: Math.round(score),
            reasons: reasons.filter(r => r).join(', '),
            intelligenceData,
            extractedData: this.extractedData,
            pageType: this.pageType,
            calculatedAt: new Date().toISOString()
        };

        console.log('📊 Final Score:', this.scoreData);
    }

    analyzeEmailPattern(email) {
        if (!email || !email.includes('@')) return { score: 0, reasons: '' };

        const [localPart, domain] = email.split('@');
        let score = 0;
        const reasons = [];

        // Professional email format patterns
        if (localPart.includes('.')) {
            const parts = localPart.split('.');
            if (parts.length === 2) {
                const [first, last] = parts;
                if (2 <= first.length <= 15 && 2 <= last.length <= 15) {
                    if (/^[a-zA-Z]+$/.test(first) && /^[a-zA-Z]+$/.test(last)) {
                        score += 15;
                        reasons.push('Professional firstname.lastname format (+15)');
                    } else if (first.length === 1 && /^[a-zA-Z]+$/.test(last)) {
                        score += 12;
                        reasons.push('Professional f.lastname format (+12)');
                    }
                }
            }
        }

        // Executive role emails
        const executiveRoles = ['ceo', 'president', 'director', 'vp', 'vice.president'];
        const managementRoles = ['manager', 'lead', 'head', 'supervisor', 'chief'];
        
        if (executiveRoles.some(role => localPart.toLowerCase().includes(role))) {
            score += 20;
            reasons.push('Executive role email (+20)');
        } else if (managementRoles.some(role => localPart.toLowerCase().includes(role))) {
            score += 15;
            reasons.push('Management role email (+15)');
        }

        // Generic/negative emails
        const genericEmails = ['info', 'contact', 'sales', 'support', 'hello'];
        const negativeEmails = ['noreply', 'no.reply', 'donotreply', 'automated'];

        if (genericEmails.some(generic => localPart.toLowerCase().includes(generic))) {
            score -= 5;
            reasons.push('Generic email address (-5)');
        } else if (negativeEmails.some(negative => localPart.toLowerCase().includes(negative))) {
            score -= 15;
            reasons.push('Automated email address (-15)');
        }

        return { score, reasons: reasons.join(', ') };
    }

    analyzeNameEmailConsistency(name, email) {
        if (!name || !email || !email.includes('@')) return { score: 0, reasons: '' };

        const localPart = email.split('@')[0].toLowerCase();
        const nameParts = name.toLowerCase().split(' ').filter(p => p.length > 1);
        let score = 0;
        const reasons = [];

        if (nameParts.length >= 2) {
            const firstName = nameParts[0];
            const lastName = nameParts[nameParts.length - 1];

            if (`${firstName}.${lastName}` === localPart) {
                score += 10;
                reasons.push('Perfect name-email match (+10)');
            } else if (`${firstName[0]}.${lastName}` === localPart) {
                score += 8;
                reasons.push('Initial.lastname match (+8)');
            } else if (nameParts.some(part => localPart.includes(part))) {
                score += 5;
                reasons.push('Name components in email (+5)');
            }
        }

        return { score, reasons: reasons.join(', ') };
    }

    detectExecutiveIndicators(data) {
        let score = 0;
        const reasons = [];

        // Check name and job title for executive indicators
        const text = `${data.name || ''} ${data.jobTitle || ''}`.toLowerCase();
        const executiveTitles = ['ceo', 'cto', 'cfo', 'president', 'vice president', 'vp', 'founder', 'director'];
        const managementTitles = ['manager', 'head of', 'lead', 'senior', 'principal'];

        if (executiveTitles.some(title => text.includes(title))) {
            score += 25;
            reasons.push('Executive title detected (+25)');
        } else if (managementTitles.some(title => text.includes(title))) {
            score += 15;
            reasons.push('Management title detected (+15)');
        }

        return { score, reasons: reasons.join(', ') };
    }

    detectTechnicalProfessional(data) {
        let score = 0;
        const reasons = [];

        // Check for technical indicators
        if (this.pageType === 'github' || data.isDeveloper) {
            score += 15;
            reasons.push('GitHub profile - technical professional (+15)');
        }

        const techKeywords = ['developer', 'engineer', 'programmer', 'architect', 'devops', 'tech'];
        const text = `${data.name || ''} ${data.jobTitle || ''} ${data.company || ''}`.toLowerCase();

        if (techKeywords.some(keyword => text.includes(keyword))) {
            score += 12;
            reasons.push('Technical role indicators (+12)');
        }

        return { score, reasons: reasons.join(', ') };
    }

    detectIndustryVertical(data, domain) {
        let score = 0;
        const reasons = [];
        let industry = 'Unknown';

        // Telecom industry (highest value)
        if (this.pageType === 'didww_kyc' || data.platform === 'DIDWW') {
            score += 30;
            reasons.push('Telecom industry customer (+30)');
            industry = 'Telecommunications';
        }

        const telecomKeywords = ['telecom', 'telco', 'voip', 'sip', 'did', 'phone', 'call'];
        const text = `${data.company || ''} ${domain}`.toLowerCase();

        if (telecomKeywords.some(keyword => text.includes(keyword))) {
            score += 20;
            reasons.push('Telecom industry indicators (+20)');
            industry = 'Telecommunications';
        }

        // Technology sector
        const techKeywords = ['tech', 'software', 'saas', 'cloud', 'ai', 'data'];
        if (techKeywords.some(keyword => text.includes(keyword))) {
            score += 15;
            reasons.push('Technology sector (+15)');
            if (industry === 'Unknown') industry = 'Technology';
        }

        return { score, reasons: reasons.join(', '), industry };
    }

    analyzeGeographicIntelligence(domain, data) {
        let score = 0;
        const reasons = [];

        // High-value geographic regions for telecom
        const premiumCountries = ['germany', 'netherlands', 'switzerland', 'austria', 'sweden'];
        const goodCountries = ['singapore', 'canada', 'australia', 'united kingdom', 'france'];
        
        const country = (data.country || data.addressCountry || '').toLowerCase();

        if (premiumCountries.some(c => country.includes(c))) {
            score += 15;
            reasons.push('Premium telecom-friendly region (+15)');
        } else if (goodCountries.some(c => country.includes(c))) {
            score += 10;
            reasons.push('Business-friendly region (+10)');
        }

        // TLD analysis
        if (domain) {
            const premiumTlds = ['.de', '.nl', '.ch', '.at', '.se'];
            const goodTlds = ['.sg', '.ca', '.au', '.uk', '.fr'];

            if (premiumTlds.some(tld => domain.endsWith(tld))) {
                score += 12;
                reasons.push('Premium geographic TLD (+12)');
            } else if (goodTlds.some(tld => domain.endsWith(tld))) {
                score += 8;
                reasons.push('Good geographic TLD (+8)');
            }
        }

        return { score, reasons: reasons.join(', ') };
    }

    calculatePlatformBonus() {
        let score = 0;
        const reasons = [];

        switch (this.pageType) {
            case 'linkedin':
                score += 10;
                reasons.push('LinkedIn professional profile (+10)');
                break;
            case 'github':
                score += 8;
                reasons.push('GitHub developer profile (+8)');
                break;
            case 'crunchbase':
                score += 12;
                reasons.push('Crunchbase company profile (+12)');
                break;
            case 'didww_kyc':
                score += 25;
                reasons.push('DIDWW verified customer (+25)');
                break;
        }

        return { score, reasons: reasons.join(', ') };
    }

    calculateVerificationBonus() {
        let score = 0;
        const reasons = [];

        if (this.extractedData.billingStatus === 'Verified') {
            score += 15;
            reasons.push('Verified billing status (+15)');
        }

        if (this.extractedData.fraudStatus === 'NO') {
            score += 10;
            reasons.push('No fraud indicators (+10)');
        }

        if (this.extractedData.balance && parseFloat(this.extractedData.balance.replace(/[$,]/g, '')) > 0) {
            score += 8;
            reasons.push('Active account with balance (+8)');
        }

        if (this.extractedData.paymentAmount && parseFloat(this.extractedData.paymentAmount.replace(/[$,]/g, '')) > 50) {
            score += 12;
            reasons.push('Significant payment history (+12)');
        }

        return { score, reasons: reasons.join(', ') };
    }

    createScoreWidget() {
        // Remove existing widget
        const existing = document.getElementById('sales-filter-widget');
        if (existing) existing.remove();

        // Create floating widget
        const widget = document.createElement('div');
        widget.id = 'sales-filter-widget';
        widget.innerHTML = `
            <div class="sf-header">
                <div class="sf-logo">🎯 Sales Filter v0.8</div>
                <button class="sf-close" onclick="this.parentElement.parentElement.style.display='none'">×</button>
            </div>
            <div class="sf-content">
                <div class="sf-score-container">
                    <div class="sf-score" id="sf-score">--</div>
                    <div class="sf-score-label">Lead Score</div>
                </div>
                <div class="sf-details" id="sf-details">
                    <div class="sf-loading">Analyzing page...</div>
                </div>
                <div class="sf-data" id="sf-data"></div>
            </div>
        `;

        document.body.appendChild(widget);

        // Update with calculated score
        setTimeout(() => {
            this.updateWidget();
        }, 1000);
    }

    updateWidget() {
        const scoreElement = document.getElementById('sf-score');
        const detailsElement = document.getElementById('sf-details');
        const dataElement = document.getElementById('sf-data');

        if (!this.scoreData) return;

        // Update score
        scoreElement.textContent = this.scoreData.score;
        scoreElement.className = this.getScoreClass(this.scoreData.score);

        // Update details
        const quality = this.getScoreQuality(this.scoreData.score);
        detailsElement.innerHTML = `
            <div class="sf-quality ${quality.class}">${quality.label}</div>
            <div class="sf-reasons">${this.scoreData.reasons}</div>
        `;

        // Update extracted data
        const keyData = this.getKeyDataPoints();
        dataElement.innerHTML = keyData.map(item => 
            `<div class="sf-data-item"><strong>${item.label}:</strong> ${item.value}</div>`
        ).join('');
    }

    getScoreClass(score) {
        if (score >= 100) return 'sf-score-premium';
        if (score >= 70) return 'sf-score-high';
        if (score >= 40) return 'sf-score-medium';
        if (score >= 0) return 'sf-score-low';
        return 'sf-score-negative';
    }

    getScoreQuality(score) {
        if (score >= 100) return { label: 'Premium Quality Lead', class: 'premium' };
        if (score >= 70) return { label: 'High Quality Lead', class: 'high' };
        if (score >= 40) return { label: 'Medium Quality Lead', class: 'medium' };
        if (score >= 0) return { label: 'Low Quality Lead', class: 'low' };
        return { label: 'Problematic/Sanctioned', class: 'negative' };
    }

    getKeyDataPoints() {
        const data = [];
        if (this.extractedData.email) data.push({ label: 'Email', value: this.extractedData.email });
        if (this.extractedData.name) data.push({ label: 'Name', value: this.extractedData.name });
        if (this.extractedData.company || this.extractedData.companyName) {
            data.push({ label: 'Company', value: this.extractedData.company || this.extractedData.companyName });
        }
        if (this.extractedData.country) data.push({ label: 'Country', value: this.extractedData.country });
        if (this.extractedData.industry) data.push({ label: 'Industry', value: this.extractedData.industry });
        if (this.extractedData.jobTitle) data.push({ label: 'Title', value: this.extractedData.jobTitle });
        if (this.extractedData.balance) data.push({ label: 'Balance', value: this.extractedData.balance });
        if (this.extractedData.platform) data.push({ label: 'Platform', value: this.extractedData.platform });
        
        return data.slice(0, 8); // Limit to top 8 data points
    }
}

// Initialize the extension when the page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new SalesFilterExtractor();
    });
} else {
    new SalesFilterExtractor();
}