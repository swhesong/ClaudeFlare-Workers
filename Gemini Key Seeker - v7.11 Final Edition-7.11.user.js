// ==UserScript==
// @name         Gemini Key Seeker - v7.2 Debug Edition
// @name:en      Gemini Key Seeker - v7.2 Debug Edition
// @namespace    http://tampermonkey.net/
// @version      7.2-debug-fix
// @description  【调试修复版】增强调试功能，修复初始化问题，提升稳定性
// @description:en [Debug Fix Edition] Enhanced debugging, fixed initialization issues, improved stability
// @author       You & AI
// @match        https://geminikeyseeker.o0o.moe/*
// @match        https://*.geminikeyseeker.o0o.moe/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=o0o.moe
// @grant        GM_addStyle
// @grant        GM_download
// @grant        GM_log
// @license      MIT
// ==/UserScript==

console.log('%c GEMINI KEY SEEKER v7.2 DEBUG - SCRIPT LOADED! ', 'background: #222; color: #00ff00; font-size: 16px; font-weight: bold;');

(function() {
    'use strict';

    // --- 调试配置 ---
    const DEBUG = {
        enabled: true,
        verbose: true,
        showDOMInfo: true
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

    // --- 增强调试函数 ---
    const debug = {
        log: (message, data = null) => {
            if (DEBUG.enabled) {
                const timestamp = new Date().toLocaleTimeString();
                console.log(`%c[KeySeeker Debug] ${timestamp}`, 'color: #00bcd4; font-weight: bold;', message, data || '');
                if (typeof GM_log !== 'undefined') {
                    try {
                        GM_log(`[KeySeeker] ${message}`);
                    } catch (e) {
                        // GM_log 可能不可用，忽略错误
                    }
                }
            }
        },
        error: (message, error = null) => {
            console.error(`%c[KeySeeker ERROR]`, 'color: #ff0000; font-weight: bold;', message, error || '');
        },
        domInfo: () => {
            if (DEBUG.showDOMInfo) {
                debug.log('DOM 信息检查:', {
                    'document.readyState': document.readyState,
                    'document.body': !!document.body,
                    'URL': window.location.href,
                    'Title': document.title,
                    'Has logout link': !!document.querySelector('a[href*="logout"]'),
                    'Has table': !!document.querySelector('table'),
                    'Has pagination': !!document.querySelector('.pagination'),
                    'Button exists': !!document.getElementById('key-seeker-btn')
                });
            }
        }
    };

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

    function downloadKeys(keys, filename, alertMessage) {
        try {
            const uniqueKeys = [...new Set(keys)];
            debug.log(`准备下载 ${uniqueKeys.length} 个唯一密钥到文件: ${filename}`);

            if (uniqueKeys.length === 0) {
                debug.log("下载被调用但密钥数量为0，跳过下载");
                return;
            }

            const fileContent = uniqueKeys.join('\n');
            const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8' });

            try {
                if (typeof GM_download !== 'undefined') {
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
                debug.error(`GM_download 失败:`, downloadError.message);
                // 备用下载方式
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
            debug.error('downloadKeys 关键错误:', error.message);
            safeAlert(`下载过程发生错误：${error.message}`);
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
            debug.error('收集失败:', error.message);
            
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

    // --- 增强的初始化函数 ---
    function initialize() {
        debug.log('开始初始化...');
        debug.domInfo();

        if (document.getElementById('key-seeker-btn')) {
            debug.log('按钮已存在，跳过初始化');
            return;
        }

        if (!document.body) {
            debug.log('document.body 不存在，将重试');
            return;
        }

        debug.log('注入按钮和样式...');

        try {
            // 注入样式
            const style = document.createElement('style');
            style.textContent = `
                #key-seeker-btn {
                    position: fixed !important; 
                    top: 15px !important; 
                    right: 20px !important; 
                    z-index: 999999 !important;
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
            debug.log('样式注入成功');

            // 创建按钮
            const button = document.createElement('button');
            button.id = 'key-seeker-btn';
            button.textContent = '🚀 一键智能抓取';
            button.title = 'Gemini Key Seeker v7.2 - 点击开始抓取和验证API密钥';
            document.body.appendChild(button);
            debug.log('按钮创建成功');

            // 添加事件监听器
            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                debug.log('按钮被点击');
                startSmartCollection();
            });
            debug.log('事件监听器添加成功');

            // 检查待办任务
            try {
                const pendingTask = sessionStorage.getItem(CONFIG.processStateKey);
                if (pendingTask === 'true') {
                    debug.log('页面加载时发现待办任务，开始收集...');
                    sessionStorage.removeItem(CONFIG.processStateKey);
                    setTimeout(() => {
                        debug.log('执行延迟任务');
                        startBackgroundCollection();
                    }, 1000);
                }
            } catch (error) {
                debug.error('检查待办任务时出错:', error.message);
            }

            debug.log('初始化完成！');

        } catch (error) {
            debug.error('初始化过程中出错:', error);
            safeAlert(`脚本初始化失败：${error.message}`);
        }
    }

    // --- 最终解决方案：多重初始化策略 ---
    function tryInitialize() {
        debug.log('尝试初始化脚本...');
        
        // 策略1: 立即尝试
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            debug.log('文档已就绪，立即初始化');
            setTimeout(initialize, 100);
        }
        
        // 策略2: DOM内容加载完成后
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                debug.log('DOMContentLoaded 触发，初始化');
                setTimeout(initialize, 100);
            });
        }
        
        // 策略3: 窗口完全加载后
        window.addEventListener('load', () => {
            debug.log('窗口加载完成，延迟初始化');
            setTimeout(initialize, 500);
        });
        
        // 策略4: 使用 MutationObserver 监视页面变化
        const observer = new MutationObserver((mutations, obs) => {
            // 检查是否有关键元素出现
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
                    debug.log(`检测到关键元素 ${selector}，页面就绪，开始初始化`);
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

    // --- 脚本启动入口 ---
    debug.log('脚本开始执行，URL:', window.location.href);
    debug.log('Document readyState:', document.readyState);
    debug.domInfo();

    // 立即开始初始化尝试
    tryInitialize();

    // 额外的安全措施：如果5秒后仍然没有按钮，强制初始化
    setTimeout(() => {
        if (!document.getElementById('key-seeker-btn')) {
            debug.log('5秒后仍未找到按钮，执行强制初始化');
            initialize();
        }
    }, 5000);

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
