// ==UserScript==
// @name         Gemini Key Seeker - v7.2 Debug Edition
// @name:en      Gemini Key Seeker - v7.2 Debug Edition
// @namespace    http://tampermonkey.net/
// @version      7.2-debug-fix
// @description  [Debug Fix Edition] Enhanced debugging, fixed initialization issues, improved stability
// @description:en [Debug Fix Edition] Enhanced debugging, fixed initialization issues, improved stability
// @author       You & AI
// @match        https://geminikeyseeker.o0o.moe/*
// @match        https://*.geminikeyseeker.o0o.moe/*
// @match        *://geminikeyseeker.o0o.moe/*
// @match        *://*.geminikeyseeker.o0o.moe/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=o0o.moe
// @grant        GM_addStyle
// @grant        GM_download
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @grant        GM_registerMenuCommand
// @grant        GM_log
// @connect      generativelanguage.googleapis.com
// @run-at       document-idle
// @noframes
// @license      MIT
// ==/UserScript==

console.log('%c GEMINI KEY SEEKER v7.2 DEBUG - SCRIPT LOADED! ', 'background: #222; color: #00ff00; font-size: 16px; font-weight: bold;');

(function() {
    'use strict';

    // --- 调试配置 ---
    const DEBUG = {
        enabled: true,
        verbose: true,
        showDOMInfo: true,
        forceInit: true
    };

    // --- 配置项 ---
    const CONFIG = {
        pageDelay: 1000,
        processStateKey: 'keySeeker_pendingTask',
        requestTimeout: 10000,
        retryAttempts: 3,
        concurrentRequests: 2, // 降低并发数以提高稳定性
        adaptiveDelay: true,
        cacheEnabled: true
    };

    // --- Enhanced Debug Functions ---
    const debug = {
        log: (message, data = null) => {
            if (DEBUG.enabled) {
                const timestamp = new Date().toLocaleTimeString();
                console.log(`%c[KeySeeker Debug] ${timestamp}`, 'color: #00bcd4; font-weight: bold;', message, data || '');
                if (typeof GM_log !== 'undefined') {
                    try {
                        GM_log(`[KeySeeker] ${message}`);
                    } catch (e) {
                        // GM_log may not be available, ignore error
                    }
                }
            }
        },
        error: (message, error = null) => {
            console.error(`%c[KeySeeker ERROR]`, 'color: #ff0000; font-weight: bold;', message, error || '');
        },
        domInfo: () => {
            if (DEBUG.showDOMInfo) {
                debug.log('DOM Information Check:', {
                    'document.readyState': document.readyState,
                    'document.body': !!document.body,
                    'document.documentElement': !!document.documentElement,
                    'URL': window.location.href,
                    'Title': document.title,
                    'Has logout link': !!document.querySelector('a[href*="logout"]'),
                    'Has table': !!document.querySelector('table'),
                    'Has pagination': !!document.querySelector('.pagination'),
                    'Button exists': !!document.getElementById('key-seeker-btn'),
                    'Body children count': document.body ? document.body.children.length : 0,
                    'Viewport size': `${window.innerWidth}x${window.innerHeight}`
                });
            }
        },
        waitForElement: async (selector, timeout = 10000) => {
            return new Promise((resolve, reject) => {
                const element = document.querySelector(selector);
                if (element) {
                    resolve(element);
                    return;
                }

                const observer = new MutationObserver(() => {
                    const element = document.querySelector(selector);
                    if (element) {
                        observer.disconnect();
                        resolve(element);
                    }
                });

                observer.observe(document.documentElement, {
                    childList: true,
                    subtree: true
                });

                setTimeout(() => {
                    observer.disconnect();
                    reject(new Error(`Element ${selector} not found within ${timeout}ms`));
                }, timeout);
            });
        },
        waitForRealPage: () => {
            return new Promise((resolve) => {
                let attempts = 0;
                const maxAttempts = 60; // Wait up to 60 seconds
                
                const checkInterval = setInterval(() => {
                    attempts++;
                    debug.log(`Waiting for real page, attempt ${attempts}/${maxAttempts}`);
                    
                    // Check if anti-bot protection is gone and real content is loaded
                    const hasRealContent = (
                        document.querySelector('.pagination') ||
                        document.querySelector('table') ||
                        document.querySelector('[href*="logout"]') ||
                        (document.body && document.body.textContent.includes('Total Keys'))
                    );
                    
                    const hasAntiBot = document.body && (
                        document.body.textContent.includes('PLEASE WAIT WHILE WE CHECK IF YOU ARE A HUMAN') ||
                        document.body.textContent.includes('Checking your browser') ||
                        document.body.textContent.includes('DDoS protection')
                    );
                    
                    if (hasRealContent && !hasAntiBot) {
                        debug.log('Real page content detected, proceeding with initialization');
                        clearInterval(checkInterval);
                        resolve(true);
                    } else if (attempts >= maxAttempts) {
                        debug.log('Timeout waiting for real page, proceeding anyway');
                        clearInterval(checkInterval);
                        resolve(false);
                    }
                }, 1000);
            });
        }
    };

    // Function to wait for real page load after anti-bot protection
    async function waitForRealPageLoad() {
        debug.log('Starting to wait for real page after anti-bot protection');
        
        try {
            await debug.waitForRealPage();
            debug.log('Real page loaded, starting normal initialization');
            
            // Enhanced domain validation
            const currentDomain = window.location.hostname.toLowerCase();
            const validDomains = ['geminikeyseeker.o0o.moe', 'www.geminikeyseeker.o0o.moe'];
            const isDomainValid = validDomains.some(domain => currentDomain === domain || currentDomain.endsWith('.' + domain));
            
            if (!isDomainValid) {
                debug.error('Script running on incorrect domain:', window.location.hostname);
                debug.log('Valid domains are:', validDomains);
                return;
            } else {
                debug.log('Domain validation passed:', currentDomain);
            }

            // Start initialization after anti-bot protection is cleared
            tryInitialize();
            
        } catch (error) {
            debug.error('Error waiting for real page:', error.message);
        }
    }


    // --- 辅助函数 ---
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

    const log = (message) => {
        debug.log(message);
    };

    function safeAlert(message) {
        try {
            alert(safeString(message));
        } catch (e) {
            debug.error('Alert 错误:', e.message);
        }
    }

    function safeString(str) {
        try {
            return String(str).replace(/[\u0000-\u001F\u007F-\u009F]/g, "");
        } catch (e) {
            return "Safe String Error";
        }
    }

    // --- 密钥验证配置和函数 ---
    const VERIFICATION_CONFIG = {
        endpoints: [
            'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent',
            'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent'
        ],
        testPayload: {
            "contents": [{
                "parts": [{
                    "text": "Hello"
                }]
            }],
            "generationConfig": {
                "temperature": 0.1,
                "maxOutputTokens": 10
            }
        },
        concurrentRequests: 3,
        requestTimeout: 8000,
    };

    async function verifySingleKey(key) {
        const promises = VERIFICATION_CONFIG.endpoints.map(endpoint =>
            new Promise(async (resolve, reject) => {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => {
                    controller.abort();
                    reject(new Error(`Timeout on ${endpoint}`));
                }, VERIFICATION_CONFIG.requestTimeout);

                try {
                    const url = `${endpoint}?key=${key}`;
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(VERIFICATION_CONFIG.testPayload),
                        signal: controller.signal
                    });

                    clearTimeout(timeoutId);

                    if (response.status === 200) {
                        try {
                            const responseData = await response.json();
                            if (responseData && responseData.candidates && responseData.candidates.length > 0) {
                                debug.log(`Key ${key.substring(0, 12)}... SUCCESS (200)`);
                                resolve({ key, status: '200' });
                            } else if (responseData && responseData.error) {
                                debug.log(`Key ${key.substring(0, 12)}... API ERROR: ${responseData.error.message}`);
                                reject(new Error(`API Error: ${responseData.error.message}`));
                            } else {
                                reject(new Error(`Invalid response format`));
                            }
                        } catch (parseError) {
                            reject(new Error(`JSON parse error: ${parseError.message}`));
                        }
                    } else if (response.status === 403) {
                        reject(new Error(`Invalid API key (403)`));
                    } else if (response.status === 429) {
                        reject(new Error(`Rate limited (429)`));
                    } else {
                        reject(new Error(`Status ${response.status}`));
                    }
                } catch (error) {
                    clearTimeout(timeoutId);
                    reject(error);
                }
            })
        );

        try {
            return await Promise.any(promises);
        } catch (error) {
            debug.log(`Key ${key.substring(0, 12)}... FAILED on all endpoints`);
            return { key, status: 'Failed' };
        }
    }

    async function verifyAndExportKeys(keys) {
        const uniqueKeys = [...new Set(keys)];
        if (uniqueKeys.length === 0) {
            safeAlert("未抓取到任何Key，无法开始验证。");
            return;
        }

        debug.log(`开始验证 ${uniqueKeys.length} 个唯一密钥`);
        const keyQueue = [...uniqueKeys];
        const validKeys = [];
        const btn = document.getElementById('key-seeker-btn');
        let completedCount = 0;

        const worker = async () => {
            while (keyQueue.length > 0) {
                const key = keyQueue.shift();
                if (!key) continue;

                try {
                    const result = await verifySingleKey(key);
                    if (result.status === '200') {
                        validKeys.push(result.key);
                    }
                } catch (e) {
                    debug.error(`验证密钥时发生错误 ${key.substring(0,12)}:`, e.message);
                } finally {
                    completedCount++;
                    if (btn) {
                        btn.textContent = `验证中... ${completedCount}/${uniqueKeys.length}`;
                    }
                }
            }
        };

        const workers = Array.from({ length: VERIFICATION_CONFIG.concurrentRequests }, () => worker());
        await Promise.all(workers);

        debug.log(`验证完成. 找到 ${validKeys.length} 个有效密钥`);
        
        if (btn) {
            btn.textContent = `验证完成! ${validKeys.length}个有效Key`;
        }

        if (validKeys.length > 0) {
            const filename = `keys_validated_${new Date().toISOString().slice(0, 10)}.txt`;
            const alertMessage = `验证完成！共找到 ${validKeys.length} 个有效的Key。已开始下载【已验证】的Key文件。`;
            downloadKeys(validKeys, filename, alertMessage);
        } else {
            safeAlert("验证完成，但未找到任何状态为200的有效Key。");
        }

        setTimeout(() => {
            try {
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = '一键智能抓取';
                    btn.style.backgroundColor = '#2196F3';
                }
            } catch (e) {
                debug.error(`重置按钮状态时出错:`, e.message);
            }
        }, 3000);
    }

    // --- 核心函数 ---
    function extractKeysFromHTML(htmlText) {
        debug.log('开始从HTML中提取密钥');
        const keys = new Set();
        
        // 更多样化的正则模式来匹配不同的HTML结构
        const patterns = [
            // 匹配表格单元格中的密钥
            /<td[^>]*>([^<]*AIzaSy[A-Za-z0-9_-]{33}[^<]*)<\/td>/gi,
            // 匹配任何包含密钥的HTML元素
            />(AIzaSy[A-Za-z0-9_-]{33})</gi,
            // 直接匹配密钥模式
            /AIzaSy[A-Za-z0-9_-]{33}/g,
            // 匹配可能在代码块中的密钥
            /<code[^>]*>([^<]*AIzaSy[A-Za-z0-9_-]{33}[^<]*)<\/code>/gi
        ];

        patterns.forEach((pattern, index) => {
            let match;
            while ((match = pattern.exec(htmlText)) !== null) {
                let keyText = match[1] || match[0];
                const keyMatch = keyText.match(/AIzaSy[A-Za-z0-9_-]{33}/);
                if (keyMatch) {
                    keys.add(keyMatch[0]);
                    debug.log(`Pattern ${index + 1} 找到密钥: ${keyMatch[0].substring(0, 12)}...`);
                }
            }
        });

        debug.log(`总共提取到 ${keys.size} 个唯一密钥`);
        return Array.from(keys);
    }

    function getMaxPageNumber(doc = document) {
        let maxPage = 1;
        
        // 多种方式查找分页信息
        const selectors = [
            '.pagination a',
            '.pagination button',
            '.page-link',
            'a[href*="page="]',
            '[class*="page"] a',
            '.pager a'
        ];

        selectors.forEach(selector => {
            doc.querySelectorAll(selector).forEach(el => {
                const pageNum = parseInt(el.textContent.trim(), 10);
                if (!isNaN(pageNum) && pageNum > maxPage) {
                    maxPage = pageNum;
                }
                
                // 检查href中的page参数
                if (el.href) {
                    const match = el.href.match(/page=(\d+)/);
                    if (match) {
                        const pageNum = parseInt(match[1], 10);
                        if (!isNaN(pageNum) && pageNum > maxPage) {
                            maxPage = pageNum;
                        }
                    }
                }
            });
        });

        debug.log(`检测到最大页码: ${maxPage}`);
        return maxPage;
    }

