class PortfolioOS {
    constructor() {
        this.activeWindows = new Set();
        this.windowZIndex = 1000; // Start with higher base z-index
        this.windowLayerOrder = []; // Track window order for proper layering
        this.recentlyClosedWindows = new Set();
        this.notebookInitialized = false; // Track notebook initialization
        
        // Asset caching system
        this.svgCache = new Map();
        this.cacheMetrics = {
            hits: 0,
            misses: 0,
            errors: 0,
            totalSize: 0
        };
        this.maxCacheSize = 5 * 1024 * 1024; // 5MB cache limit
        this.maxCacheAge = 30 * 60 * 1000; // 30 minutes
        
        // Performance monitoring
        this.performanceMetrics = {
            startTime: performance.now(),
            memoryUsage: [],
            loadTimes: [],
            errors: [],
            domNodes: 0,
            activeTimers: new Set(),
            activeIntervals: new Set()
        };

        // Weather API configuration
        this.weatherAPI = {
            key: '4dcaa969c9e943a7a5213336251008',
            baseUrl: 'https://api.weatherapi.com/v1/current.json',
            city: 'Seattle'
        };
        
        // Cache weather data for 10 minutes
        this.weatherCache = {
            data: null,
            timestamp: 0,
            duration: 10 * 60 * 1000 // 10 minutes in milliseconds
        };
        
        this.init();
        this.checkBrowserCompatibility();
        this.startPerformanceMonitoring();
    }

