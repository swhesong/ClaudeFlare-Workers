// ==UserScript==
// @name         Gemini Key Seeker - v7.0 Final Edition
// @name:en      Gemini Key Seeker - v7.0 Final Edition
// @namespace    http://tampermonkey.net/
// @version      7.0
// @description  【终极智能版】一键完成所有操作！自动筛选"Status: 200"，然后使用后台(AJAX)模式进行抓取，无需任何手动干预。
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
    const DELAY_BETWEEN_PAGES = 3000; // 每次后台请求的延迟（毫秒）。
    const PROCESS_STATE_KEY = 'keySeeker_pendingTask'; // 用于跨页面通信的“记忆”键。

    // --- 辅助函数 ---
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

    // --- 核心函数 (与v6.0相同) ---
    function extractKeysFromHTML(htmlText) {
        const keys = new Set();
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, 'text/html');
        doc.querySelectorAll('tbody tr td:first-child').forEach(cell => {
            const keyText = cell.textContent.trim();
            if (keyText.startsWith('AIzaSy')) {
                keys.add(keyText);
            }
        });
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
        const uniqueKeys = [...new Set(keys)];
        if (uniqueKeys.length === 0) {
            alert("任务完成，但未能抓取到任何Key。");
            return;
        }
        const fileContent = uniqueKeys.join('\n');
        const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8' });
        const filename = `keys_${new Date().toISOString().slice(0, 10)}.txt`;
        GM_download({ url: URL.createObjectURL(blob), name: filename, saveAs: true });
        alert(`抓取完成！共找到 ${uniqueKeys.length} 个唯一的Key。已开始下载。`);
    }

    // --- 后台抓取引擎 ---
    async function startBackgroundCollection() {
        const btn = document.getElementById('key-seeker-btn');
        btn.disabled = true;

        const maxPage = getMaxPageNumber();
        console.log(`Starting background collection for ${maxPage} pages.`);

        const allKeys = [];
        const baseUrl = new URL(window.location.href);

        for (let i = 1; i <= maxPage; i++) {
            btn.textContent = `抓取中... ${i} / ${maxPage}`;
            baseUrl.searchParams.set('page', i);

            try {
                const response = await fetch(baseUrl.toString());
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                const htmlText = await response.text();

                if (htmlText.includes('Access Forbidden')) {
                    alert(`在抓取第 ${i} 页时被防火墙拦截！抓取已停止。您可以尝试下载已抓取到的数据。`);
                    btn.textContent = '被WAF拦截!'; btn.style.backgroundColor = '#F44336';
                    break;
                }

                const keysOnPage = extractKeysFromHTML(htmlText);
                allKeys.push(...keysOnPage);
                console.log(`Page ${i}: Found ${keysOnPage.length} keys.`);

                if (i < maxPage) {
                    btn.textContent = `等待 ${DELAY_BETWEEN_PAGES / 1000}s...`;
                    await sleep(DELAY_BETWEEN_PAGES);
                }
            } catch (error) {
                console.error(`Failed to fetch page ${i}:`, error);
                alert(`抓取第 ${i} 页时发生网络错误！抓取已停止。`);
                btn.textContent = '抓取失败!'; btn.style.backgroundColor = '#F44336';
                break;
            }
        }

        downloadKeys(allKeys);
        setTimeout(() => {
            btn.disabled = false;
            btn.textContent = '一键智能抓取';
            btn.style.backgroundColor = '#2196F3';
        }, 3000);
    }

    // --- 全新的智能调度器 ---
    function startSmartCollection() {
        const currentUrl = new URL(window.location.href);
        const isFiltered = currentUrl.searchParams.get('status') === '200';

        if (isFiltered) {
            // 条件已满足，直接开始抓取
            console.log("Status is already 200. Starting collection immediately.");
            startBackgroundCollection();
        } else {
            // 条件不满足，设置标记并跳转
            console.log("Status is not 200. Setting task and redirecting...");
            sessionStorage.setItem(PROCESS_STATE_KEY, 'true'); // 设置“记忆”
            currentUrl.searchParams.set('status', '200');
            currentUrl.searchParams.set('page', '1'); // 确保从第一页开始
            window.location.href = currentUrl.toString();
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
        if (sessionStorage.getItem(PROCESS_STATE_KEY) === 'true') {
            console.log("Pending task found on page load. Starting collection...");
            sessionStorage.removeItem(PROCESS_STATE_KEY); // 用完后立刻清除“记忆”
            startBackgroundCollection(); // 自动执行抓取
        }
    }

    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
})();