async function downloadKeys(keys, filename, alertMessage) {
    try {
        const uniqueKeys = [...new Set(keys)];
        debug.log(`准备下载 ${uniqueKeys.length} 个唯一密钥到文件: ${filename}`);

        if (uniqueKeys.length === 0) {
            debug.log("下载被调用但密钥数量为0，跳过下载");
            return;
        }

        const fileContent = uniqueKeys.join('\n');
        const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8' });

        // 采用清晰、正确的下载逻辑
        try {
            if (typeof GM_download === 'function') {
                GM_download({ 
                    url: URL.createObjectURL(blob), 
                    name: filename, 
                    saveAs: true 
                });
                debug.log(`GM_download 启动成功: ${filename}`);
            } else {
                throw new Error('GM_download not available');
            }
            
            if (alertMessage) {
                safeAlert(alertMessage);
            }
        } catch (downloadError) {
            debug.error(`GM_download 失败或不可用:`, downloadError.message);
            // 统一的备用下载方案
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            debug.log('使用备用下载方式');
            
            if (alertMessage) {
                safeAlert(alertMessage + ' (使用备用方式下载)');
            }
        }
    } catch (error) {

        debug.error('downloadKeys critical error:', error.message);
                // Prevent button disappearing by not throwing unhandled errors
        try {
            safeAlert(`Download process error: ${error.message}`);
        } catch (alertError) {
            debug.error('Alert failed:', alertError.message);
        }
                // Reset button state properly

        const btn = document.getElementById('key-seeker-btn');
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Smart Key Grabber';
            btn.style.backgroundColor = '#2196F3';
        }
    }
}
    // --- 优化的并发处理 ---
    async function processPagesInBatch(pages, baseUrl) {
        const pageQueue = [...pages];
        const allResults = [];
        const btn = document.getElementById('key-seeker-btn');
        let completedCount = 0;
        let activeWorkers = 0;

        const worker = async () => {
            activeWorkers++;
            while (pageQueue.length > 0) {
                const pageNum = pageQueue.shift();
                if (pageNum === undefined) continue;

                try {
                    const keys = await fetchPageWithRetry(baseUrl, pageNum);
                    allResults.push(...keys);

                    if (CONFIG.adaptiveDelay) {
                        await sleep(CONFIG.pageDelay * (0.8 + Math.random() * 0.4));
                    }
                } catch (error) {
                    debug.error(`页面 ${pageNum} 处理永久失败:`, error.message);
                    if (error.message === 'WAF_BLOCKED') {
                        pageQueue.unshift(pageNum);
                        throw error;
                    }
                } finally {
                    completedCount++;
                    if (btn) {
                        btn.textContent = `并发抓取中... ${completedCount}/${pages.length} (并发: ${activeWorkers})`;
                    }
                }
            }
            activeWorkers--;
        };

        const workers = Array.from({ length: CONFIG.concurrentRequests }, () => worker());
        await Promise.all(workers);
        return allResults;
    }

    async function fetchPageWithRetry(baseUrl, pageNum) {
        const url = new URL(baseUrl);
        url.searchParams.set('page', pageNum);

        for (let attempt = 1; attempt <= CONFIG.retryAttempts; attempt++) {
            const requestStart = Date.now();
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), CONFIG.requestTimeout);

                debug.log(`请求页面 ${pageNum}, 尝试 ${attempt}/${CONFIG.retryAttempts}: ${url.toString()}`);

                const response = await fetch(url.toString(), {
                    signal: controller.signal,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.5',
                        'Cache-Control': 'no-cache',
                        'Pragma': 'no-cache'
                    },
                    cache: CONFIG.cacheEnabled ? 'default' : 'no-cache'
                });
                clearTimeout(timeoutId);

                const requestTime = Date.now() - requestStart;

                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const htmlText = await response.text();

                if (htmlText.includes('Access Forbidden') || response.status === 403) {
                    debug.log(`在页面 ${pageNum} 检测到WAF，用时 ${requestTime}ms`);
                    throw new Error('WAF_BLOCKED');
                }

                const keys = extractKeysFromHTML(htmlText);
                debug.log(`页面 ${pageNum}: 找到 ${keys.length} 个密钥，用时 ${requestTime}ms (尝试 ${attempt})`);
                return keys;

            } catch (error) {
                const requestTime = Date.now() - requestStart;
                debug.error(`页面 ${pageNum}, 尝试 ${attempt} 失败，用时 ${requestTime}ms:`, error.message);

                if (error.name === 'AbortError') {
                    debug.log(`页面 ${pageNum} 请求超时`);
                }

                if (error.message === 'WAF_BLOCKED') throw error;
                if (attempt === CONFIG.retryAttempts) throw error;

                const retryDelay = Math.min(1000 * Math.pow(2, attempt), 8000);
                debug.log(`等待 ${retryDelay}ms 后重试...`);
                await sleep(retryDelay);
            }
        }
        return [];
    }

    // --- 后台抓取引擎 ---
    async function startBackgroundCollection() {
        debug.log('开始后台收集');
        const btn = document.getElementById('key-seeker-btn');
        if (btn) {
            btn.disabled = true;
        }
        
        const maxPage = getMaxPageNumber();
        debug.log(`开始优化的后台收集，共 ${maxPage} 页，${CONFIG.concurrentRequests} 个并发请求`);
        
        const baseUrl = new URL(window.location.href);
        const pages = Array.from({ length: maxPage }, (_, i) => i + 1);
        
        try {
            const startTime = Date.now();
            const allKeys = await processPagesInBatch(pages, baseUrl.toString());
            const endTime = Date.now();
            const duration = ((endTime - startTime) / 1000).toFixed(2);
            const uniqueKeys = [...new Set(allKeys)];
            
            debug.log(`收集完成，用时 ${duration}s. 找到 ${allKeys.length} 个总密钥, ${uniqueKeys.length} 个唯一密钥`);
            
            if (btn) {
                btn.textContent = `抓取完成! ${duration}s (${uniqueKeys.length}个Key)`;
            }

            if (uniqueKeys.length > 0) {
                const unvalidatedFilename = `keys_unvalidated_${new Date().toISOString().slice(0, 10)}.txt`;
                const unvalidatedAlert = `抓取完成！共找到 ${uniqueKeys.length} 个唯一的Key。\n\n已开始下载【未验证】的全部Key文件。\n接下来将自动开始验证过程...`;
                downloadKeys(uniqueKeys, unvalidatedFilename, unvalidatedAlert);
                await sleep(1000);
            }

            await verifyAndExportKeys(uniqueKeys);
            
        } catch (error) {
            debug.error('Collection failed:', error.message);
            
            // Enhanced error handling to prevent button disappearing
            const btn = document.getElementById('key-seeker-btn');
            if (btn) {
                btn.disabled = false;
                btn.style.backgroundColor = '#F44336';
                btn.textContent = 'Collection Failed - Click to Retry';
            }
            
            if (error.message === 'WAF_BLOCKED') {
                safeAlert(`抓取过程中被防火墙拦截！\n建议：\n1. 等待几分钟后重试\n2. 降低并发数设置\n3. 增加延迟时间`);
                if (btn) {
                    btn.textContent = '被WAF拦截!';
                    btn.style.backgroundColor = '#F44336';
                }
                setTimeout(() => {
                    if (confirm('是否要用更保守的设置重新尝试？(并发=1, 延迟=3000ms)')) {
                        CONFIG.concurrentRequests = 1;
                        CONFIG.pageDelay = 3000;
                        if (btn) {
                            btn.disabled = false;
                            btn.textContent = '保守模式重试';
                            btn.style.backgroundColor = '#FF9800';
                        }
                    } else {
                        if (btn) {
                            btn.disabled = false;
                            btn.textContent = '一键智能抓取';
                            btn.style.backgroundColor = '#2196F3';
                        }
                    }
                }, 3000);
                return;
            }

            safeAlert(`抓取过程发生错误：${error.message}\n\n请检查网络连接或查看控制台(F12)获取详细信息。`);
            if (btn) {
                btn.textContent = '抓取失败!';
                btn.style.backgroundColor = '#F44336';
            }
            setTimeout(() => {
                try {
                    if (btn) {
                        btn.disabled = false;
                        btn.textContent = '一键智能抓取';
                        btn.style.backgroundColor = '#2196F3';
                    }
                    debug.log("按钮状态重置为就绪");
                } catch (e) {
                    debug.error('重置按钮状态时出错:', e.message);
                }
            }, 3000);
        }
    }

    // --- 智能调度器 ---
    function startSmartCollection() {
        try {
            debug.log('启动智能收集');
            debug.domInfo();
            
            const currentUrl = new URL(window.location.href);
            const isFiltered = currentUrl.searchParams.get('status') === '200';
            debug.log(`智能收集开始. 页面是否已过滤Status 200? ${isFiltered}`);

            if (isFiltered) {
                debug.log("条件满足，立即开始收集");
                startBackgroundCollection();
            } else {
                debug.log("条件不满足，设置任务并重定向...");
                sessionStorage.setItem(CONFIG.processStateKey, 'true');
                currentUrl.searchParams.set('status', '200');
                currentUrl.searchParams.set('page', '1');
                debug.log(`重定向到: ${currentUrl.toString()}`);
                window.location.href = currentUrl.toString();
            }
        } catch (error) {
            debug.error('startSmartCollection 中的错误:', error.message);
            safeAlert(`启动智能收集时发生错误：${error.message}`);
        }
    }

    // --- Enhanced Initialization Function ---
    async function initialize() {
        debug.log('Starting initialization...');
        debug.log('Current URL:', window.location.href);
        debug.log('Document readyState:', document.readyState);
        debug.domInfo();

        // Enhanced button existence check
        const existingButton = document.getElementById('key-seeker-btn');
        if (existingButton) {
            debug.log('Button already exists, removing old instance and recreating');
            try {
                existingButton.remove();
            } catch (e) {
                debug.error('Error removing existing button:', e.message);
            }
        }

        // Wait for body to be available - Enhanced waiting logic
        if (!document.body) {
            debug.log('document.body does not exist, waiting...');
            try {
                await debug.waitForElement('body', 10000);
                debug.log('document.body is now available');
            } catch (error) {
                debug.error('Failed to wait for body:', error.message);
                // Try to create body if it doesn't exist
                if (!document.body && document.documentElement) {
                    const body = document.createElement('body');
                    document.documentElement.appendChild(body);
                    debug.log('Created body element manually');
                } else {
                    return;
                }
            }
        }

        debug.log('Injecting button and styles...');
        
        try {
            // Inject styles with fallback support
            try {
                if (typeof GM_addStyle === 'function') {
                    GM_addStyle(`
                        #key-seeker-btn {
                            position: fixed !important; 
                            top: 15px !important; 
                            right: 20px !important; 
                            z-index: 2147483647 !important;
                            padding: 12px 18px !important; 
                            background-color: #2196F3 !important; 
                            color: white !important;
                            border: none !important; 
                            border-radius: 8px !important; 
                            cursor: pointer !important;
                            font-size: 14px !important; 
                            font-weight: bold !important;
                            box-shadow: 0 4px 8px rgba(0,0,0,0.3) !important;
                            transition: all 0.3s ease !important;
                            font-family: Arial, sans-serif !important;
                        }
                        #key-seeker-btn:hover { 
                            background-color: #1976D2 !important; 
                            transform: translateY(-2px) !important;
                            box-shadow: 0 6px 12px rgba(0,0,0,0.4) !important;
                        }
                        #key-seeker-btn:active { 
                            transform: scale(0.98) !important; 
                        }
                        #key-seeker-btn:disabled { 
                            background-color: #9E9E9E !important; 
                            cursor: not-allowed !important; 
                            transform: none !important;
                        }
                    `);
                    debug.log('GM_addStyle injection successful');
                } else {
                    throw new Error('GM_addStyle not available');
                }
            } catch (e) {
                debug.log('GM_addStyle failed, using fallback method');
                const style = document.createElement('style');
                style.textContent = `
                    #key-seeker-btn {
                        position: fixed !important; 
                        top: 15px !important; 
                        right: 20px !important; 
                        z-index: 2147483647 !important;
                        padding: 12px 18px !important; 
                        background-color: #2196F3 !important; 
                        color: white !important;
                        border: none !important; 
                        border-radius: 8px !important; 
                        cursor: pointer !important;
                        font-size: 14px !important; 
                        font-weight: bold !important;
                        box-shadow: 0 4px 8px rgba(0,0,0,0.3) !important;
                        transition: all 0.3s ease !important;
                        font-family: Arial, sans-serif !important;
                    }
                    #key-seeker-btn:hover { 
                        background-color: #1976D2 !important; 
                        transform: translateY(-2px) !important;
                        box-shadow: 0 6px 12px rgba(0,0,0,0.4) !important;
                    }
                    #key-seeker-btn:active { 
                        transform: scale(0.98) !important; 
                    }
                    #key-seeker-btn:disabled { 
                        background-color: #9E9E9E !important; 
                        cursor: not-allowed !important; 
                        transform: none !important;
                    }
                `;
                document.head.appendChild(style);
                debug.log('Fallback style injection successful');
            }

            // Create button
            const button = document.createElement('button');
            button.id = 'key-seeker-btn';
            button.textContent = '🚀 Smart Key Grabber';
            button.title = 'Gemini Key Seeker v7.2 - Click to start grabbing and verifying API keys';
            
            // Ensure button is visible and accessible - Enhanced styling
            button.style.cssText = `
                position: fixed !important;
                top: 15px !important;
                right: 20px !important;
                z-index: 2147483647 !important;
                padding: 12px 18px !important;
                background-color: #2196F3 !important;
                color: white !important;
                border: none !important;
                border-radius: 8px !important;
                cursor: pointer !important;
                font-size: 14px !important;
                font-weight: bold !important;
                box-shadow: 0 4px 8px rgba(0,0,0,0.3) !important;
                transition: all 0.3s ease !important;
                font-family: Arial, sans-serif !important;
                display: block !important;
                visibility: visible !important;
                opacity: 1 !important;
                pointer-events: auto !important;
                transform: none !important;
                margin: 0 !important;
                width: auto !important;
                height: auto !important;
                min-width: auto !important;
                min-height: auto !important;
                max-width: none !important;
                max-height: none !important;
            `;
            
            document.body.appendChild(button);
            debug.log('Button created successfully');
            
            // Verify button is actually in DOM and visible - Enhanced verification
            setTimeout(() => {
                const verifyButton = document.getElementById('key-seeker-btn');
                if (verifyButton) {
                    debug.log('Button verification successful');
                    const rect = verifyButton.getBoundingClientRect();
                    const computedStyle = window.getComputedStyle(verifyButton);
                    debug.log('Button position and visibility:', {
                        'getBoundingClientRect': rect,
                        'display': computedStyle.display,
                        'visibility': computedStyle.visibility,
                        'opacity': computedStyle.opacity,
                        'z-index': computedStyle.zIndex,
                        'position': computedStyle.position
                    });
                } else {
                    debug.error('Button verification failed - not found in DOM');
                    debug.log('DOM body children:', document.body ? document.body.children.length : 'No body');
                    debug.log('Document ready state:', document.readyState);
                }
            }, 100);
            
            // 添加事件监听器
            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                debug.log('按钮被点击');
                startSmartCollection();
            });
            debug.log('事件监听器添加成功');

            // Check pending tasks with enhanced error handling
            try {
                const pendingTask = sessionStorage.getItem(CONFIG.processStateKey);
                if (pendingTask === 'true') {
                    debug.log('Found pending task on page load, starting collection...');
                    sessionStorage.removeItem(CONFIG.processStateKey);
                    
                    // Add button state management during auto-execution
                    const btn = document.getElementById('key-seeker-btn');
                    if (btn) {
                        btn.textContent = 'Auto-executing pending task...';
                        btn.disabled = true;
                    }
                    
                    setTimeout(async () => {
                        debug.log('Executing delayed task');
                        try {
                            await startBackgroundCollection();
                        } catch (taskError) {
                            debug.error('Pending task execution failed:', taskError.message);
                            if (btn) {
                                btn.disabled = false;
                                btn.textContent = 'Task Failed - Click to Retry';
                                btn.style.backgroundColor = '#F44336';
                            }
                        }
                    }, 1000);
                }
            } catch (error) {
                debug.error('Error checking pending tasks:', error.message);
            }

            debug.log('初始化完成！');

        } catch (error) {
            debug.error('初始化过程中出错:', error);
            safeAlert(`脚本初始化失败：${error.message}`);
        }
    }

    // --- Final Solution: Multiple Initialization Strategies ---
    function tryInitialize() {
        debug.log('Attempting to initialize script...');
        
        // Enhanced check for anti-bot protection before initialization
        const recheckAntiBot = document.body && (
            document.body.textContent.includes('PLEASE WAIT WHILE WE CHECK IF YOU ARE A HUMAN') ||
            document.body.textContent.includes('Checking your browser') ||
            document.querySelector('[class*="cf-"]')
        );
        
        if (recheckAntiBot) {
            debug.log('Anti-bot protection still active, delaying initialization');
            setTimeout(() => tryInitialize(), 2000);
            return;
        }
        
        // Strategy 1: Immediate attempt
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            debug.log('Document is ready, initializing immediately');
            setTimeout(() => initialize().catch(e => debug.error('Init failed:', e)), 100);
        }
        
        // Strategy 2: After DOM content loaded
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                debug.log('DOMContentLoaded triggered, initializing');
                setTimeout(() => initialize().catch(e => debug.error('Init failed:', e)), 100);
            });
        }
        
        // Strategy 3: After window fully loaded
        window.addEventListener('load', () => {
            debug.log('Window load complete, delayed initialization');
            setTimeout(() => initialize().catch(e => debug.error('Init failed:', e)), 500);
        });
        
        // Strategy 4: Use MutationObserver to monitor page changes - Enhanced for anti-bot detection
        const observer = new MutationObserver((mutations, obs) => {
            // First check if anti-bot protection is cleared
            const hasAntiBot = document.body && (
                document.body.textContent.includes('PLEASE WAIT WHILE WE CHECK IF YOU ARE A HUMAN') ||
                document.body.textContent.includes('Checking your browser')
            );
            
            if (hasAntiBot) {
                debug.log('MutationObserver: Anti-bot protection still active');
                return;
            }
            
            // Check for key elements appearance
            const indicators = [
                'a[href*="logout"]',
                '.pagination',
                'table',
                '.container',
                'main',
                '#app'
            ];
            
            for (const selector of indicators) {
                if (document.querySelector(selector) && !document.getElementById('key-seeker-btn')) {
                    debug.log(`Detected key element ${selector}, page ready, starting initialization`);
                    initialize();
                    obs.disconnect();
                    return;
                }
            }
            
            // 如果已经有了目标按钮，停止观察
            if (document.getElementById('key-seeker-btn')) {
                debug.log('按钮已存在，停止观察');
                obs.disconnect();
            }
        });
        
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: false
        });
        
        // 策略5: 定时检查（备用方案）
        let checkCount = 0;
        const maxChecks = 20;
        const checkInterval = setInterval(() => {
            checkCount++;
            debug.log(`定时检查 ${checkCount}/${maxChecks}`);
            
            if (document.getElementById('key-seeker-btn')) {
                debug.log('按钮已存在，停止定时检查');
                clearInterval(checkInterval);
                return;
            }
            
            if (document.body && document.readyState !== 'loading') {
                debug.log('定时检查发现页面就绪，尝试初始化');
                initialize();
            }
            
            if (checkCount >= maxChecks) {
                debug.log('达到最大检查次数，停止定时检查');
                clearInterval(checkInterval);
                
                // 最后一次强制尝试
                if (!document.getElementById('key-seeker-btn')) {
                    debug.log('执行最后一次强制初始化尝试');
                    setTimeout(initialize, 1000);
                }
            }
        }, 1000);
    }

    // --- Script Startup Entry Point - Enhanced error handling ---
    try {
        debug.log('Script execution started, URL:', window.location.href);
        debug.log('Document readyState:', document.readyState);
        debug.log('User Agent:', navigator.userAgent);
        debug.log('Tampermonkey version:', typeof GM_info !== 'undefined' ? GM_info.version : 'Unknown');
        const gmFunctions = {
            'GM_addStyle': typeof GM_addStyle !== 'undefined',
            'GM_download': typeof GM_download !== 'undefined',
            'GM_log': typeof GM_log !== 'undefined',
            'GM_xmlhttpRequest': typeof GM_xmlhttpRequest !== 'undefined'
        };

        debug.log('Available GM functions:', gmFunctions);

        // Check if essential functions are missing
        const missingFunctions = Object.keys(gmFunctions).filter(key => !gmFunctions[key]);
        if (missingFunctions.length > 0) {
            debug.error('Missing essential Tampermonkey functions:', missingFunctions);
            
            // Show permission warning to user
            setTimeout(() => {
                const permissionWarning = `WARNING: Missing Tampermonkey Permissions\n\nThe following functions are not available:\n${missingFunctions.map(f => '• ' + f).join('\n')}\n\nThis may cause limited functionality. Please:\n1. Check Tampermonkey settings\n2. Ensure script has proper grants\n3. Reload the page after fixing permissions\n\nScript will attempt to use fallback methods.`;
                
                safeAlert(permissionWarning);
            }, 2000);
        }
        
        // Check for anti-bot protection before proceeding
        const hasAntiBot = document.body && (
            document.body.textContent.includes('PLEASE WAIT WHILE WE CHECK IF YOU ARE A HUMAN') ||
            document.body.textContent.includes('Checking your browser') ||
            document.body.textContent.includes('DDoS protection') ||
            document.querySelector('[class*="cf-"]') ||
            document.querySelector('[id*="cf-"]') ||
            window.location.pathname.includes('/cdn-cgi/')
        );
        
        if (hasAntiBot) {
            debug.log('Anti-bot protection detected, waiting for real page to load...');
            waitForRealPageLoad();
            return;
        }
        
        debug.domInfo();

        // Enhanced domain validation
        const currentDomain = window.location.hostname.toLowerCase();
        const validDomains = ['geminikeyseeker.o0o.moe', 'www.geminikeyseeker.o0o.moe'];
        const isDomainValid = validDomains.some(domain => currentDomain === domain || currentDomain.endsWith('.' + domain));
        
        if (!isDomainValid) {
            debug.error('Script running on incorrect domain:', window.location.hostname);
            debug.log('Valid domains are:', validDomains);
            return;
        } else {
            debug.log('Domain validation passed:', currentDomain);
        }

        // Immediately start initialization attempts
        tryInitialize();
    } catch (startupError) {
        console.error('%c[KeySeeker STARTUP ERROR]', 'color: #ff0000; font-weight: bold;', startupError);
        debug.error('Critical startup error:', startupError.message);
    }

    // Additional safety measure: if no button after 5 seconds, force initialization
    setTimeout(() => {
        if (!document.getElementById('key-seeker-btn')) {
            debug.log('5 seconds passed without button, executing forced initialization');
            initialize().catch(e => debug.error('Forced init failed:', e));
        }
    }, 5000);

    // Ultimate fallback: keep trying every 3 seconds for 30 seconds
    let attemptCount = 0;
    const maxAttempts = 10;
    const fallbackInterval = setInterval(() => {
        attemptCount++;
        if (document.getElementById('key-seeker-btn')) {
            debug.log('Button found, stopping fallback attempts');
            clearInterval(fallbackInterval);
            return;
        }
        
        if (attemptCount >= maxAttempts) {
            debug.error('Maximum fallback attempts reached, stopping');
            clearInterval(fallbackInterval);
            return;
        }
        
        debug.log(`Fallback attempt ${attemptCount}/${maxAttempts}`);
        initialize().catch(e => debug.error('Fallback init failed:', e));
    }, 3000);

    // 导出调试函数到全局作用域（仅在调试模式下）
    if (DEBUG.enabled) {
        window.KeySeekerDebug = {
            log: debug.log,
            domInfo: debug.domInfo,
            initialize: initialize,
            startCollection: startSmartCollection,
            config: CONFIG,
            extractKeys: extractKeysFromHTML
        };
        debug.log('调试函数已导出到 window.KeySeekerDebug');
    }

})();