    init() {
        this.updateTime();
        this.setupEventListeners();
        this.animateSkillBars();
        this.loadSavedWallpaper();
        
        // Update time every minute
        setInterval(() => this.updateTime(), 60000);
        
        // Setup cleanup on page unload
        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });
    }

    // Cache management methods
    getCachedSVG(assetPath) {
        const cacheKey = assetPath.toLowerCase();
        const cached = this.svgCache.get(cacheKey);
        
        if (!cached) {
            this.cacheMetrics.misses++;
            return null;
        }
        
        // Check if cache entry is expired
        if (Date.now() - cached.timestamp > this.maxCacheAge) {
            this.svgCache.delete(cacheKey);
            this.cacheMetrics.misses++;
            return null;
        }
        
        this.cacheMetrics.hits++;
        return cached.content;
    }
    
    setCachedSVG(assetPath, content) {
        try {
            const cacheKey = assetPath.toLowerCase();
            const size = new Blob([content]).size;
            
            // Check cache size limits
            if (this.cacheMetrics.totalSize + size > this.maxCacheSize) {
                this.evictOldestCacheEntries();
            }
            
            this.svgCache.set(cacheKey, {
                content,
                timestamp: Date.now(),
                size,
                accessCount: 1
            });
            
            this.cacheMetrics.totalSize += size;
            
        } catch (error) {
            console.warn('Failed to cache SVG:', error);
        }
    }
    
    evictOldestCacheEntries() {
        const entries = Array.from(this.svgCache.entries());
        entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
        
        // Remove oldest 25% of entries
        const toRemove = Math.ceil(entries.length * 0.25);
        
        for (let i = 0; i < toRemove && i < entries.length; i++) {
            const [key, value] = entries[i];
            this.svgCache.delete(key);
            this.cacheMetrics.totalSize -= value.size;
        }
        
        console.log(`Cache eviction: removed ${toRemove} entries, ${(this.cacheMetrics.totalSize/1024).toFixed(2)}KB remaining`);
    }
    
    getCacheStats() {
        return {
            ...this.cacheMetrics,
            entries: this.svgCache.size,
            totalSizeKB: (this.cacheMetrics.totalSize / 1024).toFixed(2),
            hitRatio: this.cacheMetrics.hits / (this.cacheMetrics.hits + this.cacheMetrics.misses) || 0
        };
    }
    
    // File existence validation
    async validateFileExists(filePath, timeout = 3000) {
        const pathsToCheck = [
            `Avatar creator/${filePath}`,
            `./Avatar creator/${filePath}`,
            filePath.includes('/') ? filePath : `Avatar creator/${filePath}`
        ];
        
        for (const path of pathsToCheck) {
            try {
                // Use HEAD request to check existence without downloading content
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), timeout);
                
                const response = await fetch(path, {
                    method: 'HEAD',
                    signal: controller.signal,
                    cache: 'no-cache'
                });
                
                clearTimeout(timeoutId);
                
                if (response.ok) {
                    return { exists: true, path, size: response.headers.get('content-length') };
                }
                
            } catch (error) {
                // Continue to next path if this one fails
                console.log(`File check failed for ${path}:`, error.message);
            }
        }
        
        console.warn(`File not found: ${filePath}`);
        return { exists: false, path: null };
    }
    
    // Batch file existence validation
    async validateMultipleFiles(filePaths, concurrency = 3) {
        const results = new Map();
        const batches = [];
        
        // Create batches to limit concurrent requests
        for (let i = 0; i < filePaths.length; i += concurrency) {
            batches.push(filePaths.slice(i, i + concurrency));
        }
        
        for (const batch of batches) {
            const promises = batch.map(async (filePath) => {
                const result = await this.validateFileExists(filePath);
                return { filePath, result };
            });
            
            const batchResults = await Promise.allSettled(promises);
            
            batchResults.forEach(({ status, value }) => {
                if (status === 'fulfilled' && value) {
                    results.set(value.filePath, value.result);
                }
            });
        }
        
        return results;
    }
    
    // Optimized SVG loading with concurrent requests
    async loadMultipleSVGs(assetPaths, options = {}) {
        const { 
            concurrency = 3,
            failFast = false,
            prevalidate = false,
            timeout = 10000
        } = options;
        
        if (prevalidate) {
            const validation = await this.validateMultipleFiles(assetPaths, concurrency);
            const validPaths = assetPaths.filter(path => validation.get(path)?.exists);
        }
        
        const results = new Map();
        const batches = [];
        
        // Create concurrent batches
        for (let i = 0; i < assetPaths.length; i += concurrency) {
            batches.push(assetPaths.slice(i, i + concurrency));
        }
        
        for (const [batchIndex, batch] of batches.entries()) {
            
            const promises = batch.map(async (assetPath) => {
                const startTime = performance.now();
                try {
                    const content = await Promise.race([
                        this.loadSVGFile(assetPath),
                        new Promise((_, reject) => 
                            setTimeout(() => reject(new Error('Timeout')), timeout)
                        )
                    ]);
                    
                    const loadTime = performance.now() - startTime;
                    return { 
                        assetPath, 
                        success: true, 
                        content, 
                        loadTime,
                        size: new Blob([content]).size
                    };
                } catch (error) {
                    const loadTime = performance.now() - startTime;
                    return { 
                        assetPath, 
                        success: false, 
                        error: error.message, 
                        loadTime
                    };
                }
            });
            
            const batchResults = await Promise.allSettled(promises);
            
            let successCount = 0;
            let failCount = 0;
            
            batchResults.forEach(({ status, value }) => {
                if (status === 'fulfilled' && value) {
                    results.set(value.assetPath, value);
                    if (value.success) {
                        successCount++;
                    } else {
                        failCount++;
                        if (failFast) {
                            throw new Error(`Batch loading failed: ${value.error}`);
                        }
                    }
                } else {
                    failCount++;
                }
            });
            
            console.log(`Batch ${batchIndex + 1} complete: ${successCount} success, ${failCount} failed`);
        }
        
        const summary = {
            total: assetPaths.length,
            successful: Array.from(results.values()).filter(r => r.success).length,
            failed: Array.from(results.values()).filter(r => !r.success).length,
            totalSize: Array.from(results.values())
                .filter(r => r.success)
                .reduce((sum, r) => sum + (r.size || 0), 0),
            avgLoadTime: Array.from(results.values())
                .reduce((sum, r) => sum + r.loadTime, 0) / results.size
        };
        
        console.log('SVG batch loading complete:', summary);
        return { results, summary };
    }
    
    // Performance monitoring and memory leak prevention
    startPerformanceMonitoring() {
        // Monitor memory usage every 30 seconds
        const memoryInterval = setInterval(() => {
            this.collectMemoryMetrics();
        }, 30000);
        this.performanceMetrics.activeIntervals.add(memoryInterval);
        
        // Check for memory leaks every 2 minutes
        const leakCheckInterval = setInterval(() => {
            this.checkForMemoryLeaks();
        }, 120000);
        this.performanceMetrics.activeIntervals.add(leakCheckInterval);
        
        // DOM node monitoring every minute
        const domInterval = setInterval(() => {
            this.performanceMetrics.domNodes = document.querySelectorAll('*').length;
        }, 60000);
        this.performanceMetrics.activeIntervals.add(domInterval);
        
        // Global error tracking
        window.addEventListener('error', (error) => {
            this.logError('Global Error', error.error || error.message, error.filename, error.lineno);
        });
        
        window.addEventListener('unhandledrejection', (event) => {
            this.logError('Unhandled Promise', event.reason, event.type);
        });
        
        console.log('Performance monitoring started');
    }
    
    collectMemoryMetrics() {
        try {
            if (performance.memory) {
                const memory = {
                    timestamp: Date.now(),
                    used: performance.memory.usedJSHeapSize,
                    total: performance.memory.totalJSHeapSize,
                    limit: performance.memory.jsHeapSizeLimit
                };
                
                this.performanceMetrics.memoryUsage.push(memory);
                
                // Keep only last 50 measurements
                if (this.performanceMetrics.memoryUsage.length > 50) {
                    this.performanceMetrics.memoryUsage.shift();
                }
                
                // Check for memory warnings
                const usageRatio = memory.used / memory.limit;
                if (usageRatio > 0.8) {
                    console.warn('High memory usage detected:', (usageRatio * 100).toFixed(1) + '%');
                    this.cleanupResources();
                }
            }
        } catch (error) {
            console.warn('Failed to collect memory metrics:', error);
        }
    }
    
    checkForMemoryLeaks() {
        try {
            // Check cache size growth
            const cacheSize = this.cacheMetrics.totalSize;
            if (cacheSize > this.maxCacheSize * 0.9) {
                console.warn('Cache size approaching limit:', (cacheSize / 1024 / 1024).toFixed(2) + 'MB');
                this.evictOldestCacheEntries();
            }
            
            // Check DOM node growth
            const currentNodes = document.querySelectorAll('*').length;
            if (currentNodes > this.performanceMetrics.domNodes + 1000) {
                console.warn('DOM node count increased significantly:', currentNodes);
            }
            this.performanceMetrics.domNodes = currentNodes;
            
            // Check for orphaned event listeners
            this.cleanupOrphanedListeners();
            
        } catch (error) {
            console.warn('Memory leak check failed:', error);
        }
    }
    
    cleanupResources() {
        try {
            // Clear expired cache entries
            const now = Date.now();
            for (const [key, value] of this.svgCache.entries()) {
                if (now - value.timestamp > this.maxCacheAge) {
                    this.svgCache.delete(key);
                    this.cacheMetrics.totalSize -= value.size;
                }
            }
            
            // Force garbage collection if available
            if (window.gc) {
                window.gc();
            }
            
            console.log('Resource cleanup completed');
            
        } catch (error) {
            console.warn('Resource cleanup failed:', error);
        }
    }
    
    cleanupOrphanedListeners() {
        try {
            // Remove listeners from removed DOM elements
            const activeWindows = document.querySelectorAll('.window');
            const activeIcons = document.querySelectorAll('.icon');
            
            if (activeWindows.length === 0 && activeIcons.length === 0) {
                console.warn('No active UI elements found - potential memory leak');
            }
            
        } catch (error) {
            console.warn('Orphaned listener cleanup failed:', error);
        }
    }
    
    logError(type, error, source = '', line = 0) {
        const errorEntry = {
            timestamp: Date.now(),
            type,
            message: error.toString(),
            source,
            line,
            stack: error.stack || 'No stack trace'
        };
        
        this.performanceMetrics.errors.push(errorEntry);
        this.cacheMetrics.errors++;
        
        // Keep only last 100 errors
        if (this.performanceMetrics.errors.length > 100) {
            this.performanceMetrics.errors.shift();
        }
        
        console.error(`[${type}]`, error, source ? `at ${source}:${line}` : '');
    }
    
    getPerformanceReport() {
        const uptime = performance.now() - this.performanceMetrics.startTime;
        const avgMemory = this.performanceMetrics.memoryUsage.reduce((sum, m) => sum + m.used, 0) / 
                         (this.performanceMetrics.memoryUsage.length || 1);
        
        return {
            uptime: Math.round(uptime / 1000) + 's',
            memoryUsage: {
                current: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) + 'MB' : 'N/A',
                average: Math.round(avgMemory / 1024 / 1024) + 'MB',
                samples: this.performanceMetrics.memoryUsage.length
            },
            cache: this.getCacheStats(),
            errors: {
                total: this.performanceMetrics.errors.length,
                recent: this.performanceMetrics.errors.slice(-10)
            },
            domNodes: this.performanceMetrics.domNodes,
            activeTimers: this.performanceMetrics.activeTimers.size,
            activeIntervals: this.performanceMetrics.activeIntervals.size
        };
    }
    
    // Override timer/interval methods to track active ones
    createTimer(callback, delay) {
        const timer = setTimeout(() => {
            this.performanceMetrics.activeTimers.delete(timer);
            callback();
        }, delay);
        this.performanceMetrics.activeTimers.add(timer);
        return timer;
    }
    
    createInterval(callback, delay) {
        const interval = setInterval(callback, delay);
        this.performanceMetrics.activeIntervals.add(interval);
        return interval;
    }
    
    clearTimer(timer) {
        clearTimeout(timer);
        this.performanceMetrics.activeTimers.delete(timer);
    }
    
    clearInterval(interval) {
        clearInterval(interval);
        this.performanceMetrics.activeIntervals.delete(interval);
    }
    
    // Cleanup method for when page unloads
    cleanup() {
        try {
            // Clear all active timers and intervals
            this.performanceMetrics.activeTimers.forEach(timer => clearTimeout(timer));
            this.performanceMetrics.activeIntervals.forEach(interval => clearInterval(interval));
            
            // Clear cache
            this.svgCache.clear();
            
            // Remove global listeners
            window.removeEventListener('error', this.logError);
            window.removeEventListener('unhandledrejection', this.logError);
            
            console.log('Portfolio OS cleanup completed');
            
        } catch (error) {
            console.warn('Cleanup failed:', error);
        }
    }
    
    // Browser compatibility and graceful degradation
    checkBrowserCompatibility() {
        const features = {
            fetch: typeof fetch === 'function',
            promises: typeof Promise === 'function',
            asyncAwait: this.checkAsyncAwaitSupport(),
            classes: this.checkClassSupport(),
            arrow: this.checkArrowFunctionSupport(),
            destructuring: this.checkDestructuringSupport(),
            templateLiterals: this.checkTemplateLiteralSupport(),
            modules: 'modules' in document.createElement('script'),
            performanceAPI: 'performance' in window && 'now' in performance,
            memoryAPI: 'memory' in performance,
            abortController: typeof AbortController === 'function',
            intersectionObserver: 'IntersectionObserver' in window,
            requestAnimationFrame: 'requestAnimationFrame' in window,
            localStorage: this.checkLocalStorageSupport(),
            webAudio: 'AudioContext' in window || 'webkitAudioContext' in window,
            canvas: this.checkCanvasSupport(),
            svg: this.checkSVGSupport()
        };
        
        const unsupported = Object.entries(features)
            .filter(([feature, supported]) => !supported)
            .map(([feature]) => feature);
            
        if (unsupported.length > 0) {
            console.warn('Unsupported browser features detected:', unsupported);
            this.setupFallbacks(features);
        } else {
            console.log('Browser compatibility check passed');
        }
        
        this.browserFeatures = features;
        return features;
    }
    
    checkAsyncAwaitSupport() {
        try {
            new Function('async () => {}');
            return true;
        } catch (e) {
            return false;
        }
    }
    
    checkClassSupport() {
        try {
            new Function('class TestClass {}');
            return true;
        } catch (e) {
            return false;
        }
    }
    
    checkArrowFunctionSupport() {
        try {
            new Function('() => {}');
            return true;
        } catch (e) {
            return false;
        }
    }
    
    checkDestructuringSupport() {
        try {
            new Function('const {a} = {a: 1}');
            return true;
        } catch (e) {
            return false;
        }
    }
    
    checkTemplateLiteralSupport() {
        try {
            new Function('const a = `test`');
            return true;
        } catch (e) {
            return false;
        }
    }
    
    checkLocalStorageSupport() {
        try {
            const test = 'localStorage-test';
            localStorage.setItem(test, test);
            localStorage.removeItem(test);
            return true;
        } catch (e) {
            return false;
        }
    }
    
    checkCanvasSupport() {
        try {
            const canvas = document.createElement('canvas');
            return !!(canvas.getContext && canvas.getContext('2d'));
        } catch (e) {
            return false;
        }
    }
    
    checkSVGSupport() {
        return document.implementation.hasFeature('http://www.w3.org/TR/SVG11/feature#BasicStructure', '1.1');
    }
    
    setupFallbacks(features) {
        // Fetch polyfill
        if (!features.fetch) {
            console.log('Adding fetch polyfill');
            this.polyfillFetch();
        }
        
        // Promise polyfill
        if (!features.promises) {
            console.log('Adding Promise polyfill');
            this.polyfillPromise();
        }
        
        // Performance API fallback
        if (!features.performanceAPI) {
            console.log('Adding performance API fallback');
            window.performance = { now: () => Date.now() };
        }
        
        // AbortController fallback
        if (!features.abortController) {
            console.log('Adding AbortController fallback');
            this.polyfillAbortController();
        }
        
        // RequestAnimationFrame fallback
        if (!features.requestAnimationFrame) {
            console.log('Adding requestAnimationFrame fallback');
            window.requestAnimationFrame = callback => setTimeout(callback, 16);
        }
        
        // Canvas fallback for download functionality
        if (!features.canvas) {
            console.warn('Canvas not supported - download functionality will be limited');
            this.disableDownloadFeature();
        }
        
        // SVG fallback
        if (!features.svg) {
            console.warn('SVG not supported - using simplified graphics');
            this.setupSVGFallback();
        }
    }
    
    polyfillFetch() {
        window.fetch = function(url, options = {}) {
            return new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open(options.method || 'GET', url);
                
                xhr.onload = () => {
                    resolve({
                        ok: xhr.status >= 200 && xhr.status < 300,
                        status: xhr.status,
                        text: () => Promise.resolve(xhr.responseText),
                        headers: {
                            get: (header) => xhr.getResponseHeader(header)
                        }
                    });
                };
                
                xhr.onerror = () => reject(new Error('Network error'));
                xhr.send(options.body);
            });
        };
    }
    
    polyfillPromise() {
        // Basic Promise polyfill for very old browsers
        if (typeof Promise === 'undefined') {
            window.Promise = function(executor) {
                const self = this;
                self.state = 'pending';
                self.value = undefined;
                self.handlers = [];
                
                function resolve(value) {
                    if (self.state === 'pending') {
                        self.state = 'fulfilled';
                        self.value = value;
                        self.handlers.forEach(handler => handler.onSuccess(value));
                    }
                }
                
                function reject(reason) {
                    if (self.state === 'pending') {
                        self.state = 'rejected';
                        self.value = reason;
                        self.handlers.forEach(handler => handler.onFail(reason));
                    }
                }
                
                this.then = function(onSuccess, onFail) {
                    return new Promise((resolve, reject) => {
                        function handle() {
                            if (self.state === 'fulfilled') {
                                if (onSuccess) {
                                    try {
                                        resolve(onSuccess(self.value));
                                    } catch (e) {
                                        reject(e);
                                    }
                                } else {
                                    resolve(self.value);
                                }
                            } else if (self.state === 'rejected') {
                                if (onFail) {
                                    try {
                                        resolve(onFail(self.value));
                                    } catch (e) {
                                        reject(e);
                                    }
                                } else {
                                    reject(self.value);
                                }
                            } else {
                                self.handlers.push({ onSuccess, onFail });
                            }
                        }
                        handle();
                    });
                };
                
                executor(resolve, reject);
            };
        }
    }
    
    polyfillAbortController() {
        window.AbortController = function() {
            this.signal = { aborted: false };
            this.abort = () => {
                this.signal.aborted = true;
            };
        };
    }
    
    disableDownloadFeature() {
        // Replace download functions with warnings
        if (window.portfolioOS) {
            window.portfolioOS.downloadAvatarV2 = function() {
                alert('Download feature not supported in this browser. Please update your browser for full functionality.');
            };
        }
    }
    
    setupSVGFallback() {
        // Use CSS and HTML fallbacks for SVG content
        const style = document.createElement('style');
        style.textContent = `
            .svg-fallback {
                background: linear-gradient(45deg, #f0f0f0, #d0d0d0);
                border: 2px solid #999;
                display: inline-block;
                text-align: center;
                color: #666;
                font-size: 12px;
            }
            .avatar-fallback {
                width: 200px;
                height: 200px;
                border-radius: 50%;
                line-height: 200px;
            }
        `;
        document.head.appendChild(style);
    }
    
    getBrowserInfo() {
        const ua = navigator.userAgent;
        let browser = 'Unknown';
        let version = 'Unknown';
        
        if (ua.includes('Chrome/')) {
            browser = 'Chrome';
            version = ua.match(/Chrome\/(\d+)/)?.[1] || 'Unknown';
        } else if (ua.includes('Firefox/')) {
            browser = 'Firefox';
            version = ua.match(/Firefox\/(\d+)/)?.[1] || 'Unknown';
        } else if (ua.includes('Safari/') && !ua.includes('Chrome/')) {
            browser = 'Safari';
            version = ua.match(/Version\/(\d+)/)?.[1] || 'Unknown';
        } else if (ua.includes('Edge/')) {
            browser = 'Edge';
            version = ua.match(/Edge\/(\d+)/)?.[1] || 'Unknown';
        }
        
        return { browser, version, userAgent: ua, features: this.browserFeatures };
    }
    
    hideDatePopup() {
        console.log('Hiding date popup...');
        
        // Hide calendar window
        const calendarWindow = document.querySelector('.calendar-window');
        if (calendarWindow && calendarWindow.style.display !== 'none') {
            calendarWindow.style.display = 'none';
        }
        
        // Remove all possible date/time cards with various class names
        const selectors = [
            '.datetime-info-card',
            '.date-time-card',
            '.welcome-card',
            '.info-card',
            '.popup-card',
            '.card'
        ];
        
        selectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
                console.log(`Removing element with class: ${el.className}`);
                el.remove();
            });
        });
        
        // Force remove any fixed/absolute positioned elements that might be popups
        const allElements = document.querySelectorAll('*');
        allElements.forEach(el => {
            const style = window.getComputedStyle(el);
            if ((style.position === 'fixed' || style.position === 'absolute') && 
                el.classList.contains('card') ||
                el.textContent.includes('Good evening') ||
                el.textContent.includes('Friday') ||
                el.textContent.includes('August')) {
                console.log(`Force removing popup: ${el.className}`);
                el.remove();
            }
        });
    }

    updateTime() {
        const now = new Date();
        const timeElement = document.getElementById('current-time');
        const dateElement = document.getElementById('current-date');

        if (timeElement) {
            timeElement.textContent = now.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            });
        }

        if (dateElement) {
            const dateString = now.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric'
            });
            // Remove comma from date string (e.g., "Mon, Aug 4" -> "Mon Aug 4")
            dateElement.textContent = dateString.replace(',', '');
        }
    }

    setupEventListeners() {
        // Desktop icon clicks
        document.querySelectorAll('.icon').forEach(icon => {
            icon.addEventListener('click', (e) => {
                // Only open window if not dragging
                if (!icon.classList.contains('was-dragging')) {
                    const appName = e.currentTarget.getAttribute('data-app');
                    this.openWindow(appName);
                }
                // Reset drag flag
                icon.classList.remove('was-dragging');
            });

            // Add hover sound effect (subtle)
            icon.addEventListener('mouseenter', () => {
                this.playHoverSound();
            });
        });

        // Setup icon dragging
        this.setupIconDragging();

        // Window controls - Use event delegation to handle all control clicks
        document.addEventListener('mousedown', (e) => {
            // console.log('Document mousedown:', e.target, 'Classes:', e.target.className);
            
            // Check if the clicked element is a window control
            const control = e.target;
            if (control.matches('.window-controls span') || control.matches('.notebook-controls span')) {
                // console.log(`✅ Control mousedown detected:`, control.className, control);
                
                // Very aggressive event stopping
                e.stopPropagation();
                e.stopImmediatePropagation();
                e.preventDefault();
                
                // Also stop the event from the event object directly
                if (e.cancelBubble !== undefined) e.cancelBubble = true;
                if (e.returnValue !== undefined) e.returnValue = false;
                
                const window = control.closest('.window');
                const action = control.className;

                // console.log('📱 Window found:', window, 'Action:', action);
                // console.log('🔍 Window data-window:', window ? window.getAttribute('data-window') : 'null');

                switch (action) {
                    case 'minimize':
                        console.log('⏬ Minimizing window');
                        this.minimizeWindow(window);
                        break;
                    case 'close':
                        // console.log('❌ Closing window:', window);
                        this.closeWindow(window);
                        break;
                    default:
                        console.log('❓ Unknown action:', action);
                        break;
                }
            } else {
                // Log what was clicked instead
                if (control.closest('.window-controls') || control.closest('.notebook-controls')) {
                    console.log('🎯 Clicked inside controls but not span:', control);
                }
            }
        });
        
        // Also prevent click events on window controls to avoid conflicts
        document.addEventListener('click', (e) => {
            if (e.target.matches('.window-controls span, .notebook-controls span')) {
                e.stopPropagation();
                e.stopImmediatePropagation();
                e.preventDefault();
            }
        });

        // Window dragging and resizing
        this.setupWindowDragging();
        this.setupWindowResizing();

        // Click anywhere on windows to focus them
        document.addEventListener('click', (e) => {
            // Don't focus if clicking on window controls
            if (e.target.closest('.window-controls') || 
                e.target.closest('.notebook-controls') ||
                e.target.classList.contains('close') ||
                e.target.classList.contains('minimize')) {
                return;
            }
            
            const window = e.target.closest('.window');
            if (window && window.classList.contains('active')) {
                // console.log('📋 Document click focusing window:', window);
                this.focusWindow(window);
                e.stopPropagation(); // Prevent event bubbling
            }
        });

        // yanliudesign click handler
        const userProfile = document.querySelector('.user-profile');
        if (userProfile) {
            userProfile.addEventListener('click', () => {
                this.showWelcomeCard();
            });
        }

        // Date click handler (removed time click handler)
        const timeElement = document.getElementById('current-time');
        const dateElement = document.getElementById('current-date');
        
        if (dateElement) {
            dateElement.addEventListener('click', (e) => {
                e.stopPropagation();
                // Hide world clocks popup if showing
                const worldClocksCard = document.querySelector('.world-clocks-card');
                if (worldClocksCard) {
                    worldClocksCard.remove();
                }
                
                // Check if date popup is already showing
                const existingCard = document.querySelector('.datetime-info-card');
                if (existingCard) {
                    // If showing, hide it
                    existingCard.remove();
                } else {
                    // If not showing, show it
                    this.showDateTimeInfo();
                }
            });
        }
        
        if (timeElement) {
            timeElement.addEventListener('click', (e) => {
                e.stopPropagation();
                // Hide date popup if showing
                const dateCard = document.querySelector('.datetime-info-card');
                if (dateCard) {
                    dateCard.remove();
                }
                
                // Check if world clocks popup is already showing
                const existingCard = document.querySelector('.world-clocks-card');
                if (existingCard) {
                    // If showing, hide it
                    existingCard.remove();
                } else {
                    // If not showing, show world clocks
                    this.showWorldClocks();
                }
            });
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Alt + number keys to open windows
            if (e.altKey && !e.shiftKey && !e.ctrlKey) {
                switch (e.key) {
                    case '1':
                        e.preventDefault();
                        this.openWindow('about');
                        break;
                    case '2':
                        e.preventDefault();
                        this.openWindow('projects');
                        break;
                    case '3':
                        e.preventDefault();
                        this.openWindow('skills');
                        break;
                    case '4':
                        e.preventDefault();
                        this.openWindow('contact');
                        break;
                }
            }

            // Escape to close all windows
            if (e.key === 'Escape') {
                this.closeAllWindows();
            }
        });

        // Form submission
        const contactForm = document.querySelector('.contact-form form');
        if (contactForm) {
            contactForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleFormSubmission(e.target);
            });
        }

        // Desktop right-click context menu
        const desktop = document.querySelector('.desktop');
        if (desktop) {
            desktop.addEventListener('contextmenu', (e) => {
                // Only show context menu if right-clicking on desktop background (not on icons, windows, taskbar, etc.)
                const isDesktopBackground = e.target === desktop || 
                    e.target.classList.contains('desktop') ||
                    (!e.target.closest('.window') && 
                     !e.target.closest('.icon') && 
                     !e.target.closest('.taskbar') && 
                     !e.target.closest('.mini-music-player'));
                
                if (isDesktopBackground) {
                    e.preventDefault();
                    console.log('Desktop right-click detected at:', e.clientX, e.clientY);
                    this.showDesktopContextMenu(e.clientX, e.clientY);
                }
            });
        }
    }

    openWindow(appName) {
        const window = document.querySelector(`[data-window="${appName}"]`);
        if (!window) return;

        // Check if this window was just closed (prevent immediate reopening)
        if (this.recentlyClosedWindows && this.recentlyClosedWindows.has(appName)) {
            console.log('🚫 Prevented reopening recently closed window:', appName);
            // console.log('🔍 Recently closed windows:', Array.from(this.recentlyClosedWindows));
            return;
        }

        if (this.activeWindows.has(appName)) {
            // Window is already open, just focus it
            this.focusWindow(window);
            return;
        }

        // Add to active windows
        this.activeWindows.add(appName);

        // Position window BEFORE showing to prevent flash
        if (appName === 'note-editor') {
            this.positionNoteEditorWindow(window);
        } else if (appName === 'game') {
            this.positionGameWindow(window);
        } else if (appName === 'avatar') {
            this.positionAvatarWindow(window);
        } else if (appName === 'mood') {
            this.positionMoodWindow(window);
        }
        
        // Show window with animation
        window.classList.add('active');
        
        // Always focus the newly opened window to bring it to front
        this.focusWindow(window);

        // Play open sound
        this.playOpenSound();

        // Add resize handles to the window
        this.addResizeHandles(window);
        
        // Ensure dragging is set up for this window
        this.setupRegularWindowDragging();
        
        // Special animations for different windows
        switch (appName) {
            case 'about':
                // Initialize immediately to avoid lag, but only once
                if (!this.notebookInitialized) {
                    this.initializeNotebook();
                    this.notebookInitialized = true;
                } else {
                    // Just refresh if already initialized
                    this.refreshNotebookView();
                }
                break;
            case 'skills':
                console.log('Opening sticker app, setting up sticker search and drop zones...');
                setTimeout(() => this.setupStickerSearch(), 300);
                break;
            case 'avatar':
                setTimeout(() => this.initializeAvatarCreator(), 300);
                break;
            case 'clock':
                setTimeout(() => this.startClock(), 300);
                break;
            case 'calendar':
                setTimeout(() => this.initializeCalendar(), 300);
                break;
            case 'mood':
                setTimeout(() => this.initializeMoodTracker(), 300);
                break;
        }
    }

    closeWindow(window) {
        // console.log('🔥 closeWindow called with:', window);
        const appName = window.getAttribute('data-window');
        // console.log('🔥 App name:', appName);
        // console.log('🔥 Active windows before:', Array.from(this.activeWindows));
        
        // Remove from layer order
        const windowId = this.getWindowId(window);
        const layerIndex = this.windowLayerOrder.indexOf(windowId);
        if (layerIndex !== -1) {
            this.windowLayerOrder.splice(layerIndex, 1);
            // console.log(`🔥 Removed ${windowId} from layer order`);
        }
        
        // Immediately mark as inactive to prevent reopening
        this.activeWindows.delete(appName);
        window.classList.remove('active');
        // console.log('🔥 Active windows after:', Array.from(this.activeWindows));
        
        // Recalculate remaining window layers
        this.recalculateWindowLayers();
        
        // Add to recently closed to prevent immediate reopening
        if (!this.recentlyClosedWindows) {
            this.recentlyClosedWindows = new Set();
        }
        this.recentlyClosedWindows.add(appName);
        
        // Remove from recently closed after a much shorter delay
        setTimeout(() => {
            if (this.recentlyClosedWindows) {
                this.recentlyClosedWindows.delete(appName);
                // console.log('🔓 Removed from recently closed:', appName);
            }
        }, 200);
        
        // Clear any inline styles that might interfere
        window.style.display = '';
        window.style.animation = '';
        
        // console.log('🔥 Window should be closed now');

        this.playCloseSound();
    }

    minimizeWindow(window) {
        const appName = window.getAttribute('data-window');
        
        // Add minimize animation
        window.style.animation = 'windowMinimize 0.4s ease forwards';

        setTimeout(() => {
            window.classList.remove('active');
            window.style.animation = '';
            this.activeWindows.delete(appName);
        }, 400);

        this.playMinimizeSound();
    }

    closeAllWindows() {
        document.querySelectorAll('.window.active').forEach(window => {
            this.closeWindow(window);
        });
    }

    positionNoteEditorWindow(window) {
        // Get the notebook window position if it's open
        const notebookWindow = document.querySelector('[data-window="about"]');
        const taskbarHeight = 40; // Height of the taskbar
        const windowPadding = 20; // Padding from edges
        
        if (notebookWindow && this.activeWindows.has('about')) {
            // Position relative to notebook window
            const notebookRect = notebookWindow.getBoundingClientRect();
            
            // Position to the right and slightly down from the notebook window
            let left = notebookRect.right + 20;
            let top = notebookRect.top + 50;
            
            // Ensure it doesn't go off screen
            const maxLeft = window.innerWidth - 600 - windowPadding;
            const maxTop = window.innerHeight - 500 - windowPadding;
            
            left = Math.min(left, maxLeft);
            top = Math.max(taskbarHeight + windowPadding, Math.min(top, maxTop));
            
            window.style.left = `${left}px`;
            window.style.top = `${top}px`;
        } else {
            // Center the window but ensure it's below the taskbar
            const left = (window.innerWidth - 600) / 2;
            const top = Math.max(taskbarHeight + windowPadding, (window.innerHeight - 500) / 2);
            
            window.style.left = `${left}px`;
            window.style.top = `${top}px`;
        }
        
        // Reset any previous positioning
        window.style.right = 'auto';
        window.style.bottom = 'auto';
    }

    positionGameWindow(gameWindow) {
        const taskbarHeight = 40;
        const windowPadding = 20;
        
        // Center the game window on screen
        const windowWidth = 380; // Game window is smaller
        const windowHeight = 420;
        
        const left = (window.innerWidth - windowWidth) / 2;
        const top = Math.max(taskbarHeight + windowPadding, (window.innerHeight - windowHeight) / 2);
        
        gameWindow.style.left = `${left}px`;
        gameWindow.style.top = `${top}px`;
        gameWindow.style.right = 'auto';
        gameWindow.style.bottom = 'auto';
    }

    positionAvatarWindow(avatarWindow) {
        const taskbarHeight = 40;
        const windowPadding = 20;
        
        // Center the avatar window on screen
        const windowWidth = 700; // Avatar window width from CSS
        const windowHeight = 600; // Avatar window height from CSS
        
        const left = (window.innerWidth - windowWidth) / 2;
        const top = Math.max(taskbarHeight + windowPadding, (window.innerHeight - windowHeight) / 2);
        
        avatarWindow.style.left = `${left}px`;
        avatarWindow.style.top = `${top}px`;
        avatarWindow.style.right = 'auto';
        avatarWindow.style.bottom = 'auto';
        avatarWindow.style.transform = 'none'; // Override CSS transform
    }

    positionMoodWindow(moodWindow) {
        const taskbarHeight = 40;
        const windowPadding = 20;
        
        // Center the mood window on screen, but ensure it doesn't overlap taskbar
        const windowWidth = 600; // Mood window estimated width
        const windowHeight = 700; // Mood window estimated height
        
        const left = (window.innerWidth - windowWidth) / 2;
        const top = Math.max(taskbarHeight + windowPadding, (window.innerHeight - windowHeight) / 2);
        
        moodWindow.style.left = `${left}px`;
        moodWindow.style.top = `${top}px`;
        moodWindow.style.right = 'auto';
        moodWindow.style.bottom = 'auto';
        moodWindow.style.transform = 'none'; // Override CSS transform
    }

    focusWindow(window) {
        if (!window) return;
        
        // Don't focus recently closed windows
        const appName = window.getAttribute('data-window');
        if (this.recentlyClosedWindows && this.recentlyClosedWindows.has(appName)) {
            console.log('🚫 Prevented focusing recently closed window:', appName);
            return;
        }
        
        // Use layer system instead of manual z-index manipulation
        this.bringWindowToFront(window);

        // Remove focus from all windows
        document.querySelectorAll('.window.active').forEach(w => {
            w.classList.remove('focused');
        });
        
        // Add focus effect to clicked window
        window.classList.add('focused');
        
        // If it's a note window, focus the editor
        const editor = window.querySelector('.note-modal-editor');
        if (editor) {
            setTimeout(() => {
                editor.focus();
            }, 50);
        }
        
        // Play subtle focus sound
        this.playFocusSound();
    }
    
    playFocusSound() {
        // Subtle click sound for window focus (optional)
        if (this.audioContext) {
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime);
            gainNode.gain.setValueAtTime(0.02, this.audioContext.currentTime); // Very quiet
            gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.1);
            
            oscillator.start(this.audioContext.currentTime);
            oscillator.stop(this.audioContext.currentTime + 0.1);
        }
    }

    setupWindowDragging() {
        // Setup dragging for regular windows
        this.setupRegularWindowDragging();
        // Setup click-to-front for all windows
        this.setupWindowClickToFront();
    }
    
    setupWindowClickToFront() {
        // Add click handler to bring any window to front when clicked
        document.querySelectorAll('.window, .note-editor-window, .sticker-preview-window').forEach(window => {
            if (window.hasAttribute('data-click-to-front')) {
                console.log('Skipping click-to-front setup - already has attribute');
                return;
            }
            console.log('Setting up click-to-front for window:', window);
            window.setAttribute('data-click-to-front', 'true');
            
            window.addEventListener('mousedown', (e) => {
                console.log('🏠 Window mousedown:', e.target);
                
                // Don't bring to front recently closed windows
                const appName = window.getAttribute('data-window');
                if (this.recentlyClosedWindows && this.recentlyClosedWindows.has(appName)) {
                    console.log('🚫 Not bringing to front - recently closed window');
                    return;
                }
                
                // Only bring to front if not clicking on window header or controls
                if (!e.target.closest('.window-header') && 
                    !e.target.closest('.window-controls') &&
                    !e.target.closest('.notebook-controls') &&
                    !e.target.classList.contains('close') &&
                    !e.target.classList.contains('minimize')) {
                    console.log('🎯 Bringing window to front via click-to-front');
                    this.bringWindowToFront(window);
                } else {
                    console.log('🚫 Not bringing to front - clicked on header/controls');
                }
            });
        });
    }

    setupRegularWindowDragging() {
        document.querySelectorAll('.window-header').forEach(header => {
            // Skip if already has dragging setup
            if (header.hasAttribute('data-draggable')) {
                console.log('Skipping drag setup for header - already has draggable attribute');
                return;
            }
            console.log('Setting up dragging for header:', header);
            header.setAttribute('data-draggable', 'true');
            
            let isDragging = false;
            let hasMoved = false;
            let startX, startY, startLeft, startTop;
            let animationFrameId = null;

            header.addEventListener('mousedown', (e) => {
                console.log('📝 Header mousedown:', e.target);
                // Don't drag if clicking on controls, resize handles, or buttons
                if (e.target.closest('.window-controls') || 
                    e.target.closest('.resize-handle') ||
                    e.target.closest('button') ||
                    e.target.classList.contains('close') ||
                    e.target.classList.contains('minimize')) {
                    console.log('🚫 Drag blocked - clicked on control');
                    return;
                }
                
                // console.log('✅ Drag allowed - setting up listeners');

                const window = header.closest('.window');
                
                // Bring window to front when starting to drag
                console.log('🔄 Bringing window to front during drag');
                this.bringWindowToFront(window, true);
                
                startX = e.clientX;
                startY = e.clientY;
                
                // Always use getBoundingClientRect for accurate current position
                const rect = window.getBoundingClientRect();
                startLeft = rect.left;
                startTop = rect.top;

                const handleMouseMove = (e) => {
                    const deltaX = e.clientX - startX;
                    const deltaY = e.clientY - startY;
                    
                    // Only start dragging after moving more than 3px (to prevent jitter)
                    if (!isDragging && (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3)) {
                        isDragging = true;
                        hasMoved = true;
                        
                        // Prevent default behavior once we start dragging
                        e.preventDefault();
                        
                        // Bring window to front and setup for dragging
                        this.bringWindowToFront(window, true);
                        window.classList.add('dragging');
                        
                        // During drag, use a high temporary z-index that doesn't conflict with layer system
                        window.style.setProperty('z-index', '10000', 'important');
                        
                        // Ensure the window is ready for dragging
                        window.style.position = 'absolute';
                        window.style.right = 'auto';
                        window.style.bottom = 'auto';
                        window.style.transform = 'none';
                    }
                    
                    if (isDragging) {
                        e.preventDefault();
                        
                        // Use requestAnimationFrame for smooth updates
                        if (animationFrameId) {
                            cancelAnimationFrame(animationFrameId);
                        }
                        
                        animationFrameId = requestAnimationFrame(() => {
                            let newLeft = startLeft + deltaX;
                            let newTop = startTop + deltaY;

                            // Simple boundary constraints - only prevent going above taskbar
                            newTop = Math.max(40, newTop); // Keep above taskbar
                            
                            window.style.left = `${newLeft}px`;
                            window.style.top = `${newTop}px`;
                        });
                    }
                };

                const handleMouseUp = () => {
                    if (animationFrameId) {
                        cancelAnimationFrame(animationFrameId);
                        animationFrameId = null;
                    }
                    
                    if (isDragging) {
                        window.classList.remove('dragging');
                        // After dragging, properly set z-index to stay on top
                        this.bringWindowToFront(window, false);
                    } else if (!hasMoved) {
                        // If no dragging occurred, just bring window to front
                        this.bringWindowToFront(window);
                    }
                    
                    isDragging = false;
                    hasMoved = false;
                    document.removeEventListener('mousemove', handleMouseMove);
                    document.removeEventListener('mouseup', handleMouseUp);
                };

                document.addEventListener('mousemove', handleMouseMove);
                document.addEventListener('mouseup', handleMouseUp);
            });
        });
    }
    
    // setupModalDragging method removed - now using window system

    setupWindowResizing() {
        document.querySelectorAll('.window').forEach(window => {
            // Add resize handles to each window
            this.addResizeHandles(window);
        });
    }

    addResizeHandles(window) {
        // Check if handles already exist
        if (window.querySelector('.resize-handle')) return;

        // Create resize handles for all edges and corners
        const handles = [
            'resize-handle-n',   // top
            'resize-handle-s',   // bottom
            'resize-handle-e',   // right
            'resize-handle-w',   // left
            'resize-handle-ne',  // top-right
            'resize-handle-nw',  // top-left
            'resize-handle-se',  // bottom-right
            'resize-handle-sw'   // bottom-left
        ];

        handles.forEach(handleClass => {
            const handle = document.createElement('div');
            handle.className = `resize-handle ${handleClass}`;
            window.appendChild(handle);

            // Add resize functionality
            this.setupResizeHandle(handle, window, handleClass);
        });
    }

    setupResizeHandle(handle, window, handleClass) {
        let isResizing = false;
        let startX, startY, startWidth, startHeight, startLeft, startTop;

        handle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            isResizing = true;
            startX = e.clientX;
            startY = e.clientY;
            
            const rect = window.getBoundingClientRect();
            startWidth = rect.width;
            startHeight = rect.height;
            startLeft = rect.left;
            startTop = rect.top;

            // Add resizing class for cursor change
            document.body.classList.add('resizing');
            window.classList.add('resizing');

            const handleMouseMove = (e) => {
                if (!isResizing) return;

                const deltaX = e.clientX - startX;
                const deltaY = e.clientY - startY;

                let newWidth = startWidth;
                let newHeight = startHeight;
                let newLeft = startLeft;
                let newTop = startTop;

                // Calculate new dimensions based on handle type
                switch (handleClass) {
                    case 'resize-handle-e': // right
                        newWidth = Math.max(300, startWidth + deltaX);
                        break;
                    case 'resize-handle-w': // left
                        newWidth = Math.max(300, startWidth - deltaX);
                        newLeft = startLeft + (startWidth - newWidth);
                        break;
                    case 'resize-handle-s': // bottom
                        newHeight = Math.max(200, startHeight + deltaY);
                        break;
                    case 'resize-handle-n': // top
                        newHeight = Math.max(200, startHeight - deltaY);
                        newTop = startTop + (startHeight - newHeight);
                        break;
                    case 'resize-handle-se': // bottom-right
                        newWidth = Math.max(300, startWidth + deltaX);
                        newHeight = Math.max(200, startHeight + deltaY);
                        break;
                    case 'resize-handle-sw': // bottom-left
                        newWidth = Math.max(300, startWidth - deltaX);
                        newHeight = Math.max(200, startHeight + deltaY);
                        newLeft = startLeft + (startWidth - newWidth);
                        break;
                    case 'resize-handle-ne': // top-right
                        newWidth = Math.max(300, startWidth + deltaX);
                        newHeight = Math.max(200, startHeight - deltaY);
                        newTop = startTop + (startHeight - newHeight);
                        break;
                    case 'resize-handle-nw': // top-left
                        newWidth = Math.max(300, startWidth - deltaX);
                        newHeight = Math.max(200, startHeight - deltaY);
                        newLeft = startLeft + (startWidth - newWidth);
                        newTop = startTop + (startHeight - newHeight);
                        break;
                }

                // Ensure window doesn't go above taskbar when resizing from top
                const taskbarHeight = 40;
                if (newTop < taskbarHeight) {
                    const adjustment = taskbarHeight - newTop;
                    newTop = taskbarHeight;
                    newHeight -= adjustment;
                    newHeight = Math.max(200, newHeight);
                }

                // Apply new dimensions and position
                window.style.width = `${newWidth}px`;
                window.style.height = `${newHeight}px`;
                window.style.left = `${newLeft}px`;
                window.style.top = `${newTop}px`;
                window.style.right = 'auto';
                window.style.bottom = 'auto';
                window.style.transform = 'none';
            };

            const handleMouseUp = () => {
                isResizing = false;
                document.body.classList.remove('resizing');
                window.classList.remove('resizing');
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
            };

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        });
    }

    animateSkillBars() {
        const skillBars = document.querySelectorAll('.skill-bar');
        skillBars.forEach((bar, index) => {
            const width = bar.style.width;
            bar.style.width = '0%';
            
            setTimeout(() => {
                bar.style.width = width;
            }, index * 100 + 200);
        });
    }

    handleFormSubmission(form) {
        const formData = new FormData(form);
        const name = formData.get('name') || form.querySelector('input[type="text"]').value;
        const email = formData.get('email') || form.querySelector('input[type="email"]').value;
        const message = formData.get('message') || form.querySelector('textarea').value;

        // Simple validation
        if (!name || !email || !message) {
            this.showNotification('Please fill in all fields', 'error');
            return;
        }

        // Simulate form submission
        const button = form.querySelector('button');
        const originalText = button.textContent;
        button.textContent = 'Sending...';
        button.disabled = true;

        setTimeout(() => {
            button.textContent = 'Message Sent!';
            button.style.background = '#4CAF50';
            form.reset();
            
            this.showNotification('Message sent successfully!', 'success');

            setTimeout(() => {
                button.textContent = originalText;
                button.disabled = false;
                button.style.background = '';
            }, 2000);
        }, 1500);
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;

        // Style the notification
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 16px 20px;
            background: rgba(255, 255, 255, 0.8);
            backdrop-filter: blur(30px);
            -webkit-backdrop-filter: blur(30px);
            color: #333;
            border: 1px solid rgba(255, 255, 255, 0.3);
            border-radius: 8px;
            box-shadow: 0 8px 20px rgba(0,0,0,0.1);
            z-index: 10000;
            font-size: 14px;
            font-weight: 500;
            font-family: 'Noto Sans', 'Noto Sans CJK JP', 'Noto Sans CJK KR', 'Noto Sans CJK SC', 'Noto Sans CJK TC', system-ui, -apple-system, sans-serif;
            animation: slideInRight 0.3s ease;
            pointer-events: none;
            user-select: none;
            -webkit-user-select: none;
            -moz-user-select: none;
            -ms-user-select: none;
        `;

        document.body.appendChild(notification);

        // Remove after 3 seconds
        setTimeout(() => {
            notification.style.animation = 'slideOutRight 0.3s ease forwards';
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 3000);
    }

    // Sound effects (using Web Audio API for subtle sounds)
    playHoverSound() {
        this.playTone(800, 0.05, 0.02);
    }

    playOpenSound() {
        this.playTone(600, 0.1, 0.15);
    }

    playCloseSound() {
        this.playTone(400, 0.08, 0.12);
    }

    playMinimizeSound() {
        this.playTone(500, 0.06, 0.1);
    }

    playMeowSound() {
        try {
            const audio = new Audio('Virtual pet/cat meow.mp3');
            audio.volume = 0.3; // Adjust volume to be subtle
            audio.play().catch(e => {
                // Audio play failed, fail silently
                console.log('Meow sound could not be played:', e);
            });
        } catch (e) {
            // Audio not supported, fail silently
        }
    }

    playMoodSelectSound(moodIndex) {
        // Game-style sound effect for all emojis
        this.playGameSelectSound();
    }

    playGameSelectSound() {
        // Fun game-style "boop" sound with rising pitch
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            // Start at a mid frequency and rise up for a playful "bloop" effect
            oscillator.frequency.setValueAtTime(600, audioContext.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(800, audioContext.currentTime + 0.1);
            oscillator.type = 'triangle'; // Triangle wave for a softer, more pleasant sound

            // Quick attack and decay for a "pop" effect
            gainNode.gain.setValueAtTime(0, audioContext.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.15, audioContext.currentTime + 0.02);
            gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.15);

            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.15);
        } catch (e) {
            // Audio not supported, fail silently
        }
    }

    playEmojiLandSound(moodIndex) {
        // Different landing sounds based on mood
        switch(moodIndex) {
            case 0: // Gentle, soft landing
                this.playTone(450, 0.08, 0.2);
                break;
            case 1: // Soft pop
                this.playTone(550, 0.09, 0.18);
                break;
            case 2: // Medium pop
                this.playTone(650, 0.1, 0.16);
                break;
            case 3: // Bright pop
                this.playTone(800, 0.11, 0.15);
                break;
            case 4: // Energetic pop
                this.playTone(950, 0.12, 0.14);
                break;
            case 5: // Excited burst
                this.playTone(1150, 0.13, 0.12);
                break;
            default:
                this.playTone(850, 0.12, 0.15);
        }
    }

    playTabSwitchSound() {
        // Subtle whoosh sound for tab switching
        this.playTone(300, 0.04, 0.1);
    }

    playStreakCelebrationSound() {
        // Celebratory ascending melody for streaks
        this.playTone(600, 0.08, 0.1);
        setTimeout(() => this.playTone(750, 0.08, 0.1), 100);
        setTimeout(() => this.playTone(900, 0.08, 0.15), 200);
    }

    playCalendarNavigationSound() {
        // Gentle click for calendar month navigation
        this.playTone(520, 0.05, 0.08);
    }

    playMoodHoverSound() {
        // Very subtle hover sound for emoji buttons
        this.playTone(400, 0.02, 0.05);
    }

    playTone(frequency, volume, duration) {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
            oscillator.type = 'sine';

            gainNode.gain.setValueAtTime(0, audioContext.currentTime);
            gainNode.gain.linearRampToValueAtTime(volume, audioContext.currentTime + 0.01);
            gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);

            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + duration);
        } catch (e) {
            // Audio not supported, fail silently
        }
    }

    playDistinctTone(frequency, volume, duration, waveType = 'sine') {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
            oscillator.type = waveType; // Use different waveforms for distinct sounds

            gainNode.gain.setValueAtTime(0, audioContext.currentTime);
            gainNode.gain.linearRampToValueAtTime(volume, audioContext.currentTime + 0.02);
            gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);

            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + duration);
        } catch (e) {
            // Audio not supported, fail silently
        }
    }

    // Clock functionality
    startClock() {
        this.updateClockTime();
        this.clockInterval = setInterval(() => {
            this.updateClockTime();
        }, 1000);
    }

    updateClockTime() {
        const now = new Date();
        const digitalClock = document.getElementById('digital-clock');
        const timezone = document.getElementById('timezone');

        if (digitalClock) {
            digitalClock.textContent = now.toLocaleTimeString('en-US', {
                hour12: false
            });
        }

        if (timezone) {
            timezone.textContent = Intl.DateTimeFormat().resolvedOptions().timeZone;
        }

        // Update analog clock hands
        const hourHand = document.querySelector('.hour-hand');
        const minuteHand = document.querySelector('.minute-hand');
        const secondHand = document.querySelector('.second-hand');

        if (hourHand && minuteHand && secondHand) {
            const hours = now.getHours() % 12;
            const minutes = now.getMinutes();
            const seconds = now.getSeconds();

            const hourAngle = (hours * 30) + (minutes * 0.5);
            const minuteAngle = minutes * 6;
            const secondAngle = seconds * 6;

            hourHand.style.transform = `rotate(${hourAngle}deg)`;
            minuteHand.style.transform = `rotate(${minuteAngle}deg)`;
            secondHand.style.transform = `rotate(${secondAngle}deg)`;
        }
    }

    // Calendar functionality
    initializeCalendar() {
        this.currentCalendarDate = new Date();
        this.selectedDate = null;
        this.renderCalendar();
        this.setupCalendarListeners();
    }

    renderCalendar() {
        const monthYear = document.getElementById('month-year');
        const calendarDays = document.getElementById('calendar-days');

        if (!monthYear || !calendarDays) return;

        const year = this.currentCalendarDate.getFullYear();
        const month = this.currentCalendarDate.getMonth();

        monthYear.textContent = new Date(year, month).toLocaleDateString('en-US', {
            month: 'long',
            year: 'numeric'
        });

        // Clear previous days
        calendarDays.innerHTML = '';

        // Get first day of month and number of days
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const daysInPrevMonth = new Date(year, month, 0).getDate();

        // Add previous month's trailing days
        for (let i = firstDay - 1; i >= 0; i--) {
            const day = daysInPrevMonth - i;
            const dayElement = this.createCalendarDay(day, 'other-month');
            calendarDays.appendChild(dayElement);
        }

        // Add current month's days
        const today = new Date();
        for (let day = 1; day <= daysInMonth; day++) {
            const isToday = today.getFullYear() === year && 
                           today.getMonth() === month && 
                           today.getDate() === day;
            
            const dayElement = this.createCalendarDay(day, isToday ? 'today' : 'current-month');
            calendarDays.appendChild(dayElement);
        }

        // Add next month's leading days
        const totalCells = calendarDays.children.length;
        const remainingCells = 42 - totalCells; // 6 rows × 7 days
        for (let day = 1; day <= remainingCells; day++) {
            const dayElement = this.createCalendarDay(day, 'other-month');
            calendarDays.appendChild(dayElement);
        }
    }

    createCalendarDay(day, className) {
        const dayElement = document.createElement('div');
        dayElement.className = `calendar-day ${className}`;
        dayElement.textContent = day;
        
        if (className === 'current-month' || className === 'today') {
            dayElement.addEventListener('click', () => {
                // Remove previous selection
                document.querySelectorAll('.calendar-day.selected').forEach(el => {
                    el.classList.remove('selected');
                });
                
                // Add selection to clicked day
                dayElement.classList.add('selected');
                this.selectedDate = new Date(
                    this.currentCalendarDate.getFullYear(),
                    this.currentCalendarDate.getMonth(),
                    day
                );
            });
        }
        
        return dayElement;
    }

    setupCalendarListeners() {
        const prevButton = document.querySelector('.prev-month');
        const nextButton = document.querySelector('.next-month');

        if (prevButton) {
            prevButton.addEventListener('click', () => {
                this.currentCalendarDate.setMonth(this.currentCalendarDate.getMonth() - 1);
                this.renderCalendar();
            });
        }

        if (nextButton) {
            nextButton.addEventListener('click', () => {
                this.currentCalendarDate.setMonth(this.currentCalendarDate.getMonth() + 1);
                this.renderCalendar();
            });
        }
    }

    // Icon dragging functionality
    setupIconDragging() {
        // Clear any problematic saved positions
        this.clearAllSavedPositions();
        
        document.querySelectorAll('.icon').forEach(icon => {
            let isDragging = false;
            let mouseOffsetX, mouseOffsetY;
            let hasMoved = false;
            let animationId;
            let offsetX, offsetY; // Move to outer scope
            let lastMouseX, lastMouseY; // Track last mouse position

            icon.addEventListener('mousedown', (e) => {
                // Prevent all default behaviors immediately
                e.preventDefault();
                e.stopPropagation();
                
                let startX = e.clientX;
                let startY = e.clientY;
                let hasMoved = false;
                let dragPreview = null;
                
                const rect = icon.getBoundingClientRect();
                
                // Calculate offset from cursor to icon's top-left
                offsetX = e.clientX - rect.left;
                offsetY = e.clientY - rect.top;

                document.body.style.userSelect = 'none';
                document.body.style.overflow = 'hidden'; // Prevent page scrolling during drag

                const createDragPreview = () => {
                    // Clone the icon for dragging
                    dragPreview = icon.cloneNode(true);
                    dragPreview.style.position = 'absolute'; // Use same positioning as final
                    dragPreview.style.zIndex = '10000';
                    dragPreview.style.pointerEvents = 'none';
                    dragPreview.style.transition = 'none';
                    dragPreview.classList.add('dragging');
                    
                    // Convert original position to absolute coordinates
                    const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
                    const scrollY = window.pageYOffset || document.documentElement.scrollTop;
                    
                    dragPreview.style.left = `${rect.left + scrollX}px`;
                    dragPreview.style.top = `${rect.top + scrollY}px`;
                    dragPreview.style.width = `${rect.width}px`;
                    dragPreview.style.height = `${rect.height}px`;
                    
                    // Hide original icon
                    icon.style.opacity = '0.3';
                    
                    document.body.appendChild(dragPreview);
                };

                const updateDragPreview = (e) => {
                    if (dragPreview) {
                        // Position preview so cursor stays at exact click point
                        const newLeft = e.clientX - offsetX;
                        const newTop = e.clientY - offsetY;
                        
                        dragPreview.style.left = `${newLeft}px`;
                        dragPreview.style.top = `${newTop}px`;
                    }
                };

                const updatePosition = (e) => {
                    const deltaX = e.clientX - startX;
                    const deltaY = e.clientY - startY;
                    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

                    // Start dragging after 5px movement
                    if (!dragPreview && distance > 5) {
                        createDragPreview();
                        hasMoved = true;
                    }

                    if (dragPreview) {
                        updateDragPreview(e);
                    }
                };

                const handleMouseMove = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    // Update last mouse position
                    lastMouseX = e.clientX;
                    lastMouseY = e.clientY;
                    
                    if (animationId) {
                        cancelAnimationFrame(animationId);
                    }
                    
                    animationId = requestAnimationFrame(() => {
                        updatePosition(e);
                    });
                };

                const handleMouseUp = (e) => {
                    if (dragPreview) {
                        // Move icon out of container to position relative to document
                        if (icon.parentNode.classList.contains('desktop-icons')) {
                            document.body.appendChild(icon);
                        }
                        
                        // Place icon at exact same position as preview
                        const previewLeft = dragPreview.style.left;
                        const previewTop = dragPreview.style.top;
                        
                        icon.style.transition = 'none';
                        icon.style.position = 'absolute';
                        icon.style.left = previewLeft;
                        icon.style.top = previewTop;
                        icon.style.transform = 'none';
                        icon.style.right = 'auto';
                        icon.style.bottom = 'auto';
                        icon.style.opacity = '1';
                        icon.style.zIndex = '10';
                        
                        // Force immediate style application
                        icon.offsetHeight;
                        
                        // Remove preview safely
                        if (dragPreview && dragPreview.parentNode) {
                            document.body.removeChild(dragPreview);
                        }
                    }
                    
                    // Restore text selection and scrolling
                    document.body.style.userSelect = '';
                    document.body.style.overflow = '';
                    
                    if (animationId) {
                        cancelAnimationFrame(animationId);
                    }
                    
                    // Prevent click event only if we actually dragged
                    if (hasMoved) {
                        icon.classList.add('was-dragging');
                        
                        setTimeout(() => {
                            icon.classList.remove('was-dragging');
                        }, 100);
                    }

                    document.removeEventListener('mousemove', handleMouseMove, true);
                    document.removeEventListener('mouseup', handleMouseUp, true);
                    document.removeEventListener('mouseup', handleMouseUp, false);
                    window.removeEventListener('mouseup', handleMouseUp, false);
                };

                // Add event listeners with capture to ensure they work
                document.addEventListener('mousemove', handleMouseMove, true);
                document.addEventListener('mouseup', handleMouseUp, true);
                document.addEventListener('mouseup', handleMouseUp, false);
                window.addEventListener('mouseup', handleMouseUp, false);
            });

            // Prevent default drag behavior
            icon.addEventListener('dragstart', (e) => {
                e.preventDefault();
            });

            // Prevent context menu during drag
            icon.addEventListener('contextmenu', (e) => {
                if (icon.classList.contains('dragging')) {
                    e.preventDefault();
                }
            });

            // Don't load saved positions for now
            // this.loadIconPosition(icon);
        });
    }

    saveIconPosition(icon) {
        const appName = icon.getAttribute('data-app');
        // Save the actual CSS left/top values, not getBoundingClientRect
        const position = {
            left: parseInt(icon.style.left, 10) || 0,
            top: parseInt(icon.style.top, 10) || 0
        };
        console.log('Saving position for', appName, position);
        localStorage.setItem(`icon-position-${appName}`, JSON.stringify(position));
    }

    loadIconPosition(icon) {
        const appName = icon.getAttribute('data-app');
        const savedPosition = localStorage.getItem(`icon-position-${appName}`);
        
        if (savedPosition) {
            const position = JSON.parse(savedPosition);
            console.log('Loading position for', appName, position);
            icon.style.position = 'absolute';
            icon.style.left = `${position.left}px`;
            icon.style.top = `${position.top}px`;
        }
    }

    clearAllSavedPositions() {
        // Clear any saved positions that might be causing bundling
        const appNames = ['about', 'projects', 'skills', 'contact'];
        appNames.forEach(appName => {
            localStorage.removeItem(`icon-position-${appName}`);
        });
    }

    // Notebook functionality
    initializeNotebook() {
        this.setupStickyNotes();
    }

    setupContextMenu() {
        const editor = document.querySelector('.notebook-editor');
        const contextMenu = document.getElementById('context-menu');
        
        if (!editor || !contextMenu) return;
        
        // Prevent default context menu and show custom one
        editor.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showContextMenu(e.clientX, e.clientY);
        });
        
        // Hide context menu on click outside
        document.addEventListener('click', (e) => {
            if (!contextMenu.contains(e.target)) {
                this.hideContextMenu();
            }
        });
        
        // Handle context menu item clicks
        contextMenu.addEventListener('click', (e) => {
            const item = e.target.closest('.context-menu-item');
            if (!item) return;
            
            const action = item.getAttribute('data-action');
            const color = item.getAttribute('data-color');
            
            this.handleContextMenuAction(action, color);
            this.hideContextMenu();
        });
        
        // Hide context menu on scroll or window resize
        window.addEventListener('scroll', () => this.hideContextMenu());
        window.addEventListener('resize', () => this.hideContextMenu());
    }
    
    showContextMenu(x, y) {
        const contextMenu = document.getElementById('context-menu');
        if (!contextMenu) return;
        
        contextMenu.style.display = 'block';
        contextMenu.style.left = `${x}px`;
        contextMenu.style.top = `${y}px`;
        
        // Adjust position if menu goes off screen
        const rect = contextMenu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            contextMenu.style.left = `${x - rect.width}px`;
        }
        if (rect.bottom > window.innerHeight) {
            contextMenu.style.top = `${y - rect.height}px`;
        }
    }
    
    hideContextMenu() {
        const contextMenu = document.getElementById('context-menu');
        if (contextMenu) {
            contextMenu.style.display = 'none';
        }
    }
    
    handleContextMenuAction(action, color = null) {
        const editor = document.querySelector('.notebook-editor');
        if (!editor) return;
        
        editor.focus();
        
        switch (action) {
            case 'bold':
                document.execCommand('bold');
                break;
            case 'italic':
                document.execCommand('italic');
                break;
            case 'underline':
                document.execCommand('underline');
                break;
            case 'bullet':
                document.execCommand('insertUnorderedList');
                break;
            case 'number':
                document.execCommand('insertOrderedList');
                break;
            case 'color':
                if (color) {
                    document.execCommand('foreColor', false, color);
                } else {
                    // For the first color item without data-color, use red
                    document.execCommand('foreColor', false, '#ff4444');
                }
                break;
        }
        
        // Save the changes
        localStorage.setItem('notebook-content', editor.innerHTML);
    }

    // Sticker library search functionality
    setupStickerSearch() {
        console.log('setupStickerSearch called');
        const searchInput = document.getElementById('sticker-search');
        if (!searchInput) {
            console.log('No sticker search input found');
            return;
        }

        console.log('Setting up sticker search functionality');
        searchInput.addEventListener('input', (e) => {
            this.filterStickers(e.target.value.toLowerCase());
        });

        // Setup category filtering
        this.setupCategoryFiltering();

        // Setup sticker click handlers for full size view
        this.setupStickerModal();
    }

    setupCategoryFiltering() {
        const categoryItems = document.querySelectorAll('.category-item');
        
        categoryItems.forEach(item => {
            item.addEventListener('click', () => {
                // Remove active class from all categories
                categoryItems.forEach(cat => cat.classList.remove('active'));
                
                // Add active class to clicked category
                item.classList.add('active');
                
                // Filter stickers by category
                const category = item.dataset.category;
                this.filterStickersByCategory(category);
            });
        });
    }

    filterStickersByCategory(category) {
        const stickerItems = document.querySelectorAll('.sticker-item');
        
        stickerItems.forEach(item => {
            if (category === 'all' || item.dataset.category === category) {
                item.style.display = 'flex';
            } else {
                item.style.display = 'none';
            }
        });
    }

    setupStickerModal() {
        const stickerItems = document.querySelectorAll('.sticker-item');
        console.log('Setting up sticker modal for', stickerItems.length, 'stickers');
        
        stickerItems.forEach(item => {
            // Make stickers draggable
            item.draggable = true;
            
            // Add drag start handler
            item.addEventListener('dragstart', (e) => {
                const img = item.querySelector('img');
                const stickerHtml = `<img src="${img.src}" alt="${img.alt}" style="width: 60px; height: auto; display: inline-block; margin: 2px;">`;
                
                console.log('=== DRAG START DEBUG ===');
                console.log('Dragging sticker:', img.alt);
                console.log('Image src:', img.src);
                console.log('Generated HTML:', stickerHtml);
                
                e.dataTransfer.setData('text/html', stickerHtml);
                e.dataTransfer.setData('text/plain', img.alt);
                
                // Add visual feedback
                item.classList.add('dragging');
                console.log('Drag data set successfully');
            });
            
            // Add drag end handler
            item.addEventListener('dragend', (e) => {
                item.classList.remove('dragging');
            });
            
            // Click handler for modal view
            item.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const img = item.querySelector('img');
                this.showStickerModal(img.src, img.alt);
            });
        });
        
        // Setup drop zones for note editors
        this.setupNoteDropZones();
        
        // Also force setup drop zones for any existing note windows right now
        setTimeout(() => {
            const noteWindows = document.querySelectorAll('.note-editor-window');
            console.log('Force setting up drop zones for', noteWindows.length, 'existing note windows');
            noteWindows.forEach(noteWindow => {
                this.addDropZoneToEditor(noteWindow);
            });
        }, 100);
    }
    
    setupNoteDropZones() {
        console.log('Setting up note drop zones...');
        
        // Setup drop zones for existing note editors
        this.addDropZoneToEditors();
        
        // Watch for new note windows being created
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1 && node.classList && node.classList.contains('note-editor-window')) {
                        console.log('New note window detected, adding drop zone...');
                        // New note window created, add drop zone
                        setTimeout(() => this.addDropZoneToEditor(node), 200);
                    }
                });
            });
        });
        
        observer.observe(document.body, { childList: true, subtree: true });
    }
    
    addDropZoneToEditors() {
        const noteEditors = document.querySelectorAll('.note-modal-editor');
        console.log('Found existing note editors:', noteEditors.length);
        noteEditors.forEach(editor => {
            const noteWindow = editor.closest('.note-editor-window');
            if (noteWindow) {
                this.addDropZoneToEditor(noteWindow);
            }
        });
    }
    
    addDropZoneToEditor(noteWindow) {
        if (!noteWindow) {
            console.log('No note window provided');
            return;
        }
        
        const editor = noteWindow.querySelector('.note-modal-editor');
        if (!editor) {
            console.log('No editor found in note window');
            return;
        }
        
        if (editor.hasAttribute('data-drop-enabled')) {
            console.log('Editor already has drop zone enabled');
            return;
        }
        
        editor.setAttribute('data-drop-enabled', 'true');
        console.log('Adding drop zone to editor');
        
        editor.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            editor.classList.add('drag-over');
            console.log('Dragging over editor');
        });
        
        editor.addEventListener('dragleave', (e) => {
            // Only remove if we're actually leaving the editor
            if (!editor.contains(e.relatedTarget)) {
                editor.classList.remove('drag-over');
                console.log('Left editor drag area');
            }
        });
        
        editor.addEventListener('drop', (e) => {
            e.preventDefault();
            editor.classList.remove('drag-over');
            
            const htmlData = e.dataTransfer.getData('text/html');
            const textData = e.dataTransfer.getData('text/plain');
            
            console.log('Drop event fired!');
            console.log('HTML data:', htmlData);
            console.log('Text data:', textData);
            
            if (htmlData) {
                // Insert sticker at cursor position or at the end
                this.insertStickerIntoNote(editor, htmlData);
                console.log('Sticker dropped into note:', textData);
            } else {
                console.log('No HTML data found in drop event');
            }
        });
        
        console.log('Drop zone successfully added to note editor');
    }
    
    insertStickerIntoNote(editor, stickerHtml) {
        console.log('=== STICKER INSERTION DEBUG ===');
        console.log('Editor element:', editor);
        console.log('Editor classList:', editor.classList.toString());
        console.log('Editor innerHTML BEFORE:', editor.innerHTML);
        console.log('Editor textContent BEFORE:', editor.textContent);
        console.log('Editor isEmpty:', editor.innerHTML === '');
        console.log('Sticker HTML to insert:', stickerHtml);
        
        try {
            // Clear any placeholder content first
            if (editor.innerHTML.trim() === '') {
                console.log('Editor is empty, clearing any potential placeholder content');
                editor.innerHTML = '';
            }
            
            // Simple approach: just append to the editor content
            const currentContent = editor.innerHTML;
            const newContent = currentContent + stickerHtml + ' ';
            
            console.log('Current content:', currentContent);
            console.log('New content to set:', newContent);
            
            editor.innerHTML = newContent;
            
            console.log('Editor innerHTML AFTER setting:', editor.innerHTML);
            console.log('Editor textContent AFTER setting:', editor.textContent);
            console.log('Editor has images:', editor.querySelectorAll('img').length);
            
            // Trigger auto-save
            editor.dispatchEvent(new Event('input', { bubbles: true }));
            console.log('Input event dispatched');
            
            // Focus the editor
            editor.focus();
            console.log('Editor focused');
            
            // Move cursor to end
            try {
                const range = document.createRange();
                const selection = window.getSelection();
                range.selectNodeContents(editor);
                range.collapse(false);
                selection.removeAllRanges();
                selection.addRange(range);
                console.log('Cursor moved to end');
            } catch (cursorError) {
                console.warn('Could not move cursor:', cursorError);
            }
            
            console.log('=== STICKER INSERTION COMPLETED ===');
        } catch (error) {
            console.error('=== STICKER INSERTION ERROR ===', error);
            
            // Fallback: try direct insertion
            try {
                console.log('Trying fallback insertion method...');
                const img = document.createElement('img');
                const match = stickerHtml.match(/src="([^"]+)"/);
                if (match) {
                    img.src = match[1];
                    img.style.width = '60px';
                    img.style.height = 'auto';
                    img.style.display = 'inline-block';
                    img.style.margin = '2px';
                    
                    editor.appendChild(img);
                    console.log('Fallback insertion successful');
                }
            } catch (fallbackError) {
                console.error('Fallback insertion also failed:', fallbackError);
            }
        }
    }

    showStickerModal(src, alt) {
        // Check if window for this sticker already exists
        const existingWindow = document.querySelector(`[data-sticker-src="${src}"]`);
        if (existingWindow) {
            this.bringWindowToFront(existingWindow);
            return;
        }

        // Create sticker window
        const stickerWindow = document.createElement('div');
        stickerWindow.className = 'sticker-preview-window active';
        stickerWindow.setAttribute('data-sticker-src', src);
        
        // Generate random position (ensure it doesn't overlap with taskbar)
        const taskbarHeight = 40;
        const windowPadding = 20;
        const randomX = Math.random() * (window.innerWidth - 450);
        const randomY = Math.max(taskbarHeight + windowPadding, Math.random() * (window.innerHeight - 500 - taskbarHeight - windowPadding));
        stickerWindow.style.left = `${Math.max(0, randomX)}px`;
        stickerWindow.style.top = `${Math.max(taskbarHeight + windowPadding, randomY)}px`;
        
        stickerWindow.innerHTML = `
            <div class="window-header">
                <div class="window-title">${alt}</div>
                <div class="window-controls">
                    <span class="close">×</span>
                </div>
            </div>
            <div class="sticker-preview-content">
                <img src="${src}" alt="${alt}">
            </div>
        `;

        // Add window to page
        document.body.appendChild(stickerWindow);

        // Layer order will be managed by bringWindowToFront when window is created

        // Setup window functionality
        this.setupStickerWindowDragging(stickerWindow);
        this.setupStickerWindowControls(stickerWindow);
        this.setupStickerWindowClickToFront(stickerWindow);
        
        // Bring the new sticker window to front
        this.bringWindowToFront(stickerWindow);
    }

    setupStickerWindowDragging(stickerWindow) {
        const header = stickerWindow.querySelector('.window-header');
        if (!header) return;

        let isDragging = false;
        let startX, startY, startLeft, startTop;

        header.addEventListener('mousedown', (e) => {
            // Don't drag if clicking on controls or buttons
            if (e.target.closest('.window-controls') ||
                e.target.closest('button') ||
                e.target.classList.contains('close') ||
                e.target.classList.contains('minimize')) {
                return;
            }

            // Initialize starting position
            startX = e.clientX;
            startY = e.clientY;
            startLeft = parseInt(stickerWindow.style.left) || 0;
            startTop = parseInt(stickerWindow.style.top) || 0;

            const handleMouseMove = (e) => {
                const deltaX = e.clientX - startX;
                const deltaY = e.clientY - startY;
                
                // Only start dragging after moving more than 3px (to prevent jitter)
                if (!isDragging && (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3)) {
                    isDragging = true;
                    
                    // Prevent default behavior once we start dragging
                    e.preventDefault();
                    
                    // Bring window to front and setup for dragging
                    this.bringWindowToFront(stickerWindow, true);
                    stickerWindow.classList.add('dragging');
                    
                    // During drag, use a high temporary z-index that doesn't conflict with layer system
                    stickerWindow.style.setProperty('z-index', '10000', 'important');
                }
                
                if (isDragging) {
                    e.preventDefault();
                    let newLeft = startLeft + deltaX;
                    let newTop = startTop + deltaY;

                    // Simple boundary constraints - only prevent going above taskbar
                    newTop = Math.max(40, newTop); // Keep above taskbar

                    stickerWindow.style.left = `${newLeft}px`;
                    stickerWindow.style.top = `${newTop}px`;
                }
            };

            const handleMouseUp = () => {
                if (isDragging) {
                    stickerWindow.classList.remove('dragging');
                    // After dragging, properly set z-index to stay on top
                    this.bringWindowToFront(stickerWindow, false);
                } else {
                    // If no dragging occurred, just bring window to front
                    this.bringWindowToFront(stickerWindow);
                }
                
                isDragging = false;
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
            };

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        });
    }

    setupStickerWindowControls(stickerWindow) {
        const closeBtn = stickerWindow.querySelector('.window-controls .close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                // Remove from layer order
                const windowId = this.getWindowId(stickerWindow);
                const layerIndex = this.windowLayerOrder.indexOf(windowId);
                if (layerIndex !== -1) {
                    this.windowLayerOrder.splice(layerIndex, 1);
                }
                this.recalculateWindowLayers();
                
                stickerWindow.remove();
            });
        }
    }

    setupStickerWindowClickToFront(stickerWindow) {
        // Add click handler to bring sticker window to front when clicked
        stickerWindow.addEventListener('mousedown', (e) => {
            console.log('🌟 Sticker window mousedown:', e.target);
            
            // Only bring to front if not clicking on window header or controls
            if (!e.target.closest('.window-header') && 
                !e.target.closest('.window-controls') &&
                !e.target.classList.contains('close')) {
                console.log('🎯 Bringing sticker window to front via click-to-front');
                this.bringWindowToFront(stickerWindow);
            } else {
                console.log('🚫 Not bringing to front - clicked on header/controls');
            }
        });
    }

    setupNoteWindowClickToFront(noteWindow) {
        // Add click handler to bring note window to front when clicked
        noteWindow.addEventListener('mousedown', (e) => {
            console.log('📝 Note window mousedown:', e.target);
            
            // Only bring to front if not clicking on window header or controls
            if (!e.target.closest('.window-header') && 
                !e.target.closest('.window-controls') &&
                !e.target.classList.contains('close')) {
                console.log('🎯 Bringing note window to front via click-to-front');
                this.bringWindowToFront(noteWindow);
            } else {
                console.log('🚫 Not bringing to front - clicked on header/controls');
            }
        });
    }

    filterStickers(searchTerm) {
        const stickerItems = document.querySelectorAll('.sticker-item');
        
        stickerItems.forEach(item => {
            const img = item.querySelector('img');
            const altText = img.alt.toLowerCase();
            const fileName = img.src.toLowerCase();
            
            // Search in both alt text and filename
            const isMatch = altText.includes(searchTerm) || 
                           fileName.includes(searchTerm);
            
            if (isMatch || searchTerm === '') {
                item.style.display = 'flex';
            } else {
                item.style.display = 'none';
            }
        });
    }

    // Sticky Notes functionality
    setupStickyNotes() {
        // Validate and fix any pinning rule violations
        this.validateNotePinningRules();
        // Load and display existing sticky notes
        this.loadStickyNotes();
    }
    
    saveCurrentNote() {
        const editor = document.querySelector('.notebook-editor');
        if (!editor || !editor.innerHTML.trim()) {
            alert('Please write something before saving!');
            return;
        }
        
        // Get current content
        const content = editor.innerHTML;
        const textContent = editor.textContent || editor.innerText || '';
        
        if (textContent.trim() === '') {
            alert('Please write something before saving!');
            return;
        }
        
        // Create sticky note object
        const stickyNote = {
            id: Date.now(),
            type: 'note',
            content: content,
            textContent: textContent.trim(),
            date: new Date().toLocaleDateString(),
            timestamp: Date.now()
        };
        
        // Save to localStorage
        let stickyNotes = JSON.parse(localStorage.getItem('sticky-notes') || '[]');
        stickyNotes.push(stickyNote);
        localStorage.setItem('sticky-notes', JSON.stringify(stickyNotes));
        
        // Clear editor
        editor.innerHTML = '';
        localStorage.removeItem('notebook-content');
        
        // Refresh sticky notes display
        this.loadStickyNotes();
        
        // Focus editor for next note
        editor.focus();
    }
    
    loadStickyNotes() {
        const container = document.getElementById('sticky-notes-container');
        if (!container) return;
        
        const stickyNotes = JSON.parse(localStorage.getItem('sticky-notes') || '[]');
        
        // Clear container
        container.innerHTML = '';
        
        // Create action buttons container
        const actionsContainer = document.createElement('div');
        actionsContainer.className = 'actions-container';
        
        // Add "Add New Note" sticky first
        const addNoteElement = document.createElement('div');
        addNoteElement.className = 'add-note-sticky';
        addNoteElement.innerHTML = `
            <div class="add-note-icon"><span class="material-symbols-outlined">sticky_note_2</span></div>
            <div class="add-note-text">New note</div>
        `;
        
        // Add click handler to open new note modal
        addNoteElement.addEventListener('click', () => {
            this.openNewNoteModal();
        });
        
        actionsContainer.appendChild(addNoteElement);
        
        // Add template buttons
        this.addNoteTemplates(actionsContainer);
        
        container.appendChild(actionsContainer);
        
        // Ensure all notes have timestamps
        stickyNotes.forEach(note => {
            if (!note.timestamp) {
                // Fallback: use ID as timestamp for older notes
                note.timestamp = note.id || Date.now();
            }
        });
        
        // Only work with notes (no folders)
        const notes = stickyNotes.filter(item => item.type !== 'folder');
        
        // Separate pinned and regular notes
        const pinnedNotes = notes.filter(note => note.pinned);
        const regularNotes = notes.filter(note => !note.pinned);
        
        
        // Sort by timestamp (newest first)
        pinnedNotes.sort((a, b) => {
            const timestampA = a.timestamp || a.id || 0;
            const timestampB = b.timestamp || b.id || 0;
            return timestampB - timestampA;
        });
        
        regularNotes.sort((a, b) => {
            const timestampA = a.timestamp || a.id || 0;
            const timestampB = b.timestamp || b.id || 0;
            return timestampB - timestampA;
        });
        
        // Save updated notes with timestamps back to localStorage
        localStorage.setItem('sticky-notes', JSON.stringify([...pinnedNotes, ...regularNotes]));
        
        if (pinnedNotes.length > 0) {
            const pinnedSection = document.createElement('div');
            pinnedSection.className = 'pinned-notes-section';
            pinnedSection.innerHTML = `<h4 class="section-title">${pinnedNotes.length} Pinned Note${pinnedNotes.length === 1 ? '' : 's'}</h4>`;
            container.appendChild(pinnedSection);
            
            const pinnedContainer = document.createElement('div');
            pinnedContainer.className = 'sticky-notes-grid';
            
            pinnedNotes.forEach(note => {
                const stickyElement = this.createStickyNoteElement(note);
                pinnedContainer.appendChild(stickyElement);
            });
            
            container.appendChild(pinnedContainer);
        }
        
        // Add regular notes organized by date sections
        if (regularNotes.length > 0) {
            this.addRegularNotesByDateSections(container, regularNotes);
        }
    }
    
    addRegularNotesByDateSections(container, regularNotes) {
        // Get current date info (using local timezone)
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        
        console.log('Date categorization debug:');
        console.log('Today:', today.toDateString());
        console.log('Yesterday:', yesterday.toDateString());
        console.log('Week ago:', weekAgo.toDateString());
        
        // Categorize notes by date
        const todayNotes = [];
        const yesterdayNotes = [];
        const previousWeekNotes = [];
        
        regularNotes.forEach(note => {
            // Use the more recent timestamp or lastUpdated date
            let noteTimestamp = note.timestamp || note.id || Date.now();
            
            // If note has lastUpdated, try to use that for more accuracy
            if (note.lastUpdated) {
                const parsedDate = new Date(note.lastUpdated);
                if (!isNaN(parsedDate.getTime())) {
                    noteTimestamp = parsedDate.getTime();
                }
            }
            
            const noteDate = new Date(noteTimestamp);
            const noteDateOnly = new Date(noteDate.getFullYear(), noteDate.getMonth(), noteDate.getDate());
            
            console.log(`Note: "${note.textContent?.substring(0, 20)}..." - Date: ${noteDateOnly.toDateString()}, Timestamp: ${noteTimestamp}`);
            
            if (noteDateOnly.getTime() === today.getTime()) {
                console.log('  -> Categorized as TODAY');
                todayNotes.push(note);
            } else if (noteDateOnly.getTime() === yesterday.getTime()) {
                console.log('  -> Categorized as YESTERDAY');
                yesterdayNotes.push(note);
            } else if (noteDateOnly >= weekAgo) {
                console.log('  -> Categorized as PREVIOUS WEEK');
                previousWeekNotes.push(note);
            } else {
                console.log('  -> Not categorized (older than 7 days)');
            }
        });
        
        // Add "Today" section
        if (todayNotes.length > 0) {
            const todaySection = document.createElement('div');
            todaySection.className = 'date-notes-section';
            todaySection.innerHTML = `<h4 class="section-title">Today</h4>`;
            container.appendChild(todaySection);
            
            const todayContainer = document.createElement('div');
            todayContainer.className = 'sticky-notes-grid';
            
            todayNotes.forEach(note => {
                const stickyElement = this.createStickyNoteElement(note);
                todayContainer.appendChild(stickyElement);
            });
            
            container.appendChild(todayContainer);
        }
        
        // Add "Yesterday" section
        if (yesterdayNotes.length > 0) {
            const yesterdaySection = document.createElement('div');
            yesterdaySection.className = 'date-notes-section';
            yesterdaySection.innerHTML = `<h4 class="section-title">Yesterday</h4>`;
            container.appendChild(yesterdaySection);
            
            const yesterdayContainer = document.createElement('div');
            yesterdayContainer.className = 'sticky-notes-grid';
            
            yesterdayNotes.forEach(note => {
                const stickyElement = this.createStickyNoteElement(note);
                yesterdayContainer.appendChild(stickyElement);
            });
            
            container.appendChild(yesterdayContainer);
        }
        
        // Add "Previous 7 days" section
        if (previousWeekNotes.length > 0) {
            const weekSection = document.createElement('div');
            weekSection.className = 'date-notes-section';
            weekSection.innerHTML = `<h4 class="section-title">📆 Previous 7 days</h4>`;
            container.appendChild(weekSection);
            
            const weekContainer = document.createElement('div');
            weekContainer.className = 'sticky-notes-grid';
            
            previousWeekNotes.forEach(note => {
                const stickyElement = this.createStickyNoteElement(note);
                weekContainer.appendChild(stickyElement);
            });
            
            container.appendChild(weekContainer);
        }
    }

    validateNotePinningRules() {
        // Clean up any legacy folder-related data
        const stickyNotes = JSON.parse(localStorage.getItem('sticky-notes') || '[]');
        let hasChanges = false;
        
        stickyNotes.forEach(note => {
            // Remove any legacy folder references
            if (note.folderId) {
                delete note.folderId;
                hasChanges = true;
            }
        });
        
        if (hasChanges) {
            localStorage.setItem('sticky-notes', JSON.stringify(stickyNotes));
            console.log('Cleaned up legacy folder references');
        }
    }
    
    refreshNotebookView() {
        this.loadStickyNotes();
    }
    
    addNoteTemplates(actionsContainer) {
        const templates = [
            {
                title: 'Daily Journal',
                icon: 'edit_note',
                content: `<div><strong>Daily Journal</strong></div><div><br></div><div><strong>Date:</strong> ${new Date().toLocaleDateString()}</div><div><br></div><div><strong>🌟 Today's Highlights:</strong></div><div>• Had a productive morning working on the project</div><div>• Enjoyed a great lunch with colleagues</div><div>• Finished reading an interesting article about productivity</div><div><br></div><div><strong>📝 Notes:</strong></div><div>Remember to follow up on the client email tomorrow. The weather was beautiful today - perfect for a walk during lunch break. Learned a new shortcut in the app that will save time.</div><div><br></div><div><strong>🎯 Tomorrow's Goals:</strong></div><div>• Complete the presentation for the Monday meeting</div><div>• Call mom to check in</div><div>• Start planning weekend activities</div>`
            },
            {
                title: 'To-do List',
                icon: 'checklist',
                content: `<div><strong>To-do List</strong></div><div><br></div><div><strong>High Priority:</strong></div><div>☐ Finish quarterly report by Friday</div><div>☐ Schedule dentist appointment</div><div>☐ Review budget for next month</div><div><br></div><div><strong>Regular Tasks:</strong></div><div>☐ Update project documentation</div><div>☐ Grocery shopping for the week</div><div>☐ Reply to pending emails</div><div>☐ Clean and organize desk workspace</div><div><br></div><div><strong>Low Priority:</strong></div><div>☐ Research vacation destinations</div><div>☐ Organize digital photo collection</div><div>☐ Update LinkedIn profile</div>`
            },
            {
                title: 'Meeting Notes',
                icon: 'groups',
                content: `<div><strong>Weekly Team Standup</strong></div><div><br></div><div><strong>📅 Date:</strong> ${new Date().toLocaleDateString()}</div><div><strong>👥 Attendees:</strong></div><div>• Sarah (Project Manager)</div><div>• Mike (Developer)</div><div>• Lisa (Designer)</div><div>• Alex (QA)</div><div><br></div><div><strong>📋 Agenda:</strong></div><div>1. Sprint progress review</div><div>2. Upcoming deadline discussion</div><div>3. Resource allocation for next phase</div><div>4. Client feedback review</div><div><br></div><div><strong>✅ Action Items:</strong></div><div>☐ Mike: Fix login bug by Wednesday</div><div>☐ Lisa: Complete UI mockups for new feature</div><div>☐ Alex: Update test scenarios document</div><div>☐ Sarah: Schedule client demo for Friday</div><div><br></div><div><strong>📝 Key Decisions:</strong></div><div>Agreed to extend current sprint by 2 days to accommodate client requests. Team will work remotely on Thursday. Next meeting scheduled for same time next week.</div>`
            }
        ];
        
        templates.forEach(template => {
            const templateElement = document.createElement('div');
            templateElement.className = 'template-note-sticky';
            templateElement.innerHTML = `
                <div class="template-note-icon"><span class="material-symbols-outlined">${template.icon}</span></div>
                <div class="template-note-text">${template.title}</div>
            `;
            
            templateElement.addEventListener('click', () => {
                this.openTemplateNote(template);
            });
            
            actionsContainer.appendChild(templateElement);
        });
    }
    
    openTemplateNote(template) {
        console.log('Opening template:', template.title);
        
        // Create the note immediately in storage
        const newNote = this.createNewNoteInStorage(template.content);
        
        // Open note window with the created note
        const noteWindow = this.createNoteWindow(newNote);
        
        if (!noteWindow) {
            console.error('Failed to create note window');
            return;
        }
        
        // Refresh the notebook view to show the new note
        this.loadStickyNotes();
        
        console.log('Template note created and saved:', template.title);
    }
    
    createNewNoteInStorage(content = '') {
        const stickyNotes = JSON.parse(localStorage.getItem('sticky-notes') || '[]');
        
        const newNote = {
            id: Date.now(),
            content: content,
            textContent: this.extractTextContent(content),
            date: new Date().toLocaleDateString(),
            lastUpdated: new Date().toLocaleDateString(),
            timestamp: Date.now(),
            pinned: false
        };
        
        stickyNotes.push(newNote);
        localStorage.setItem('sticky-notes', JSON.stringify(stickyNotes));
        
        return newNote;
    }
    
    // Manual function to force setup drag and drop
    forceStickerDragSetup() {
        console.log('Manually forcing sticker drag setup...');
        this.setupStickerModal();
    }
    
    getNotePreview(textContent) {
        if (!textContent) {
            return {
                title: 'Untitled note',
                preview: ''
            };
        }
        
        // Clean up the text content and normalize line breaks
        let cleanText = textContent.trim();
        
        // Handle both line breaks and potentially HTML formatting
        // Convert various HTML elements to line breaks first
        cleanText = cleanText.replace(/<\/div>/gi, '\n').replace(/<div[^>]*>/gi, '\n');
        cleanText = cleanText.replace(/<\/p>/gi, '\n').replace(/<p[^>]*>/gi, '\n');
        cleanText = cleanText.replace(/<br\s*\/?>/gi, '\n');
        cleanText = cleanText.replace(/<\/li>/gi, '\n').replace(/<li[^>]*>/gi, '\n');
        
        // Remove all remaining HTML tags
        cleanText = cleanText.replace(/<[^>]*>/g, '');
        
        // Remove checkbox symbols and other formatting characters
        cleanText = cleanText.replace(/[☐☑✓✗]/g, '').trim();
        
        // Split into lines and filter out empty ones
        const lines = cleanText.split(/[\r\n]+/).filter(line => line.trim().length > 0);
        
        // Get title (first line) and clean it further
        let title = lines.length > 0 ? lines[0].trim() : 'Untitled note';
        
        // Remove any remaining special formatting characters from title
        title = title.replace(/[☐☑✓✗]/g, '').trim();
        
        // Get preview content (all remaining lines, but we'll limit display to 2 lines)
        const previewLines = lines.slice(1);
        const preview = previewLines.join(' ').trim();
        
        // Limit title length
        const maxTitleLength = 40;
        const finalTitle = title.length > maxTitleLength ? 
            title.substring(0, maxTitleLength) + '...' : title;
        
        // Limit preview length (this will be limited to 2 lines in CSS)
        const maxPreviewLength = 100;
        const finalPreview = preview.length > maxPreviewLength ? 
            preview.substring(0, maxPreviewLength) + '...' : preview;
        
        return {
            title: finalTitle,
            preview: finalPreview
        };
    }
    
    
    
    
    
    
    
    
    
    
    createStickyNoteElement(note) {
        const stickyElement = document.createElement('div');
        stickyElement.className = note.pinned ? 'sticky-note pinned' : 'sticky-note';
        stickyElement.setAttribute('data-note-id', note.id);
        
        const notePreview = this.getNotePreview(note.textContent);
        stickyElement.innerHTML = `
            <div class="sticky-note-pin">
                <div class="sticky-note-icon ${note.pinned ? 'pinned-icon' : ''}" title="${note.pinned ? 'Pinned note' : 'Regular note'}">
                    <span class="material-symbols-outlined ${note.pinned ? 'filled' : ''}">keep</span>
                </div>
            </div>
            <div class="sticky-note-content">
                <div class="sticky-note-title">${notePreview.title}</div>
                <div class="sticky-note-preview">${notePreview.preview || ''}</div>
                <div class="sticky-note-date">Updated: ${note.lastUpdated || note.date}</div>
            </div>
        `;
        
        // Make sticky notes draggable first
        this.makeStickyNoteDraggable(stickyElement, note);
        
        // Add click handler to open note in modal for editing (with drag detection)
        let isDragging = false;
        let dragStarted = false;
        
        stickyElement.addEventListener('mousedown', () => {
            isDragging = false;
            dragStarted = false;
        });
        
        stickyElement.addEventListener('dragstart', () => {
            dragStarted = true;
        });
        

        // Add icon click handler for pin/unpin functionality  
        const iconBtn = stickyElement.querySelector('.sticky-note-icon');
        iconBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent opening the note
            this.toggleStickyNotePin(note, stickyElement);
        });

        stickyElement.addEventListener('click', (e) => {
            if (!dragStarted && !isDragging && 
                !e.target.classList.contains('sticky-note-icon')) {
                // Prevent the notebook window from coming to front
                e.preventDefault();
                e.stopPropagation();
                
                // Small delay to avoid competing focus events
                setTimeout(() => {
                    this.editStickyNote(note);
                }, 10);
            }
        });
        
        return stickyElement;
    }

    toggleStickyNotePin(note, stickyElement) {
        // Toggle the pin state
        note.pinned = !note.pinned;
        
        // Update the note in storage
        const stickyNotes = JSON.parse(localStorage.getItem('sticky-notes') || '[]');
        const noteIndex = stickyNotes.findIndex(n => n.id === note.id);
        if (noteIndex !== -1) {
            stickyNotes[noteIndex].pinned = note.pinned;
            localStorage.setItem('sticky-notes', JSON.stringify(stickyNotes));
        }
        
        // Visual updates will be handled by refreshNotebookView()
        
        // Show notification
        this.showNotification(
            note.pinned ? 'Note pinned!' : 'Note unpinned!', 
            'success'
        );
        
        // Refresh the entire notebook view to show note in correct section
        this.refreshNotebookView();
    }

    moveNoteToCorrectSection(note, stickyElement) {
        // Find the correct grid container
        let targetContainer = null;
        
        if (note.pinned) {
            // Look for pinned notes grid (should be after pinned-notes-section)
            const pinnedSection = document.querySelector('.pinned-notes-section');
            if (pinnedSection) {
                targetContainer = pinnedSection.nextElementSibling;
                // Verify it's a sticky-notes-grid
                if (targetContainer && !targetContainer.classList.contains('sticky-notes-grid')) {
                    targetContainer = null;
                }
            }
        } else {
            // Look for regular notes grid (should be after regular-notes-section) 
            const regularSection = document.querySelector('.regular-notes-section');
            if (regularSection) {
                targetContainer = regularSection.nextElementSibling;
                // Verify it's a sticky-notes-grid
                if (targetContainer && !targetContainer.classList.contains('sticky-notes-grid')) {
                    targetContainer = null;
                }
            }
        }
        
        if (targetContainer) {
            // Add smooth transition effect
            stickyElement.style.transition = 'all 0.3s ease';
            stickyElement.style.transform = 'scale(0.8)';
            stickyElement.style.opacity = '0.5';
            
            setTimeout(() => {
                // Move to correct section
                targetContainer.appendChild(stickyElement);
                
                // Restore appearance with animation
                stickyElement.style.transform = 'scale(1)';
                stickyElement.style.opacity = '1';
                
                // Clean up transition after animation
                setTimeout(() => {
                    stickyElement.style.transition = '';
                }, 300);
            }, 150);
            
            // Update section counts
            this.updateSectionCounts();
        } else {
            // If we can't find the target container, the section might not exist yet
            // This happens when pinning the first note or unpinning the last pinned note
            console.log('Could not find target container, refreshing view to create sections');
            this.showNotebookContent();
        }
    }

    updateSectionCounts() {
        const stickyNotes = JSON.parse(localStorage.getItem('sticky-notes') || '[]');
        const notes = stickyNotes.filter(item => !item.isFolder);
        const pinnedNotes = notes.filter(note => note.pinned);
        const regularNotes = notes.filter(note => !note.pinned);
        
        // Update pinned section title
        const pinnedSection = document.querySelector('.pinned-notes-section h4');
        if (pinnedSection && pinnedNotes.length > 0) {
            pinnedSection.innerHTML = `${pinnedNotes.length} Pinned Note${pinnedNotes.length === 1 ? '' : 's'}`;
        }
        
        // Update regular section title  
        const regularSection = document.querySelector('.regular-notes-section h4');
        if (regularSection && regularNotes.length > 0) {
            regularSection.textContent = `📝 ${regularNotes.length} Note${regularNotes.length === 1 ? '' : 's'}`;
        }
        
        // Hide empty sections
        const pinnedContainer = document.querySelector('.pinned-notes-section');
        const regularContainer = document.querySelector('.regular-notes-section');
        
        if (pinnedContainer) {
            pinnedContainer.style.display = pinnedNotes.length > 0 ? 'block' : 'none';
        }
        if (regularContainer) {
            regularContainer.style.display = regularNotes.length > 0 ? 'block' : 'none';
        }
    }
    
    
    makeStickyNoteDraggable(stickyElement, note) {
        stickyElement.draggable = true;
        stickyElement.setAttribute('data-drag-type', 'note');
        stickyElement.setAttribute('data-note-data', JSON.stringify(note));
        
        stickyElement.addEventListener('dragstart', (e) => {
            // Prevent dragging if this is a click on the note to edit it
            if (e.target.closest('.sticky-note') !== stickyElement) {
                e.preventDefault();
                return;
            }
            
            e.stopPropagation(); // Prevent parent drag handlers
            
            // Store drag data
            e.dataTransfer.setData('text/plain', JSON.stringify({
                type: 'note',
                noteId: note.id,
                noteData: note
            }));
            
            // Visual feedback - make dragged element semi-transparent
            stickyElement.style.opacity = '0.5';
            stickyElement.classList.add('dragging');
            
            // Set drag effect
            e.dataTransfer.effectAllowed = 'move';
            
            
            console.log('Started dragging note:', note.id);
        });
        
        stickyElement.addEventListener('dragend', (e) => {
            // Reset visual state
            stickyElement.style.opacity = '1';
            stickyElement.classList.remove('dragging');
            
            
            console.log('Finished dragging note:', note.id);
        });
    }
    
    
    











    
    


    
    
    
    
    
    
    
    

    
    loadStickyNote(note) {
        const editor = document.querySelector('.notebook-editor');
        if (!editor) return;
        
        // Load content into editor
        editor.innerHTML = note.content;
        
        // Save to current notebook content
        localStorage.setItem('notebook-content', note.content);
        
        // Focus editor
        editor.focus();
        
        // Optionally remove the sticky note from storage since it's being edited
        this.removeStickyNote(note.id);
    }
    
    editStickyNote(note) {
        // Check if a window for this note is already open
        const existingWindow = document.querySelector(`[data-note-id="${note.id}"].note-editor-window`);
        
        if (existingWindow) {
            // Window already exists - bring it to front and make it active
            existingWindow.classList.add('active');
            this.bringWindowToFront(existingWindow);
            return;
        }
        
        // Create a new note window for editing this specific note
        this.createNoteWindow(note);
    }
    
    bringWindowToFront(targetWindow, isDuringDrag = false) {
        if (!targetWindow) {
            console.log('🚫 Not bringing window to front - targetWindow is null');
            return;
        }
        
        // Make sure the window is active when bringing to front
        targetWindow.classList.add('active');
        
        // Get window identifier
        const windowId = this.getWindowId(targetWindow);
        // console.log(`🔝 Bringing window to front: ${windowId}`);
        // console.log(`🔝 Layer order before:`, [...this.windowLayerOrder]);
        
        // Remove from current position in layer order
        const currentIndex = this.windowLayerOrder.indexOf(windowId);
        if (currentIndex !== -1) {
            this.windowLayerOrder.splice(currentIndex, 1);
            // console.log(`🔝 Removed ${windowId} from position ${currentIndex}`);
        }
        
        // Add to top of layer order
        this.windowLayerOrder.push(windowId);
        // console.log(`🔝 Added ${windowId} to top. Layer order after:`, [...this.windowLayerOrder]);
        
        // Recalculate all z-indices based on layer order
        this.recalculateWindowLayers();
        
        // Remove focus from all other windows first
        document.querySelectorAll('.window.active, .note-editor-window.active, .sticker-preview-window').forEach(win => {
            if (win !== targetWindow) {
                win.classList.remove('focused');
                win.style.setProperty('opacity', '1', 'important');
            }
        });
        
        // Add focused class to target window
        targetWindow.classList.add('focused');
        targetWindow.style.setProperty('opacity', '1', 'important');
        
        // Skip animations to prevent bouncing
        if (!isDuringDrag) {
            targetWindow.focus();
        }
        
        // Also focus the editor inside if it exists
        const editor = targetWindow.querySelector('.note-modal-editor');
        if (editor) {
            editor.focus();
        }
        
        // console.log(`🔝 Window brought to front: ${windowId}, Layer order:`, this.windowLayerOrder);
    }
    
    getWindowId(windowElement) {
        // Get a unique identifier for the window
        if (windowElement.id) {
            return windowElement.id;
        }
        if (windowElement.dataset.window) {
            return windowElement.dataset.window;
        }
        if (windowElement.dataset.noteId) {
            return `note-${windowElement.dataset.noteId}`;
        }
        if (windowElement.dataset.stickerSrc) {
            return `sticker-${windowElement.dataset.stickerSrc}`;
        }
        if (windowElement.classList.contains('about-window')) {
            return 'main-notebook';
        }
        if (windowElement.classList.contains('skills-window')) {
            return 'sticker-window';
        }
        if (windowElement.classList.contains('contact-window')) {
            return 'camera-window';
        }
        // Fallback - create a unique ID
        const uniqueId = `window-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        windowElement.id = uniqueId;
        return uniqueId;
    }
    
    recalculateWindowLayers() {
        // Skip recalculation if any popup is currently visible
        const existingPopup = document.querySelector('.rename-popup, .delete-popup, .remove-note-popup');
        if (existingPopup) {
            console.log('🚫 Skipping recalculateWindowLayers - popup is visible');
            return;
        }
        
        // console.log('🚨 recalculateWindowLayers called');
        // console.trace(); // This will show the call stack
        
        // Base z-index for all windows - high enough to be above all main app windows
        const baseZIndex = 100000;
        
        // Get all active windows
        const allWindows = document.querySelectorAll('.window.active, .note-editor-window.active, .sticker-preview-window');
        
        // Create a map of window elements by their IDs
        const windowMap = new Map();
        allWindows.forEach(win => {
            const windowId = this.getWindowId(win);
            windowMap.set(windowId, win);
        });
        
        // console.log('🔄 Recalculating layers. Current layer order:', [...this.windowLayerOrder]);
        // console.log('🔄 Found active windows:', Array.from(allWindows).map(w => this.getWindowId(w)));
        
        // Show current z-indices
        // allWindows.forEach(win => {
        //     const id = this.getWindowId(win);
        //     const zIndex = window.getComputedStyle(win).zIndex;
        //     console.log(`  ${id}: z-index = ${zIndex}`);
        // });
        
        // Clean up layer order - remove windows that no longer exist
        const originalLayerOrder = [...this.windowLayerOrder];
        this.windowLayerOrder = this.windowLayerOrder.filter(windowId => windowMap.has(windowId));
        
        // Add any new windows that aren't in the layer order yet (in DOM order for consistency)
        Array.from(allWindows).forEach(win => {
            const windowId = this.getWindowId(win);
            if (!this.windowLayerOrder.includes(windowId)) {
                this.windowLayerOrder.push(windowId);
                // console.log(`➕ Added new window to layer order: ${windowId}`);
            }
        });
        
        // console.log('🔄 Final layer order:', [...this.windowLayerOrder]);
        
        // Apply z-indices based on layer order
        this.windowLayerOrder.forEach((windowId, index) => {
            const windowElement = windowMap.get(windowId);
            if (windowElement) {
                const zIndex = baseZIndex + (index * 10);
                windowElement.style.setProperty('z-index', zIndex, 'important');
                console.log(`🎯 Set ${windowId} z-index to ${zIndex} (position ${index})`);
            }
        });
        
        // Update the global counter
        this.windowZIndex = baseZIndex + (this.windowLayerOrder.length * 10);
    }
    
    
    // Drag and drop folder creation functionality removed
    
    deleteCurrentNote() {
        const editor = document.querySelector('.notebook-editor');
        if (!editor) return;
        
        // Clear the editor
        editor.innerHTML = '';
        
        // Clear auto-saved content
        localStorage.removeItem('notebook-content');
        
        // Focus editor
        editor.focus();
    }
    
    removeStickyNote(noteId) {
        let stickyNotes = JSON.parse(localStorage.getItem('sticky-notes') || '[]');
        let noteFound = false;
        
        // Remove note from main array
        const originalLength = stickyNotes.length;
        stickyNotes = stickyNotes.filter(note => note.id !== noteId);
        
        if (stickyNotes.length < originalLength) {
            noteFound = true;
        }
        
        if (noteFound) {
            localStorage.setItem('sticky-notes', JSON.stringify(stickyNotes));
            
            // Refresh main view
            this.loadStickyNotes();
        }
    }

    // New Note Modal functionality
    openNewNoteModal() {
        console.log('Opening new note');
        
        // Create the note immediately in storage (empty content)
        const newNote = this.createNewNoteInStorage('');
        
        // Open note window with the created note
        const noteWindow = this.createNoteWindow(newNote);
        
        // Refresh the notebook view to show the new note
        this.loadStickyNotes();
        
        console.log('New note created and saved');
        return noteWindow;
    }
    
    createNoteWindow(note = null) {
        // Generate unique ID for this note window
        const windowId = `note-window-${Date.now()}`;
        const isNewNote = !note;
        
        // Create the note window HTML
        const noteWindow = document.createElement('div');
        noteWindow.className = 'window note-editor-window';
        noteWindow.setAttribute('data-window', windowId);
        noteWindow.id = windowId;
        
        // Set data-note-id for existing notes so we can find the window later
        if (note) {
            noteWindow.setAttribute('data-note-id', note.id);
        }
        
        // Determine title - for newly created notes, still show "New note"
        const windowTitle = (note && note.content && note.content.trim()) ? 'Edit note' : 'New note';
        const editorContent = note ? note.content : '';
        
        noteWindow.innerHTML = `
            <div class="window-header">
                <div class="window-title">
                    <span class="note-title-text">${windowTitle}</span>
                    <button class="modal-pin-btn" title="Pin note">
                        <span class="material-symbols-outlined">push_pin</span>
                    </button>
                    <button class="modal-delete-btn" title="Delete note">Delete</button>
                </div>
                <div class="window-controls">
                    <span class="close">×</span>
                </div>
            </div>
            <div class="window-content">
                <div class="note-editor-container">
                    <!-- Persistent Formatting Toolbar -->
                    <div class="note-formatting-toolbar">
                        <button class="toolbar-btn" data-action="bold" title="Bold">
                            <span class="toolbar-icon">B</span>
                        </button>
                        <button class="toolbar-btn" data-action="underline" title="Underline">
                            <span class="toolbar-icon">U</span>
                        </button>
                        <button class="toolbar-btn" data-action="italic" title="Italic">
                            <span class="toolbar-icon">I</span>
                        </button>
                        
                        <div class="toolbar-divider"></div>
                        
                        <button class="toolbar-btn" data-action="bullet" title="Bullet List">
                            <span class="toolbar-icon">•</span>
                        </button>
                        <button class="toolbar-btn" data-action="number" title="Numbered List">
                            <span class="toolbar-icon">1.</span>
                        </button>
                        <button class="toolbar-btn" data-action="checkbox" title="Checkbox">
                            <span class="toolbar-icon">☐</span>
                        </button>
                        <button class="toolbar-btn" data-action="code" title="Code">
                            <span class="toolbar-icon">&lt;/&gt;</span>
                        </button>
                        
                        <div class="toolbar-divider"></div>
                        
                        <button class="toolbar-btn color-btn" data-action="color" data-color="#ff4444" title="Red">
                            <span class="color-dot" style="background: #ff4444;"></span>
                        </button>
                        <button class="toolbar-btn color-btn" data-action="color" data-color="#FF8DA1" title="Pink">
                            <span class="color-dot" style="background: #FF8DA1;"></span>
                        </button>
                        <button class="toolbar-btn color-btn" data-action="color" data-color="#4444ff" title="Blue">
                            <span class="color-dot" style="background: #4444ff;"></span>
                        </button>
                        <button class="toolbar-btn color-btn" data-action="color" data-color="#2E6F40" title="Green">
                            <span class="color-dot" style="background: #2E6F40;"></span>
                        </button>
                        <button class="toolbar-btn color-btn" data-action="color" data-color="#ff8800" title="Orange">
                            <span class="color-dot" style="background: #ff8800;"></span>
                        </button>
                        <button class="toolbar-btn color-btn" data-action="color" data-color="#333333" title="Black">
                            <span class="color-dot" style="background: #333333;"></span>
                        </button>
                    </div>
                    
                    <div class="note-editor-body">
                        <div 
                            class="note-modal-editor" 
                            contenteditable="true"
                            data-placeholder="Start writing your note here..."
                            spellcheck="false"
                        >${editorContent}</div>
                    </div>
                </div>
            </div>
        `;
        
        // Add to DOM
        document.body.appendChild(noteWindow);
        
        // Layer order will be managed by bringWindowToFront when window is positioned
        
        // Ensure the window doesn't have interfering classes
        noteWindow.classList.remove('resizing');
        noteWindow.style.pointerEvents = 'auto';
        
        // Store note data in window element
        if (note) {
            noteWindow.noteData = { ...note }; // Create a copy to avoid reference issues
            noteWindow.isPinned = note.pinned || false;
        } else {
            noteWindow.isPinned = false;
        }
        noteWindow.isNewNote = isNewNote;
        
        // Add to active windows and show directly (bypass openWindow for dynamic windows)
        this.activeWindows.add(windowId);
        noteWindow.classList.add('active');
        
        // Position the window with some offset to avoid overlap (after showing)
        setTimeout(() => {
            this.positionNoteWindow(noteWindow);
            // Bring the new window to front without disrupting focus
            this.bringWindowToFront(noteWindow);
        }, 50);
        
        // Add resize handles and setup dragging
        this.addResizeHandles(noteWindow);
        this.setupRegularWindowDragging();
        this.setupNoteWindowClickToFront(noteWindow);
        
        // Setup event listeners for this specific window (with small delay to ensure DOM is ready)
        setTimeout(() => {
            this.setupNoteWindowListeners(noteWindow);
            
            // Initialize pin button state
            const pinBtn = noteWindow.querySelector('.modal-pin-btn');
            this.updatePinButtonState(noteWindow.isPinned, pinBtn);
        }, 10);
        
        // Focus the editor
        const editor = noteWindow.querySelector('.note-modal-editor');
        setTimeout(() => {
            editor.focus();
        }, 100);
    }
    
    positionNoteWindow(noteWindow) {
        // Simple, reliable positioning - center-right with cascade
        const existingNoteWindows = document.querySelectorAll('.note-editor-window.active');
        const offset = existingNoteWindows.length * 30;
        
        const taskbarHeight = 40;
        
        // Position in right half of screen with cascade
        let left = Math.min(450 + offset, window.innerWidth - 650);
        let top = Math.max(taskbarHeight + 20, 100 + offset);
        
        // Ensure it stays on screen
        if (left > window.innerWidth - 650) left = 50;
        if (top > window.innerHeight - 550) top = taskbarHeight + 20;
        
        // Apply positioning
        noteWindow.style.setProperty('position', 'absolute', 'important');
        noteWindow.style.setProperty('left', `${left}px`, 'important');
        noteWindow.style.setProperty('top', `${top}px`, 'important');
        noteWindow.style.setProperty('right', 'auto', 'important');
        noteWindow.style.setProperty('bottom', 'auto', 'important');
        noteWindow.style.setProperty('transform', 'none', 'important');
    }
    
    setupNoteWindowListeners(noteWindow) {
        const editor = noteWindow.querySelector('.note-modal-editor');
        const pinBtn = noteWindow.querySelector('.modal-pin-btn');
        const deleteBtn = noteWindow.querySelector('.modal-delete-btn');
        const closeBtn = noteWindow.querySelector('.close');
        // contextMenu removed - now using toolbar
        
        // Ensure all buttons have proper pointer events
        [pinBtn, deleteBtn, closeBtn].forEach(btn => {
            if (btn) {
                btn.style.pointerEvents = 'auto';
                btn.style.position = 'relative';
                btn.style.zIndex = '999';
            }
        });
        
        // Close button
        if (closeBtn) {
            closeBtn.style.pointerEvents = 'auto';
            closeBtn.style.position = 'relative';
            closeBtn.style.zIndex = '9999';
            closeBtn.style.cursor = 'pointer';
            closeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                this.closeNoteWindow(noteWindow);
            });
            
            // Prevent window dragging on close button
            closeBtn.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                e.stopImmediatePropagation();
            });
        }
        
        // Delete button
        if (deleteBtn) {
            console.log('🔧 Setting up delete button listener');
            deleteBtn.addEventListener('mousedown', (e) => {
                console.log('🗑️ Delete button mousedown');
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
            });
            
            deleteBtn.addEventListener('click', (e) => {
                console.log('🗑️ Delete button clicked');
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                this.showDeleteConfirmation(noteWindow);
            });
        }
        
        // Pin button
        if (pinBtn) {
            pinBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.togglePinNoteWindow(noteWindow);
            });
        }
        
        // Setup formatting toolbar
        this.setupFormattingToolbar(noteWindow, editor);
        
        // Setup keyboard shortcuts
        this.setupFormattingKeyboardShortcuts(editor);
        
        // Setup auto-save functionality
        this.setupAutoSave(noteWindow, editor);
        
        // Update pin button state
        const isPinned = noteWindow.noteData ? noteWindow.noteData.pinned : false;
        this.updatePinButtonState(isPinned, pinBtn);
        
        return noteWindow;
    }
    
    setupFormattingToolbar(noteWindow, editor) {
        const toolbar = noteWindow.querySelector('.note-formatting-toolbar');
        if (!toolbar) {
            return;
        }
        
        // Add click handlers for all toolbar buttons
        toolbar.addEventListener('click', (e) => {
            const toolbarBtn = e.target.closest('.toolbar-btn');
            if (!toolbarBtn) return;
            
            e.preventDefault();
            e.stopPropagation();
            
            // Focus the editor to ensure we can format
            editor.focus();
            
            const action = toolbarBtn.getAttribute('data-action');
            const color = toolbarBtn.getAttribute('data-color');
            
            // Apply formatting based on action
            switch (action) {
                case 'bold':
                    document.execCommand('bold', false, null);
                    break;
                case 'underline':
                    document.execCommand('underline', false, null);
                    break;
                case 'italic':
                    document.execCommand('italic', false, null);
                    break;
                case 'bullet':
                    document.execCommand('insertUnorderedList', false, null);
                    break;
                case 'number':
                    document.execCommand('insertOrderedList', false, null);
                    break;
                case 'checkbox':
                    this.insertCheckbox(editor);
                    break;
                case 'code':
                    // Only apply code formatting if explicitly clicked
                    e.preventDefault();
                    e.stopPropagation();
                    this.applyCodeFormatting(editor);
                    break;
                case 'color':
                    if (color) {
                        document.execCommand('foreColor', false, color);
                    }
                    break;
            }
            
            // Update toolbar button states
            this.updateToolbarButtonStates(toolbar, editor);
        });
        
        // Update button states when selection changes
        editor.addEventListener('selectionchange', () => {
            this.updateToolbarButtonStates(toolbar, editor);
        });
        
        // Update button states when clicking in the editor
        editor.addEventListener('mouseup', () => {
            setTimeout(() => this.updateToolbarButtonStates(toolbar, editor), 10);
        });
        
        editor.addEventListener('keyup', () => {
            setTimeout(() => this.updateToolbarButtonStates(toolbar, editor), 10);
        });
        
        // Add keyboard handler for removing list formatting
        editor.addEventListener('keydown', (e) => {
            this.handleListFormattingKeyboard(e, editor);
        });
        
        // Setup sticker drop zone for this note editor
        console.log('Setting up drop zone for new note editor...');
        this.addDropZoneToEditor(noteWindow);
        
        // Also make sure all stickers are draggable if they aren't already
        setTimeout(() => {
            const stickerItems = document.querySelectorAll('.sticker-item:not([draggable])');
            if (stickerItems.length > 0) {
                console.log('Making', stickerItems.length, 'stickers draggable');
                this.setupStickerModal();
            }
        }, 100);
    }
    
    updateToolbarButtonStates(toolbar, editor) {
        // Update button states based on current selection
        const boldBtn = toolbar.querySelector('[data-action="bold"]');
        const underlineBtn = toolbar.querySelector('[data-action="underline"]');
        const italicBtn = toolbar.querySelector('[data-action="italic"]');
        const codeBtn = toolbar.querySelector('[data-action="code"]');
        
        if (boldBtn) boldBtn.classList.toggle('active', document.queryCommandState('bold'));
        if (underlineBtn) underlineBtn.classList.toggle('active', document.queryCommandState('underline'));
        if (italicBtn) italicBtn.classList.toggle('active', document.queryCommandState('italic'));
        
        // Check if selection contains or is inside code formatting
        if (codeBtn) {
            const selection = window.getSelection();
            let isInCode = false;
            
            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                
                if (range.collapsed) {
                    // No selection, check if cursor is inside code
                    let node = range.commonAncestorContainer;
                    while (node && node !== editor) {
                        if (node.tagName === 'CODE') {
                            isInCode = true;
                            break;
                        }
                        node = node.parentNode;
                    }
                } else {
                    // Text selected, check if any part is code formatted
                    try {
                        const tempDiv = document.createElement('div');
                        tempDiv.appendChild(range.cloneContents());
                        isInCode = tempDiv.querySelector('code') !== null;
                    } catch (e) {
                        console.warn('Error checking code formatting state:', e);
                        isInCode = false;
                    }
                }
            }
            
            codeBtn.classList.toggle('active', isInCode);
        }
    }
    
    applyFormatting(command, value = null) {
        // Restore selection if we saved one
        if (this.savedSelection) {
            this.restoreSelection(this.savedSelection);
        }
        
        // Apply the formatting command
        try {
            const result = document.execCommand(command, false, value);
            console.log(`Applied formatting command: ${command}, value: ${value}, result: ${result}`);
        } catch (error) {
            console.error('Error applying formatting:', error);
        }
        
        // Clear saved selection
        this.savedSelection = null;
    }
    
    insertCheckbox(editor) {
        const selection = window.getSelection();
        const range = selection.getRangeAt(0);
        
        // Create checkbox element
        const checkbox = document.createElement('span');
        checkbox.innerHTML = '☐ ';
        checkbox.className = 'checkbox-item';
        checkbox.style.cursor = 'pointer';
        checkbox.style.userSelect = 'none';
        checkbox.style.fontSize = '18px';
        
        // Add click handler to toggle checkbox
        checkbox.addEventListener('click', function() {
            if (this.innerHTML === '☐ ') {
                this.innerHTML = '☑ ';
            } else {
                this.innerHTML = '☐ ';
            }
        });
        
        // Insert checkbox at cursor position
        range.insertNode(checkbox);
        
        // Move cursor after checkbox
        range.setStartAfter(checkbox);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        
        editor.focus();
    }
    
    applyCodeFormatting(editor) {
        // Use document.execCommand approach similar to bold/italic/underline
        const selection = window.getSelection();
        if (selection.rangeCount === 0) return;
        
        const range = selection.getRangeAt(0);
        
        // Check if we're already in a code element
        let parentCode = null;
        let node = range.commonAncestorContainer;
        while (node && node !== editor) {
            if (node.tagName === 'CODE') {
                parentCode = node;
                break;
            }
            node = node.parentNode;
        }
        
        if (parentCode) {
            // Remove code formatting - unwrap the code element safely
            const parent = parentCode.parentNode;
            const textContent = parentCode.textContent;
            const textNode = document.createTextNode(textContent);
            
            parent.replaceChild(textNode, parentCode);
            
            // Position cursor after the unwrapped text
            const newRange = document.createRange();
            newRange.setStartAfter(textNode);
            newRange.collapse(true);
            selection.removeAllRanges();
            selection.addRange(newRange);
        } else {
            // Apply code formatting using execCommand approach
            if (range.collapsed) {
                // Insert placeholder code
                const code = document.createElement('code');
                code.textContent = 'code';
                code.style.fontFamily = 'monospace';
                code.style.backgroundColor = '#f5f5f5';
                code.style.padding = '2px 4px';
                code.style.borderRadius = '3px';
                code.style.border = '1px solid #ddd';
                code.style.display = 'inline';
                
                range.insertNode(code);
                
                // Select the placeholder
                const newRange = document.createRange();
                newRange.selectNodeContents(code);
                selection.removeAllRanges();
                selection.addRange(newRange);
            } else {
                // Wrap selection in code element
                try {
                    const contents = range.extractContents();
                    const code = document.createElement('code');
                    code.style.fontFamily = 'monospace';
                    code.style.backgroundColor = '#f5f5f5';
                    code.style.padding = '2px 4px';
                    code.style.borderRadius = '3px';
                    code.style.border = '1px solid #ddd';
                    code.style.display = 'inline';
                    
                    code.appendChild(contents);
                    range.insertNode(code);
                    
                    // Maintain selection
                    const newRange = document.createRange();
                    newRange.selectNodeContents(code);
                    selection.removeAllRanges();
                    selection.addRange(newRange);
                } catch (e) {
                    console.error('Code formatting error:', e);
                }
            }
        }
        
        editor.focus();
    }
    
    handleListFormattingKeyboard(e, editor) {
        // Handle backspace/delete to remove list formatting
        if (e.key === 'Backspace' || e.key === 'Delete') {
            const selection = window.getSelection();
            if (selection.rangeCount === 0) return;
            
            const range = selection.getRangeAt(0);
            
            // Only handle when cursor is at the beginning of the line
            if (range.collapsed && range.startOffset === 0) {
                let listItem = null;
                let node = range.startContainer;
                
                // Find if we're in a list item
                while (node && node !== editor) {
                    if (node.tagName === 'LI') {
                        listItem = node;
                        break;
                    }
                    node = node.parentNode;
                }
                
                if (listItem) {
                    const list = listItem.parentNode;
                    
                    // Check if this is the first list item and it's empty or cursor is at start
                    const isFirstItem = listItem === list.firstElementChild;
                    const isEmpty = listItem.textContent.trim() === '';
                    
                    if (isFirstItem || isEmpty) {
                        e.preventDefault();
                        
                        // Get the text content of the list item
                        const textContent = listItem.textContent;
                        
                        if (isEmpty) {
                            // If empty, just remove the list item
                            if (list.children.length === 1) {
                                // If it's the only item, remove the entire list
                                const paragraph = document.createElement('div');
                                paragraph.innerHTML = '<br>';
                                list.parentNode.replaceChild(paragraph, list);
                                
                                // Position cursor in the new paragraph
                                const newRange = document.createRange();
                                newRange.setStart(paragraph, 0);
                                newRange.collapse(true);
                                selection.removeAllRanges();
                                selection.addRange(newRange);
                            } else {
                                // Remove just this list item
                                listItem.remove();
                            }
                        } else {
                            // Convert list item to regular paragraph, preserving formatting
                            const paragraph = document.createElement('div');
                            paragraph.innerHTML = listItem.innerHTML; // Preserve HTML formatting
                            
                            if (list.children.length === 1) {
                                // If it's the only item, replace the entire list
                                list.parentNode.replaceChild(paragraph, list);
                            } else {
                                // Insert paragraph before the list and remove this item
                                list.parentNode.insertBefore(paragraph, list);
                                listItem.remove();
                            }
                            
                            // Position cursor at the beginning of the new paragraph
                            const newRange = document.createRange();
                            const firstNode = paragraph.firstChild || paragraph;
                            newRange.setStart(firstNode, 0);
                            newRange.collapse(true);
                            selection.removeAllRanges();
                            selection.addRange(newRange);
                        }
                    }
                }
            }
        }
    }
    
    setupAutoSave(noteWindow, editor) {
        let autoSaveTimer;
        
        const performAutoSave = () => {
            const content = editor.innerHTML.trim();
            if (content) {
                this.autoSaveNote(noteWindow);
            }
        };
        
        // Auto-save on content changes (debounced)
        const handleInput = () => {
            clearTimeout(autoSaveTimer);
            autoSaveTimer = setTimeout(performAutoSave, 1000); // Save after 1 second of no typing
        };
        
        editor.addEventListener('input', handleInput);
        editor.addEventListener('paste', handleInput);
        editor.addEventListener('keyup', handleInput);
        
        // Auto-save when window loses focus
        noteWindow.addEventListener('blur', performAutoSave);
        
        // Store the cleanup function on the window
        noteWindow.autoSaveCleanup = () => {
            clearTimeout(autoSaveTimer);
            editor.removeEventListener('input', handleInput);
            editor.removeEventListener('paste', handleInput);
            editor.removeEventListener('keyup', handleInput);
            noteWindow.removeEventListener('blur', performAutoSave);
        };
    }
    
    autoSaveNote(noteWindow) {
        const editor = noteWindow.querySelector('.note-modal-editor');
        
        // Clone editor to remove auto-save indicator before getting content
        const editorClone = editor.cloneNode(true);
        const indicator = editorClone.querySelector('.auto-save-indicator');
        if (indicator) {
            indicator.remove();
        }
        const content = editorClone.innerHTML.trim();
        
        // For existing notes, always save pin state even if content is empty
        // For new notes, only save if content exists OR if trying to pin/unpin
        if (!content && !noteWindow.noteData) {
            return; // Don't save completely new empty notes
        }
        
        const stickyNotes = JSON.parse(localStorage.getItem('sticky-notes') || '[]');
        
        if (noteWindow.noteData) {
            // Check if this note exists in the main array
            const noteIndex = stickyNotes.findIndex(n => n.id === noteWindow.noteData.id);
            
            if (noteIndex !== -1) {
                // Note is in main array - update it
                stickyNotes[noteIndex].content = content;
                stickyNotes[noteIndex].lastUpdated = new Date().toLocaleDateString();
                stickyNotes[noteIndex].textContent = this.extractTextContent(content);
                stickyNotes[noteIndex].pinned = noteWindow.isPinned || false;
                
                // Update the noteData reference as well
                noteWindow.noteData.pinned = noteWindow.isPinned || false;
            } else {
                console.error('Note not found in main array');
                
                // Update the noteData reference
                noteWindow.noteData.pinned = noteWindow.isPinned || false;
            }
        } else if (content) {
            // Creating new note with content
            const newNote = {
                id: Date.now(),
                type: 'note',
                content: content,
                textContent: this.extractTextContent(content),
                date: new Date().toLocaleDateString(),
                lastUpdated: new Date().toLocaleDateString(),
                timestamp: Date.now(),
                pinned: noteWindow.isPinned || false
            };
            stickyNotes.push(newNote);
            noteWindow.noteData = newNote;
        }
        
        // Save to localStorage
        localStorage.setItem('sticky-notes', JSON.stringify(stickyNotes));
        
        // Refresh the notebook view to show changes immediately
        this.refreshNotebookView();
        
        
        // Show subtle save indicator
        this.showAutoSaveIndicator(noteWindow);
    }
    
    extractTextContent(htmlContent) {
        // Create a temporary div to extract text from HTML
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlContent;
        
        // Convert various HTML elements to line breaks first
        let text = htmlContent
            .replace(/<\/div>/gi, '\n').replace(/<div[^>]*>/gi, '\n')
            .replace(/<\/p>/gi, '\n').replace(/<p[^>]*>/gi, '\n')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/li>/gi, '\n').replace(/<li[^>]*>/gi, '\n')
            .replace(/<[^>]*>/g, ''); // Remove all other HTML tags
        
        // Remove checkbox symbols and other formatting characters
        text = text.replace(/[☐☑✓✗]/g, '').trim();
        
        // Clean up multiple consecutive newlines and normalize
        text = text.replace(/\n\s*\n/g, '\n').trim();
        
        return text;
    }
    
    showAutoSaveIndicator(noteWindow) {
        // Find or create auto-save indicator
        let indicator = noteWindow.querySelector('.auto-save-indicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.className = 'auto-save-indicator';
            indicator.innerHTML = '✓ Saved';
            
            // Position it INSIDE the actual editor (yellow area), not the editor body wrapper
            const editor = noteWindow.querySelector('.note-modal-editor');
            if (editor) {
                editor.appendChild(indicator);
            } else {
                // Fallback to editor body
                const editorBody = noteWindow.querySelector('.note-editor-body');
                if (editorBody) {
                    editorBody.appendChild(indicator);
                }
            }
        }
        
        // Show the indicator
        indicator.style.opacity = '1';
        indicator.style.transform = 'scale(1.05)';
        
        setTimeout(() => {
            indicator.style.opacity = '0';
            indicator.style.transform = 'scale(1)';
        }, 2000);
    }
    
    closeNoteWindow(noteWindow) {
        const windowId = noteWindow.getAttribute('data-window');
        
        // Perform final auto-save before closing
        this.autoSaveNote(noteWindow);
        
        // Clean up auto-save listeners
        if (noteWindow.autoSaveCleanup) {
            noteWindow.autoSaveCleanup();
        }
        
        // Remove from active windows
        this.activeWindows.delete(windowId);
        
        // Remove active class and hide window
        noteWindow.classList.remove('active');
        
        // Remove from DOM after closing animation
        setTimeout(() => {
            noteWindow.remove();
        }, 300);
    }
    
    
    deleteNoteWindow(noteWindow) {
        console.log('🗑️ deleteNoteWindow called', noteWindow.noteData);
        
        if (noteWindow.noteData) {
            const noteId = noteWindow.noteData.id;
            console.log('🗑️ Deleting note with ID:', noteId);
            
            // Simple note deletion - no folder complexity
            this.removeStickyNote(noteId);
            this.closeNoteWindow(noteWindow);
            this.showNotification('Note deleted', 'success');
            console.log('✅ Note deletion completed');
        } else {
            // Just close new unsaved note
            console.log('🗑️ Closing new unsaved note');
            this.closeNoteWindow(noteWindow);
        }
    }
    
    
    togglePinNoteWindow(noteWindow) {
        const pinBtn = noteWindow.querySelector('.modal-pin-btn');
        
        noteWindow.isPinned = !noteWindow.isPinned;
        
        if (noteWindow.noteData) {
            noteWindow.noteData.pinned = noteWindow.isPinned;
        }
        
        // Update button state
        this.updatePinButtonState(noteWindow.isPinned, pinBtn);
        
        // Note: Pin icon is now handled by the button itself, no separate header icon needed
        
        // Immediately save the pin state
        this.autoSaveNote(noteWindow);
        
        // Refresh main notebook view
        setTimeout(() => {
            this.loadStickyNotes();
        }, 200);
        
        // Show appropriate feedback
        if (noteWindow.isPinned) {
            this.showNotification('Note pinned!', 'success');
        } else {
            this.showNotification('Note unpinned!', 'success');
        }
    }
    
    showDeleteConfirmation(noteWindow) {
        // Remove any existing popup
        const existingPopup = document.querySelector('.delete-confirmation-popup');
        if (existingPopup) {
            existingPopup.remove();
        }
        
        // Find the delete button to position the popup near it
        const deleteButton = noteWindow.querySelector('.modal-delete-btn');
        if (!deleteButton) return;
        
        // Create the popup container with consistent styling
        const deletePopup = document.createElement('div');
        deletePopup.className = 'rename-popup';
        deletePopup.style.cssText = `
            position: fixed !important;
            display: block !important;
            flex-direction: column !important;
            align-items: flex-start !important;
            padding: 12px !important;
            background: rgba(255, 255, 255, 0.95) !important;
            backdrop-filter: blur(20px) !important;
            border-radius: 8px !important;
            border: 1px solid rgba(255, 255, 255, 0.8) !important;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15) !important;
            z-index: 10000 !important;
            min-width: 200px !important;
            animation: popupFadeIn 0.2s ease !important;
        `;
        
        // Create the message
        const message = document.createElement('div');
        message.style.cssText = 'text-align: left; width: 100%; display: block; clear: both;';
        message.innerHTML = `
            <div style="margin-bottom: 8px; color: #333; font-weight: 500; text-align: left; font-size: 14px;">Delete this note?</div>
        `;
        
        // Create action buttons
        const actionsContainer = document.createElement('div');
        actionsContainer.style.cssText = 'display: flex; justify-content: flex-start; align-items: center; gap: 8px; width: 100%; clear: both;';
        
        const confirmButton = document.createElement('button');
        confirmButton.className = 'rename-save-btn';
        confirmButton.innerHTML = 'Delete';
        
        const cancelButton = document.createElement('button');
        cancelButton.className = 'rename-cancel-btn';
        cancelButton.innerHTML = 'Cancel';
        
        actionsContainer.appendChild(confirmButton);
        actionsContainer.appendChild(cancelButton);
        
        deletePopup.appendChild(message);
        deletePopup.appendChild(actionsContainer);
        
        // Add to document body (not note window)
        document.body.appendChild(deletePopup);
        
        // Position popup below button
        const buttonRect = deleteButton.getBoundingClientRect();
        deletePopup.style.position = 'fixed';
        deletePopup.style.top = (buttonRect.bottom + 8) + 'px';
        deletePopup.style.left = buttonRect.left + 'px';
        deletePopup.style.zIndex = '999999';
        deletePopup.style.visibility = 'visible';
        
        // Setup button handlers
        confirmButton.addEventListener('click', () => {
            console.log('🗑️ Delete confirmation button clicked');
            deletePopup.remove();
            this.deleteNoteWindow(noteWindow);
        });
        
        cancelButton.addEventListener('click', () => {
            deletePopup.remove();
        });
        
        // Close popup when clicking outside
        const handleOutsideClick = (e) => {
            if (!deletePopup.contains(e.target)) {
                deletePopup.remove();
                document.removeEventListener('click', handleOutsideClick);
            }
        };
        
        setTimeout(() => {
            document.addEventListener('click', handleOutsideClick);
        }, 100);
    }
    
    updatePinButtonState(isPinned, pinBtn = null) {
        if (pinBtn) {
            // Update the icon based on pin state
            const icon = pinBtn.querySelector('.material-symbols-outlined');
            if (icon) {
                if (isPinned) {
                    // Use filled pin icon when pinned
                    icon.textContent = 'push_pin';
                    icon.style.fontVariationSettings = '"FILL" 1, "wght" 400, "GRAD" 0, "opsz" 24';
                } else {
                    // Use outline pin icon when not pinned
                    icon.textContent = 'push_pin';
                    icon.style.fontVariationSettings = '"FILL" 0, "wght" 400, "GRAD" 0, "opsz" 24';
                }
            }
            
            // Update button appearance and tooltip
            pinBtn.style.background = 'rgba(107, 114, 128, 0.1)';
            pinBtn.style.color = '#6b7280';
            pinBtn.title = isPinned ? 'Remove from pinned section' : 'Add to pinned section';
        }
    }
    
    showNoteContextMenu(x, y, contextMenu) {
        console.log('showNoteContextMenu called with:', x, y, contextMenu);
        
        // Hide any existing context menus
        document.querySelectorAll('.context-menu').forEach(menu => {
            menu.style.display = 'none';
        });
        
        if (!contextMenu) {
            console.error('Context menu element not found');
            return;
        }
        
        // Move context menu to document body to avoid clipping issues
        if (contextMenu.parentNode !== document.body) {
            document.body.appendChild(contextMenu);
        }
        
        // First position the menu at the click location
        contextMenu.style.left = `${x}px`;
        contextMenu.style.top = `${y}px`;
        contextMenu.style.display = 'block';
        contextMenu.style.zIndex = '99999';
        contextMenu.style.position = 'fixed';
        contextMenu.style.visibility = 'visible';
        contextMenu.style.opacity = '1';
        
        console.log('Context menu positioned and displayed');
        console.log('Context menu computed style:', window.getComputedStyle(contextMenu));
        
        // Force a reflow to get accurate dimensions
        contextMenu.offsetHeight;
        
        // Get context menu dimensions after it's visible
        const menuRect = contextMenu.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        // Adjust horizontal position if menu would be cut off
        let adjustedX = x;
        if (x + menuRect.width > viewportWidth) {
            adjustedX = Math.max(10, viewportWidth - menuRect.width - 10); // Ensure minimum 10px from left edge
        }
        
        // Adjust vertical position if menu would be cut off
        let adjustedY = y;
        if (y + menuRect.height > viewportHeight) {
            adjustedY = Math.max(10, viewportHeight - menuRect.height - 10); // Ensure minimum 10px from top edge
        }
        
        // Apply adjusted position if needed
        if (adjustedX !== x || adjustedY !== y) {
            contextMenu.style.left = `${adjustedX}px`;
            contextMenu.style.top = `${adjustedY}px`;
        }
        
        // Remove existing event listeners to prevent duplicates
        contextMenu.querySelectorAll('.context-menu-item').forEach(item => {
            const newItem = item.cloneNode(true);
            item.parentNode.replaceChild(newItem, item);
        });
        
        // Setup context menu actions
        contextMenu.querySelectorAll('.context-menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                console.log('Context menu item clicked:', item);
                const action = item.getAttribute('data-action');
                const color = item.getAttribute('data-color');
                console.log('Action:', action, 'Color:', color);
                console.log('Saved selection:', this.savedSelection);
                
                if (action && this.savedSelection) {
                    console.log('Restoring selection and applying formatting...');
                    this.restoreSelection(this.savedSelection);
                    this.applyContextMenuFormatting(action, color);
                } else {
                    console.log('No action or saved selection found');
                }
                
                contextMenu.style.display = 'none';
            });
        });
        
        // Close menu when clicking outside
        const closeMenu = (e) => {
            if (!contextMenu.contains(e.target)) {
                contextMenu.style.display = 'none';
                document.removeEventListener('click', closeMenu);
            }
        };
        
        setTimeout(() => {
            document.addEventListener('click', closeMenu);
        }, 100);
    }
    
    prepareNewNote(editor, windowTitle) {
        // Clear editing state
        this.editingNote = null;
        this.newNotePinned = false; // Reset pin state for new notes
        
        // Clear previous content
        editor.innerHTML = '';
        
        // Update window title
        if (windowTitle) {
            windowTitle.textContent = 'New note';
        }
        
        // Initialize pin button state
        this.updatePinButtonState(false);
    }
    
    closeNewNoteModal() {
        const noteWindow = document.getElementById('note-editor-window');
        if (noteWindow) {
            this.closeWindow(noteWindow);
        }
    }
    
    
    showModalContextMenu(x, y) {
        const contextMenu = document.getElementById('modal-context-menu');
        if (!contextMenu) {
            console.log('Modal context menu not found');
            return;
        }
        
        console.log('Showing modal context menu at', x, y);
        contextMenu.style.display = 'block';
        contextMenu.style.left = `${x}px`;
        contextMenu.style.top = `${y}px`;
        
        // Adjust position if menu goes off screen
        const rect = contextMenu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            contextMenu.style.left = `${x - rect.width}px`;
        }
        if (rect.bottom > window.innerHeight) {
            contextMenu.style.top = `${y - rect.height}px`;
        }
    }
    
    hideModalContextMenu() {
        const contextMenu = document.getElementById('modal-context-menu');
        if (contextMenu) {
            contextMenu.style.display = 'none';
        }
    }
    
    saveSelection() {
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            return {
                startContainer: range.startContainer,
                startOffset: range.startOffset,
                endContainer: range.endContainer,
                endOffset: range.endOffset,
                collapsed: range.collapsed,
                text: selection.toString()
            };
        }
        return null;
    }
    
    restoreSelection(savedSelection) {
        if (!savedSelection) return;
        
        const selection = window.getSelection();
        const range = document.createRange();
        
        try {
            range.setStart(savedSelection.startContainer, savedSelection.startOffset);
            range.setEnd(savedSelection.endContainer, savedSelection.endOffset);
            
            selection.removeAllRanges();
            selection.addRange(range);
            return true;
        } catch (e) {
            return false;
        }
    }
    
    applyContextMenuFormatting(action, color) {
        console.log('applyContextMenuFormatting called with:', action, color);
        
        switch (action) {
            case 'bold':
                if (document.queryCommandSupported('bold')) {
                    console.log('Applying bold formatting');
                    document.execCommand('bold', false, null);
                }
                break;
            case 'italic':
                if (document.queryCommandSupported('italic')) {
                    console.log('Applying italic formatting');
                    document.execCommand('italic', false, null);
                }
                break;
            case 'underline':
                if (document.queryCommandSupported('underline')) {
                    console.log('Applying underline formatting');
                    document.execCommand('underline', false, null);
                }
                break;
            case 'bullet':
                if (document.queryCommandSupported('insertUnorderedList')) {
                    console.log('Applying bullet list formatting');
                    document.execCommand('insertUnorderedList', false, null);
                }
                break;
            case 'number':
                if (document.queryCommandSupported('insertOrderedList')) {
                    console.log('Applying numbered list formatting');
                    document.execCommand('insertOrderedList', false, null);
                }
                break;
            case 'color':
                if (color && document.queryCommandSupported('foreColor')) {
                    console.log('Applying color formatting:', color);
                    document.execCommand('foreColor', false, color);
                }
                break;
            default:
                console.log('Unknown formatting action:', action);
        }
    }

    handleModalContextMenuAction(action, color = null) {
        const editor = document.querySelector('.note-modal-editor');
        if (!editor) return;
        
        editor.focus();
        
        // Restore the saved selection
        if (this.savedSelection) {
            this.restoreSelection(this.savedSelection);
        } else {
            // Create a selection at the current cursor position
            const selection = window.getSelection();
            if (selection.rangeCount === 0) {
                const range = document.createRange();
                range.selectNodeContents(editor);
                range.collapse(false); // Move to end
                selection.removeAllRanges();
                selection.addRange(range);
            }
        }
        
        switch (action) {
            case 'bold':
                this.toggleBold(editor);
                break;
            case 'italic':
                this.toggleItalic(editor);
                break;
            case 'underline':
                this.toggleUnderline(editor);
                break;
            case 'bullet':
                this.insertBulletList(editor);
                break;
            case 'number':
                this.insertNumberedList(editor);
                break;
            case 'color':
                const colorToApply = color || '#ff4444';
                this.applyTextColor(editor, colorToApply);
                break;
            default:
                console.log('Unknown action:', action);
        }
        
        // Clear saved selection
        this.savedSelection = null;
    }
    
    toggleBold(editor) {
        console.log('toggleBold function called');
        const selection = window.getSelection();
        console.log('Selection text:', selection.toString());
        console.log('Range count:', selection.rangeCount);
        
        if (selection.rangeCount === 0) {
            console.log('No selection range, returning');
            return;
        }
        
        console.log('Checking if bold command is supported:', document.queryCommandSupported('bold'));
        
        if (document.queryCommandSupported('bold')) {
            console.log('Executing bold command');
            console.log('Editor HTML before:', editor.innerHTML);
            const result = document.execCommand('bold', false, null);
            console.log('Bold execCommand result:', result);
            console.log('Editor HTML after:', editor.innerHTML);
        } else {
            console.log('Using fallback bold implementation');
            const range = selection.getRangeAt(0);
            if (range.collapsed) {
                const bold = document.createElement('b');
                bold.textContent = 'Bold text';
                range.insertNode(bold);
                
                const newRange = document.createRange();
                newRange.selectNodeContents(bold);
                selection.removeAllRanges();
                selection.addRange(newRange);
            } else {
                const contents = range.extractContents();
                const bold = document.createElement('b');
                bold.appendChild(contents);
                range.insertNode(bold);
            }
        }
        console.log('toggleBold function completed');
    }
    
    toggleItalic(editor) {
        const selection = window.getSelection();
        if (selection.rangeCount === 0) return;
        
        if (document.queryCommandSupported('italic')) {
            document.execCommand('italic', false, null);
        } else {
            const range = selection.getRangeAt(0);
            if (range.collapsed) {
                const italic = document.createElement('em');
                italic.textContent = 'Italic text';
                range.insertNode(italic);
                
                const newRange = document.createRange();
                newRange.selectNodeContents(italic);
                selection.removeAllRanges();
                selection.addRange(newRange);
            } else {
                const contents = range.extractContents();
                const italic = document.createElement('em');
                italic.appendChild(contents);
                range.insertNode(italic);
            }
        }
    }
    
    toggleUnderline(editor) {
        const selection = window.getSelection();
        if (selection.rangeCount === 0) return;
        
        if (document.queryCommandSupported('underline')) {
            document.execCommand('underline', false, null);
        } else {
            const range = selection.getRangeAt(0);
            if (range.collapsed) {
                const underline = document.createElement('u');
                underline.textContent = 'Underlined text';
                range.insertNode(underline);
                
                const newRange = document.createRange();
                newRange.selectNodeContents(underline);
                selection.removeAllRanges();
                selection.addRange(newRange);
            } else {
                const contents = range.extractContents();
                const underline = document.createElement('u');
                underline.appendChild(contents);
                range.insertNode(underline);
            }
        }
    }
    
    insertBulletList(editor) {
        if (document.queryCommandSupported('insertUnorderedList')) {
            document.execCommand('insertUnorderedList', false, null);
        } else {
            const selection = window.getSelection();
            const range = selection.getRangeAt(0);
            
            const ul = document.createElement('ul');
            const li = document.createElement('li');
            li.textContent = 'List item';
            ul.appendChild(li);
            
            range.insertNode(ul);
            
            // Position cursor in the list item
            const newRange = document.createRange();
            newRange.selectNodeContents(li);
            selection.removeAllRanges();
            selection.addRange(newRange);
        }
    }
    
    insertNumberedList(editor) {
        if (document.queryCommandSupported('insertOrderedList')) {
            document.execCommand('insertOrderedList', false, null);
        } else {
            const selection = window.getSelection();
            const range = selection.getRangeAt(0);
            
            const ol = document.createElement('ol');
            const li = document.createElement('li');
            li.textContent = 'List item';
            ol.appendChild(li);
            
            range.insertNode(ol);
            
            // Position cursor in the list item
            const newRange = document.createRange();
            newRange.selectNodeContents(li);
            selection.removeAllRanges();
            selection.addRange(newRange);
        }
    }
    
    applyTextColor(editor, color) {
        const selection = window.getSelection();
        if (selection.rangeCount === 0) return;
        
        const range = selection.getRangeAt(0);
        
        if (range.collapsed) {
            // No selection, insert colored placeholder
            const span = document.createElement('span');
            span.style.color = color;
            span.textContent = 'Colored text';
            range.insertNode(span);
            
            const newRange = document.createRange();
            newRange.selectNodeContents(span);
            selection.removeAllRanges();
            selection.addRange(newRange);
        } else {
            // Wrap selection in colored span
            const contents = range.extractContents();
            const span = document.createElement('span');
            span.style.color = color;
            span.appendChild(contents);
            range.insertNode(span);
        }
    }
    
    setupFormattingKeyboardShortcuts(editor) {
        // Remove existing listeners to prevent duplicates
        if (editor.hasAttribute('data-shortcuts-setup')) return;
        editor.setAttribute('data-shortcuts-setup', 'true');
        
        editor.addEventListener('keydown', (e) => {
            // Check for Mac (metaKey = Cmd) or Windows/Linux (ctrlKey = Ctrl)
            const isShortcut = e.metaKey || e.ctrlKey;
            
            if (isShortcut) {
                switch (e.key.toLowerCase()) {
                    case 'b':
                        e.preventDefault();
                        console.log('Keyboard shortcut: Bold (Cmd+B)');
                        this.toggleBold(editor);
                        break;
                    case 'i':
                        e.preventDefault();
                        console.log('Keyboard shortcut: Italic (Cmd+I)');
                        this.toggleItalic(editor);
                        break;
                    case 'u':
                        e.preventDefault();
                        console.log('Keyboard shortcut: Underline (Cmd+U)');
                        this.toggleUnderline(editor);
                        break;
                }
            }
        });
    }
    
    saveModalNote() {
        const editor = document.querySelector('.note-modal-editor');
        if (!editor || !editor.innerHTML.trim()) {
            alert('Please write something before saving!');
            return;
        }
        
        // Get current content
        const content = editor.innerHTML;
        const textContent = editor.textContent || editor.innerText || '';
        
        if (textContent.trim() === '') {
            alert('Please write something before saving!');
            return;
        }
        
        let stickyNotes = JSON.parse(localStorage.getItem('sticky-notes') || '[]');
        
        if (this.editingNote) {
            // Editing existing note
            const noteIndex = stickyNotes.findIndex(note => note.id === this.editingNote.id);
            if (noteIndex !== -1) {
                // Update existing note in main array
                stickyNotes[noteIndex] = {
                    ...stickyNotes[noteIndex],
                    content: content,
                    textContent: textContent.trim(),
                    lastUpdated: new Date().toLocaleDateString(),
                    timestamp: Date.now(),
                    pinned: this.editingNote.pinned || false
                };
            } else {
                console.error('Note not found for editing');
                return;
            }
        } else {
            // Creating new note
            const stickyNote = {
                id: Date.now(),
                type: 'note',
                content: content,
                textContent: textContent.trim(),
                date: new Date().toLocaleDateString(),
                lastUpdated: new Date().toLocaleDateString(),
                timestamp: Date.now(),
                pinned: this.newNotePinned || false
            };
            stickyNotes.push(stickyNote);
        }
        
        // Save to localStorage
        localStorage.setItem('sticky-notes', JSON.stringify(stickyNotes));
        
        // Clear editing state
        this.editingNote = null;
        
        // Refresh sticky notes display
        this.loadStickyNotes();
        
        // Close modal
        this.closeNewNoteModal();
    }
    
    deleteModalNote() {
        if (this.editingNote) {
            // Deleting existing note
            if (confirm('Are you sure you want to delete this note?')) {
                this.removeStickyNote(this.editingNote.id);
                this.closeNewNoteModal();
            }
        } else {
            // Creating new note, just close modal
            this.closeNewNoteModal();
        }
    }
    

    showWelcomeCard() {
        // Remove existing card if present
        const existingCard = document.querySelector('.welcome-card');
        if (existingCard) {
            existingCard.remove();
            return;
        }

        // Create welcome card
        const card = document.createElement('div');
        card.className = 'welcome-card';
        card.innerHTML = `
            <div class="welcome-content" style="padding: 18px; margin: 0;">
                <p style="margin: 0; line-height: 1.4; text-align: left;">Hello, thanks for visiting! I'm Yan. This is my first time vibe-coding something this big. Before this, I was just making mini games and little interactions. If you've been thinking about making something, start small, enjoy the ride, and see where it takes you.</p>
            </div>
        `;

        // Style the card
        card.style.cssText = `
            position: fixed;
            top: 40px;
            left: 20px;
            width: 300px;
            background: rgba(255, 255, 255, 0.15);
            backdrop-filter: blur(20px);
            border-radius: 12px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
            border: 1px solid rgba(255, 255, 255, 0.2);
            z-index: 10000;
            animation: slideIn 0.3s ease;
            font-family: 'Noto Sans', 'Noto Sans CJK JP', 'Noto Sans CJK KR', 'Noto Sans CJK SC', 'Noto Sans CJK TC', system-ui, -apple-system, sans-serif;
        `;

        document.body.appendChild(card);

        // Close when clicking outside
        setTimeout(() => {
            document.addEventListener('click', function closeCard(e) {
                if (!card.contains(e.target) && !e.target.closest('.user-profile')) {
                    card.remove();
                    document.removeEventListener('click', closeCard);
                }
            });
        }, 100);
    }


    async showDateTimeInfo() {
        // Remove existing card if present
        const existingCard = document.querySelector('.datetime-info-card');
        if (existingCard) {
            existingCard.remove();
            return;
        }

        // THIS IS THE EXACT ORIGINAL CODE THAT WAS WORKING YESTERDAY
        // DO NOT MODIFY THIS FUNCTION ANYMORE!!!

        // Get current date and time info
        const now = new Date();
        
        // Fetch weather data
        const weatherData = await this.fetchWeatherData();
        const weather = this.formatWeatherData(weatherData);
        const dateOptions = { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        };
        const timeOptions = {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        };
        
        const fullDate = now.toLocaleDateString('en-US', dateOptions);
        const currentTime = now.toLocaleTimeString('en-US', timeOptions);

        // Get calendar data
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();
        const monthNames = ["January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"];

        // Create datetime info card with embedded calendar
        const card = document.createElement('div');
        card.className = 'datetime-info-card';
        card.innerHTML = `
            <div class="datetime-content" style="padding: 20px; margin: 0;">
                <div style="margin-bottom: 15px;">
                    <h3 style="margin: 0 0 8px 0; font-size: 16px; font-weight: 600; color: #333;">Good ${this.getGreeting()}!</h3>
                </div>
                <div style="margin-bottom: 15px;">
                    <div style="color: #333; font-size: 14px;">${weather.locationText} &nbsp;&nbsp;&nbsp; ${weather.weatherText}</div>
                </div>
                <div class="embedded-calendar" style="margin-top: 15px; border-top: 1px solid #f0f0f0; padding-top: 15px;">
                    <div class="calendar-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <button class="prev-month" style="background: none; border: none; font-size: 18px; cursor: pointer; padding: 4px 8px; color: #666;">‹</button>
                        <div class="month-year" style="font-weight: 600; color: #333; font-size: 14px;">${monthNames[currentMonth]} ${currentYear}</div>
                        <button class="next-month" style="background: none; border: none; font-size: 18px; cursor: pointer; padding: 4px 8px; color: #666;">›</button>
                    </div>
                    <div class="weekday-headers" style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 1px; margin-bottom: 6px;">
                        <div style="text-align: center; font-size: 11px; font-weight: 600; color: #666; padding: 3px;">Sun</div>
                        <div style="text-align: center; font-size: 11px; font-weight: 600; color: #666; padding: 3px;">Mon</div>
                        <div style="text-align: center; font-size: 11px; font-weight: 600; color: #666; padding: 3px;">Tue</div>
                        <div style="text-align: center; font-size: 11px; font-weight: 600; color: #666; padding: 3px;">Wed</div>
                        <div style="text-align: center; font-size: 11px; font-weight: 600; color: #666; padding: 3px;">Thu</div>
                        <div style="text-align: center; font-size: 11px; font-weight: 600; color: #666; padding: 3px;">Fri</div>
                        <div style="text-align: center; font-size: 11px; font-weight: 600; color: #666; padding: 3px;">Sat</div>
                    </div>
                    <div class="calendar-days" id="embedded-calendar-days" style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 1px;"></div>
                </div>
            </div>
        `;

        // Style the card - make it WIDER to fit all 7 days
        card.style.cssText = `
            position: fixed;
            top: 40px;
            right: 20px;
            width: 340px;
            background: rgba(255, 255, 255, 0.15);
            backdrop-filter: blur(30px);
            -webkit-backdrop-filter: blur(30px);
            border-radius: 12px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
            border: 1px solid rgba(255, 255, 255, 0.3);
            z-index: 10000;
            animation: slideIn 0.3s ease;
            font-family: 'Noto Sans', 'Noto Sans CJK JP', 'Noto Sans CJK KR', 'Noto Sans CJK SC', 'Noto Sans CJK TC', system-ui, -apple-system, sans-serif;
        `;

        document.body.appendChild(card);

        // Initialize simple clean calendar
        this.renderCleanCalendar(card, currentYear, currentMonth);

        // Close when clicking outside
        setTimeout(() => {
            document.addEventListener('click', function closeDateTimeCard(e) {
                if (!card.contains(e.target) && !e.target.closest('#current-date') && !e.target.closest('#current-time')) {
                    card.remove();
                    document.removeEventListener('click', closeDateTimeCard);
                }
            });
        }, 100);
    }

    renderCleanCalendar(card, year, month) {
        const container = card.querySelector('#embedded-calendar-days');
        const now = new Date();
        const today = now.getDate();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const daysInPrevMonth = new Date(year, month, 0).getDate();
        
        container.innerHTML = '';
        container.style.cssText = `
            display: grid;
            grid-template-columns: repeat(7, 1fr);
            gap: 4px 0;
            width: 100%;
            justify-items: center;
        `;
        
        // Previous month days
        for (let i = firstDay - 1; i >= 0; i--) {
            const day = daysInPrevMonth - i;
            const dayEl = document.createElement('div');
            dayEl.textContent = day;
            dayEl.style.cssText = `
                padding: 6px 2px;
                text-align: center;
                font-size: 13px;
                color: #888;
                height: 26px;
                display: flex;
                align-items: center;
                justify-content: center;
            `;
            container.appendChild(dayEl);
        }
        
        // Current month days
        for (let day = 1; day <= daysInMonth; day++) {
            const isToday = (year === currentYear && month === currentMonth && day === today);
            const dayEl = document.createElement('div');
            dayEl.textContent = day;
            dayEl.style.cssText = `
                padding: 6px 2px;
                text-align: center;
                font-size: 13px;
                color: ${isToday ? '#fff' : '#333'};
                background: ${isToday ? '#000' : 'transparent'};
                border-radius: ${isToday ? '50%' : '0'};
                height: 26px;
                width: 26px;
                display: flex;
                align-items: center;
                justify-content: center;
                margin: 0 auto;
                cursor: pointer;
                font-weight: ${isToday ? '600' : '400'};
            `;
            
            if (!isToday) {
                dayEl.addEventListener('mouseover', () => {
                    dayEl.style.background = 'rgba(0,0,0,0.1)';
                    dayEl.style.borderRadius = '50%';
                });
                dayEl.addEventListener('mouseout', () => {
                    dayEl.style.background = 'transparent';
                    dayEl.style.borderRadius = '0';
                });
            }
            
            container.appendChild(dayEl);
        }
        
        // Next month days to fill the grid
        const totalCells = container.children.length;
        const remainingCells = 42 - totalCells; // 6 rows × 7 days
        for (let day = 1; day <= remainingCells; day++) {
            const dayEl = document.createElement('div');
            dayEl.textContent = day;
            dayEl.style.cssText = `
                padding: 6px 2px;
                text-align: center;
                font-size: 13px;
                color: #888;
                height: 26px;
                display: flex;
                align-items: center;
                justify-content: center;
            `;
            container.appendChild(dayEl);
        }
    }

    setupEmbeddedCalendar(card, year, month) {
        const calendarDays = card.querySelector('#embedded-calendar-days');
        const monthYearElement = card.querySelector('.month-year');
        const prevButton = card.querySelector('.prev-month');
        const nextButton = card.querySelector('.next-month');
        
        const monthNames = ["January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"];

        let currentYear = year;
        let currentMonth = month;

        const renderCalendar = () => {
            calendarDays.innerHTML = '';
            monthYearElement.textContent = `${monthNames[currentMonth]} ${currentYear}`;

            const firstDay = new Date(currentYear, currentMonth, 1).getDay();
            const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
            const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();
            const today = new Date();
            const isCurrentMonth = currentYear === today.getFullYear() && currentMonth === today.getMonth();
            const todayDate = today.getDate();

            // Add previous month's trailing days
            for (let i = firstDay - 1; i >= 0; i--) {
                const day = daysInPrevMonth - i;
                const dayElement = document.createElement('div');
                dayElement.className = 'calendar-day other-month';
                dayElement.textContent = day;
                // Let CSS handle all styling - no inline styles!
                calendarDays.appendChild(dayElement);
            }

            // Add current month's days
            for (let day = 1; day <= daysInMonth; day++) {
                const isToday = isCurrentMonth && day === todayDate;
                
                const dayElement = document.createElement('div');
                dayElement.className = `calendar-day current-month ${isToday ? 'today' : ''}`;
                dayElement.textContent = day;
                // Let CSS handle all styling - no inline styles!
                
                calendarDays.appendChild(dayElement);
            }

            // Add next month's leading days
            const totalCells = calendarDays.children.length;
            const remainingCells = 42 - totalCells;
            for (let day = 1; day <= remainingCells; day++) {
                const dayElement = document.createElement('div');
                dayElement.className = 'calendar-day other-month';
                dayElement.textContent = day;
                // Let CSS handle all styling - no inline styles!
                calendarDays.appendChild(dayElement);
            }
        };

        // Navigation button events
        prevButton.addEventListener('click', (e) => {
            e.stopPropagation();
            currentMonth--;
            if (currentMonth < 0) {
                currentMonth = 11;
                currentYear--;
            }
            renderCalendar();
        });

        nextButton.addEventListener('click', (e) => {
            e.stopPropagation();
            currentMonth++;
            if (currentMonth > 11) {
                currentMonth = 0;
                currentYear++;
            }
            renderCalendar();
        });

        // Initial render
        renderCalendar();
    }

    showWorldClocks() {
        // Remove existing card if present
        const existingCard = document.querySelector('.world-clocks-card');
        if (existingCard) {
            existingCard.remove();
            return;
        }

        // Get current time for different timezones
        const now = new Date();
        
        // Define major world cities with their timezones
        const worldClocks = [
            { city: 'Seattle, US', timezone: 'America/Los_Angeles' },
            { city: 'New York, US', timezone: 'America/New_York' },
            { city: 'Shanghai, China', timezone: 'Asia/Shanghai' }
        ];

        // Create world clocks card
        const card = document.createElement('div');
        card.className = 'world-clocks-card';
        
        let clocksHTML = '';
        worldClocks.forEach(clock => {
            const timeInZone = now.toLocaleTimeString('en-US', {
                timeZone: clock.timezone,
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            });
            
            const dateInZone = now.toLocaleDateString('en-US', {
                timeZone: clock.timezone,
                month: 'short',
                day: 'numeric'
            });
            
            clocksHTML += `
                <div style="background: rgba(255, 255, 255, 0.3); border-radius: 8px; padding: 12px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="font-weight: 500; color: #333; font-size: 13px;">${clock.city}</div>
                        <div style="color: #666; font-size: 11px;">${dateInZone}</div>
                    </div>
                    <div style="font-weight: 600; color: #333; font-size: 14px;">${timeInZone}</div>
                </div>
            `;
        });

        card.innerHTML = `
            <div class="world-clocks-content" style="padding: 20px; margin: 0; min-width: 280px;">
                <div style="margin-bottom: 15px;">
                    <h3 style="margin: 0 0 8px 0; font-size: 16px; font-weight: 600; color: #333;">World clocks</h3>
                </div>
                <div style="margin-top: 10px;">
                    ${clocksHTML}
                </div>
            </div>
        `;

        // Position the card right below the taskbar
        const taskbar = document.querySelector('.taskbar');
        const taskbarRect = taskbar.getBoundingClientRect();
        
        card.style.cssText = `
            position: fixed;
            top: ${taskbarRect.bottom}px;
            right: 20px;
            background: rgba(255, 255, 255, 0.15);
            backdrop-filter: blur(30px);
            -webkit-backdrop-filter: blur(30px);
            border: 1px solid rgba(255, 255, 255, 0.3);
            border-radius: 12px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
            z-index: 1000;
            opacity: 0;
            transform: translateY(-8px);
            transition: all 0.2s ease;
        `;

        document.body.appendChild(card);

        // Show with animation
        requestAnimationFrame(() => {
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
        });

        // Close when clicking outside
        setTimeout(() => {
            const handleClickOutside = (e) => {
                if (!card.contains(e.target) && !e.target.closest('#current-time')) {
                    card.remove();
                    document.removeEventListener('click', handleClickOutside);
                }
            };
            document.addEventListener('click', handleClickOutside);
        }, 100);
    }

    async fetchWeatherData() {
        // Check if we have cached data that's still fresh
        const now = Date.now();
        if (this.weatherCache.data && (now - this.weatherCache.timestamp < this.weatherCache.duration)) {
            return this.weatherCache.data;
        }

        try {
            const url = `${this.weatherAPI.baseUrl}?key=${this.weatherAPI.key}&q=${this.weatherAPI.city}&aqi=no`;
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`Weather API error: ${response.status}`);
            }
            
            const data = await response.json();
            
            // Cache the data
            this.weatherCache.data = data;
            this.weatherCache.timestamp = now;
            
            return data;
        } catch (error) {
            console.warn('Failed to fetch weather data:', error);
            // Return fallback data
            return {
                location: { name: 'Seattle' },
                current: {
                    temp_f: 72,
                    condition: { text: 'Partly Cloudy', icon: '' }
                }
            };
        }
    }

    formatWeatherData(weatherData) {
        const location = weatherData.location.name;
        const temp = Math.round(weatherData.current.temp_f);
        const condition = weatherData.current.condition.text;
        
        // Simple emoji mapping for weather conditions
        const weatherEmojis = {
            'sunny': '☀️',
            'clear': '☀️',
            'partly cloudy': '⛅',
            'cloudy': '☁️',
            'overcast': '☁️',
            'rain': '🌧️',
            'drizzle': '🌦️',
            'snow': '❄️',
            'thunderstorm': '⛈️',
            'fog': '🌫️',
            'mist': '🌫️'
        };
        
        // Find matching emoji (case insensitive)
        const emoji = Object.keys(weatherEmojis).find(key => 
            condition.toLowerCase().includes(key)
        );
        
        const weatherIcon = emoji ? weatherEmojis[emoji] : '⛅';
        
        return {
            locationText: `${location}, US`,
            weatherText: `${temp}°F • ${condition} ${weatherIcon}`
        };
    }

    showDesktopContextMenu(x, y) {
        // Remove existing context menu
        const existingMenu = document.querySelector('.desktop-context-menu');
        if (existingMenu) {
            existingMenu.remove();
        }

        // Check if pet exists
        const petExists = document.querySelector('.desktop-pet') !== null;
        const petMenuText = petExists ? 'Close desktop pet' : 'Desktop pet';
        const petAction = petExists ? 'close-desktop-pet' : 'desktop-pet';

        // Create context menu
        const contextMenu = document.createElement('div');
        contextMenu.className = 'desktop-context-menu';
        contextMenu.innerHTML = `
            <div class="desktop-menu-item" data-action="wallpaper">
                Change Wallpaper
            </div>
            <div class="desktop-menu-item" data-action="${petAction}">
                ${petMenuText}
            </div>
        `;

        // Style the menu
        contextMenu.style.cssText = `
            position: fixed;
            left: ${x}px;
            top: ${y}px;
            background: rgba(255, 255, 255, 0.9);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.3);
            border-radius: 8px;
            box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
            z-index: 10000;
            min-width: 180px;
            overflow: hidden;
        `;

        document.body.appendChild(contextMenu);

        // Position adjustment if menu goes off screen
        const rect = contextMenu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            contextMenu.style.left = `${x - rect.width}px`;
        }
        if (rect.bottom > window.innerHeight) {
            contextMenu.style.top = `${y - rect.height}px`;
        }

        // Add event listeners for menu items
        contextMenu.querySelectorAll('.desktop-menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const action = e.target.dataset.action;
                if (action === 'wallpaper') {
                    this.openWallpaperSelector();
                } else if (action === 'desktop-pet') {
                    this.spawnDesktopPet();
                } else if (action === 'close-desktop-pet') {
                    this.closeDesktopPet();
                }
                contextMenu.remove();
            });
        });

        // Close menu when clicking outside
        setTimeout(() => {
            const handleClickOutside = (e) => {
                if (!contextMenu.contains(e.target)) {
                    contextMenu.remove();
                    document.removeEventListener('click', handleClickOutside);
                }
            };
            document.addEventListener('click', handleClickOutside);
        }, 10);
    }

    openWallpaperSelector() {
        console.log('openWallpaperSelector called');
        
        // Remove any existing wallpaper window
        const existingWindow = document.querySelector('.wallpaper-window');
        if (existingWindow) {
            existingWindow.remove();
        }

        try {
            // Create new wallpaper selector window
            const wallpaperWindow = this.createWallpaperWindow();
            console.log('Wallpaper window created:', wallpaperWindow);
            
            wallpaperWindow.style.display = 'block';
            
            // Bring to front using the proper window management system
            this.bringWindowToFront(wallpaperWindow);
        } catch (error) {
            console.error('Error creating wallpaper selector:', error);
        }
    }

    createWallpaperWindow() {
        console.log('Creating wallpaper window...');
        
        const wallpaperWindow = document.createElement('div');
        wallpaperWindow.className = 'window wallpaper-window active';
        
        // Position at top left like macOS to avoid overlap issues with larger windows
        const windowWidth = 600;
        const windowHeight = 400;
        const leftMargin = 60; // Space from left edge and taskbar area
        const topMargin = 60;  // Space from top edge (below taskbar)
        
        // Apply all styles including top-left positioning
        wallpaperWindow.style.cssText = `
            position: fixed;
            width: ${windowWidth}px;
            height: ${windowHeight}px;
            left: ${leftMargin}px;
            top: ${topMargin}px;
            visibility: hidden;
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 0.3);
            border-radius: 12px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
        `;
        
        wallpaperWindow.innerHTML = `
            <div class="window-header">
                <div class="window-title">Change Wallpaper</div>
                <div class="window-controls">
                    <span class="close">×</span>
                </div>
            </div>
            <div class="window-content">
                <div class="wallpaper-grid" id="wallpaper-grid">
                    <p>Loading wallpapers...</p>
                </div>
            </div>
        `;

        console.log('Appending wallpaper window to body...');
        document.body.appendChild(wallpaperWindow);
        
        // Force layout calculation then show
        wallpaperWindow.offsetHeight; // Force reflow
        wallpaperWindow.style.visibility = 'visible';

        // Setup close button
        const closeBtn = wallpaperWindow.querySelector('.close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                console.log('Close button clicked');
                wallpaperWindow.remove();
            });
        }

        // Make window draggable and integrate with window management system
        setTimeout(() => {
            this.setupRegularWindowDragging();
            // Bring to front initially
            this.bringWindowToFront(wallpaperWindow);
            // Setup click-to-front behavior for wallpaper window
            this.setupWallpaperWindowClickToFront(wallpaperWindow);
        }, 50);

        // Populate wallpaper options
        setTimeout(() => {
            this.populateWallpapers();
        }, 100);

        console.log('Wallpaper window created and appended');
        return wallpaperWindow;
    }

    setupWallpaperWindowClickToFront(wallpaperWindow) {
        // Add click handler to bring wallpaper window to front when clicked anywhere
        wallpaperWindow.addEventListener('mousedown', (e) => {
            this.bringWindowToFront(wallpaperWindow);
        });
    }

    populateWallpapers() {
        console.log('Populating wallpapers...');
        const grid = document.getElementById('wallpaper-grid');
        if (!grid) {
            console.error('Could not find wallpaper-grid element');
            return;
        }
        console.log('Found wallpaper grid:', grid);

        // Define available wallpapers
        const wallpapers = [
            { name: '3D Cute Animals', preview: 'Desktop wallpaper/3D cute animals.png', file: 'Desktop wallpaper/3D cute animals.png' },
            { name: '3D Cat', preview: 'Desktop wallpaper/3D cat.png', file: 'Desktop wallpaper/3D cat.png' },
            { name: 'Coffee and Bread', preview: "Desktop wallpaper/Coffee and bread'.png", file: "Desktop wallpaper/Coffee and bread'.png" },
            { name: 'Nature', preview: 'Desktop wallpaper/Nature.png', file: 'Desktop wallpaper/Nature.png' },
            { name: 'Panda and Tiger Ride Bike', preview: 'Desktop wallpaper/Panda and tiger ride bike.png', file: 'Desktop wallpaper/Panda and tiger ride bike.png' },
            { name: 'Panda Vacation', preview: 'Desktop wallpaper/Panda vacation.png', file: 'Desktop wallpaper/Panda vacation.png' }
        ];

        let gridHTML = '';
        wallpapers.forEach((wallpaper, index) => {
            gridHTML += `
                <div class="wallpaper-option" data-index="${index}" data-file="${wallpaper.file}">
                    <img src="${wallpaper.preview}" alt="${wallpaper.name}" loading="lazy">
                    <div class="wallpaper-name">${wallpaper.name}</div>
                </div>
            `;
        });

        grid.innerHTML = gridHTML;

        // Add click handlers for wallpaper selection
        grid.querySelectorAll('.wallpaper-option').forEach(option => {
            option.addEventListener('click', () => {
                const wallpaperFile = option.dataset.file;
                const wallpaperName = option.querySelector('.wallpaper-name').textContent;
                this.changeWallpaper(wallpaperFile, wallpaperName);
                
                // Highlight selected wallpaper
                grid.querySelectorAll('.wallpaper-option').forEach(opt => opt.classList.remove('selected'));
                option.classList.add('selected');
            });
        });
    }

    changeWallpaper(wallpaperFile, wallpaperName) {
        const desktop = document.querySelector('.desktop');
        if (desktop) {
            // Use double quotes in CSS url() to handle special characters like apostrophes
            desktop.style.backgroundImage = `url("${wallpaperFile}")`;
            desktop.style.backgroundSize = 'cover';
            desktop.style.backgroundPosition = 'center';
            desktop.style.backgroundRepeat = 'no-repeat';
            
            // Save wallpaper preference
            localStorage.setItem('desktop-wallpaper', wallpaperFile);
            localStorage.setItem('desktop-wallpaper-name', wallpaperName);
            
            console.log(`Wallpaper changed to: ${wallpaperName}`);
        }
    }

    loadSavedWallpaper() {
        const savedWallpaper = localStorage.getItem('desktop-wallpaper');
        const defaultWallpaper = 'Desktop wallpaper/3D cute animals.png';
        
        const desktop = document.querySelector('.desktop');
        if (desktop) {
            const wallpaperToUse = savedWallpaper || defaultWallpaper;
            desktop.style.backgroundImage = `url('${wallpaperToUse}')`;
            desktop.style.backgroundSize = 'cover';
            desktop.style.backgroundPosition = 'center';
            desktop.style.backgroundRepeat = 'no-repeat';
            
            // Save the default wallpaper if none was saved before
            if (!savedWallpaper) {
                localStorage.setItem('desktop-wallpaper', defaultWallpaper);
                localStorage.setItem('desktop-wallpaper-name', '3D Cute Animals');
            }
        }
    }

    spawnDesktopPet() {
        // Check if pet already exists
        const existingPet = document.querySelector('.desktop-pet');
        if (existingPet) {
            console.log('Desktop pet already exists');
            return;
        }

        // Create desktop pet
        const pet = document.createElement('div');
        pet.className = 'desktop-pet';
        pet.innerHTML = `<img src="Virtual pet/Cartoon Hello Sticker by Cat and Cat Comics.gif" alt="Desktop Pet">`;
        
        // Get actual music player position
        const musicPlayer = document.querySelector('.mini-music-player');
        let startX, startY;
        
        if (musicPlayer) {
            // Get the actual music player's bounding box
            const musicPlayerRect = musicPlayer.getBoundingClientRect();
            const petWidth = 80;
            const petHeight = 80;
            
            // Position cat directly on top of music player, aligned to right edge
            startX = musicPlayerRect.right - petWidth;
            startY = musicPlayerRect.top - petHeight + 20; // Move cat down 20px to completely eliminate the gap
        } else {
            // Fallback if music player not found
            const screenWidth = window.innerWidth;
            const petWidth = 80;
            startX = screenWidth - petWidth - 20;
            startY = 200;
        }
        
        // Style the pet - positioned right above music player widget using TOP positioning
        pet.style.cssText = `
            position: fixed;
            width: 80px;
            height: 80px;
            left: ${startX}px;
            top: ${startY}px;
            z-index: 500;
            cursor: grab;
            user-select: none;
            pointer-events: auto;
            transition: transform 0.3s ease;
        `;

        // Style the pet image with subtle shadow
        const petImg = pet.querySelector('img');
        petImg.style.cssText = `
            width: 100%;
            height: 100%;
            object-fit: contain;
            filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.2)) drop-shadow(0 1px 3px rgba(0, 0, 0, 0.1));
        `;

        document.body.appendChild(pet);
        
        // Play meow sound when cat appears
        this.playMeowSound();
        
        // Initialize walking animation immediately
        this.startCatWalking(pet);
        
        // Make pet draggable (will pause walking when dragged)  
        this.makeDesktopPetDraggable(pet);
        
        // Add talking bubble feature
        this.setupCatTalking(pet);

        console.log('Desktop pet spawned and walking started');
    }

    setupCatTalking(pet) {
        // Array of random sentences (you can provide more)
        const sentences = [
            "Your time will come.",
            "Keep going, you're doing great!",
            "I believe in you!",
            "Take a break, you deserve it.",
            "Everything happens for a reason.",
            "You're stronger than you think.",
            "Good things are coming your way.",
            "Stay positive and keep working!",
            "One step is still forward.",
            "Bloom where you're planted.",
            "Progress over perfection.",
            "Small steps, big change.",
            "Seeds today, flowers tomorrow.",
            "Your pace, your race.",
            "Keep moving, even slow.",
            "Growth is quiet at first.",
            "You're further than you think.",
            "Shine anyway.",
            "Choose joy today.",
            "Catch the little joys.",
            "Carry sunshine with you.",
            "It's okay to be not ok.",
            "Tough times grow tough souls.",
            "Be kind to yourself first.",
            "Believe it, then build it."
        ];

        pet.addEventListener('click', (e) => {
            // Prevent dragging when clicking for talking
            e.stopPropagation();
            
            // Remove any existing speech bubble
            const existingBubble = document.querySelector('.cat-speech-bubble');
            if (existingBubble) {
                existingBubble.remove();
            }

            // Get random sentence
            const randomSentence = sentences[Math.floor(Math.random() * sentences.length)];
            
            // Create speech bubble
            const speechBubble = document.createElement('div');
            speechBubble.className = 'cat-speech-bubble';
            speechBubble.innerHTML = `
                <div class="bubble-text">${randomSentence}</div>
                <div class="bubble-tail"></div>
            `;

            // Style the speech bubble with transparent background and blur
            speechBubble.style.cssText = `
                position: fixed;
                background: rgba(255, 255, 255, 0.15);
                backdrop-filter: blur(20px);
                -webkit-backdrop-filter: blur(20px);
                border: 1px solid rgba(255, 255, 255, 0.3);
                border-radius: 20px;
                padding: 10px 12px;
                font-size: 13px;
                color: #333;
                font-weight: 400;
                width: 160px;
                text-align: left;
                z-index: 1001;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
                pointer-events: none;
                transform: translateY(-10px);
                opacity: 0;
                transition: all 0.3s ease;
                white-space: normal;
                overflow-wrap: break-word;
            `;
            
            // Add CSS for speech bubble styling
            const style = document.createElement('style');
            style.textContent = `
                
                .cat-speech-bubble .bubble-text {
                    text-align: left;
                    line-height: 1.4;
                }
            `;
            
            if (!document.querySelector('#cat-speech-style')) {
                style.id = 'cat-speech-style';
                document.head.appendChild(style);
            }

            // Position bubble above cat with proper spacing
            const petRect = pet.getBoundingClientRect();
            speechBubble.style.left = (petRect.left + petRect.width/2 - 80) + 'px'; // Center above cat
            speechBubble.style.top = (petRect.top - 50) + 'px'; // Closer to cat

            document.body.appendChild(speechBubble);

            // Animate in
            requestAnimationFrame(() => {
                speechBubble.style.opacity = '1';
                speechBubble.style.transform = 'translateY(0)';
            });

            // Auto-remove after 2 seconds
            setTimeout(() => {
                if (speechBubble && speechBubble.parentNode) {
                    speechBubble.style.opacity = '0';
                    speechBubble.style.transform = 'translateY(-10px)';
                    setTimeout(() => {
                        if (speechBubble.parentNode) {
                            speechBubble.remove();
                        }
                    }, 300);
                }
            }, 2000);
        });
    }

    closeDesktopPet() {
        const pet = document.querySelector('.desktop-pet');
        if (pet) {
            // Play meow sound when closing
            this.playMeowSound();
            pet.remove();
            console.log('Desktop pet closed');
        }
    }

    startCatWalking(pet) {
        let direction = -1; // Start walking left (right to left)
        let speed = 1; // Use 1 pixel but with frame skipping for slower movement
        let frameSkip = 0; // Counter for frame skipping
        let frameSkipMax = 3; // Skip 3 frames, move on 4th frame (makes it 4x slower)
        const petWidth = 80;
        const screenWidth = window.innerWidth;
        
        // Use the current position from the pet's style, or default to off-screen right
        let position = parseInt(pet.style.left) || (screenWidth + petWidth + 30);
        
        // Store walking state on the pet element
        pet.isWalking = true;
        pet.walkingDirection = direction;
        
        // Ensure cat is facing left and positioned correctly
        pet.style.left = position + 'px';
        pet.style.transform = 'scaleX(1)'; // Face left
        
        console.log('Cat starting to walk from position:', position);
        
        const walkingLoop = () => {
            if (!pet.isWalking || !document.body.contains(pet)) {
                return; // Stop if pet is being dragged or removed
            }
            
            // Only move every 4th frame for slower animation
            frameSkip++;
            if (frameSkip < frameSkipMax) {
                requestAnimationFrame(walkingLoop);
                return;
            }
            frameSkip = 0; // Reset counter
            
            const screenWidth = window.innerWidth;
            const petWidth = 80;
            
            // Move the cat
            position += (speed * direction);
            
            // Simple back and forth logic with shorter off-screen time
            if (direction === 1 && position >= screenWidth + 30) {
                // Cat went off right edge, come back from right walking left
                console.log('Cat went off right edge, coming back from right walking left');
                direction = -1;
                pet.style.transform = 'scaleX(1)'; // Face left
                position = screenWidth + 30; // Start closer to right edge
            } else if (direction === -1 && position <= -petWidth - 30) {
                // Cat went off left edge (completely off-screen), come back from left walking right  
                console.log('Cat went off left edge, coming back from left walking right');
                direction = 1;
                pet.style.transform = 'scaleX(-1)'; // Face right
                position = -petWidth - 30; // Start completely off left edge
            }
            
            // Update position in CSS
            pet.style.left = Math.round(position) + 'px';
            pet.walkingDirection = direction;
            
            // Continue walking
            if (pet.isWalking) {
                requestAnimationFrame(walkingLoop);
            }
        };
        
        // Start the walking animation
        requestAnimationFrame(walkingLoop);
    }

    resumeCatWalking(pet) {
        let direction = pet.walkingDirection || 1; // Use stored direction or default to right
        let speed = 1;
        let frameSkip = 0;
        let frameSkipMax = 3;
        let position = parseInt(pet.style.left); // Resume from current position
        
        // Determine direction based on current position if not set
        if (!pet.walkingDirection) {
            const screenWidth = window.innerWidth;
            const screenCenter = screenWidth / 2;
            direction = position < screenCenter ? 1 : -1; // Walk toward nearest edge
        }
        
        // Set correct facing direction
        pet.style.transform = direction === 1 ? 'scaleX(-1)' : 'scaleX(1)';
        
        const walkingLoop = () => {
            if (!pet.isWalking || !document.body.contains(pet)) {
                return;
            }
            
            // Only move every 4th frame for slower animation
            frameSkip++;
            if (frameSkip < frameSkipMax) {
                requestAnimationFrame(walkingLoop);
                return;
            }
            frameSkip = 0;
            
            const screenWidth = window.innerWidth;
            const petWidth = 80;
            
            // Move the cat
            position += (speed * direction);
            
            // Simple back and forth logic with shorter off-screen time
            if (direction === 1 && position >= screenWidth + 30) {
                // Cat went off right edge, come back from right walking left
                console.log('Cat went off right edge, coming back from right walking left');
                direction = -1;
                pet.style.transform = 'scaleX(1)'; // Face left
                position = screenWidth + 30; // Start closer to right edge
            } else if (direction === -1 && position <= -petWidth - 30) {
                // Cat went off left edge (completely off-screen), come back from left walking right  
                console.log('Cat went off left edge, coming back from left walking right');
                direction = 1;
                pet.style.transform = 'scaleX(-1)'; // Face right
                position = -petWidth - 30; // Start completely off left edge
            }
            
            // Update position in CSS
            pet.style.left = Math.round(position) + 'px';
            pet.walkingDirection = direction;
            
            // Continue walking
            if (pet.isWalking) {
                requestAnimationFrame(walkingLoop);
            }
        };
        
        // Start the walking animation from current position
        requestAnimationFrame(walkingLoop);
    }

    makeDesktopPetDraggable(pet) {
        let isDragging = false;
        let startX, startY, startLeft, startTop;

        pet.addEventListener('mousedown', (e) => {
            if (e.button === 0) { // Left click only
                isDragging = true;
                pet.isWalking = false; // Pause walking while dragging
                startX = e.clientX;
                startY = e.clientY;
                startLeft = parseInt(pet.style.left);
                startTop = parseInt(pet.style.top); // Back to using top positioning
                pet.style.cursor = 'grabbing';
                e.preventDefault();
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                const deltaX = e.clientX - startX;
                const deltaY = e.clientY - startY; // Normal Y delta for top positioning
                
                let newLeft = startLeft + deltaX;
                let newTop = startTop + deltaY;
                
                // Keep pet within screen bounds
                newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - 80));
                newTop = Math.max(40, Math.min(newTop, window.innerHeight - 120)); // 40px for taskbar, 80px for pet height
                
                pet.style.left = newLeft + 'px';
                pet.style.top = newTop + 'px';
            }
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                pet.style.cursor = 'grab';
                
                // Resume walking immediately after dragging from current position
                pet.isWalking = true;
                this.resumeCatWalking(pet);
            }
        });
    }


    getGreeting() {
        const hour = new Date().getHours();
        if (hour < 12) return 'morning';
        if (hour < 17) return 'afternoon';
        return 'evening';
    }

}

