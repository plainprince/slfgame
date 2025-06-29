class I18n {
    constructor() {
        this.translations = {};
        this.currentLanguage = 'de'; // Default to German
        this.initialized = false;
    }

    async init() {
        try {
            const response = await fetch('/i18n.json');
            this.translations = await response.json();
            this.initialized = true;

            // Check if language is stored in localStorage
            const savedLang = localStorage.getItem('gameLanguage');
            if (savedLang && this.translations[savedLang]) {
                this.currentLanguage = savedLang;
            } else {
                // Auto-detect language if not saved
                this.currentLanguage = await this.detectLanguage();
            }

            this.updatePage();
            this.createLanguageSelector();
        } catch (error) {
            console.error('Failed to load translations:', error);
        }
    }

    async detectLanguage() {
        try {
            // First try to detect by IP geolocation
            const geoLanguage = await this.detectLanguageByIP();
            if (geoLanguage) {
                console.log('Language detected by IP:', geoLanguage);
                return geoLanguage;
            }
        } catch (error) {
            console.log('IP-based language detection failed:', error);
        }

        // Fallback to browser language detection
        const browserLanguage = this.detectLanguageByBrowser();
        console.log('Language detected by browser:', browserLanguage);
        return browserLanguage;
    }

    async detectLanguageByIP() {
        try {
            // Use a free IP geolocation service with timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

            const response = await fetch('https://ipapi.co/json/', {
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) throw new Error('IP API failed');

            const data = await response.json();
            const countryCode = data.country_code;

            // Map country codes to languages
            const countryToLanguage = {
                // Deutschsprachige Länder
                'DE': 'de', // Deutschland
                'AT': 'de', // Österreich
                'CH': 'de', // Schweiz (deutschsprachiger Teil)
                'LI': 'de', // Liechtenstein

                // Englischsprachige Länder (Standard)
                'US': 'en', 'GB': 'en', 'CA': 'en', 'AU': 'en', 'NZ': 'en',
                'IE': 'en', 'ZA': 'en', 'IN': 'en', 'SG': 'en', 'MY': 'en',
                'PH': 'en', 'HK': 'en', 'NG': 'en', 'KE': 'en', 'GH': 'en',

                // Russischsprachige Länder
                'RU': 'ru', // Russland
                'BY': 'ru', // Belarus
                'KZ': 'ru', // Kasachstan
                'KG': 'ru', // Kirgisistan
                'UA': 'ru', // Ukraine (teilweise, optional)
            };

            return countryToLanguage[countryCode] || this.detectLanguageByBrowser();
        } catch (error) {
            throw error;
        }
    }

    detectLanguageByBrowser() {
        // Get browser language preferences
        const browserLangs = navigator.languages || [navigator.language || navigator.userLanguage];

        for (const lang of browserLangs) {
            const langCode = lang.toLowerCase().split('-')[0]; // Get main language code

            if (langCode === 'de') {
                return 'de';
            } else if (langCode === 'en') {
                return 'en';
            }
        }

        // Default to German as it's the original game
        return 'de';
    }

    setLanguage(lang) {
        if (this.translations[lang]) {
            this.currentLanguage = lang;
            localStorage.setItem('gameLanguage', lang);
            this.updatePage();

            // Update dropdown selection
            const dropdown = document.getElementById('languageSelect');
            if (dropdown) {
                dropdown.value = lang;
            }

            // Trigger custom event for other scripts to react to language change
            window.dispatchEvent(new CustomEvent('languageChanged', {
                detail: { language: lang, translations: this.translations[lang] }
            }));
        }
    }

    t(key, params = {}) {
        if (!this.initialized) return key;

        const keys = key.split('.');
        let value = this.translations[this.currentLanguage];

        for (const k of keys) {
            if (value && typeof value === 'object') {
                value = value[k];
            } else {
                return key; // Return key if translation not found
            }
        }

        let result = value || key;
        
        // Replace template placeholders
        if (typeof result === 'string' && Object.keys(params).length > 0) {
            Object.keys(params).forEach(param => {
                result = result.replace(new RegExp(`\\{${param}\\}`, 'g'), params[param]);
            });
        }

        return result;
    }

    updatePage() {
        // Update elements with data-i18n attribute
        document.querySelectorAll('[data-i18n]').forEach(element => {
            const key = element.getAttribute('data-i18n');
            element.textContent = this.t(key);
        });

        // Update placeholders
        document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
            const key = element.getAttribute('data-i18n-placeholder');
            element.placeholder = this.t(key);
        });

        // Update values
        document.querySelectorAll('[data-i18n-value]').forEach(element => {
            const key = element.getAttribute('data-i18n-value');
            element.value = this.t(key);
        });

        // Update titles
        document.querySelectorAll('[data-i18n-title]').forEach(element => {
            const key = element.getAttribute('data-i18n-title');
            element.title = this.t(key);
        });

        // Update document title
        const titleElement = document.querySelector('title');
        if (titleElement && titleElement.hasAttribute('data-i18n')) {
            titleElement.textContent = this.t(titleElement.getAttribute('data-i18n'));
        }
    }

    createLanguageSelector() {
        // Check if language selector already exists
        if (document.querySelector('.language-selector')) return;

        const selector = document.createElement('div');
        selector.className = 'language-selector';
        selector.innerHTML = /*html*/ `
            <select class="lang-dropdown" id="languageSelect">
                <option value="de" ${this.currentLanguage === 'de' ? 'selected' : ''}>🇩🇪 Deutsch</option>
                <option value="en" ${this.currentLanguage === 'en' ? 'selected' : ''}>🇺🇸 English</option>
                <option value="es" ${this.currentLanguage === 'es' ? 'selected' : ''}>🇪🇸 Español</option>
                <option value="fr" ${this.currentLanguage === 'fr' ? 'selected' : ''}>🇫🇷 Français</option>
                <option value="it" ${this.currentLanguage === 'it' ? 'selected' : ''}>🇮🇹 Italiano</option>
                <option value="ru" ${this.currentLanguage === 'ru' ? 'selected' : ''}>🇷🇺 Русский</option>
            </select>
        `;

        // Add styles
        const style = document.createElement('style');
        style.textContent = /*css*/ `
            .language-selector {
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 1000;
            }
            .lang-dropdown {
                padding: 8px 12px;
                border: 2px solid #ddd;
                background: white;
                border-radius: 6px;
                cursor: pointer;
                font-size: 14px;
                transition: all 0.2s;
                outline: none;
                min-width: 120px;
            }
            .lang-dropdown:hover {
                border-color: #007bff;
                background: #f8f9fa;
            }
            .lang-dropdown:focus {
                border-color: #007bff;
                box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.1);
            }
        `;
        document.head.appendChild(style);

        // Add event listener
        const dropdown = selector.querySelector('.lang-dropdown');
        dropdown.addEventListener('change', (e) => {
            const lang = e.target.value;
            this.setLanguage(lang);
        });

        document.body.appendChild(selector);
    }

    getDefaultCategories() {
        return Object.values(this.t('defaultCategories') || {});
    }

    getCurrentLanguage() {
        return this.currentLanguage;
    }
}

// Create global instance
window.i18n = new I18n(); 