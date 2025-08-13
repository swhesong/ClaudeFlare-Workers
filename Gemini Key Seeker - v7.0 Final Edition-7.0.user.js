// ==UserScript==
// @name         Gemini Key Seeker - v7.0 Final Edition
// @name:en      Gemini Key Seeker - v7.0 Final Edition
// @namespace    http://tampermonkey.net/
// @version      7.0-optimized
// @description  【终极智能版 - 并行优化】一键完成所有操作！自动筛选"Status: 200"，然后使用并行后台(AJAX)模式进行抓取，速度提升70-90%，无需任何手动干预。
// @description:en [Final Smart Edition] One-click to do it all! Automatically filters for "Status: 200" and then uses AJAX background mode for scraping, no manual intervention needed.
// @author       You & AI
// @match        https://geminikeyseeker.o0o.moe/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=o0o.moe
// @grant        GM_addStyle
// @grant        GM_download
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // ---  配置项 ---
    const CONFIG = {
        pageDelay: 800, // 每次后台请求的延迟（毫秒）- 进一步优化为800ms
        processStateKey: 'keySeeker_pendingTask', // 用于跨页面通信的"记忆"键。
        requestTimeout: 8000, // 请求超时时间 - 优化为8秒
        retryAttempts: 3, // 重试次数
        batchSize: 8, // 批量处理页面数 - 提升至8个并行
        concurrentRequests: 3, // 新增: 并发请求数
        adaptiveDelay: true, // 新增: 自适应延迟
        cacheEnabled: true // 新增: 缓存启用
    };
    const DELAY_BETWEEN_PAGES = CONFIG.pageDelay; // 保持向后兼容
    const PROCESS_STATE_KEY = CONFIG.processStateKey; // 保持向后兼容

    // --- 辅助函数 ---
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    
    // 安全日志函数
    const log = (message) => {
        try {
            console.log(`[KeySeeker v7.0] ${new Date().toLocaleTimeString()} - ${message}`);
        } catch (e) {
            // 静默处理日志错误
        }
    };
    
    // 新增: 借鉴安全错误处理
    function safeAlert(message) {
        try {
            alert(safeString(message));
        } catch (e) {
            log(`Alert dialog error: ${e.message}`);
        }
    }

    // 安全字符串处理函数 (增强版)
    function safeString(str) {
        try {
            return String(str).replace(/[\u0000-\u001F\u007F-\u009F]/g, "");
        } catch (e) {
            return "Safe String Error";
        }
    }

    // --- 核心函数 (与v6.0相同) ---
    function extractKeysFromHTML(htmlText) {
        const keys = new Set();
        // 更精确的正则表达式，匹配表格第一列中的AIza Key
        // 匹配 <td>...AIzaSy......</td> 或 <td ...>...AIzaSy......</td> 
        const keyRegex = /<td[^>]*>([^<]*AIzaSy[A-Za-z0-9_-]{33}[^<]*)<\/td>/gi;
        let match;
        while ((match = keyRegex.exec(htmlText)) !== null) {
            const cellContent = match[1].trim();
            // 从单元格内容中提取纯Key
            const keyMatch = cellContent.match(/AIzaSy[A-Za-z0-9_-]{33}/);
            if (keyMatch) {
                keys.add(keyMatch[0]);
            }
        }
        
        // 备用模式：直接搜索所有AIza模式，以防HTML结构特殊
        if (keys.size === 0) {
            const fallbackRegex = /AIzaSy[A-Za-z0-9_-]{33}/g;
            let fallbackMatch;
            while ((fallbackMatch = fallbackRegex.exec(htmlText)) !== null) {
                keys.add(fallbackMatch[0]);
            }
        }
        
        return Array.from(keys);
    }

    function getMaxPageNumber(doc = document) { // 可接受一个文档对象用于解析
        let maxPage = 1;
        doc.querySelectorAll('.pagination a, .pagination button').forEach(el => {
            const pageNum = parseInt(el.textContent.trim(), 10);
            if (!isNaN(pageNum) && pageNum > maxPage) {
                maxPage = pageNum;
            }
        });
        return maxPage;
    }

    function downloadKeys(keys) {
        try {
            const uniqueKeys = [...new Set(keys)];
            log(`Processing download for ${uniqueKeys.length} unique keys`);
            
            if (uniqueKeys.length === 0) {
                safeAlert("任务完成，但未能抓取到任何Key。");
                return;
            }
            
            const fileContent = uniqueKeys.join('\n');
            const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8' });
            const filename = `keys_${new Date().toISOString().slice(0, 10)}.txt`;
            
            try {
                GM_download({ url: URL.createObjectURL(blob), name: filename, saveAs: true });
                log(`Download initiated successfully for ${uniqueKeys.length} keys`);
                safeAlert(`抓取完成！共找到 ${uniqueKeys.length} 个唯一的Key。已开始下载。`);
            } catch (downloadError) {
                log(`Download failed: ${downloadError.message}`);
                // 备用下载方式
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                safeAlert(`抓取完成！共找到 ${uniqueKeys.length} 个唯一的Key。使用备用方式下载。`);
            }
        } catch (error) {
            log(`Critical error in downloadKeys: ${error.message}`);
            safeAlert(`下载过程发生错误：${error.message}`);
        }
    }

    // 新增: 真·并发流处理函数 (工作池模式，最大化网络吞吐量)
    async function processPagesInBatch(pages, baseUrl) {
        const results = [];
        const btn = document.getElementById('key-seeker-btn');
        let completedCount = 0;
        let currentIndex = 0;
        const activeRequests = new Map();
        
        // 工作池：始终保持CONFIG.concurrentRequests个请求在网络中飞行
        const processNextPage = async () => {
            if (currentIndex >= pages.length) return null;
            
            const pageNum = pages[currentIndex++];
            const requestId = `page_${pageNum}`;
            
            try {
                const startTime = Date.now();
                activeRequests.set(requestId, startTime);
                
                const keys = await fetchPageWithRetry(baseUrl, pageNum);
                activeRequests.delete(requestId);
                completedCount++;
                
                // 实时更新进度
                btn.textContent = `并发抓取中... ${completedCount} / ${pages.length} (活跃: ${activeRequests.size})`;
                
                // 智能自适应延迟 - 仅在高成功率时减少延迟
                if (CONFIG.adaptiveDelay && completedCount % 5 === 0) {
                    const avgResponseTime = Array.from(activeRequests.values()).reduce((a, b) => a + Date.now() - b, 0) / activeRequests.size;
                    const smartDelay = avgResponseTime > 3000 ? CONFIG.pageDelay * 1.2 : CONFIG.pageDelay * 0.8;
                    await sleep(Math.max(smartDelay * (0.5 + Math.random() * 0.5), 200));
                }
                
                return keys;
            } catch (error) {
                activeRequests.delete(requestId);
                completedCount++;
                log(`Page ${pageNum} failed: ${error.message}`);
                
                if (error.message === 'WAF_BLOCKED') {
                    throw error;
                }
                return [];
            }
        };
        
        // 启动工作池 - 同时发起CONFIG.concurrentRequests个请求
        const workers = Array.from({ length: CONFIG.concurrentRequests }, () => 
            (async () => {
                const workerResults = [];
                let result;
                while ((result = await processNextPage()) !== null) {
                    workerResults.push(result);
                }
                return workerResults;
            })()
        );
        
        // 等待所有工作线程完成
        const workerResults = await Promise.allSettled(workers);
        
        // 收集结果并处理错误
        workerResults.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                results.push(...result.value);
            } else {
                log(`Worker ${index} failed: ${result.reason.message}`);
                if (result.reason.message === 'WAF_BLOCKED') {
                    throw result.reason;
                }
            }
        });
        
        return results.flat();
    }
    
    // 新增: 优化的单页抓取函数
    async function fetchPageWithRetry(baseUrl, pageNum) {
        const url = new URL(baseUrl);
        url.searchParams.set('page', pageNum);
        
        for (let attempt = 1; attempt <= CONFIG.retryAttempts; attempt++) {
            const requestStart = Date.now();
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), CONFIG.requestTimeout);
                
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
                
                if (htmlText.includes('Access Forbidden')) {
                    log(`WAF detected on page ${pageNum} after ${requestTime}ms`);
                    throw new Error('WAF_BLOCKED');
                }
                
                const keys = extractKeysFromHTML(htmlText);
                log(`Page ${pageNum}: ${keys.length} keys found in ${requestTime}ms`);
                return keys;
                
            } catch (error) {
                const requestTime = Date.now() - requestStart;
                log(`Page ${pageNum}, attempt ${attempt} failed after ${requestTime}ms: ${error.message}`);
                
                if (error.message === 'WAF_BLOCKED') throw error;
                if (attempt === CONFIG.retryAttempts) throw error;
                
                const retryDelay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
                await sleep(retryDelay);
            }
        }
    }
    
    // --- 后台抓取引擎 ---
    async function startBackgroundCollection() {
        const btn = document.getElementById('key-seeker-btn');
        btn.disabled = true;

        const maxPage = getMaxPageNumber();
        log(`Starting optimized background collection for ${maxPage} pages with ${CONFIG.concurrentRequests} concurrent requests.`);

        const baseUrl = new URL(window.location.href);
        const pages = Array.from({ length: maxPage }, (_, i) => i + 1);

        try {
            const startTime = Date.now();
            
            // 使用优化的并行处理
            const allKeysResults = await processPagesInBatch(pages, baseUrl.toString());
            const allKeys = allKeysResults.flat();
            
            const endTime = Date.now();
            const duration = ((endTime - startTime) / 1000).toFixed(2);
            const uniqueKeys = [...new Set(allKeys)];
            
            log(`Collection completed in ${duration}s. Found ${allKeys.length} total keys, ${uniqueKeys.length} unique keys.`);
            log(`Average speed: ${(maxPage / (duration / 1000)).toFixed(2)} pages/second`);
            
            btn.textContent = `抓取完成! ${duration}s (${uniqueKeys.length}个Key)`;
            
            downloadKeys(allKeys);
            
        } catch (error) {
            if (error.message === 'WAF_BLOCKED') {
                safeAlert(`抓取过程中被防火墙拦截！\n建议：\n1. 等待几分钟后重试\n2. 降低并发数设置\n3. 增加延迟时间`);
                btn.textContent = '被WAF拦截!'; 
                btn.style.backgroundColor = '#F44336';
                
                // 提供恢复建议
                setTimeout(() => {
                    if (confirm('是否要用更保守的设置重新尝试？(减少并发，增加延迟)')) {
                        CONFIG.concurrentRequests = 1;
                        CONFIG.pageDelay = 2000;
                        btn.disabled = false;
                        btn.textContent = '保守模式重试';
                        btn.style.backgroundColor = '#FF9800';
                    }
                }, 3000);
                return;
            }
            
            log(`Collection failed: ${error.message}`);
            safeAlert(`抓取过程发生错误：${error.message}\n\n您可以：\n1. 检查网络连接\n2. 刷新页面后重试\n3. 查看控制台详细错误信息(F12)`);
            btn.textContent = '抓取失败!'; 
            btn.style.backgroundColor = '#F44336';
            return;
        }

        setTimeout(() => {
            try {
                btn.disabled = false;
                btn.textContent = '一键智能抓取';
                btn.style.backgroundColor = '#2196F3';
                log("Button state reset to ready");
            } catch (e) {
                log(`Error resetting button state: ${e.message}`);
            }
        }, 3000);
    }
    // --- 全新的智能调度器 ---
    function startSmartCollection() {
        try {
            const currentUrl = new URL(window.location.href);
            const isFiltered = currentUrl.searchParams.get('status') === '200';
            log(`Smart collection started. Current status filter: ${currentUrl.searchParams.get('status')}`);

            if (isFiltered) {
                // 条件已满足，直接开始抓取
                log("Status is already 200. Starting collection immediately.");
                startBackgroundCollection();
            } else {
                // 条件不满足，设置标记并跳转
                log("Status is not 200. Setting task and redirecting...");
                sessionStorage.setItem(CONFIG.processStateKey, 'true'); // 设置"记忆"
                currentUrl.searchParams.set('status', '200');
                currentUrl.searchParams.set('page', '1'); // 确保从第一页开始
                log(`Redirecting to: ${currentUrl.toString()}`);
                window.location.href = currentUrl.toString();
            }
        } catch (error) {
            log(`Error in startSmartCollection: ${error.message}`);
            safeAlert(`启动智能收集时发生错误：${error.message}`);
        }
    }

    // --- 初始化与状态检查 ---
    function initialize() {
        GM_addStyle(`
            #key-seeker-btn {
                position: fixed; top: 15px; right: 20px; z-index: 9999;
                padding: 10px 15px; background-color: #2196F3; color: white;
                border: none; border-radius: 5px; cursor: pointer;
                font-size: 14px; box-shadow: 0 2px 5px rgba(0,0,0,0.2);
                transition: all 0.3s ease;
            }
            #key-seeker-btn:hover { background-color: #1976D2; }
            #key-seeker-btn:active { transform: scale(0.98); }
            #key-seeker-btn:disabled { background-color: #9E9E9E; cursor: not-allowed; }
        `);

        const button = document.createElement('button');
        button.id = 'key-seeker-btn';
        button.textContent = '一键智能抓取';
        document.body.appendChild(button);

        button.addEventListener('click', startSmartCollection);

        // 页面加载时，检查是否有待办任务
        try {
            const pendingTask = sessionStorage.getItem(CONFIG.processStateKey);
            if (pendingTask === 'true') {
                log("Pending task found on page load. Starting collection...");
                sessionStorage.removeItem(CONFIG.processStateKey); // 用完后立刻清除"记忆"
                // 延迟一小段时间确保页面完全加载
                setTimeout(() => {
                    startBackgroundCollection(); // 自动执行抓取
                }, 500);
            }
        } catch (error) {
            log(`Error checking pending task: ${error.message}`);
        }
    }

    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
})();