// Add additional CSS animations via JavaScript
const additionalStyles = `
@keyframes slideIn {
    from {
        opacity: 0;
        transform: translateY(-10px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.welcome-content {
    padding: 20px;
    position: relative;
}

.welcome-content p {
    margin: 0;
    color: #333;
    font-size: 12px;
    line-height: 1.5;
    padding-right: 30px;
}

.close-card {
    position: absolute;
    top: 15px;
    right: 15px;
    background: none;
    border: none;
    font-size: 18px;
    color: #666;
    cursor: pointer;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: all 0.2s ease;
    font-family: system-ui;
}

.close-card:hover {
    background: rgba(0, 0, 0, 0.1);
    color: #333;
}

.user-profile {
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 6px;
    transition: all 0.2s ease;
}

.user-profile:hover {
    background: rgba(255, 255, 255, 0.2);
}

@keyframes windowClose {
    to {
        opacity: 0;
        transform: scale(0.9) translateY(-20px);
    }
}

@keyframes windowMinimize {
    to {
        opacity: 0;
        transform: scale(0.1) translateY(200px);
    }
}

@keyframes slideInRight {
    from {
        transform: translateX(100%);
        opacity: 0;
    }
    to {
        transform: translateX(0);
        opacity: 1;
    }
}

@keyframes slideOutRight {
    from {
        transform: translateX(0);
        opacity: 1;
    }
    to {
        transform: translateX(100%);
        opacity: 0;
    }
}

.window.focused {
    box-shadow: 0 25px 50px rgba(102, 126, 234, 0.15);
}

.window.dragging {
    transition: none !important;
}

/* Subtle entrance animations */
.icon {
    animation: iconFadeIn 0.6s ease forwards;
    opacity: 0;
}

.icon:nth-child(1) { animation-delay: 0.1s; }
.icon:nth-child(2) { animation-delay: 0.2s; }
.icon:nth-child(3) { animation-delay: 0.3s; }
.icon:nth-child(4) { animation-delay: 0.4s; }

@keyframes iconFadeIn {
    from {
        opacity: 0;
        transform: translateY(20px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.taskbar {
    animation: taskbarSlideDown 0.8s ease forwards;
    transform: translateY(-100%);
    animation-delay: 0.2s;
}

@keyframes taskbarSlideDown {
    to {
        transform: translateY(0);
    }
}

/* Micro-interactions */
.project-card {
    position: relative;
    overflow: hidden;
}

.project-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, transparent, rgba(102, 126, 234, 0.1), transparent);
    transition: left 0.5s ease;
}

.project-card:hover::before {
    left: 100%;
}

.contact-method {
    position: relative;
    overflow: hidden;
}

.contact-method::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 0;
    height: 0;
    background: rgba(102, 126, 234, 0.1);
    border-radius: 50%;
    transform: translate(-50%, -50%);
    transition: width 0.6s, height 0.6s;
}

.contact-method:hover::after {
    width: 200px;
    height: 200px;
}

/* Smooth scrollbar for window content */
.window-content::-webkit-scrollbar {
    width: 6px;
}

.window-content::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.05);
    border-radius: 3px;
}

.window-content::-webkit-scrollbar-thumb {
    background: rgba(102, 126, 234, 0.3);
    border-radius: 3px;
}

.window-content::-webkit-scrollbar-thumb:hover {
    background: rgba(102, 126, 234, 0.5);
}
`;

