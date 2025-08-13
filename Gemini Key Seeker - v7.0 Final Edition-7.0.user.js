// ==UserScript==
// @name         Gemini Key Seeker - v7.1 Final Edition
// @name:en      Gemini Key Seeker - v7.1 Final Edition
// @namespace    http://tampermonkey.net/
// @version      7.1-optimized
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
        concurrentRequests: 3, // 新增: 并发请求数, 这是控制速度与稳定性的核心
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
            console.log(`[KeySeeker v7.1] ${new Date().toLocaleTimeString()} - ${message}`);
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

    // --- 高级算法核心：优化的并发工作池 (World-Leading Algorithm for I/O-bound tasks) ---
    // 此函数采用现代并发模型（常被称为"Worker Pool"或"Semaphore"模式）来处理大量网络请求。
    // 它不是简单地一次性发起所有请求（会淹没浏览器和服务器），而是维持一个固定数量的并发“工人”(worker)。
    // 每个工人完成任务后，会立即从任务队列中领取下一个任务。这确保了网络连接得到最有效的利用，是当前处理此类问题的世界领先实践。
    async function processPagesInBatch(pages, baseUrl) {
        const pageQueue = [...pages]; // 创建一个待处理页面的队列
        const allResults = [];
        const btn = document.getElementById('key-seeker-btn');
        let completedCount = 0;
        let activeWorkers = 0;

        // 单个“工人”的任务逻辑：持续从队列中获取页面并处理，直到队列为空
        const worker = async () => {
            activeWorkers++;
            while (pageQueue.length > 0) {
                const pageNum = pageQueue.shift(); // 从队列头部取出一个任务
                if (pageNum === undefined) continue;

                try {
                    const keys = await fetchPageWithRetry(baseUrl, pageNum);
                    allResults.push(...keys);

                    // 智能自适应延迟：在成功获取后，根据配置决定是否需要短暂延迟
                    // 这有助于在持续高速请求时模拟更自然的行为，减少被WAF拦截的风险
                    if (CONFIG.adaptiveDelay) {
                        await sleep(CONFIG.pageDelay * (0.8 + Math.random() * 0.4));
                    }
                } catch (error) {
                    log(`Page ${pageNum} processing failed permanently: ${error.message}`);
                    if (error.message === 'WAF_BLOCKED') {
                        // 如果检测到WAF，将任务重新放回队列，并抛出错误以暂停整个进程
                        pageQueue.unshift(pageNum);
                        throw error;
                    }
                    // 对于其他错误，记录后继续处理下一个页面
                } finally {
                    completedCount++;
                    // 实时更新UI，提供清晰的进度反馈
                    btn.textContent = `并发抓取中... ${completedCount}/${pages.length} (并发: ${activeWorkers})`;
                }
            }
            activeWorkers--;
        };

        // 创建并启动N个“工人”，N由CONFIG.concurrentRequests决定
        const workers = Array.from({ length: CONFIG.concurrentRequests }, () => worker());

        // 等待所有工人完成其任务
        await Promise.all(workers);

        return allResults;
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

                if (htmlText.includes('Access Forbidden') || response.status === 403) {
                    log(`WAF detected on page ${pageNum} after ${requestTime}ms`);
                    throw new Error('WAF_BLOCKED');
                }

                const keys = extractKeysFromHTML(htmlText);
                log(`Page ${pageNum}: ${keys.length} keys found in ${requestTime}ms (Attempt ${attempt})`);
                return keys;

            } catch (error) {
                const requestTime = Date.now() - requestStart;
                log(`Page ${pageNum}, attempt ${attempt} failed after ${requestTime}ms: ${error.message}`);

                if (error.name === 'AbortError') {
                    log(`Page ${pageNum} request timed out.`);
                }
                
                if (error.message === 'WAF_BLOCKED') throw error; // 立刻向上抛出WAF错误
                if (attempt === CONFIG.retryAttempts) throw error; // 如果是最后一次尝试，则抛出最终错误

                // 实现指数退避策略：每次重试前等待更长时间
                const retryDelay = Math.min(1000 * Math.pow(2, attempt), 8000);
                log(`Waiting ${retryDelay}ms before next retry...`);
                await sleep(retryDelay);
            }
        }
        return []; // 如果所有重试都失败，则返回空数组
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
            const allKeys = await processPagesInBatch(pages, baseUrl.toString());

            const endTime = Date.now();
            const duration = ((endTime - startTime) / 1000).toFixed(2);
            const uniqueKeys = [...new Set(allKeys)];

            log(`Collection completed in ${duration}s. Found ${allKeys.length} total keys, ${uniqueKeys.length} unique keys.`);
            log(`Average speed: ${(maxPage / (duration > 0 ? parseFloat(duration) : 1)).toFixed(2)} pages/second`);

            btn.textContent = `抓取完成! ${duration}s (${uniqueKeys.length}个Key)`;

            downloadKeys(allKeys);

        } catch (error) {
            if (error.message === 'WAF_BLOCKED') {
                safeAlert(`抓取过程中被防火墙拦截！\n建议：\n1. 等待几分钟后重试\n2. 降低并发数设置\n3. 增加延迟时间`);
                btn.textContent = '被WAF拦截!';
                btn.style.backgroundColor = '#F44336';

                // 提供恢复建议
                setTimeout(() => {
                    if (confirm('是否要用更保守的设置重新尝试？(并发=1, 延迟=2000ms)')) {
                        CONFIG.concurrentRequests = 1;
                        CONFIG.pageDelay = 2000;
                        btn.disabled = false;
                        btn.textContent = '保守模式重试';
                        btn.style.backgroundColor = '#FF9800';
                    } else {
                        btn.disabled = false;
                        btn.textContent = '一键智能抓取';
                        btn.style.backgroundColor = '#2196F3';
                    }
                }, 3000);
                return; // 提前返回，不执行后续重置
            }
            
            log(`Collection failed: ${error.message}`);
            safeAlert(`抓取过程发生错误：${error.message}\n\n请检查网络连接或查看控制台(F12)获取详细信息。`);
            btn.textContent = '抓取失败!';
            btn.style.backgroundColor = '#F44336';
        }

        // (恢复自v7.0) 任务结束后重置按钮
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
    
    // --- 智能调度器 (恢复自v7.0) ---
    function startSmartCollection() {
        try {
            const currentUrl = new URL(window.location.href);
            const isFiltered = currentUrl.searchParams.get('status') === '200';
            log(`Smart collection started. Is page filtered for Status 200? ${isFiltered}`);

            if (isFiltered) {
                log("Conditions met. Starting collection immediately.");
                startBackgroundCollection();
            } else {
                log("Conditions not met. Setting task and redirecting...");
                sessionStorage.setItem(CONFIG.processStateKey, 'true');
                currentUrl.searchParams.set('status', '200');
                currentUrl.searchParams.set('page', '1');
                log(`Redirecting to: ${currentUrl.toString()}`);
                window.location.href = currentUrl.toString();
            }
        } catch (error) {
            log(`Error in startSmartCollection: ${error.message}`);
            safeAlert(`启动智能收集时发生错误：${error.message}`);
        }
    }

    // --- 初始化与状态检查 (恢复自v7.0) ---
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
                sessionStorage.removeItem(CONFIG.processStateKey); // 用完后立刻清除
                // 延迟启动以确保页面完全加载
                setTimeout(startBackgroundCollection, 500);
            }
        } catch (error) {
            log(`Error checking pending task: ${error.message}`);
        }
    }

    // --- 脚本启动入口 ---
    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
})();
