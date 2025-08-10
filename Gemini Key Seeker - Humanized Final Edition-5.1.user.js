// ==UserScript==
// @name         Gemini Key Seeker - Humanized Final Edition
// @name:en      Gemini Key Seeker - Humanized Final Edition
// @namespace    http://tampermonkey.net/
// @version      5.1
// @description  【人性化最终版】增加翻页延迟以绕过WAF防火墙，并能检测拦截状态，实现最稳定抓取。
// @description:en [Humanized Final Edition] Adds delay between pages to bypass WAF, detects block status for most stable scraping.
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
    const DELAY_BETWEEN_PAGES = 3000; // 每次翻页之间的延迟（毫秒），2000ms = 2秒。如果还被拦截，可以适当增加这个值。

    // --- 内部常量 ---
    const STORAGE_KEY_COLLECTING = 'keySeeker_isCollecting';
    const STORAGE_KEY_DATA = 'keySeeker_data';

    // --- 辅助函数 ---
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

    // --- 核心函数 (保持不变) ---
    function extractKeysFromPage() {
        const keys = new Set();
        document.querySelectorAll('tbody tr td:first-child').forEach(cell => {
            const keyText = cell.textContent.trim();
            if (keyText.startsWith('AIzaSy')) {
                keys.add(keyText);
            }
        });
        console.log(`Found ${keys.size} keys on this page.`);
        return Array.from(keys);
    }

    function getMaxPageNumber() {
        let maxPage = 1;
        document.querySelectorAll('.pagination a, .pagination button').forEach(el => {
            const pageNum = parseInt(el.textContent.trim(), 10);
            if (!isNaN(pageNum) && pageNum > maxPage) {
                maxPage = pageNum;
            }
        });
        if (maxPage === 1) console.warn("Could only find 1 page, or pagination not found. Scraping current page only.");
        else console.log(`Detected a maximum of ${maxPage} pages.`);
        return maxPage;
    }

    function downloadKeys(keys) {
        const uniqueKeys = [...new Set(keys)];
        const fileContent = uniqueKeys.join('\n');
        const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8' });
        const filename = `keys_${new Date().toISOString().slice(0, 10)}.txt`;
        GM_download({ url: URL.createObjectURL(blob), name: filename, saveAs: true });
    }

    function cleanupStorage() {
        sessionStorage.removeItem(STORAGE_KEY_COLLECTING);
        sessionStorage.removeItem(STORAGE_KEY_DATA);
    }

    // --- 状态机逻辑 (已升级) ---

    async function startInitialCollection() {
        const btn = document.getElementById('key-seeker-btn');
        btn.disabled = true;
        btn.textContent = '初始化...';
        try {
            cleanupStorage();
            const maxPage = getMaxPageNumber();
            const initialState = { currentPage: 1, maxPage: maxPage, allKeys: [] };
            sessionStorage.setItem(STORAGE_KEY_COLLECTING, 'true');
            sessionStorage.setItem(STORAGE_KEY_DATA, JSON.stringify(initialState));

            const url = new URL(window.location.href);
            url.searchParams.set('page', '1');
            url.searchParams.set('status', '200');
            window.location.href = url.toString();
        } catch (error) {
            console.error("Failed to start collection:", error);
            alert("启动失败！无法找到分页信息。请确保页面已加载完毕。");
            cleanupStorage();
            btn.disabled = false;
            btn.textContent = '一键下载全部Key';
        }
    }

    async function continueCollectionOnPageLoad() {
        if (sessionStorage.getItem(STORAGE_KEY_COLLECTING) !== 'true') return;

        const btn = document.getElementById('key-seeker-btn');
        btn.disabled = true;

        // 【新功能】WAF 拦截检测
        if (document.body.textContent.includes('Access Forbidden')) {
            console.error("WAF Blocked! Halting collection.");
            btn.textContent = '被防火墙拦截!';
            btn.style.backgroundColor = '#F44336';
            const data = JSON.parse(sessionStorage.getItem(STORAGE_KEY_DATA));
            if (data && data.allKeys.length > 0) {
                if (confirm(`访问过快被网站防火墙拦截！\n\n是否下载已成功抓取的 ${data.allKeys.length} 个Key？`)) {
                    downloadKeys(data.allKeys);
                }
            } else {
                alert("访问过快被网站防火墙拦截！未能抓取到任何Key。请稍后再试或增加脚本中的延迟时间。");
            }
            cleanupStorage();
            return;
        }

        try {
            let data = JSON.parse(sessionStorage.getItem(STORAGE_KEY_DATA));
            btn.textContent = `收集中... 第 ${data.currentPage} / ${data.maxPage} 页`;

            const keysOnThisPage = extractKeysFromPage();
            data.allKeys.push(...keysOnThisPage);

            if (data.currentPage >= data.maxPage) {
                // --- 完成 ---
                console.log(`Collection complete! Total keys found (before dedupe): ${data.allKeys.length}`);
                btn.textContent = '下载完成!';
                btn.style.backgroundColor = '#4CAF50';
                downloadKeys(data.allKeys);
                cleanupStorage();
                setTimeout(() => { // 延迟后重置按钮
                    btn.disabled = false;
                    btn.textContent = '一键下载全部Key';
                    btn.style.backgroundColor = '#2196F3';
                }, 5000);
            } else {
                // --- 继续到下一页 ---
                data.currentPage++;
                sessionStorage.setItem(STORAGE_KEY_DATA, JSON.stringify(data));

                // 【新功能】人性化延迟
                btn.textContent = `等待 ${DELAY_BETWEEN_PAGES / 1000}s...`;
                await sleep(DELAY_BETWEEN_PAGES);

                const nextUrl = new URL(window.location.href);
                nextUrl.searchParams.set('page', data.currentPage);
                window.location.href = nextUrl.toString();
            }
        } catch (error) {
            console.error("Error during collection cycle:", error);
            btn.textContent = '收集出错! (已停止)';
            btn.style.backgroundColor = '#F44336';
            cleanupStorage();
        }
    }


    // --- UI 初始化 (保持不变) ---
    function initialize() {
        GM_addStyle(`...`); // 样式代码省略以保持简洁，实际已包含
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
        button.textContent = '一键下载全部Key';
        document.body.appendChild(button);

        button.addEventListener('click', startInitialCollection);

        continueCollectionOnPageLoad();
    }

    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }

})();