// Inject additional styles
const styleSheet = document.createElement('style');
styleSheet.textContent = additionalStyles;
document.head.appendChild(styleSheet);

// Camera functionality
class CameraApp {
    constructor() {
        this.videoElement = document.getElementById('camera-video');
        this.cameraPreview = document.querySelector('.camera-preview');
        this.startButton = document.getElementById('start-camera-btn');
        this.takePhotoButton = document.getElementById('take-photo-btn');
        this.stopButton = document.getElementById('stop-camera-btn');
        this.filterSelect = document.getElementById('filter-select');
        this.galleryContainer = document.getElementById('photo-gallery-container');
        this.cameraStatus = null; // Camera status overlay removed
        this.stream = null;
        this.photos = [];
        this.isInitialized = false;
        this.currentFilter = 'none';
        this.stickerImage = null; // Pre-loaded sticker image
        
        // Wait for DOM to be fully ready before initializing
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.initEventListeners();
                this.preloadSticker();
            });
        } else {
            this.initEventListeners();
            this.preloadSticker();
        }
    }
    
    async preloadSticker() {
        try {
            // Fetch the image as a blob first
            const response = await fetch('My camera/Love You Sticker.gif');
            const blob = await response.blob();
            
            // Convert to data URL
            const dataUrl = await this.blobToDataUrl(blob);
            
            // Create image with data URL (won't taint canvas)
            this.stickerImage = new Image();
            this.stickerImage.onload = () => {
                console.log('Sticker preloaded successfully as data URL');
            };
            this.stickerImage.onerror = () => {
                console.warn('Failed to load sticker from data URL');
                this.stickerImage = null;
            };
            this.stickerImage.src = dataUrl;
            
        } catch (error) {
            console.warn('Failed to preload sticker:', error);
            this.stickerImage = null;
        }
    }
    
    blobToDataUrl(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }
    
    initEventListeners() {
        if (!this.startButton || !this.takePhotoButton || !this.stopButton || !this.filterSelect) {
            console.warn('Camera elements not found - camera app not initialized');
            return;
        }
        
        this.startButton.addEventListener('click', () => this.startCamera());
        this.takePhotoButton.addEventListener('click', () => this.takePhoto());
        this.stopButton.addEventListener('click', () => this.stopCamera());
        
        // Filter selection with real-time preview
        this.filterSelect.addEventListener('change', (e) => {
            this.currentFilter = e.target.value;
            this.applyFilter(this.currentFilter);
        });
        
        // Hover effect for real-time preview
        this.filterSelect.addEventListener('mouseover', (e) => {
            if (e.target.tagName === 'OPTION' && e.target.value !== this.currentFilter) {
                this.applyFilter(e.target.value);
            }
        });
        
        this.filterSelect.addEventListener('mouseout', () => {
            // Restore current filter when mouse leaves
            this.applyFilter(this.currentFilter);
        });
        
        // Stop camera when window is closed
        const cameraWindow = document.querySelector('.contact-window');
        if (cameraWindow) {
            const closeButton = cameraWindow.querySelector('.close');
            if (closeButton) {
                closeButton.addEventListener('click', () => {
                    if (this.stream) {
                        this.stopCamera();
                    }
                });
            }
        }
        
        // Stop camera when page is about to unload
        window.addEventListener('beforeunload', () => {
            if (this.stream) {
                this.stream.getTracks().forEach(track => track.stop());
            }
        });
        
        this.isInitialized = true;
    }
    
    applyFilter(filterName) {
        if (!this.videoElement) return;
        
        const filters = {
            'none': 'none',
            'retro': 'sepia(0.4) contrast(1.3) brightness(1.1) saturate(1.4) hue-rotate(350deg)',
            'soft': 'brightness(1.1) contrast(0.8) saturate(1.2) blur(0.5px)',
            'saturated': 'saturate(2) contrast(1.2) brightness(1.05)'
        };
        
        const filterValue = filters[filterName] || 'none';
        this.videoElement.style.filter = filterValue;
    }
    
    async startCamera() {
        try {
            // Status text removed from overlay
            
            // Check if mediaDevices is available
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('Camera not supported by this browser');
            }
            
            // Stop any existing stream first
            if (this.stream) {
                this.stream.getTracks().forEach(track => track.stop());
            }
            
            // Request camera access with simpler constraints
            this.stream = await navigator.mediaDevices.getUserMedia({ 
                video: {
                    width: { ideal: 640, max: 1280 },
                    height: { ideal: 480, max: 720 },
                    facingMode: 'user'
                }
            });
            
            // Set video source and wait for it to load
            this.videoElement.srcObject = this.stream;
            
            // Wait for video to start playing
            await new Promise((resolve, reject) => {
                this.videoElement.onloadedmetadata = () => {
                    this.videoElement.play()
                        .then(resolve)
                        .catch(reject);
                };
                
                // Timeout after 10 seconds
                setTimeout(() => reject(new Error('Camera load timeout')), 10000);
            });
            
            // Camera active status removed from overlay
            
            // Add camera active class to hide dark background
            this.cameraPreview.classList.add('camera-active');
            
            // Update button states
            this.startButton.disabled = true;
            this.takePhotoButton.disabled = false;
            this.stopButton.disabled = false;
            
        } catch (error) {
            console.error('Error accessing camera:', error);
            let errorMessage = 'Camera access failed';
            
            if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                errorMessage = 'Camera permission denied. Please allow camera access.';
            } else if (error.name === 'NotFoundError') {
                errorMessage = 'No camera found on this device.';
            } else if (error.name === 'NotSupportedError') {
                errorMessage = 'Camera not supported by this browser.';
            } else if (error.name === 'AbortError') {
                errorMessage = 'Camera access was interrupted. Please try again.';
            }
            
            console.warn('Camera error:', errorMessage); // Status overlay removed
            
            // Reset button states
            this.startButton.disabled = false;
            this.takePhotoButton.disabled = true;
            this.stopButton.disabled = true;
        }
    }
    
    takePhoto() {
        console.log('takePhoto called');
        if (!this.stream) {
            console.log('No stream available');
            return;
        }
        
        // Play cute camera click sound
        this.playCameraClickSound();
        
        // Create canvas to capture the photo
        const canvas = document.createElement('canvas');
        const video = this.videoElement;
        
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        const ctx = canvas.getContext('2d');
        
        // Apply current filter to canvas context
        if (this.currentFilter !== 'none') {
            ctx.filter = this.getCanvasFilter(this.currentFilter);
        }
        
        ctx.drawImage(video, 0, 0);
        
        // Reset filter for drawing sticker (we don't want filter applied to sticker)
        ctx.filter = 'none';
        
        // Add the sticker to the photo if it's loaded (using data URL to avoid tainting)
        if (this.stickerImage && this.stickerImage.complete) {
            console.log('Adding sticker to photo');
            this.addStickerToCanvas(ctx, canvas);
        } else {
            console.log('Sticker not available, proceeding without');
        }
        
        // Finalize the photo
        console.log('About to finalize photo...');
        this.finalizePhoto(canvas);
    }
    
    finalizePhoto(canvas) {
        console.log('finalizePhoto called with canvas:', canvas.width, 'x', canvas.height);
        
        // Convert to blob and create photo object
        canvas.toBlob((blob) => {
            if (!blob) {
                console.error('Failed to create blob from canvas');
                return;
            }
            
            console.log('Blob created successfully, size:', blob.size);
            
            const photoUrl = URL.createObjectURL(blob);
            const photo = {
                id: Date.now(),
                url: photoUrl,
                timestamp: new Date().toLocaleString(),
                filter: this.currentFilter
            };
            
            console.log('Adding photo to gallery:', photo);
            
            this.photos.unshift(photo);
            this.updateGallery();
            
            // Brief flash effect (preserve current filter)
            const currentFilter = this.videoElement.style.filter;
            this.videoElement.style.filter = currentFilter + ' brightness(1.5)';
            setTimeout(() => {
                this.videoElement.style.filter = currentFilter;
            }, 200);
            
        }, 'image/jpeg', 0.9);
    }
    
    addStickerToCanvas(ctx, canvas) {
        if (!this.stickerImage || !this.stickerImage.complete) {
            console.warn('Sticker image not available');
            return;
        }
        
        try {
            console.log('Drawing preloaded sticker on canvas');
            
            // Calculate sticker size and position based on canvas dimensions
            // Keep the same relative size as in the preview (80px out of typical preview width)
            const previewWidth = 400; // Approximate preview width
            const stickerSizeRatio = 80 / previewWidth; // 0.2
            const stickerSize = Math.min(canvas.width, canvas.height) * stickerSizeRatio;
            
            // Position in top-left corner with relative positioning
            const margin = stickerSize * 0.2; // 20% of sticker size as margin
            const x = margin;
            const y = margin;
            
            console.log(`Drawing sticker at ${x}, ${y} with size ${stickerSize}`);
            
            // Draw the sticker on the canvas
            ctx.drawImage(this.stickerImage, x, y, stickerSize, stickerSize);
            
            console.log('Sticker drawn successfully');
        } catch (error) {
            console.error('Error drawing sticker:', error);
        }
    }
    
    getCanvasFilter(filterName) {
        // Canvas filter syntax (slightly different from CSS)
        const canvasFilters = {
            'retro': 'sepia(40%) contrast(130%) brightness(110%) saturate(140%)',
            'soft': 'brightness(110%) contrast(80%) saturate(120%) blur(0.5px)',
            'saturated': 'saturate(200%) contrast(120%) brightness(105%)'
        };
        
        return canvasFilters[filterName] || 'none';
    }
    
    playCameraClickSound() {
        try {
            // Create classic "kachak" camera shutter sound using Web Audio API
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Classic camera shutter timing
            const totalDuration = 0.25;
            const sampleRate = audioContext.sampleRate;
            const numSamples = totalDuration * sampleRate;
            const audioBuffer = audioContext.createBuffer(1, numSamples, sampleRate);
            const channelData = audioBuffer.getChannelData(0);
            
            // Generate classic "ka-chak" shutter sound
            for (let i = 0; i < numSamples; i++) {
                const t = i / sampleRate;
                let sample = 0;
                
                if (t < 0.02) {
                    // "KA" - Initial shutter release (very sharp, metallic)
                    const envelope = Math.exp(-t * 50);
                    const noise = (Math.random() - 0.5) * 0.3; // Mechanical noise
                    const click = Math.sin(2 * Math.PI * 2000 * t) * 0.4; // Sharp metallic ping
                    sample = envelope * (click + noise) * 0.8;
                    
                } else if (t > 0.03 && t < 0.08) {
                    // Brief mechanism sound
                    const adjustedT = t - 0.03;
                    const envelope = Math.exp(-adjustedT * 30);
                    const mechanism = Math.sin(2 * Math.PI * 800 * adjustedT) * 0.2;
                    const rattle = (Math.random() - 0.5) * 0.1;
                    sample = envelope * (mechanism + rattle) * 0.3;
                    
                } else if (t > 0.12 && t < 0.18) {
                    // "CHAK" - Shutter closing (deeper, more resonant)
                    const adjustedT = t - 0.12;
                    const envelope = Math.exp(-adjustedT * 25);
                    const deepClick = Math.sin(2 * Math.PI * 400 * adjustedT) * 0.5; // Deep thunk
                    const metallic = Math.sin(2 * Math.PI * 1200 * adjustedT) * 0.2; // Metallic overtone
                    const noise = (Math.random() - 0.5) * 0.15; // Mechanical texture
                    sample = envelope * (deepClick + metallic + noise) * 0.7;
                }
                
                channelData[i] = Math.max(-1, Math.min(1, sample)); // Prevent clipping
            }
            
            // Play the sound
            const source = audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioContext.destination);
            source.start();
            
        } catch (error) {
            // Fallback: console sound indication if Web Audio fails
            console.log('📸 *classic kachak sound*');
        }
    }
    
    stopCamera() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        
        this.videoElement.srcObject = null;
        // Camera stopped status removed from overlay
        
        // Remove camera active class to show dark background
        this.cameraPreview.classList.remove('camera-active');
        
        // Update button states
        this.startButton.disabled = false;
        this.takePhotoButton.disabled = true;
        this.stopButton.disabled = true;
    }
    
    updateGallery() {
        if (this.photos.length === 0) {
            this.galleryContainer.innerHTML = '<div class="no-photos">No photos taken yet<br><br><img src="pixel gif/Hello Kitty Hearts Sticker.gif" alt="Hello Kitty Hearts" class="no-photos-sticker"></div>';
            return;
        }
        
        this.galleryContainer.innerHTML = this.photos.map(photo => `
            <div class="photo-item" data-photo-id="${photo.id}" onclick="window.cameraApp.showLargeView(${photo.id})">
                <img src="${photo.url}" alt="Photo taken on ${photo.timestamp}">
                <div class="photo-overlay">
                    <button class="delete-photo" onclick="event.stopPropagation(); window.cameraApp.deletePhoto(${photo.id})" title="Delete photo">×</button>
                    <div class="photo-timestamp">${photo.timestamp}</div>
                </div>
            </div>
        `).join('');
    }
    
    showLargeView(photoId) {
        const photo = this.photos.find(p => p.id === photoId);
        if (!photo) return;
        
        // Create large view modal
        const modal = document.createElement('div');
        modal.className = 'photo-large-view-modal';
        modal.innerHTML = `
            <div class="large-view-overlay" onclick="window.cameraApp.closeLargeView()">
                <div class="large-view-container" onclick="event.stopPropagation()">
                    <div class="large-view-header">
                        <div class="photo-info">${photo.timestamp}</div>
                        <button class="large-view-close" onclick="window.cameraApp.closeLargeView()">×</button>
                    </div>
                    <div class="large-view-image">
                        <img src="${photo.url}" alt="Large view of photo taken on ${photo.timestamp}">
                    </div>
                    <div class="large-view-actions">
                        <button onclick="window.cameraApp.downloadPhoto(${photoId})" class="action-btn download-btn">Download</button>
                        <button onclick="window.cameraApp.deletePhotoFromLarge(${photoId})" class="action-btn delete-btn">Delete</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Add fade-in animation
        requestAnimationFrame(() => {
            modal.classList.add('show');
        });
    }
    
    closeLargeView() {
        const modal = document.querySelector('.photo-large-view-modal');
        if (modal) {
            modal.classList.add('hiding');
            setTimeout(() => {
                document.body.removeChild(modal);
            }, 300);
        }
    }
    
    downloadPhoto(photoId) {
        const photo = this.photos.find(p => p.id === photoId);
        if (!photo) return;
        
        const link = document.createElement('a');
        link.href = photo.url;
        link.download = `camera-photo-${photo.timestamp.replace(/[/,:]/g, '-')}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
    
    deletePhotoFromLarge(photoId) {
        this.deletePhoto(photoId);
        this.closeLargeView();
    }
    
    deletePhoto(photoId) {
        const photoIndex = this.photos.findIndex(p => p.id === photoId);
        if (photoIndex !== -1) {
            // Revoke the object URL to free memory
            URL.revokeObjectURL(this.photos[photoIndex].url);
            this.photos.splice(photoIndex, 1);
            this.updateGallery();
        }
    }
    
}

// Five in a Row Game Class with AI
class FiveInARowGame {
    constructor() {
        this.boardSize = 8;
        this.board = Array(this.boardSize).fill().map(() => Array(this.boardSize).fill(0));
        this.isPlayerTurn = true; // Player goes first, Player is X (1), AI is O (2)
        this.gameOver = false;
        this.isThinking = false;
        
        this.boardElement = document.getElementById('game-board');
        this.messageElement = document.getElementById('game-message');
        this.resetButton = document.getElementById('reset-game');
        
        this.init();
    }
    
    init() {
        this.createBoard();
        this.updateUI();
        
        if (this.resetButton) {
            this.resetButton.addEventListener('click', () => {
                this.resetGame();
            });
        }
        
        // Player goes first, so no AI move needed
    }
    
    createBoard() {
        if (!this.boardElement) return;
        
        this.boardElement.innerHTML = '';
        
        // Create message element inside the board
        const messageElement = document.createElement('div');
        messageElement.className = 'game-message';
        messageElement.id = 'game-message';
        this.boardElement.appendChild(messageElement);
        this.messageElement = messageElement;
        
        for (let row = 0; row < this.boardSize; row++) {
            for (let col = 0; col < this.boardSize; col++) {
                const cell = document.createElement('div');
                cell.className = 'game-cell';
                cell.dataset.row = row;
                cell.dataset.col = col;
                
                cell.addEventListener('click', (e) => {
                    this.handlePlayerMove(parseInt(e.target.dataset.row), parseInt(e.target.dataset.col));
                });
                
                this.boardElement.appendChild(cell);
            }
        }
    }
    
    handlePlayerMove(row, col) {
        if (this.gameOver || !this.isPlayerTurn || this.board[row][col] !== 0 || this.isThinking) {
            return;
        }
        
        // Play click sound
        this.playClickSound();
        
        // Player places X
        this.makeMove(row, col, 1, 'player');
        
        if (this.checkWin(row, col, 1)) {
            this.handleWin('player');
            return;
        }
        
        if (this.checkDraw()) {
            this.handleDraw();
            return;
        }
        
        // AI's turn
        this.isPlayerTurn = false;
        this.updateUI();
        this.makeAIMove();
    }
    
    makeMove(row, col, player, className) {
        this.board[row][col] = player;
        const cells = this.boardElement.querySelectorAll('.game-cell');
        const cell = cells[row * this.boardSize + col];
        if (cell) {
            cell.classList.add('occupied');
            cell.classList.add(className);
        }
    }
    
    makeAIMove() {
        this.isThinking = true;
        // Remove AI thinking message - user finds it distracting
        
        // Add a small delay to make it feel more natural
        setTimeout(() => {
            const move = this.getBestMove();
            if (move) {
                // Play AI click sound
                this.playAIClickSound();
                
                this.makeMove(move.row, move.col, 2, 'ai');
                
                if (this.checkWin(move.row, move.col, 2)) {
                    this.handleWin('ai');
                    return;
                }
                
                if (this.checkDraw()) {
                    this.handleDraw();
                    return;
                }
                
                this.isPlayerTurn = true;
                this.isThinking = false;
                this.updateUI();
            }
        }, 500);
    }
    
    getBestMove() {
        // Priority 1: Check if AI can win immediately
        const winMove = this.findWinningMove(2);
        if (winMove) return winMove;
        
        // Priority 2: Block player from winning (CRITICAL!)
        const blockMove = this.findWinningMove(1);
        if (blockMove) return blockMove;
        
        // Priority 3: Block dangerous player threats (2-in-a-row)
        const blockThreatMove = this.findThreatMove(1);
        if (blockThreatMove) return blockThreatMove;
        
        // Priority 4: Create AI threats (2-in-a-row)
        const threatMove = this.findThreatMove(2);
        if (threatMove) return threatMove;
        
        // Priority 5: Use strategic positioning
        const strategicMove = this.findStrategicMove();
        if (strategicMove) return strategicMove;
        
        // Fallback: center or random
        return this.findCenterMove();
    }

    findThreatMove(player) {
        let bestMove = null;
        let bestScore = -1;
        
        for (let row = 0; row < this.boardSize; row++) {
            for (let col = 0; col < this.boardSize; col++) {
                if (this.board[row][col] === 0) {
                    // Temporarily place piece and evaluate
                    this.board[row][col] = player;
                    const score = this.countConsecutive(row, col, player);
                    this.board[row][col] = 0;
                    
                    if (score > bestScore) {
                        bestScore = score;
                        bestMove = { row, col };
                    }
                }
            }
        }
        
        return bestScore >= 3 ? bestMove : null; // Only return if creates 3+ in a row
    }

    countConsecutive(row, col, player) {
        let maxCount = 0;
        const directions = [[0,1], [1,0], [1,1], [1,-1]];
        
        for (const [dx, dy] of directions) {
            let count = 1; // Count the piece we just placed
            
            // Check positive direction
            for (let i = 1; i < 5; i++) {
                const nr = row + dx * i;
                const nc = col + dy * i;
                if (nr >= 0 && nr < this.boardSize && nc >= 0 && nc < this.boardSize && 
                    this.board[nr][nc] === player) {
                    count++;
                } else {
                    break;
                }
            }
            
            // Check negative direction
            for (let i = 1; i < 5; i++) {
                const nr = row - dx * i;
                const nc = col - dy * i;
                if (nr >= 0 && nr < this.boardSize && nc >= 0 && nc < this.boardSize && 
                    this.board[nr][nc] === player) {
                    count++;
                } else {
                    break;
                }
            }
            
            maxCount = Math.max(maxCount, count);
        }
        
        return maxCount;
    }

    findStrategicMove() {
        // Find moves adjacent to existing pieces
        for (let row = 0; row < this.boardSize; row++) {
            for (let col = 0; col < this.boardSize; col++) {
                if (this.board[row][col] === 0 && this.hasNeighbor(row, col)) {
                    return { row, col };
                }
            }
        }
        return null;
    }

    minimax(depth, player, alpha, beta, isMaximizing) {
        // Check for terminal states
        const gameState = this.evaluateGameState();
        if (depth === 0 || Math.abs(gameState) >= 1000) {
            return { score: gameState, move: null };
        }

        const moves = this.generateMoves();
        if (moves.length === 0) {
            return { score: 0, move: null }; // Draw
        }

        let bestMove = moves[0];
        
        if (isMaximizing) {
            let maxScore = -Infinity;
            
            for (const move of moves) {
                this.board[move.row][move.col] = player;
                const result = this.minimax(depth - 1, player === 1 ? 2 : 1, alpha, beta, false);
                this.board[move.row][move.col] = 0;
                
                if (result.score > maxScore) {
                    maxScore = result.score;
                    bestMove = move;
                }
                
                alpha = Math.max(alpha, result.score);
                if (beta <= alpha) {
                    break; // Alpha-beta pruning
                }
            }
            
            return { score: maxScore, move: bestMove };
        } else {
            let minScore = Infinity;
            
            for (const move of moves) {
                this.board[move.row][move.col] = player;
                const result = this.minimax(depth - 1, player === 1 ? 2 : 1, alpha, beta, true);
                this.board[move.row][move.col] = 0;
                
                if (result.score < minScore) {
                    minScore = result.score;
                    bestMove = move;
                }
                
                beta = Math.min(beta, result.score);
                if (beta <= alpha) {
                    break; // Alpha-beta pruning
                }
            }
            
            return { score: minScore, move: bestMove };
        }
    }

    generateMoves() {
        const moves = [];
        const occupied = [];
        
        // First, find all occupied positions
        for (let row = 0; row < this.boardSize; row++) {
            for (let col = 0; col < this.boardSize; col++) {
                if (this.board[row][col] !== 0) {
                    occupied.push({ row, col });
                }
            }
        }
        
        // If no moves yet, start from center
        if (occupied.length === 0) {
            const center = Math.floor(this.boardSize / 2);
            return [{ row: center, col: center }];
        }
        
        // Generate moves near occupied positions
        const moveSet = new Set();
        
        for (const pos of occupied) {
            for (let dr = -2; dr <= 2; dr++) {
                for (let dc = -2; dc <= 2; dc++) {
                    const newRow = pos.row + dr;
                    const newCol = pos.col + dc;
                    
                    if (newRow >= 0 && newRow < this.boardSize && 
                        newCol >= 0 && newCol < this.boardSize &&
                        this.board[newRow][newCol] === 0) {
                        moveSet.add(`${newRow},${newCol}`);
                    }
                }
            }
        }
        
        // Convert set back to array of moves
        for (const move of moveSet) {
            const [row, col] = move.split(',').map(Number);
            moves.push({ row, col });
        }
        
        // Sort moves by strategic value
        return moves.sort((a, b) => 
            this.evaluatePosition(b.row, b.col, 2) - this.evaluatePosition(a.row, a.col, 2)
        ).slice(0, 15); // Limit to best 15 moves for performance
    }

    evaluateGameState() {
        let score = 0;
        
        // Check for wins
        for (let row = 0; row < this.boardSize; row++) {
            for (let col = 0; col < this.boardSize; col++) {
                if (this.board[row][col] !== 0) {
                    const player = this.board[row][col];
                    if (this.checkWin(row, col, player)) {
                        return player === 2 ? 10000 : -10000; // AI wins = positive, Player wins = negative
                    }
                }
            }
        }
        
        // Evaluate positions for both players
        for (let row = 0; row < this.boardSize; row++) {
            for (let col = 0; col < this.boardSize; col++) {
                if (this.board[row][col] === 2) { // AI pieces
                    score += this.evaluatePosition(row, col, 2);
                } else if (this.board[row][col] === 1) { // Player pieces
                    score -= this.evaluatePosition(row, col, 1);
                }
            }
        }
        
        return score;
    }

    findCenterMove() {
        const center = Math.floor(this.boardSize / 2);
        if (this.board[center][center] === 0) {
            return { row: center, col: center };
        }
        
        // Find nearby center position
        for (let r = center - 1; r <= center + 1; r++) {
            for (let c = center - 1; c <= center + 1; c++) {
                if (r >= 0 && r < this.boardSize && c >= 0 && c < this.boardSize && 
                    this.board[r][c] === 0) {
                    return { row: r, col: c };
                }
            }
        }
        
        return this.findRandomMove();
    }
    
    findWinningMove(player) {
        for (let row = 0; row < this.boardSize; row++) {
            for (let col = 0; col < this.boardSize; col++) {
                if (this.board[row][col] === 0) {
                    this.board[row][col] = player;
                    if (this.checkWin(row, col, player)) {
                        this.board[row][col] = 0;
                        return {row, col};
                    }
                    this.board[row][col] = 0;
                }
            }
        }
        return null;
    }
    
    findThreatMove(player) {
        let bestMove = null;
        let bestScore = 0;
        
        for (let row = 0; row < this.boardSize; row++) {
            for (let col = 0; col < this.boardSize; col++) {
                if (this.board[row][col] === 0) {
                    const score = this.evaluatePosition(row, col, player);
                    if (score > bestScore) {
                        bestScore = score;
                        bestMove = {row, col};
                    }
                }
            }
        }
        
        return bestScore > 10 ? bestMove : null;
    }
    
    findSmartMove() {
        const moves = [];
        for (let row = 0; row < this.boardSize; row++) {
            for (let col = 0; col < this.boardSize; col++) {
                if (this.board[row][col] === 0 && this.hasNeighbor(row, col)) {
                    moves.push({row, col});
                }
            }
        }
        
        return moves.length > 0 ? moves[Math.floor(Math.random() * moves.length)] : null;
    }
    
    findRandomMove() {
        const moves = [];
        for (let row = 0; row < this.boardSize; row++) {
            for (let col = 0; col < this.boardSize; col++) {
                if (this.board[row][col] === 0) {
                    moves.push({row, col});
                }
            }
        }
        
        return moves.length > 0 ? moves[Math.floor(Math.random() * moves.length)] : null;
    }
    
    hasNeighbor(row, col) {
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                const nr = row + dr;
                const nc = col + dc;
                if (nr >= 0 && nr < this.boardSize && nc >= 0 && nc < this.boardSize && 
                    this.board[nr][nc] !== 0) {
                    return true;
                }
            }
        }
        return false;
    }
    
    evaluatePosition(row, col, player) {
        let score = 0;
        const directions = [[0,1], [1,0], [1,1], [1,-1]];
        
        // Center preference
        const center = Math.floor(this.boardSize / 2);
        const distanceFromCenter = Math.abs(row - center) + Math.abs(col - center);
        score += Math.max(0, 5 - distanceFromCenter);
        
        for (const [dx, dy] of directions) {
            const lineValue = this.evaluateLine(row, col, dx, dy, player);
            score += lineValue;
        }
        
        return score;
    }

    evaluateLine(row, col, dx, dy, player) {
        let score = 0;
        let consecutive = 1; // Count the piece we're placing
        let openEnds = 0;
        let gaps = 0;
        
        // Check positive direction
        let i = 1;
        while (i < 5) {
            const nr = row + dx * i;
            const nc = col + dy * i;
            
            if (nr < 0 || nr >= this.boardSize || nc < 0 || nc >= this.boardSize) {
                break; // Hit boundary
            }
            
            if (this.board[nr][nc] === player) {
                consecutive++;
            } else if (this.board[nr][nc] === 0) {
                if (i === 1) openEnds++;
                break;
            } else {
                break; // Hit opponent piece
            }
            i++;
        }
        
        // Check negative direction
        i = 1;
        while (i < 5) {
            const nr = row - dx * i;
            const nc = col - dy * i;
            
            if (nr < 0 || nr >= this.boardSize || nc < 0 || nc >= this.boardSize) {
                break; // Hit boundary
            }
            
            if (this.board[nr][nc] === player) {
                consecutive++;
            } else if (this.board[nr][nc] === 0) {
                if (i === 1) openEnds++;
                break;
            } else {
                break; // Hit opponent piece
            }
            i++;
        }
        
        // Advanced scoring based on patterns for 5-in-a-row
        if (consecutive >= 5) {
            score += 10000; // Winning move
        } else if (consecutive >= 4) {
            if (openEnds >= 1) score += 1000; // Almost winning
            else score += 200; // Blocked but strong
        } else if (consecutive >= 3) {
            if (openEnds >= 1) score += 300; // Strong threat
            else score += 80; // Blocked threat
        } else if (consecutive === 2) {
            if (openEnds >= 2) score += 50; // Good potential
            else if (openEnds === 1) score += 15; // Some potential
        }
        
        // Bonus for creating multiple threats
        if (openEnds === 2 && consecutive >= 2) {
            score += 100; // Open line is very valuable
        }
        
        return score;
    }
    
    checkWin(row, col, player) {
        const directions = [[0,1], [1,0], [1,1], [1,-1]];
        
        for (const [dx, dy] of directions) {
            let count = 1;
            const winningCells = [{row, col}];
            
            // Check positive direction
            for (let i = 1; i < 5; i++) {
                const newRow = row + dx * i;
                const newCol = col + dy * i;
                
                if (newRow >= 0 && newRow < this.boardSize && newCol >= 0 && newCol < this.boardSize && 
                    this.board[newRow][newCol] === player) {
                    count++;
                    winningCells.push({row: newRow, col: newCol});
                } else {
                    break;
                }
            }
            
            // Check negative direction
            for (let i = 1; i < 5; i++) {
                const newRow = row - dx * i;
                const newCol = col - dy * i;
                
                if (newRow >= 0 && newRow < this.boardSize && newCol >= 0 && newCol < this.boardSize && 
                    this.board[newRow][newCol] === player) {
                    count++;
                    winningCells.push({row: newRow, col: newCol});
                } else {
                    break;
                }
            }
            
            if (count >= 5) {
                this.winningCells = winningCells;
                return true;
            }
        }
        
        return false;
    }
    
    checkDraw() {
        for (let row = 0; row < this.boardSize; row++) {
            for (let col = 0; col < this.boardSize; col++) {
                if (this.board[row][col] === 0) {
                    return false;
                }
            }
        }
        return true;
    }
    
    handleWin(winner) {
        this.gameOver = true;
        this.isThinking = false;
        
        // Highlight winning cells
        this.winningCells.forEach(({row, col}) => {
            const cells = this.boardElement.querySelectorAll('.game-cell');
            const cell = cells[row * this.boardSize + col];
            if (cell) {
                cell.classList.add('winning');
            }
        });
        
        const message = winner === 'player' ? 'You win!' : 'AI wins!';
        this.showMessage(message, 'winner');
        
        // Play appropriate sound for winner
        if (winner === 'player') {
            this.playWinSound();
        } else {
            this.playLoseSound();
        }
        
        // Confetti removed per user request
        
        // Auto-restart game after 2 seconds
        setTimeout(() => {
            this.resetGame();
        }, 2000);
    }
    
    handleDraw() {
        this.gameOver = true;
        this.isThinking = false;
        this.showMessage("Tie", 'draw');
        
        // Play tie sound
        this.playTieSound();
        
        // Auto-restart game after 2 seconds
        setTimeout(() => {
            this.resetGame();
        }, 2000);
    }
    
    showMessage(text, type = '') {
        if (this.messageElement) {
            if (text) {
                this.messageElement.textContent = text;
                this.messageElement.className = `game-message show ${type}`;
            } else {
                // Fade out smoothly
                this.hideMessage();
            }
        }
    }
    
    hideMessage() {
        if (this.messageElement && this.messageElement.classList.contains('show')) {
            this.messageElement.classList.remove('show');
            // Clear text after transition completes
            setTimeout(() => {
                if (this.messageElement && !this.messageElement.classList.contains('show')) {
                    this.messageElement.textContent = '';
                }
            }, 300); // Match CSS transition duration
        }
    }
    
    updateUI() {
        if (!this.gameOver && !this.isThinking) {
            this.showMessage('');
        }
    }
    
    resetGame() {
        this.board = Array(this.boardSize).fill().map(() => Array(this.boardSize).fill(0));
        this.isPlayerTurn = true; // Player starts first
        this.gameOver = false;
        this.isThinking = false;
        this.winningCells = [];
        
        // Reset all cells
        const cells = this.boardElement.querySelectorAll('.game-cell');
        cells.forEach(cell => {
            cell.className = 'game-cell';
        });
        
        this.showMessage('');
        this.updateUI();
    }
    
    // createConfetti method removed per user request
    
    playWinSound() {
        // Create audio context if it doesn't exist
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        try {
            // Create a celebratory win sound using oscillators
            const frequency1 = 523.25; // C5
            const frequency2 = 659.25; // E5
            const frequency3 = 783.99; // G5
            
            // First note
            this.playNote(frequency1, 0, 0.3);
            // Second note
            this.playNote(frequency2, 0.3, 0.3);
            // Third note (higher)
            this.playNote(frequency3, 0.6, 0.5);
        } catch (error) {
            console.log('Audio not available');
        }
    }

    playNote(frequency, delay, duration) {
        setTimeout(() => {
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
            oscillator.type = 'triangle'; // Warmer sound
            
            // Envelope for smooth sound
            gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.3, this.audioContext.currentTime + 0.1);
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);
            
            oscillator.start(this.audioContext.currentTime);
            oscillator.stop(this.audioContext.currentTime + duration);
        }, delay * 1000);
    }

    playLoseSound() {
        // Create audio context if it doesn't exist
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        try {
            // Create a disappointed/somber sound using descending tones
            const frequency1 = 261.63; // C4
            const frequency2 = 196.00; // G3
            const frequency3 = 146.83; // D3
            
            // First note (disappointed)
            this.playLoseNote(frequency1, 0, 0.4);
            // Second note (descending)
            this.playLoseNote(frequency2, 0.4, 0.4);
            // Third note (lower, somber)
            this.playLoseNote(frequency3, 0.8, 0.6);
        } catch (error) {
            console.log('Audio not available');
        }
    }

    playLoseNote(frequency, delay, duration) {
        setTimeout(() => {
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
            oscillator.type = 'sawtooth'; // More somber/harsh sound
            
            // Envelope for disappointed sound
            gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.2, this.audioContext.currentTime + 0.1);
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);
            
            oscillator.start(this.audioContext.currentTime);
            oscillator.stop(this.audioContext.currentTime + duration);
        }, delay * 1000);
    }

    playClickSound() {
        // Create audio context if it doesn't exist
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        try {
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            // Short, crisp click sound
            oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(400, this.audioContext.currentTime + 0.1);
            oscillator.type = 'square'; // Sharp, crisp sound for clicking
            
            // Quick envelope for click effect
            gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.15, this.audioContext.currentTime + 0.01);
            gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.1);
            
            oscillator.start(this.audioContext.currentTime);
            oscillator.stop(this.audioContext.currentTime + 0.1);
        } catch (error) {
            console.log('Audio not available');
        }
    }

    playAIClickSound() {
        // Create audio context if it doesn't exist
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        try {
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            // Lower, more robotic sound for AI
            oscillator.frequency.setValueAtTime(600, this.audioContext.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(300, this.audioContext.currentTime + 0.15);
            oscillator.type = 'sawtooth'; // More mechanical sound
            
            // Slightly different envelope for AI
            gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.12, this.audioContext.currentTime + 0.02);
            gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.15);
            
            oscillator.start(this.audioContext.currentTime);
            oscillator.stop(this.audioContext.currentTime + 0.15);
        } catch (error) {
            console.log('Audio not available');
        }
    }

    playTieSound() {
        // Create audio context if it doesn't exist
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        try {
            // Create a neutral tie sound - neither happy nor sad
            const frequency1 = 329.63; // E4
            const frequency2 = 329.63; // Same note repeated
            const frequency3 = 293.66; // D4 (slight downward resolution)
            
            // First note (neutral)
            this.createTieNote(frequency1, 0, 0.4);
            // Second note (same pitch)
            this.createTieNote(frequency2, 0.5, 0.4);
            // Third note (slight resolution down)
            this.createTieNote(frequency3, 1.0, 0.6);
        } catch (error) {
            console.log('Audio not available');
        }
    }

    createTieNote(frequency, delay, duration) {
        setTimeout(() => {
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
            oscillator.type = 'sine'; // Clean, neutral sound
            
            // Envelope for neutral tie sound
            gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.15, this.audioContext.currentTime + 0.1);
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);
            
            oscillator.start(this.audioContext.currentTime);
            oscillator.stop(this.audioContext.currentTime + duration);
        }, delay * 1000);
    }
}

// Mini Music Player Class
class MusicPlayer {
    constructor() {
        this.isPlaying = false;
        this.isMinimized = true; // Default to minimized
        this.currentTrackIndex = 0;
        this.currentTime = 0;
        this.volume = 0.5;
        this.audioContext = null;
        this.currentOscillator = null;
        this.gainNode = null;
        this.progressInterval = null;
        
        // Playlist - your 9 MP3 files  
        this.playlist = [
            { name: 'Song 1', artist: 'From bensound', src: './Music player/1.mp3', duration: 0 },
            { name: 'Song 2', artist: 'From bensound', src: './Music player/2.mp3', duration: 0 },
            { name: 'Song 3', artist: 'From bensound', src: './Music player/3.mp3', duration: 0 },
            { name: 'Song 4', artist: 'From bensound', src: './Music player/4.mp3', duration: 0 },
            { name: 'Song 5', artist: 'From bensound', src: './Music player/5.mp3', duration: 0 },
            { name: 'Song 6', artist: 'From bensound', src: './Music player/6.mp3', duration: 0 },
            { name: 'Song 7', artist: 'From bensound', src: './Music player/7.mp3', duration: 0 },
            { name: 'Song 8', artist: 'From bensound', src: './Music player/8.mp3', duration: 0 },
            { name: 'Song 9', artist: 'From bensound', src: './Music player/9.mp3', duration: 0 }
        ];
        
        this.audio = new Audio(); // For playing real audio files
        this.audio.volume = this.volume;
        
        // Visualizer properties
        this.analyser = null;
        this.dataArray = null;
        this.visualizerCanvas = null;
        this.visualizerCtx = null;
        this.animationId = null;
        
        this.initializePlayer();
    }
    
    initializePlayer() {
        this.playerElement = document.getElementById('music-player');
        this.playPauseBtn = this.playerElement.querySelector('.play-pause-btn');
        this.prevBtn = this.playerElement.querySelector('.prev-btn');
        this.nextBtn = this.playerElement.querySelector('.next-btn');
        this.headerElement = this.playerElement.querySelector('.music-player-header');
        this.progressBar = this.playerElement.querySelector('.progress-bar');
        this.progressFill = this.playerElement.querySelector('.progress-fill');
        this.currentTimeEl = this.playerElement.querySelector('.current-time');
        this.totalTimeEl = this.playerElement.querySelector('.total-time');
        this.volumeSlider = this.playerElement.querySelector('.volume-slider');
        this.trackNameEl = this.playerElement.querySelector('.track-name');
        this.trackArtistEl = this.playerElement.querySelector('.track-artist');
        
        this.setupEventListeners();
        this.setupHeaderInteraction();
        this.setupVisualizer();
        this.updateTrackInfo();
        this.debugFileAccess();
        
        // Set initial minimized state
        this.playerElement.classList.add('minimized');
    }
    
    setupEventListeners() {
        this.playPauseBtn.addEventListener('click', () => this.togglePlayPause());
        this.prevBtn.addEventListener('click', () => this.previousTrack());
        this.nextBtn.addEventListener('click', () => this.nextTrack());
        this.progressBar.addEventListener('click', (e) => this.seekTo(e));
        this.volumeSlider.addEventListener('input', (e) => this.setVolume(e.target.value));
    }
    
    setupHeaderInteraction() {
        let isDragging = false;
        let startX, startY, startLeft, startTop;
        let dragStarted = false;
        
        this.headerElement.addEventListener('mousedown', (e) => {
            isDragging = true;
            dragStarted = false;
            this.playerElement.classList.add('dragging');
            startX = e.clientX;
            startY = e.clientY;
            
            const rect = this.playerElement.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;
            
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        });
        
        const handleMouseMove = (e) => {
            if (!isDragging) return;
            
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;
            
            // Only start dragging if moved more than 5px
            if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
                dragStarted = true;
                this.headerElement.style.cursor = 'move';
                
                this.playerElement.style.left = `${startLeft + deltaX}px`;
                this.playerElement.style.top = `${startTop + deltaY}px`;
                this.playerElement.style.right = 'auto';
                this.playerElement.style.bottom = 'auto';
            }
        };
        
        const handleMouseUp = () => {
            isDragging = false;
            this.playerElement.classList.remove('dragging');
            this.headerElement.style.cursor = 'pointer';
            
            // If we didn't drag, toggle minimize
            if (!dragStarted) {
                this.toggleMinimize();
            }
            
            dragStarted = false;
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }
    
    setupVisualizer() {
        this.visualizerCanvas = document.getElementById('music-visualizer');
        this.visualizerCtx = this.visualizerCanvas.getContext('2d');
        
        // Set canvas size
        const container = this.visualizerCanvas.parentElement;
        this.visualizerCanvas.width = container.clientWidth - 24; // Account for padding
        this.visualizerCanvas.height = 60;
        
        // Initialize analyser for real audio
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 64; // Small FFT for simple bars
        this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        
        // Connect audio to analyser when playing real files
        this.mediaSource = null;
    }
    
    startVisualizer() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        
        const draw = () => {
            this.animationId = requestAnimationFrame(draw);
            this.drawVisualizer();
        };
        
        draw();
    }
    
    stopVisualizer() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        
        // Clear canvas
        this.visualizerCtx.clearRect(0, 0, this.visualizerCanvas.width, this.visualizerCanvas.height);
    }
    
    drawVisualizer() {
        const canvas = this.visualizerCanvas;
        const ctx = this.visualizerCtx;
        const width = canvas.width;
        const height = canvas.height;
        
        // Clear canvas
        ctx.clearRect(0, 0, width, height);
        
        if (this.isPlaying) {
            const track = this.playlist[this.currentTrackIndex];
            
            // Simple animated visualizer (no real audio analysis)
            const barCount = 32;
            const barWidth = Math.max(2, (width - (barCount - 1) * 1) / barCount);
            const time = Date.now() * 0.003;
            
            for (let i = 0; i < barCount; i++) {
                const wave = Math.sin(time + i * 0.5) * 0.5 + 0.5;
                const barHeight = wave * height * 0.6;
                
                const x = i * (barWidth + 1);
                const y = height - barHeight;
                
                // Soft white gradient
                const gradient = ctx.createLinearGradient(0, height, 0, 0);
                const intensity = wave;
                
                gradient.addColorStop(0, `rgba(255, 255, 255, ${0.2 + intensity * 0.2})`);
                gradient.addColorStop(0.5, `rgba(255, 255, 255, ${0.4 + intensity * 0.3})`);
                gradient.addColorStop(1, `rgba(255, 255, 255, ${0.6 + intensity * 0.4})`);
                
                ctx.fillStyle = gradient;
                ctx.fillRect(x, y, barWidth, barHeight);
            }
        }
    }
    
    debugFileAccess() {
        console.log('');
        console.log('🎵 ====== MUSIC PLAYER DEBUG ======');
        console.log('📁 Current page URL:', window.location.href);
        console.log('📁 Expected folder: Music player/');
        console.log('🎶 Total songs in playlist:', this.playlist.length);
        console.log('🎶 Testing file access...');
        console.log('');
        
        this.playlist.forEach((track, index) => {
            console.log(`${index + 1}. Testing: ${track.src} (${track.name})`);
            
            // Test if file exists with multiple methods
            const testAudio = new Audio();
            
            testAudio.addEventListener('loadstart', () => {
                console.log(`  📥 Track ${index + 1} - Load started`);
            });
            
            testAudio.addEventListener('canplay', () => {
                console.log(`  ✅ Track ${index + 1} - CAN PLAY`);
            });
            
            testAudio.addEventListener('loadedmetadata', () => {
                console.log(`  📊 Track ${index + 1} - Duration: ${testAudio.duration}s`);
            });
            
            testAudio.addEventListener('error', (e) => {
                console.log(`  ❌ Track ${index + 1} - ERROR:`, testAudio.error?.code, testAudio.error?.message);
            });
            
            testAudio.src = track.src;
        });
        
        console.log('');
        console.log('💡 All 9 files should load successfully');
        console.log('💡 Check that yanliudesktop/Music player/ contains 1.mp3 through 9.mp3');
        console.log('🎵 ================================');
        console.log('');
    }
    
    togglePlayPause() {
        if (this.isPlaying) {
            this.pause();
        } else {
            this.play();
        }
    }
    
    play() {
        this.isPlaying = true;
        this.playPauseBtn.textContent = '⏸';
        this.startAudio();
        this.startProgressUpdate();
        this.startVisualizer();
    }
    
    pause() {
        this.isPlaying = false;
        this.playPauseBtn.textContent = '▶';
        this.stopAudio();
        this.stopProgressUpdate();
        this.stopVisualizer();
    }
    
    startAudio() {
        const track = this.playlist[this.currentTrackIndex];
        console.log('🎵 Attempting to play:', track.src);
        console.log('🎵 Track info:', track.name, '-', track.artist);
        
        // Ensure audio context is ready
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        // Resume audio context if suspended (required for autoplay policies)
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        
        if (track.src) {            
            // Play real audio file
            console.log('🔄 Setting audio source to:', track.src);
            this.audio.src = track.src;
            this.audio.currentTime = this.currentTime;
            this.audio.volume = this.volume;
            
            // Add comprehensive event listeners for debugging
            this.audio.onloadstart = () => console.log('📥 Load started for:', track.src);
            this.audio.onloadeddata = () => console.log('📊 Data loaded for:', track.src);
            this.audio.oncanplay = () => console.log('✅ Can play:', track.src);
            this.audio.oncanplaythrough = () => console.log('✅ Can play through:', track.src);
            
            // Just play audio normally - no visualizer connection
            console.log('🔊 Playing audio normally');
            
            // Set up event listeners for real audio
            this.audio.onloadedmetadata = () => {
                console.log('📋 Metadata loaded. Duration:', this.audio.duration);
                track.duration = this.audio.duration;
                this.updateProgressDisplay();
            };
            
            this.audio.onended = () => {
                console.log('🏁 Track ended, going to next');
                this.nextTrack();
            };
            
            this.audio.onerror = (e) => {
                console.error('❌ Audio error event:', e);
                console.error('❌ Audio error code:', this.audio.error?.code);
                console.error('❌ Audio error message:', this.audio.error?.message);
            };
            
            // Attempt to play
            console.log('▶️ Calling play()...');
            const playPromise = this.audio.play();
            
            if (playPromise !== undefined) {
                playPromise.then(() => {
                    console.log('🎉 Successfully started playing:', track.src);
                }).catch(error => {
                    console.error('❌ Play promise failed:', error);
                    console.error('❌ Error name:', error.name);
                    console.error('❌ Error message:', error.message);
                    
                    // Just log the error but don't stop playback for AbortError
                    if (error.name !== 'AbortError') {
                        this.isPlaying = false;
                        this.playPauseBtn.textContent = '▶';
                        this.stopProgressUpdate();
                        this.stopVisualizer();
                        
                        // Show error in player
                        this.trackNameEl.textContent = 'Failed to load';
                        this.trackArtistEl.textContent = error.message;
                    }
                });
            }
            
        } else {
            // Play synthesized audio
            console.log('🎛️ Playing synthesized audio');
            this.startSynthesizedAudio(track);
        }
    }
    
    startSynthesizedAudio(track) {
        try {
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            
            // Main tone (soft sine wave)
            this.currentOscillator = this.audioContext.createOscillator();
            this.gainNode = this.audioContext.createGain();
            
            // Create a subtle LFO for gentle modulation
            const lfo = this.audioContext.createOscillator();
            const lfoGain = this.audioContext.createGain();
            
            // Setup LFO for ambient feel
            lfo.frequency.setValueAtTime(0.5, this.audioContext.currentTime);
            lfoGain.gain.setValueAtTime(5, this.audioContext.currentTime);
            
            lfo.connect(lfoGain);
            lfoGain.connect(this.currentOscillator.frequency);
            
            // Main oscillator setup
            this.currentOscillator.frequency.setValueAtTime(track.frequency, this.audioContext.currentTime);
            this.currentOscillator.type = 'sine';
            
            // Soft envelope
            this.gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
            this.gainNode.gain.linearRampToValueAtTime(this.volume * 0.3, this.audioContext.currentTime + 0.5);
            
            this.currentOscillator.connect(this.gainNode);
            this.gainNode.connect(this.audioContext.destination);
            
            this.currentOscillator.start();
            lfo.start();
            
        } catch (error) {
            console.log('Audio not available');
        }
    }
    
    stopAudio() {
        // Stop real audio
        if (this.audio && !this.audio.paused) {
            this.audio.pause();
        }
        
        // Stop synthesized audio
        if (this.currentOscillator) {
            try {
                this.currentOscillator.stop();
            } catch (error) {
                // Oscillator may already be stopped
            }
            this.currentOscillator = null;
        }
    }
    
    startProgressUpdate() {
        this.progressInterval = setInterval(() => {
            if (this.isPlaying) {
                const track = this.playlist[this.currentTrackIndex];
                
                if (track.src && this.audio) {
                    // For real audio files, get current time from audio element
                    this.currentTime = this.audio.currentTime;
                } else {
                    // For synthesized audio, increment manually
                    this.currentTime += 0.1;
                }
                
                if (this.currentTime >= track.duration) {
                    this.nextTrack();
                } else {
                    this.updateProgressDisplay();
                }
            }
        }, 100);
    }
    
    stopProgressUpdate() {
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }
    }
    
    updateProgressDisplay() {
        const track = this.playlist[this.currentTrackIndex];
        const progress = (this.currentTime / track.duration) * 100;
        this.progressFill.style.width = `${progress}%`;
        
        this.currentTimeEl.textContent = this.formatTime(this.currentTime);
        this.totalTimeEl.textContent = this.formatTime(track.duration);
    }
    
    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    
    seekTo(e) {
        const rect = this.progressBar.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const progress = clickX / rect.width;
        
        const track = this.playlist[this.currentTrackIndex];
        const newTime = progress * track.duration;
        
        if (track.src && this.audio) {
            // For real audio files, seek the audio element
            this.audio.currentTime = newTime;
            this.currentTime = newTime;
        } else {
            // For synthesized audio, just update the time
            this.currentTime = newTime;
        }
        
        this.updateProgressDisplay();
    }
    
    setVolume(value) {
        this.volume = value / 100;
        
        // Update real audio volume
        if (this.audio) {
            this.audio.volume = this.volume;
        }
        
        // Update synthesized audio volume
        if (this.gainNode) {
            this.gainNode.gain.setValueAtTime(this.volume * 0.3, this.audioContext.currentTime);
        }
    }
    
    previousTrack() {
        this.stopAudio();
        this.currentTrackIndex = (this.currentTrackIndex - 1 + this.playlist.length) % this.playlist.length;
        this.currentTime = 0;
        this.updateTrackInfo();
        
        if (this.isPlaying) {
            this.startAudio();
        }
    }
    
    nextTrack() {
        console.log('🔄 Next track called. Current index:', this.currentTrackIndex);
        this.stopAudio();
        this.currentTrackIndex = (this.currentTrackIndex + 1) % this.playlist.length;
        this.currentTime = 0;
        
        console.log('🔄 New track index:', this.currentTrackIndex);
        console.log('🔄 New track:', this.playlist[this.currentTrackIndex]);
        
        this.updateTrackInfo();
        
        if (this.isPlaying) {
            console.log('🔄 Starting new track...');
            this.startAudio();
        }
    }
    
    updateTrackInfo() {
        const track = this.playlist[this.currentTrackIndex];
        this.trackNameEl.textContent = track.name;
        this.trackArtistEl.textContent = track.artist;
        this.totalTimeEl.textContent = this.formatTime(track.duration);
        this.currentTimeEl.textContent = '0:00';
        this.progressFill.style.width = '0%';
    }
    
    toggleMinimize() {
        this.isMinimized = !this.isMinimized;
        this.playerElement.classList.toggle('minimized', this.isMinimized);
    }
}

// Initialize the portfolio OS when DOM is loaded
// Avatar Creator Class
class AvatarCreator {
    constructor() {
        this.currentAvatar = {
            head: -1,
            clothes: -1,
            accessory: -1 // -1 means no selection
        };
        
        this.avatarAssets = {
            heads: [
                'Head/Hair 1.svg',
                'Head/Hair 2.svg',
                'Head/Hair 3.svg',
                'Head/Hair 4.svg',
                'Head/Hair 5.svg',
                'Head/Hair 6.svg',
                'Head/Hair 7.svg',
                'Head/Hair 8.svg',
                'Head/Hair 9.svg',
                'Head/Hair 10.svg',
                'Head/Hair 11.svg',
                'Head/Hair 12.svg'
            ],
            clothes: [
                'Clothes/Cloth 1.svg',
                'Clothes/Cloth 2.svg',
                'Clothes/Cloth 3.svg',
                'Clothes/Cloth 4.svg',
                'Clothes/Cloth 5.svg',
                'Clothes/Cloth 6.svg',
                'Clothes/Cloth 7.svg',
                'Clothes/Cloth 8.svg',
                'Clothes/Cloth 9.svg',
                'Clothes/Cloth 10.svg',
                'Clothes/Cloth 11.svg',
                'Clothes/Cloth 12.svg',
                'Clothes/Cloth 13.svg',
                'Clothes/Cloth 14.svg'
            ],
            accessories: [
                'Accessories 1.svg'
            ]
        };
    }
    
    async updateAvatar() {
        const canvas = document.getElementById('avatar-canvas');
        if (!canvas) return;
        
        // Clear existing content
        canvas.innerHTML = '';
        
        // Create main container div 
        const container = document.createElement('div');
        container.style.cssText = `
            position: relative;
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        
        // STEP 1: Always load base avatar (selected head/hair or Starting point.svg)
        let baseAvatarPath = 'Starting point.svg';
        if (this.currentAvatar.head >= 0) {
            baseAvatarPath = this.avatarAssets.heads[this.currentAvatar.head];
        }
        
        try {
            console.log('Loading base avatar:', baseAvatarPath);
            const baseAvatarSvg = await window.portfolioOS.loadSVGFile(baseAvatarPath);
            
            if (baseAvatarSvg) {
                const baseElement = document.createElement('div');
                baseElement.innerHTML = baseAvatarSvg;
                baseElement.style.cssText = `
                    position: absolute;
                    width: 100%;
                    height: 100%;
                    top: 0;
                    left: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 1;
                `;
                
                // Style the base avatar SVG to fit perfectly
                const svg = baseElement.querySelector('svg');
                if (svg) {
                    svg.style.cssText = `
                        width: 260px;
                        height: 260px;
                    `;
                }
                
                container.appendChild(baseElement);
                console.log('Base avatar loaded:', baseAvatarPath);
            } else {
                throw new Error('Could not load base avatar');
            }
        } catch (error) {
            console.error('Error loading base avatar:', error);
            
            // Show fallback basic avatar
            const fallbackElement = document.createElement('div');
            fallbackElement.innerHTML = `
                <svg width="260" height="300" viewBox="0 0 350 390" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="141" y="185" width="68.2139" height="128.131" rx="13.7769" fill="white" stroke="#323232" stroke-width="4" stroke-linecap="round"/>
                    <path d="M142.896 267.634V226.678H211.5C206.333 247.68 175.523 268.768 142.896 267.634Z" fill="#7E7E7E" fill-opacity="0.45"/>
                    <path d="M108 153C121.45 153 132 162.811 132 174.5C132 186.189 121.45 196 108 196C94.5501 196 84 186.189 84 174.5C84 162.811 94.5501 153 108 153Z" fill="white" stroke="#323232" stroke-width="4"/>
                    <path d="M243 153C229.55 153 219 162.811 219 174.5C219 186.189 229.55 196 243 196C256.45 196 267 186.189 267 174.5C267 162.811 256.45 153 243 153Z" fill="white" stroke="#323232" stroke-width="4"/>
                    <path d="M176.03 71C197.043 71.0001 213.473 82.8931 224.74 100.611C236.026 118.358 242 141.787 242 164.262C242 186.713 236.042 203.834 224.985 215.337C213.941 226.828 197.532 233 176.03 233C154.527 233 137.842 226.826 126.528 215.32C115.211 203.81 109 186.69 109 164.262C109 141.804 115.232 118.379 126.779 100.629C138.311 82.9027 155.009 71 176.03 71Z" fill="white" stroke="#323232" stroke-width="4" stroke-linecap="round"/>
                    <path d="M176 163C174.029 169.812 173 173.371 173 180.458C175.64 181.72 178.163 182.036 182.5 182" stroke="#323232" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M140.768 155.178C142.829 155.178 144.657 156.293 145.953 158.021C147.249 159.748 148.035 162.112 148.035 164.701C148.035 167.291 147.249 169.655 145.953 171.382C144.657 173.11 142.829 174.225 140.768 174.225C138.706 174.225 136.878 173.11 135.582 171.382C134.286 169.655 133.5 167.291 133.5 164.701C133.5 162.112 134.286 159.748 135.582 158.021C136.878 156.293 138.706 155.178 140.768 155.178Z" fill="#323232" stroke="#323232" stroke-linecap="round"/>
                    <circle cx="143.616" cy="162.487" r="2.5" fill="white" stroke="#323232"/>
                    <path d="M212.768 155.178C214.829 155.178 216.657 156.293 217.953 158.021C219.249 159.748 220.035 162.112 220.035 164.701C220.035 167.291 219.249 169.655 217.953 171.382C216.657 173.11 214.829 174.225 212.768 174.225C210.706 174.225 208.878 173.11 207.582 171.382C206.286 169.655 205.5 167.291 205.5 164.701C205.5 162.112 206.286 159.748 207.582 158.021C208.878 156.293 210.706 155.178 212.768 155.178Z" fill="#323232" stroke="#323232" stroke-linecap="round"/>
                    <circle cx="215.616" cy="162.487" r="2" fill="white"/>
                    <path d="M168 197.5C171 201.167 178.8 206.3 186 197.5" stroke="#323232" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
                    <g filter="url(#filter0_f_2202_2750)">
                        <ellipse cx="136.5" cy="192.5" rx="9.5" ry="5.5" fill="#FC9D80"/>
                    </g>
                    <g filter="url(#filter1_f_2202_2750)">
                        <ellipse cx="215.5" cy="192.5" rx="9.5" ry="5.5" fill="#FC9D80"/>
                    </g>
                    <path d="M206.838 103.678C178.838 143.678 153.136 146.762 106 151C114.748 89.7943 110.5 68 182.5 65C240 68.5 238.619 99.613 240 151C222.838 141.678 219.182 135.481 206.838 103.678Z" fill="#323232"/>
                    <defs>
                        <filter id="filter0_f_2202_2750" x="115" y="175" width="43" height="35" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
                            <feFlood flood-opacity="0" result="BackgroundImageFix"/>
                            <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
                            <feGaussianBlur stdDeviation="6" result="effect1_foregroundBlur_2202_2750"/>
                        </filter>
                        <filter id="filter1_f_2202_2750" x="194" y="175" width="43" height="35" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
                            <feFlood flood-opacity="0" result="BackgroundImageFix"/>
                            <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
                            <feGaussianBlur stdDeviation="6" result="effect1_foregroundBlur_2202_2750"/>
                        </filter>
                    </defs>
                </svg>
            `;
            fallbackElement.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 1;
            `;
            container.appendChild(fallbackElement);
        }
        
        // STEP 2: Add clothes layer (if selected) positioned on body area
        if (this.currentAvatar.clothes >= 0) {
            const clothesPath = this.avatarAssets.clothes[this.currentAvatar.clothes];
            try {
                console.log('Loading clothes:', clothesPath);
                const clothesSvg = await window.portfolioOS.loadSVGFile(clothesPath);
                
                if (clothesSvg) {
                    const clothesElement = document.createElement('div');
                    clothesElement.innerHTML = clothesSvg;
                    clothesElement.style.cssText = `
                        position: absolute;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%);
                        z-index: 2;
                        pointer-events: none;
                    `;
                    
                    // Style clothes to match base avatar perfectly
                    const svg = clothesElement.querySelector('svg');
                    if (svg) {
                        svg.style.cssText = `
                            width: 260px;
                            height: 260px;
                        `;
                    }
                    
                    container.appendChild(clothesElement);
                    console.log('Clothes added:', clothesPath);
                }
            } catch (error) {
                console.log('Could not load clothes:', clothesPath);
            }
        }
        
        // STEP 3: Add accessories layer (if selected) positioned correctly
        if (this.currentAvatar.accessory >= 0) {
            const accessoryPath = this.avatarAssets.accessories[this.currentAvatar.accessory];
            try {
                console.log('Loading accessory:', accessoryPath);
                const accessorySvg = await window.portfolioOS.loadSVGFile(accessoryPath);
                
                if (accessorySvg) {
                    const accessoryElement = document.createElement('div');
                    accessoryElement.innerHTML = accessorySvg;
                    accessoryElement.style.cssText = `
                        position: absolute;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%);
                        z-index: 3;
                        pointer-events: none;
                    `;
                    
                    // Style accessories to match base avatar perfectly
                    const svg = accessoryElement.querySelector('svg');
                    if (svg) {
                        svg.style.cssText = `
                            width: 260px;
                            height: 260px;
                        `;
                    }
                    
                    container.appendChild(accessoryElement);
                    console.log('Accessory added:', accessoryPath);
                }
            } catch (error) {
                console.log('Could not load accessory:', accessoryPath);
            }
        }
        
        // Add container to canvas
        canvas.appendChild(container);
    }
    
    // Create overlay functions for layering on the basic avatar
    createHeadOverlay(headPath) {
        const fileName = headPath.split('/').pop().replace('.svg', '');
        
        // Return different hair styles that overlay on the basic head
        if (fileName.toLowerCase().includes('short straignt')) {
            return '<svg width="280" height="320" viewBox="0 0 350 390"><path d="M100 100 Q175 60 250 100 Q225 75 175 75 Q125 75 100 100" fill="#654321"/></svg>';
        } else if (fileName.toLowerCase().includes('bangs')) {
            return '<svg width="280" height="320" viewBox="0 0 350 390"><path d="M100 100 Q175 60 250 100 Q225 75 175 75 Q125 75 100 100" fill="#8B4513"/><path d="M110 85 L140 90 L185 90 L210 90 L240 85" stroke="#8B4513" stroke-width="4"/></svg>';
        } else if (fileName.toLowerCase().includes('long')) {
            return '<svg width="280" height="320" viewBox="0 0 350 390"><path d="M90 95 Q175 55 260 95 L255 200 Q175 180 95 200 Z" fill="#654321"/></svg>';
        } else if (fileName.toLowerCase().includes('bun')) {
            return '<svg width="280" height="320" viewBox="0 0 350 390"><circle cx="175" cy="70" r="15" fill="#654321"/><path d="M100 100 Q175 75 250 100" fill="#654321"/></svg>';
        } else if (fileName.toLowerCase().includes('braid')) {
            return '<svg width="280" height="320" viewBox="0 0 350 390"><path d="M90 95 Q175 55 260 95 L275 250 Q270 245 265 250 L255 200 Q175 180 95 200 L85 250 Q80 245 75 250 Z" fill="#654321"/></svg>';
        }
        
        return '<svg width="280" height="320" viewBox="0 0 350 390"><path d="M100 100 Q175 65 250 100" fill="#654321"/></svg>';
    }
    
    createClothesOverlay(clothesPath) {
        const fileName = clothesPath.split('/').pop().replace('.svg', '');
        
        // Return different clothing that overlays on the basic body
        if (fileName.toLowerCase().includes('t shirt')) {
            return '<svg width="280" height="320" viewBox="0 0 350 390"><rect x="120" y="180" width="110" height="80" rx="10" fill="#4A90E2" stroke="#333" stroke-width="2"/></svg>';
        } else if (fileName.toLowerCase().includes('button')) {
            return '<svg width="280" height="320" viewBox="0 0 350 390"><rect x="120" y="180" width="110" height="80" rx="10" fill="#2ECC71" stroke="#333" stroke-width="2"/><circle cx="175" cy="200" r="3" fill="#333"/><circle cx="175" cy="220" r="3" fill="#333"/><circle cx="175" cy="240" r="3" fill="#333"/></svg>';
        } else if (fileName.toLowerCase().includes('stripe')) {
            return '<svg width="280" height="320" viewBox="0 0 350 390"><rect x="120" y="180" width="110" height="80" rx="10" fill="#E74C3C" stroke="#333" stroke-width="2"/><line x1="120" y1="195" x2="230" y2="195" stroke="#fff" stroke-width="3"/><line x1="120" y1="215" x2="230" y2="215" stroke="#fff" stroke-width="3"/><line x1="120" y1="235" x2="230" y2="235" stroke="#fff" stroke-width="3"/></svg>';
        } else if (fileName.toLowerCase().includes('cardigan')) {
            return '<svg width="280" height="320" viewBox="0 0 350 390"><rect x="120" y="180" width="110" height="80" rx="10" fill="#9B59B6" stroke="#333" stroke-width="2"/><path d="M175 180 L175 260" stroke="#333" stroke-width="2"/></svg>';
        } else if (fileName.toLowerCase().includes('collar')) {
            return '<svg width="280" height="320" viewBox="0 0 350 390"><rect x="120" y="180" width="110" height="80" rx="10" fill="#F39C12" stroke="#333" stroke-width="2"/><path d="M120 180 L140 160 L210 160 L230 180" stroke="#333" stroke-width="2" fill="#F39C12"/></svg>';
        }
        
        return '<svg width="280" height="320" viewBox="0 0 350 390"><rect x="120" y="180" width="110" height="80" rx="10" fill="#4A90E2" stroke="#333" stroke-width="2"/></svg>';
    }
    
    createAccessoryOverlay(accessoryPath) {
        const fileName = accessoryPath.split('/').pop().replace('.svg', '');
        
        // Return accessories that overlay on the avatar
        if (fileName.toLowerCase().includes('glass')) {
            return '<svg width="280" height="320" viewBox="0 0 350 390"><rect x="130" y="150" width="25" height="15" rx="5" fill="none" stroke="#333" stroke-width="3"/><rect x="195" y="150" width="25" height="15" rx="5" fill="none" stroke="#333" stroke-width="3"/><line x1="155" y1="157" x2="195" y2="157" stroke="#333" stroke-width="3"/></svg>';
        } else if (fileName.toLowerCase().includes('hat')) {
            return '<svg width="280" height="320" viewBox="0 0 350 390"><ellipse cx="175" cy="110" rx="60" ry="8" fill="#654321"/><rect x="130" y="60" width="90" height="50" rx="45" fill="#654321"/></svg>';
        } else if (fileName.toLowerCase().includes('cap')) {
            return '<svg width="280" height="320" viewBox="0 0 350 390"><path d="M100 105 Q175 70 250 105 L270 95 Q175 60 80 95 Z" fill="#E74C3C"/></svg>';
        } else if (fileName.toLowerCase().includes('beanie')) {
            return '<svg width="280" height="320" viewBox="0 0 350 390"><path d="M110 110 Q175 75 240 110 Q225 85 175 85 Q125 85 110 110" fill="#8E44AD"/></svg>';
        } else if (fileName.toLowerCase().includes('earning')) {
            return '<svg width="280" height="320" viewBox="0 0 350 390"><circle cx="120" cy="160" r="6" fill="#FFD700"/><circle cx="230" cy="160" r="6" fill="#FFD700"/></svg>';
        }
        
        return null; // No overlay for unknown accessories
    }
}

// Add Avatar Creator methods to PortfolioOS
PortfolioOS.prototype.initializeAvatarCreator = function() {
    console.log('Initializing Avatar Creator...');
    
    if (!this.avatarCreator) {
        this.avatarCreator = new AvatarCreator();
    }
    
    // Set up category tabs with improved error handling
    const categoryTabs = document.querySelectorAll('.category-tab');
    console.log('Found category tabs:', categoryTabs.length);
    
    categoryTabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            const category = e.target.dataset.category;
            console.log('Category tab clicked:', category);
            
            // Update tab active states
            document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            
            // Update panel active states
            document.querySelectorAll('.category-panel').forEach(p => p.classList.remove('active'));
            const targetPanel = document.querySelector(`[data-category="${category}"].category-panel`);
            if (targetPanel) {
                targetPanel.classList.add('active');
                console.log('Activated panel for category:', category);
            } else {
                console.error('Could not find panel for category:', category);
            }
        });
    });
    
    // Populate visual options for each category
    this.populateVisualOptions();
    
    // Initial avatar update - show basic.svg
    this.avatarCreator.updateAvatar();
};

PortfolioOS.prototype.populateVisualOptions = function() {
    // Populate head options
    const headGrid = document.getElementById('head-options');
    this.avatarCreator.avatarAssets.heads.forEach((asset, index) => {
        const option = document.createElement('div');
        option.className = 'visual-option-item';
        option.dataset.category = 'head';
        option.dataset.value = index;
        
        // Create a mini preview of the head
        this.loadAssetPreview(asset, option);
        
        option.addEventListener('click', (e) => this.handleVisualOptionClick(e));
        headGrid.appendChild(option);
    });
    
    // Populate clothes options
    const clothesGrid = document.getElementById('clothes-options');
    this.avatarCreator.avatarAssets.clothes.forEach((asset, index) => {
        const option = document.createElement('div');
        option.className = 'visual-option-item';
        option.dataset.category = 'clothes';
        option.dataset.value = index;
        
        this.loadAssetPreview(asset, option);
        
        option.addEventListener('click', (e) => this.handleVisualOptionClick(e));
        clothesGrid.appendChild(option);
    });
    
    // Populate accessory options (with "None" option)
    const accessoryGrid = document.getElementById('accessory-options');
    
    // Add "None" option first
    const noneOption = document.createElement('div');
    noneOption.className = 'visual-option-item none active';
    noneOption.dataset.category = 'accessory';
    noneOption.dataset.value = -1;
    noneOption.textContent = 'None';
    noneOption.addEventListener('click', (e) => this.handleVisualOptionClick(e));
    accessoryGrid.appendChild(noneOption);
    
    // Add actual accessory options
    this.avatarCreator.avatarAssets.accessories.forEach((asset, index) => {
        const option = document.createElement('div');
        option.className = 'visual-option-item';
        option.dataset.category = 'accessory';
        option.dataset.value = index;
        
        this.loadAssetPreview(asset, option);
        
        option.addEventListener('click', (e) => this.handleVisualOptionClick(e));
        accessoryGrid.appendChild(option);
    });
};

PortfolioOS.prototype.loadAssetPreview = async function(assetPath, container) {
    // First try to load the actual SVG file
    try {
        // Use XMLHttpRequest which sometimes works better with file:// protocol
        const svgContent = await this.loadSVGFile(assetPath);
        if (svgContent) {
            container.innerHTML = svgContent;
            return;
        }
    } catch (error) {
        console.log('Could not load real SVG, using placeholder:', error);
    }
    
    // Show loading message instead of useless placeholder
    container.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 80px; font-size: 12px; color: #666;">Need web server<br>to load SVGs</div>';
};

PortfolioOS.prototype.loadSVGFile = function(assetPath, retryCount = 0) {
    const MAX_RETRIES = 2;
    const RETRY_DELAY = 1000;
    
    return new Promise((resolve, reject) => {
        // Validate input
        if (!assetPath || typeof assetPath !== 'string') {
            const error = new Error('Invalid asset path provided');
            console.error('SVG Load Error:', error.message, { assetPath });
            this.cacheMetrics.errors++;
            reject(error);
            return;
        }
        
        // Check cache first
        const cached = this.getCachedSVG(assetPath);
        if (cached) {
            resolve(cached);
            return;
        }
        
        // Try different path approaches with better error context
        const pathsToTry = [
            `Avatar creator/${assetPath}`,
            `./Avatar creator/${assetPath}`,
            assetPath.includes('/') ? assetPath : `Avatar creator/${assetPath}`
        ];
        
        let currentPathIndex = 0;
        const loadAttempts = [];
        
        const tryNextPath = async () => {
            if (currentPathIndex >= pathsToTry.length) {
                const errorDetails = {
                    assetPath,
                    pathsTried: pathsToTry,
                    attempts: loadAttempts,
                    retryCount
                };
                console.error('SVG Load Failed - All paths exhausted:', errorDetails);
                
                // Try retry if available
                if (retryCount < MAX_RETRIES) {
                    console.log(`Retrying SVG load for ${assetPath} (attempt ${retryCount + 1}/${MAX_RETRIES + 1})`);
                    setTimeout(() => {
                        this.loadSVGFile(assetPath, retryCount + 1)
                            .then(resolve)
                            .catch(reject);
                    }, RETRY_DELAY * Math.pow(2, retryCount));
                    return;
                }
                
                // Generate fallback SVG if all retries exhausted
                const fallback = this.generateFallbackSVG(assetPath);
                if (fallback) {
                    console.warn('Using fallback SVG for:', assetPath);
                    resolve(fallback);
                    return;
                }
                
                reject(new Error(`Failed to load ${assetPath} after ${MAX_RETRIES + 1} attempts and ${pathsToTry.length} paths`));
                return;
            }
            
            const path = pathsToTry[currentPathIndex];
            const attemptStart = performance.now();
            currentPathIndex++;
            
            try {
                // Try fetch first with timeout
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 5000);
                
                const response = await fetch(path, { 
                    signal: controller.signal,
                    cache: 'force-cache'
                });
                clearTimeout(timeoutId);
                
                if (response.ok) {
                    const svgText = await response.text();
                    const attemptTime = performance.now() - attemptStart;
                    
                    // Validate SVG content
                    if (!svgText || !svgText.includes('<svg')) {
                        throw new Error('Invalid SVG content received');
                    }
                    
                    console.log(`SVG loaded successfully: ${path} (${attemptTime.toFixed(2)}ms)`);
                    loadAttempts.push({ path, method: 'fetch', success: true, time: attemptTime });
                    
                    // Cache the loaded SVG
                    this.setCachedSVG(assetPath, svgText);
                    
                    resolve(svgText);
                    return;
                }
                
                loadAttempts.push({ 
                    path, 
                    method: 'fetch', 
                    success: false, 
                    error: `HTTP ${response.status}`,
                    time: performance.now() - attemptStart 
                });
                
            } catch (fetchError) {
                loadAttempts.push({ 
                    path, 
                    method: 'fetch', 
                    success: false, 
                    error: fetchError.message,
                    time: performance.now() - attemptStart
                });
                console.warn(`Fetch failed for ${path}:`, fetchError.message);
            }
            
            // Try XMLHttpRequest with better error handling
            try {
                const xhr = new XMLHttpRequest();
                const xhrStart = performance.now();
                
                xhr.timeout = 5000;
                xhr.open('GET', path, true);
                
                xhr.onreadystatechange = function() {
                    if (xhr.readyState === 4) {
                        const xhrTime = performance.now() - xhrStart;
                        
                        if ((xhr.status === 200 || xhr.status === 0) && xhr.responseText) {
                            // Validate XHR response
                            if (!xhr.responseText.includes('<svg')) {
                                loadAttempts.push({ 
                                    path, 
                                    method: 'xhr', 
                                    success: false, 
                                    error: 'Invalid SVG content',
                                    time: xhrTime
                                });
                                tryNextPath();
                                return;
                            }
                            
                            console.log(`XHR successful for: ${path} (${xhrTime.toFixed(2)}ms)`);
                            loadAttempts.push({ path, method: 'xhr', success: true, time: xhrTime });
                            
                            // Cache the loaded SVG
                            this.setCachedSVG(assetPath, xhr.responseText);
                            
                            resolve(xhr.responseText);
                        } else {
                            loadAttempts.push({ 
                                path, 
                                method: 'xhr', 
                                success: false, 
                                error: `HTTP ${xhr.status}`,
                                time: xhrTime
                            });
                            console.warn(`XHR failed for ${path}, status: ${xhr.status}`);
                            tryNextPath();
                        }
                    }
                };
                
                xhr.onerror = () => {
                    const xhrTime = performance.now() - xhrStart;
                    loadAttempts.push({ 
                        path, 
                        method: 'xhr', 
                        success: false, 
                        error: 'Network error',
                        time: xhrTime
                    });
                    console.warn(`XHR error for: ${path}`);
                    tryNextPath();
                };
                
                xhr.ontimeout = () => {
                    const xhrTime = performance.now() - xhrStart;
                    loadAttempts.push({ 
                        path, 
                        method: 'xhr', 
                        success: false, 
                        error: 'Timeout',
                        time: xhrTime
                    });
                    console.warn(`XHR timeout for: ${path}`);
                    tryNextPath();
                };
                
                xhr.send();
                
            } catch (xhrError) {
                loadAttempts.push({ 
                    path, 
                    method: 'xhr', 
                    success: false, 
                    error: xhrError.message,
                    time: performance.now() - xhrStart
                });
                console.warn(`XHR setup failed for ${path}:`, xhrError.message);
                tryNextPath();
            }
        };
        
        // Start the loading process
        tryNextPath();
    });
};

// Add fallback SVG generation for failed loads
PortfolioOS.prototype.generateFallbackSVG = function(assetPath) {
    try {
        const fileName = assetPath.split('/').pop()?.replace('.svg', '') || 'unknown';
        const category = assetPath.toLowerCase();
        
        if (category.includes('head') || category.includes('hair')) {
            return `<svg width="500" height="500" viewBox="0 0 500 500" xmlns="http://www.w3.org/2000/svg">
                <rect width="500" height="500" fill="none"/>
                <circle cx="250" cy="220" r="80" fill="#FDBCB4" stroke="#333" stroke-width="2"/>
                <circle cx="230" cy="200" r="8" fill="#333"/>
                <circle cx="270" cy="200" r="8" fill="#333"/>
                <path d="M230 240 Q250 260 270 240" stroke="#333" stroke-width="2" fill="none"/>
                <path d="M170 180 Q250 100 330 180 Q300 120 250 120 Q200 120 170 180" fill="#654321"/>
                <text x="250" y="400" text-anchor="middle" font-size="14" fill="#666">Fallback: ${fileName}</text>
            </svg>`;
        } else if (category.includes('cloth') || category.includes('shirt')) {
            return `<svg width="500" height="500" viewBox="0 0 500 500" xmlns="http://www.w3.org/2000/svg">
                <rect width="500" height="500" fill="none"/>
                <rect x="180" y="280" width="140" height="180" fill="#4A90E2" stroke="#333" stroke-width="2" rx="10"/>
                <rect x="160" y="250" width="40" height="60" fill="#4A90E2" stroke="#333" stroke-width="2"/>
                <rect x="300" y="250" width="40" height="60" fill="#4A90E2" stroke="#333" stroke-width="2"/>
                <text x="250" y="400" text-anchor="middle" font-size="14" fill="#666">Fallback: ${fileName}</text>
            </svg>`;
        } else if (category.includes('access')) {
            return `<svg width="500" height="500" viewBox="0 0 500 500" xmlns="http://www.w3.org/2000/svg">
                <rect width="500" height="500" fill="none"/>
                <rect x="200" y="150" width="100" height="20" fill="#FFD700" stroke="#333" stroke-width="2" rx="10"/>
                <circle cx="220" cy="160" r="8" fill="#FF6B6B"/>
                <circle cx="280" cy="160" r="8" fill="#FF6B6B"/>
                <text x="250" y="400" text-anchor="middle" font-size="14" fill="#666">Fallback: ${fileName}</text>
            </svg>`;
        }
        
        // Generic fallback
        return `<svg width="500" height="500" viewBox="0 0 500 500" xmlns="http://www.w3.org/2000/svg">
            <rect width="500" height="500" fill="none"/>
            <rect x="200" y="200" width="100" height="100" fill="#E0E0E0" stroke="#999" stroke-width="2" rx="10"/>
            <text x="250" y="250" text-anchor="middle" font-size="16" fill="#666">?</text>
            <text x="250" y="350" text-anchor="middle" font-size="12" fill="#666">Missing: ${fileName}</text>
        </svg>`;
    } catch (error) {
        console.error('Error generating fallback SVG:', error);
        return null;
    }
};

PortfolioOS.prototype.createAssetPreview = function(assetPath) {
    // Create specific previews based on asset name
    const fileName = assetPath.split('/').pop().replace('.svg', '');
    
    if (assetPath.includes('Head and hair style')) {
        return this.createHeadPreview(fileName);
    } else if (assetPath.includes('Clothes')) {
        return this.createClothesPreview(fileName);
    } else if (assetPath.includes('Accessories')) {
        return this.createAccessoryPreview(fileName);
    }
    
    return '<svg width="80" height="80"><rect width="80" height="80" fill="#f5f5f5" stroke="#ddd"/><text x="40" y="45" text-anchor="middle" font-size="10" fill="#999">Preview</text></svg>';
};

PortfolioOS.prototype.createHeadPreview = function(fileName) {
    // Create different head previews based on filename
    const baseHead = `
        <svg width="80" height="80" viewBox="0 0 80 80">
            <circle cx="40" cy="35" r="20" fill="#FDBCB4" stroke="#333" stroke-width="1"/>
            <circle cx="35" cy="32" r="2" fill="#333"/>
            <circle cx="45" cy="32" r="2" fill="#333"/>
            <path d="M35 40 Q40 45 45 40" stroke="#333" stroke-width="1" fill="none"/>
    `;
    
    let hair = '';
    if (fileName.toLowerCase().includes('short')) {
        hair = '<path d="M20 30 Q40 15 60 30 Q50 20 40 20 Q30 20 20 30" fill="#654321"/>';
    } else if (fileName.toLowerCase().includes('long')) {
        hair = '<path d="M20 25 Q40 10 60 25 L55 50 Q40 45 25 50 Z" fill="#654321"/>';
    } else if (fileName.toLowerCase().includes('bangs')) {
        hair = '<path d="M20 30 Q40 15 60 30 Q50 20 40 20 Q30 20 20 30" fill="#654321"/><path d="M25 25 L35 28 L45 28 L55 25" stroke="#654321" stroke-width="2"/>';
    } else if (fileName.toLowerCase().includes('braid')) {
        hair = '<path d="M20 25 Q40 10 60 25 L65 60 Q62 55 58 60 L55 50 Q40 45 25 50 L22 60 Q18 55 15 60 Z" fill="#654321"/>';
    } else if (fileName.toLowerCase().includes('bun')) {
        hair = '<circle cx="40" cy="20" r="8" fill="#654321"/><path d="M20 30 Q40 20 60 30" fill="#654321"/>';
    } else if (fileName.toLowerCase().includes('beard')) {
        hair = '<path d="M20 30 Q40 15 60 30" fill="#654321"/><path d="M30 45 Q40 50 50 45 Q45 55 40 55 Q35 55 30 45" fill="#654321"/>';
    } else {
        hair = '<path d="M20 30 Q40 15 60 30" fill="#654321"/>';
    }
    
    let accessory = '';
    if (fileName.toLowerCase().includes('hat')) {
        accessory = '<rect x="25" y="15" width="30" height="8" rx="4" fill="#333"/>';
    } else if (fileName.toLowerCase().includes('cap')) {
        accessory = '<path d="M20 25 Q40 10 60 25 L65 20 Q40 5 15 20 Z" fill="#333"/>';
    } else if (fileName.toLowerCase().includes('glasses')) {
        accessory = '<rect x="28" y="30" width="10" height="8" rx="2" fill="none" stroke="#333"/><rect x="42" y="30" width="10" height="8" rx="2" fill="none" stroke="#333"/><line x1="38" y1="34" x2="42" y2="34" stroke="#333"/>';
    }
    
    return baseHead + hair + accessory + '</svg>';
};

PortfolioOS.prototype.createClothesPreview = function(fileName) {
    const base = `
        <svg width="80" height="80" viewBox="0 0 80 80">
            <rect x="25" y="25" width="30" height="35" rx="3" fill="#4A90E2" stroke="#333" stroke-width="1"/>
    `;
    
    let details = '';
    if (fileName.toLowerCase().includes('button')) {
        details = '<circle cx="40" cy="35" r="2" fill="#333"/><circle cx="40" cy="45" r="2" fill="#333"/>';
    } else if (fileName.toLowerCase().includes('pocket')) {
        details = '<rect x="30" y="30" width="8" height="6" rx="1" fill="none" stroke="#333"/>';
    } else if (fileName.toLowerCase().includes('collar')) {
        details = '<path d="M25 25 L30 20 L50 20 L55 25" stroke="#333" stroke-width="1" fill="#4A90E2"/>';
    } else if (fileName.toLowerCase().includes('stripe')) {
        details = '<line x1="25" y1="30" x2="55" y2="30" stroke="#fff" stroke-width="2"/><line x1="25" y1="40" x2="55" y2="40" stroke="#fff" stroke-width="2"/><line x1="25" y1="50" x2="55" y2="50" stroke="#fff" stroke-width="2"/>';
    } else if (fileName.toLowerCase().includes('cardigan')) {
        details = '<path d="M40 25 L40 60" stroke="#333" stroke-width="1"/>';
    }
    
    return base + details + '</svg>';
};

PortfolioOS.prototype.createAccessoryPreview = function(fileName) {
    if (fileName.toLowerCase().includes('glass')) {
        return `
            <svg width="80" height="80" viewBox="0 0 80 80">
                <rect x="15" y="35" width="18" height="12" rx="4" fill="none" stroke="#333" stroke-width="2"/>
                <rect x="47" y="35" width="18" height="12" rx="4" fill="none" stroke="#333" stroke-width="2"/>
                <line x1="33" y1="41" x2="47" y2="41" stroke="#333" stroke-width="2"/>
                <text x="40" y="65" text-anchor="middle" font-size="8" fill="#666">Glasses</text>
            </svg>
        `;
    } else if (fileName.toLowerCase().includes('hat')) {
        return `
            <svg width="80" height="80" viewBox="0 0 80 80">
                <ellipse cx="40" cy="45" rx="25" ry="5" fill="#654321"/>
                <rect x="25" y="20" width="30" height="25" rx="15" fill="#654321"/>
                <text x="40" y="65" text-anchor="middle" font-size="8" fill="#666">Hat</text>
            </svg>
        `;
    } else if (fileName.toLowerCase().includes('cap')) {
        return `
            <svg width="80" height="80" viewBox="0 0 80 80">
                <path d="M15 35 Q40 20 65 35 L70 30 Q40 15 10 30 Z" fill="#E74C3C"/>
                <text x="40" y="65" text-anchor="middle" font-size="8" fill="#666">Cap</text>
            </svg>
        `;
    } else if (fileName.toLowerCase().includes('beanie')) {
        return `
            <svg width="80" height="80" viewBox="0 0 80 80">
                <path d="M20 40 Q40 20 60 40 Q55 25 40 25 Q25 25 20 40" fill="#8E44AD"/>
                <text x="40" y="65" text-anchor="middle" font-size="8" fill="#666">Beanie</text>
            </svg>
        `;
    } else if (fileName.toLowerCase().includes('earning')) {
        return `
            <svg width="80" height="80" viewBox="0 0 80 80">
                <circle cx="30" cy="40" r="4" fill="#FFD700"/>
                <circle cx="50" cy="40" r="4" fill="#FFD700"/>
                <text x="40" y="65" text-anchor="middle" font-size="8" fill="#666">Earrings</text>
            </svg>
        `;
    } else {
        return `
            <svg width="80" height="80" viewBox="0 0 80 80">
                <rect x="30" y="30" width="20" height="15" rx="3" fill="#F39C12"/>
                <text x="40" y="65" text-anchor="middle" font-size="8" fill="#666">Accessory</text>
            </svg>
        `;
    }
};

PortfolioOS.prototype.handleVisualOptionClick = function(e) {
    const category = e.currentTarget.dataset.category;
    const value = parseInt(e.currentTarget.dataset.value);
    
    // Remove active class from siblings in the same category
    const categoryGrid = e.currentTarget.parentElement;
    categoryGrid.querySelectorAll('.visual-option-item').forEach(sibling => {
        sibling.classList.remove('active');
    });
    
    // Add active class to clicked item
    e.currentTarget.classList.add('active');
    
    // Update avatar data
    this.avatarCreator.currentAvatar[category] = value;
    
    // Update avatar display
    this.avatarCreator.updateAvatar();
};

PortfolioOS.prototype.downloadAvatarV2 = function() {
    const avatarCanvas = document.getElementById('avatar-canvas');
    if (!avatarCanvas) return;
    
    try {
        // Get all SVG elements from the avatar display
        const svgElements = avatarCanvas.querySelectorAll('svg');
        
        if (svgElements.length === 0) {
            alert('No avatar to download');
            return;
        }
        
        // Create canvas for final image
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 500;
        canvas.height = 500;
        
        // White background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 500, 500);
        
        // Function to process SVGs sequentially
        let currentIndex = 0;
        
        const processNextSVG = () => {
            if (currentIndex >= svgElements.length) {
                // All SVGs processed - download the result
                const link = document.createElement('a');
                link.download = `my-avatar-${Date.now()}.png`;
                link.href = canvas.toDataURL('image/png', 1.0);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                return;
            }
            
            const svg = svgElements[currentIndex];
            
            // Get the SVG as string and prepare it for conversion
            const svgClone = svg.cloneNode(true);
            
            // Ensure the SVG has proper dimensions
            svgClone.setAttribute('width', '500');
            svgClone.setAttribute('height', '500');
            
            // Convert SVG to data URL
            const svgData = new XMLSerializer().serializeToString(svgClone);
            const svgDataUrl = 'data:image/svg+xml;base64,' + btoa(svgData);
            
            // Create image and draw it on canvas
            const img = new Image();
            img.onload = function() {
                ctx.drawImage(img, 0, 0, 500, 500);
                currentIndex++;
                processNextSVG(); // Process next SVG
            };
            
            img.onerror = function() {
                console.error('Failed to load SVG:', currentIndex);
                currentIndex++;
                processNextSVG(); // Continue with next SVG
            };
            
            img.src = svgDataUrl;
        };
        
        // Start processing SVGs
        processNextSVG();
        
    } catch (error) {
        alert('Download failed: ' + error.message);
    }
};

PortfolioOS.prototype.randomizeAvatar = function() {
    // Randomize all avatar parts based on available assets
    this.avatarCreator.currentAvatar.head = Math.floor(Math.random() * this.avatarCreator.avatarAssets.heads.length);
    this.avatarCreator.currentAvatar.clothes = Math.floor(Math.random() * this.avatarCreator.avatarAssets.clothes.length);
    // Accessory can be -1 (none) or any valid accessory index
    this.avatarCreator.currentAvatar.accessory = Math.random() < 0.3 ? -1 : Math.floor(Math.random() * this.avatarCreator.avatarAssets.accessories.length);
    
    // Update UI to reflect random choices
    Object.keys(this.avatarCreator.currentAvatar).forEach(category => {
        const value = this.avatarCreator.currentAvatar[category];
        
        // Find the appropriate grid for this category
        let grid;
        if (category === 'head') grid = document.getElementById('head-options');
        else if (category === 'clothes') grid = document.getElementById('clothes-options');
        else if (category === 'accessory') grid = document.getElementById('accessory-options');
        
        if (grid) {
            grid.querySelectorAll('.visual-option-item').forEach(item => {
                item.classList.remove('active');
                if (parseInt(item.dataset.value) === value) {
                    item.classList.add('active');
                }
            });
        }
    });
    
    // Update avatar display
    this.avatarCreator.updateAvatar();
};

PortfolioOS.prototype.resetAvatar = function() {
    // Reset to default values (no selections, just basic.svg)
    this.avatarCreator.currentAvatar = {
        head: -1,
        clothes: -1,
        accessory: -1
    };
    
    // Reset UI - remove all active states
    document.querySelectorAll('.visual-option-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // Set "None" active for accessory (it's the only one with a -1 value)
    document.querySelector('#accessory-options [data-value="-1"]')?.classList.add('active');
    
    // Update avatar display (will show only basic.svg)
    this.avatarCreator.updateAvatar();
};

document.addEventListener('DOMContentLoaded', () => {
    window.portfolioOS = new PortfolioOS();
    window.cameraApp = new CameraApp();
    window.gameApp = new FiveInARowGame();
    window.musicPlayer = new MusicPlayer();
    
    // Initialize notebook immediately so sticky notes work
    window.portfolioOS.initializeNotebook();
    
    // Global function to manually setup drag and drop
    window.setupStickerDrag = () => {
        console.log('Manual sticker drag setup triggered');
        if (window.portfolioOS) {
            window.portfolioOS.forceStickerDragSetup();
        } else {
            console.log('portfolioOS not found');
        }
    };
    
    // Also try to auto-setup every few seconds as fallback
    setInterval(() => {
        const stickerItems = document.querySelectorAll('.sticker-item:not([draggable="true"])');
        if (stickerItems.length > 0 && window.portfolioOS) {
            console.log('Auto-setting up', stickerItems.length, 'non-draggable stickers');
            window.portfolioOS.forceStickerDragSetup();
        }
    }, 5000);
});

// Mood Tracker functionality
PortfolioOS.prototype.initializeMoodTracker = function() {
    console.log('Initializing Mood Tracker...');
    
    // Setup mood buttons
    this.setupMoodButtons();
    
    // Initialize mood calendar with a small delay to ensure DOM is ready
    setTimeout(() => {
        this.initializeMoodCalendar();
    }, 100);
    
    // Load and display mood data
    this.loadMoodData();
    
    // Update analytics
    this.updateMoodAnalytics();
};

PortfolioOS.prototype.setupMoodButtons = function() {
    const moodButtons = document.querySelectorAll('.mood-btn');
    
    moodButtons.forEach((button, index) => {
        button.addEventListener('click', (e) => {
            // Stop event from bubbling up to window management
            e.preventDefault();
            e.stopPropagation();
            
            // Remove active class from all buttons
            moodButtons.forEach(btn => btn.classList.remove('selected'));
            
            // Add active class to clicked button
            button.classList.add('selected');
            
            // Play mood selection sound (unique for each emoji)
            this.playMoodSelectSound(index);
            
            // Create flying emoji animation - update calendar when it lands
            this.createFlyingEmojiAnimation(button, index, () => {
                // Update mood data when emoji lands (quick operations only)
                this.saveTodaysMood(index);
                this.updateCalendarMood(index);
                
                // Delay heavy analytics update to avoid jank
                setTimeout(() => {
                    this.updateMoodAnalytics();
                }, 100);
            });
            
            // Create particle effect
            this.createMoodParticleEffect(button, index);
        });
    });
};

PortfolioOS.prototype.createFlyingEmojiAnimation = function(button, moodIndex, onLandingCallback) {
    // Get the emoji image from the button
    const emojiImg = button.querySelector('img');
    if (!emojiImg) return;
    
    // Find today's date box in the calendar
    const today = new Date();
    const calendarDates = document.getElementById('mood-calendar-dates');
    if (!calendarDates) return;
    
    // Find today's date box
    const dateBoxes = calendarDates.querySelectorAll('.date-box.today');
    if (dateBoxes.length === 0) return;
    
    const todayDateBox = dateBoxes[0];
    
    // Create flying emoji element with performance optimizations
    const flyingEmoji = document.createElement('div');
    flyingEmoji.className = 'flying-emoji';
    flyingEmoji.innerHTML = `<img src="${emojiImg.src}" alt="Flying emoji" />`;
    
    // Get start and end positions
    const buttonRect = button.getBoundingClientRect();
    const dateBoxRect = todayDateBox.getBoundingClientRect();
    
    // Position flying emoji at button location
    flyingEmoji.style.left = `${buttonRect.left + buttonRect.width / 2 - 30}px`;
    flyingEmoji.style.top = `${buttonRect.top + buttonRect.height / 2 - 30}px`;
    flyingEmoji.style.opacity = '1';
    flyingEmoji.style.position = 'fixed';
    flyingEmoji.style.pointerEvents = 'none';
    flyingEmoji.style.zIndex = '999999';
    
    // Add to document
    document.body.appendChild(flyingEmoji);
    
    // Simple direct animation to calendar
    setTimeout(() => {
        flyingEmoji.style.transition = 'all 1s ease-out';
        flyingEmoji.style.left = `${dateBoxRect.left + dateBoxRect.width / 2 - 30}px`;
        flyingEmoji.style.top = `${dateBoxRect.top + dateBoxRect.height / 2 - 30}px`;
        flyingEmoji.style.transform = 'rotate(720deg) scale(0.8)';
        flyingEmoji.style.opacity = '0.8';
        
        // Call callback when emoji lands (earlier for smoother experience)
        setTimeout(() => {
            if (onLandingCallback) {
                onLandingCallback();
            }
        }, 800);
        
        // Fade out
        setTimeout(() => {
            flyingEmoji.style.opacity = '0';
        }, 800);
    }, 100);
    
    // Remove element after animation (total: 1.8s)
    setTimeout(() => {
        if (flyingEmoji.parentNode) {
            flyingEmoji.parentNode.removeChild(flyingEmoji);
        }
        
        // Play landing sound (unique for each emoji)
        this.playEmojiLandSound(moodIndex);
        
        // Add a bounce effect to the calendar date
        todayDateBox.style.transform = 'scale(1.2)';
        todayDateBox.style.transition = 'transform 0.3s ease';
        setTimeout(() => {
            todayDateBox.style.transform = 'scale(1)';
        }, 300);
        
    }, 1800);
};

PortfolioOS.prototype.createMoodParticleEffect = function(button, index) {
    // Simple particle effect (if not already implemented)
    // Can be expanded later
};

PortfolioOS.prototype.initializeMoodCalendar = function() {
    this.currentCalendarDate = new Date();
    this.renderMoodCalendar();
    this.setupMoodCalendarListeners();
    this.setupInsightsTabs();
};

PortfolioOS.prototype.renderMoodCalendar = function() {
    const calendarTitle = document.getElementById('mood-calendar-title');
    const calendarDates = document.getElementById('mood-calendar-dates');
    
    if (!calendarTitle || !calendarDates) {
        return;
    }
    
    const year = this.currentCalendarDate.getFullYear();
    const month = this.currentCalendarDate.getMonth();
    
    // Set title
    const titleText = new Date(year, month).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric'
    });
    calendarTitle.textContent = titleText;
    
    // Clear previous dates
    calendarDates.innerHTML = '';
    
    // Get calendar information
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    // Get mood data
    const moodData = this.getMoodData();
    const today = new Date();
    const todayString = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
    
    // Add previous month's trailing days
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    const daysInPrevMonth = new Date(prevYear, prevMonth + 1, 0).getDate();
    
    for (let i = firstDay; i > 0; i--) {
        const dayNumber = daysInPrevMonth - i + 1;
        const dateBox = document.createElement('div');
        dateBox.className = 'date-box other-month';
        
        const dateCircle = document.createElement('div');
        dateCircle.className = 'date-circle';
        
        const dateNumber = document.createElement('div');
        dateNumber.className = 'date-number';
        dateNumber.textContent = dayNumber;
        
        dateBox.appendChild(dateCircle);
        dateBox.appendChild(dateNumber);
        calendarDates.appendChild(dateBox);
    }
    
    // Add current month's days
    for (let day = 1; day <= daysInMonth; day++) {
        const dateBox = document.createElement('div');
        dateBox.className = 'date-box';
        
        // Create circle container
        const dateCircle = document.createElement('div');
        dateCircle.className = 'date-circle';
        
        // Create date number
        const dateNumber = document.createElement('div');
        dateNumber.className = 'date-number';
        dateNumber.textContent = day;
        
        // Check if this is today
        const dayString = `${year}-${month + 1}-${day}`;
        if (dayString === todayString) {
            dateBox.classList.add('today');
        }
        
        // Check if there's mood data for this day
        if (moodData[dayString] !== undefined) {
            const moodIndex = moodData[dayString];
            dateBox.classList.add('has-mood');
            
            // Create mood emoji to replace the circle
            const moodEmoji = document.createElement('div');
            moodEmoji.className = 'date-mood-emoji';
            moodEmoji.innerHTML = `<img src="Mood track emojis/${moodIndex + 1}.svg" alt="Mood ${moodIndex + 1}" />`;
            dateCircle.appendChild(moodEmoji);
        }
        
        dateBox.appendChild(dateCircle);
        dateBox.appendChild(dateNumber);
        calendarDates.appendChild(dateBox);
    }
    
    // Fill remaining cells to complete grid
    const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
    const nextMonthDays = totalCells - (firstDay + daysInMonth);
    
    for (let day = 1; day <= nextMonthDays; day++) {
        const dateBox = document.createElement('div');
        dateBox.className = 'date-box other-month';
        
        const dateCircle = document.createElement('div');
        dateCircle.className = 'date-circle';
        
        const dateNumber = document.createElement('div');
        dateNumber.className = 'date-number';
        dateNumber.textContent = day;
        
        dateBox.appendChild(dateCircle);
        dateBox.appendChild(dateNumber);
        calendarDates.appendChild(dateBox);
    }
};


PortfolioOS.prototype.setupMoodCalendarListeners = function() {
    const prevButton = document.getElementById('mood-prev-month');
    const nextButton = document.getElementById('mood-next-month');
    
    if (prevButton) {
        prevButton.addEventListener('click', () => {
            this.playCalendarNavigationSound();
            this.currentCalendarDate.setMonth(this.currentCalendarDate.getMonth() - 1);
            this.renderMoodCalendar();
        });
    }
    
    if (nextButton) {
        nextButton.addEventListener('click', () => {
            this.playCalendarNavigationSound();
            this.currentCalendarDate.setMonth(this.currentCalendarDate.getMonth() + 1);
            this.renderMoodCalendar();
        });
    }
};

PortfolioOS.prototype.setupInsightsTabs = function() {
    const insightsDropdown = document.getElementById('insights-select');
    
    if (insightsDropdown) {
        insightsDropdown.addEventListener('change', () => {
            // Play tab switch sound
            this.playTabSwitchSound();
            
            // Update analytics based on selected option
            const selectedValue = insightsDropdown.value;
            if (selectedValue === 'week') {
                this.updateWeeklyInsights();
            } else if (selectedValue === 'month') {
                this.updateMonthlyInsights();
            } else if (selectedValue === 'year') {
                this.updateYearlyInsights();
            }
        });
    }
    
    // Initialize with weekly insights (default selection)
    this.updateWeeklyInsights();
};

PortfolioOS.prototype.updateMonthlyInsights = function() {
    // Update stats for current month
    this.updateMonthStatsNew();
};

PortfolioOS.prototype.updateYearlyInsights = function() {
    // Update stats for current year
    this.updateYearStats();
};

PortfolioOS.prototype.updateWeeklyInsights = function() {
    // Update stats for current week
    this.updateWeekStats();
};

PortfolioOS.prototype.updateWeekStats = function() {
    const moodData = this.getMoodData();
    const currentDate = new Date();
    
    // Get the start of the current week (Sunday)
    const startOfWeek = new Date(currentDate);
    startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());
    
    // Filter data for current week
    const weeklyData = Object.keys(moodData).filter(dateKey => {
        const entryDate = new Date(dateKey);
        return entryDate >= startOfWeek && entryDate <= currentDate;
    });
    
    // Update total entries
    const totalEntriesElement = document.getElementById('total-entries');
    if (totalEntriesElement) {
        totalEntriesElement.textContent = weeklyData.length;
    }
    
    // Calculate most picked mood for week
    if (weeklyData.length > 0) {
        // Count frequency of each mood
        const moodCount = {};
        weeklyData.forEach(dateKey => {
            const mood = moodData[dateKey];
            moodCount[mood] = (moodCount[mood] || 0) + 1;
        });
        
        // Find the most frequent mood
        const mostPickedMood = Object.keys(moodCount).reduce((a, b) => 
            moodCount[a] > moodCount[b] ? a : b
        );
        
        const avgMoodElement = document.getElementById('avg-mood');
        if (avgMoodElement) {
            avgMoodElement.innerHTML = `<img src="Mood track emojis/${parseInt(mostPickedMood) + 1}.svg" alt="Top mood" style="width: 36px; height: 36px;" />`;
        }
    } else {
        const avgMoodElement = document.getElementById('avg-mood');
        if (avgMoodElement) {
            avgMoodElement.textContent = '-';
        }
    }
    
    // Find best day (highest mood) in current week
    const bestDayElement = document.getElementById('best-day');
    if (bestDayElement && weeklyData.length > 0) {
        const bestDate = weeklyData.reduce((best, dateKey) => {
            return moodData[dateKey] > moodData[best] ? dateKey : best;
        });
        const bestDay = new Date(bestDate).toLocaleDateString('en-US', { weekday: 'short' });
        bestDayElement.textContent = bestDay;
    } else if (bestDayElement) {
        bestDayElement.textContent = '-';
    }
    
    // Calculate weekly streak (simplified)
    const streakElement = document.getElementById('current-streak');
    if (streakElement) {
        const currentStreak = weeklyData.length;
        streakElement.textContent = currentStreak;
        
        // Play celebration sound for milestones
        if (currentStreak > 0 && currentStreak === 7) {
            setTimeout(() => this.playStreakCelebrationSound(), 500);
        }
    }
};

PortfolioOS.prototype.updateMonthStatsNew = function() {
    const moodData = this.getMoodData();
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;
    
    // Filter data for current month
    const monthlyData = Object.keys(moodData).filter(dateKey => {
        const [year, month] = dateKey.split('-').map(num => parseInt(num));
        return year === currentYear && month === currentMonth;
    });
    
    // Update total entries
    const totalEntriesElement = document.getElementById('total-entries');
    if (totalEntriesElement) {
        totalEntriesElement.textContent = monthlyData.length;
    }
    
    // Calculate most picked mood for month
    if (monthlyData.length > 0) {
        // Count frequency of each mood
        const moodCount = {};
        monthlyData.forEach(dateKey => {
            const mood = moodData[dateKey];
            moodCount[mood] = (moodCount[mood] || 0) + 1;
        });
        
        // Find the most frequent mood
        const mostPickedMood = Object.keys(moodCount).reduce((a, b) => 
            moodCount[a] > moodCount[b] ? a : b
        );
        
        const avgMoodElement = document.getElementById('avg-mood');
        if (avgMoodElement) {
            avgMoodElement.innerHTML = `<img src="Mood track emojis/${parseInt(mostPickedMood) + 1}.svg" alt="Most picked mood" style="width: 36px; height: 36px;" />`;
        }
    } else {
        const avgMoodElement = document.getElementById('avg-mood');
        if (avgMoodElement) {
            avgMoodElement.textContent = '-';
        }
    }
    
    // Find best day (highest mood) in current month
    const bestDayElement = document.getElementById('best-day');
    if (bestDayElement && monthlyData.length > 0) {
        const bestDate = monthlyData.reduce((best, dateKey) => {
            return moodData[dateKey] > moodData[best] ? dateKey : best;
        });
        const bestDay = new Date(bestDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        bestDayElement.textContent = bestDay;
    } else if (bestDayElement) {
        bestDayElement.textContent = '-';
    }
    
    // Calculate monthly streak (simplified)
    const streakElement = document.getElementById('current-streak');
    if (streakElement) {
        const currentStreak = monthlyData.length;
        streakElement.textContent = currentStreak;
        
        // Play celebration sound for milestones
        if (currentStreak > 0 && (currentStreak % 5 === 0 || currentStreak === 7)) {
            setTimeout(() => this.playStreakCelebrationSound(), 500);
        }
    }
};

PortfolioOS.prototype.updateYearStats = function() {
    const moodData = this.getMoodData();
    const currentYear = new Date().getFullYear();
    
    // Filter data for current year
    const yearlyData = Object.keys(moodData).filter(dateKey => {
        const year = parseInt(dateKey.split('-')[0]);
        return year === currentYear;
    });
    
    // Update total entries
    const totalEntriesElement = document.getElementById('total-entries');
    if (totalEntriesElement) {
        totalEntriesElement.textContent = yearlyData.length;
    }
    
    // Calculate most picked mood for year
    if (yearlyData.length > 0) {
        // Count frequency of each mood
        const moodCount = {};
        yearlyData.forEach(dateKey => {
            const mood = moodData[dateKey];
            moodCount[mood] = (moodCount[mood] || 0) + 1;
        });
        
        // Find the most frequent mood
        const mostPickedMood = Object.keys(moodCount).reduce((a, b) => 
            moodCount[a] > moodCount[b] ? a : b
        );
        
        const avgMoodElement = document.getElementById('avg-mood');
        if (avgMoodElement) {
            avgMoodElement.innerHTML = `<img src="Mood track emojis/${parseInt(mostPickedMood) + 1}.svg" alt="Most picked mood" style="width: 36px; height: 36px;" />`;
        }
    } else {
        const avgMoodElement = document.getElementById('avg-mood');
        if (avgMoodElement) {
            avgMoodElement.textContent = '-';
        }
    }
    
    // Find best day (highest mood)
    const bestDayElement = document.getElementById('best-day');
    if (bestDayElement && yearlyData.length > 0) {
        const bestDate = yearlyData.reduce((best, dateKey) => {
            return moodData[dateKey] > moodData[best] ? dateKey : best;
        });
        const bestDay = new Date(bestDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        bestDayElement.textContent = bestDay;
    } else if (bestDayElement) {
        bestDayElement.textContent = '-';
    }
    
    // Calculate yearly streak (simplified)
    const streakElement = document.getElementById('current-streak');
    if (streakElement) {
        streakElement.textContent = yearlyData.length;
    }
};

PortfolioOS.prototype.saveTodaysMood = function(moodIndex) {
    try {
        const today = new Date();
        const dateKey = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
        
        let moodData = this.getMoodData();
        moodData[dateKey] = moodIndex;
        
        localStorage.setItem('moodTrackerData', JSON.stringify(moodData));
    } catch (error) {
        console.error('Error saving mood data:', error);
    }
};

PortfolioOS.prototype.updateCalendarMood = function(moodIndex) {
    // Find today's date box in the calendar
    const today = new Date();
    const calendarDates = document.getElementById('mood-calendar-dates');
    if (!calendarDates) return;
    
    const todayDateBox = calendarDates.querySelector('.date-box.today');
    if (!todayDateBox) return;
    
    const dateCircle = todayDateBox.querySelector('.date-circle');
    if (!dateCircle) return;
    
    // Simple and smooth emoji transition
    const existingMoodEmoji = dateCircle.querySelector('.date-mood-emoji');
    
    if (existingMoodEmoji) {
        // Just update the existing emoji smoothly
        const img = existingMoodEmoji.querySelector('img');
        if (img) {
            img.style.transition = 'opacity 0.3s ease';
            img.style.opacity = '0';
            
            setTimeout(() => {
                img.src = `Mood track emojis/${moodIndex + 1}.svg`;
                img.alt = `Mood ${moodIndex + 1}`;
                img.style.opacity = '1';
            }, 300);
        }
    } else {
        // Create new emoji with simple fade-in
        const moodEmoji = document.createElement('div');
        moodEmoji.className = 'date-mood-emoji';
        moodEmoji.innerHTML = `<img src="Mood track emojis/${moodIndex + 1}.svg" alt="Mood ${moodIndex + 1}" />`;
        
        moodEmoji.style.opacity = '0';
        moodEmoji.style.transition = 'opacity 0.4s ease';
        
        dateCircle.appendChild(moodEmoji);
        todayDateBox.classList.add('has-mood');
        
        // Simple fade-in
        setTimeout(() => {
            moodEmoji.style.opacity = '1';
        }, 100);
    }
};


PortfolioOS.prototype.getMoodData = function() {
    try {
        const data = localStorage.getItem('moodTrackerData');
        return data ? JSON.parse(data) : {};
    } catch (error) {
        console.error('Error loading mood data:', error);
        return {};
    }
};

PortfolioOS.prototype.loadMoodData = function() {
    const today = new Date();
    const dateKey = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
    const moodData = this.getMoodData();
    const todayMood = moodData[dateKey];
    
    if (todayMood !== undefined) {
        // Highlight the selected mood button
        const moodButtons = document.querySelectorAll('.mood-btn');
        moodButtons.forEach((btn, index) => {
            btn.classList.remove('selected');
            if (index === todayMood) {
                btn.classList.add('selected');
            }
        });
    }
};

PortfolioOS.prototype.displayTodayMood = function(mood) {
    const todayMoodEl = document.getElementById('today-mood');
    if (todayMoodEl) {
        const moodEmojis = {
            'tired/sad': '😔',
            'calm/content': '😌',
            'excited/happy': '😊',
            'anxious/annoyed': '😰',
            'furious/overwhelmed': '😤'
        };
        
        todayMoodEl.innerHTML = `
            <div style="font-size: 24px; margin-bottom: 8px;">${moodEmojis[mood] || '😌'}</div>
            <div>Today you feel: <strong>${mood}</strong></div>
        `;
    }
};

PortfolioOS.prototype.updateMoodAnalytics = function() {
    // Update the current selected insights
    const insightsDropdown = document.getElementById('insights-select');
    if (insightsDropdown) {
        const selectedValue = insightsDropdown.value;
        if (selectedValue === 'week') {
            this.updateWeeklyInsights();
        } else if (selectedValue === 'month') {
            this.updateMonthlyInsights();
        } else if (selectedValue === 'year') {
            this.updateYearlyInsights();
        }
    } else {
        // Default to monthly if dropdown is not found
        this.updateMonthlyInsights();
    }
    
    this.updateWeekView();
    this.updateStreak();
};

PortfolioOS.prototype.updateWeekView = function() {
    const weekGrid = document.getElementById('week-grid');
    const weekSummary = document.getElementById('week-summary');
    
    if (!weekGrid || !weekSummary) return;
    
    const moodData = this.getMoodData();
    const today = new Date();
    const weekDays = [];
    
    // Get last 7 days
    for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        weekDays.push(date);
    }
    
    // Build week grid
    weekGrid.innerHTML = '';
    let weekMoods = [];
    
    weekDays.forEach(date => {
        const dateStr = date.toISOString().split('T')[0];
        const dayName = date.toLocaleDateString('en', { weekday: 'short' });
        const moodEntry = moodData.find(entry => entry.date === dateStr);
        const isToday = dateStr === new Date().toISOString().split('T')[0];
        
        const dayEl = document.createElement('div');
        dayEl.className = `week-day ${isToday ? 'today' : ''}`;
        
        let moodDisplay = '—';
        if (moodEntry) {
            const percentage = ((moodEntry.value - 1) / 4) * 100;
            const color = this.getColorFromPercentage(percentage);
            moodDisplay = `<div style="width: 16px; height: 16px; background: ${color}; border-radius: 50%; margin: 0 auto; box-shadow: 0 2px 4px rgba(0,0,0,0.2);"></div>`;
        }
        
        dayEl.innerHTML = `
            <div class="week-day-name">${dayName}</div>
            <div class="week-day-mood">${moodDisplay}</div>
        `;
        
        weekGrid.appendChild(dayEl);
        
        if (moodEntry) {
            weekMoods.push(moodEntry.value);
        }
    });
    
    // Calculate week summary
    if (weekMoods.length > 0) {
        const avgMood = weekMoods.reduce((a, b) => a + b, 0) / weekMoods.length;
        const moodText = avgMood >= 4 ? 'mostly positive 😊' : 
                        avgMood >= 3 ? 'balanced 😐' : 
                        'challenging 😔';
        weekSummary.textContent = `This week: ${moodText} (${weekMoods.length}/7 days tracked)`;
    } else {
        weekSummary.textContent = 'No mood data for this week yet';
    }
};

PortfolioOS.prototype.updateMonthStats = function() {
    const monthStats = document.getElementById('month-stats');
    if (!monthStats) return;
    
    const moodData = this.getMoodData();
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    
    // Filter this month's data
    const thisMonthData = moodData.filter(entry => {
        const entryDate = new Date(entry.date);
        return entryDate >= firstDayOfMonth && entryDate <= today;
    });
    
    const totalDays = thisMonthData.length;
    const positiveDays = thisMonthData.filter(entry => entry.value >= 4).length;
    const avgMood = totalDays > 0 ? 
        (thisMonthData.reduce((sum, entry) => sum + entry.value, 0) / totalDays).toFixed(1) : 0;
    
    monthStats.innerHTML = `
        <div class="stat-item">
            <div class="stat-number">${totalDays}</div>
            <div class="stat-label">Days tracked</div>
        </div>
        <div class="stat-item">
            <div class="stat-number">${positiveDays}</div>
            <div class="stat-label">Positive days</div>
        </div>
        <div class="stat-item">
            <div class="stat-number">${avgMood}</div>
            <div class="stat-label">Avg mood</div>
        </div>
    `;
};

PortfolioOS.prototype.updateStreak = function() {
    const streakCounter = document.getElementById('streak-counter');
    if (!streakCounter) return;
    
    const moodData = this.getMoodData();
    let streak = 0;
    const today = new Date();
    
    // Count consecutive days from today backwards
    for (let i = 0; i < 30; i++) { // Check last 30 days max
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        
        const hasEntry = moodData.some(entry => entry.date === dateStr);
        if (hasEntry) {
            streak++;
        } else {
            break;
        }
    }
    
    const streakText = streak === 1 ? 'day' : 'days';
    const encouragement = streak >= 7 ? '🔥 Great streak!' :
                         streak >= 3 ? '⭐ Keep it up!' :
                         streak >= 1 ? '🌟 Good start!' :
                         '💫 Begin your journey!';
    
    streakCounter.innerHTML = `
        <div class="streak-number">${streak}</div>
        <div class="streak-text">${streakText} of tracking</div>
        <div class="streak-text">${encouragement}</div>
    `;
    
    // Add milestone animation for special streaks
    if (streak > 0 && (streak % 7 === 0 || streak === 3 || streak === 5)) {
        streakCounter.classList.add('milestone');
        setTimeout(() => streakCounter.classList.remove('milestone'), 1000);
    }
};

// Helper functions for spectrum
PortfolioOS.prototype.getMoodFromValue = function(value) {
    const moods = {
        1: 'tired/sad',
        2: 'calm/content', 
        3: 'excited/happy',
        4: 'anxious/annoyed',
        5: 'furious/overwhelmed'
    };
    return moods[value] || 'calm/content';
};

PortfolioOS.prototype.getColorFromPercentage = function(percentage) {
    // Match the sophisticated emotion spectrum colors
    if (percentage <= 20) {
        // Blue range - tired/shy/sad
        return `#6B8DD6`;
    } else if (percentage <= 40) {
        // Green range - calm/content/focused  
        return `#9FB86F`;
    } else if (percentage <= 60) {
        // Yellow range - excited/silly/happy
        return `#F0E68C`;
    } else if (percentage <= 80) {
        // Orange range - anxious/annoyed/embarrassed
        return `#F4A460`;
    } else if (percentage <= 95) {
        // Red range - angry/stressed/agitated
        return `#CD5C5C`;
    } else {
        // Purple range - furious/overwhelmed/out of control
        return `#9370DB`;
    }
};

// Interactive functions  
PortfolioOS.prototype.createSpectrumParticleEffect = function(spectrum, percentage, color) {
    const particleContainer = document.querySelector('.mood-tracker-content');
    const spectrumRect = spectrum.getBoundingClientRect();
    const containerRect = particleContainer.getBoundingClientRect();
    
    // Create 6 particles
    for (let i = 0; i < 6; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle spectrum-particle';
        particle.style.color = color;
        
        // Position relative to spectrum selector
        const selectorX = (spectrumRect.left - containerRect.left) + (spectrumRect.width * percentage / 100);
        const selectorY = (spectrumRect.top - containerRect.top) + (spectrumRect.height / 2);
        
        const x = selectorX + (Math.random() - 0.5) * 80;
        const y = selectorY + (Math.random() - 0.5) * 80;
        
        particle.style.left = `${x}px`;
        particle.style.top = `${y}px`;
        particle.style.animationDelay = `${i * 0.1}s`;
        
        // Add particle content based on mood
        const value = Math.round(1 + (percentage / 100) * 4);
        const particleEmoji = value >= 5 ? '✨' : value >= 4 ? '💖' : value >= 3 ? '⭐' : value >= 2 ? '🌈' : '🌸';
        particle.textContent = particleEmoji;
        
        particleContainer.appendChild(particle);
        
        // Remove particle after animation
        setTimeout(() => {
            if (particle.parentNode) {
                particle.parentNode.removeChild(particle);
            }
        }, 2000);
    }
};

