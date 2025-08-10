// ==UserScript==
// @name         【全自动】Gemini Key 更新部署器 - v8.6 兼容性修复版
// @name:en      [Fully Automatic] Gemini Key Updater & Deployer - v8.6 Compatibility Fix
// @namespace    http://tampermonkey.net/
// @version      8.6
// @description  【终极进化版】修复字符编码问题，优化错误处理机制，增强页面兼容性。一键抓取Key并在新标签页中自动登录指定网站，清空旧Key，粘贴新Key，完成部署。全程自动化，带重置功能。
// @description:en [Ultimate Evolution] Fixed encoding issues and enhanced compatibility. One-click scrape keys & auto-deploy with improved error handling.
// @author       You & AI Enhanced
// @match        https://geminikeyseeker.o0o.moe/*
// @match        https://chhsai.dpdns.org/*
// @match        https://chiangma.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=o0o.moe
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_openInTab
// @license      MIT
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // ===================================================================================
    // ---                           ⭐ 全局配置中心 ⭐                           ---
    // ===================================================================================
    const CONFIG = {
        sites: [
            {
                name: "Visual AI Mall",
                baseUrl: "https://chhsai.dpdns.org",
                adminPath: "/admin/channels",
                loginPath: "/login",
                username: "root",
                password: "96582666Ss",
                channelName: "Gemini",
                channelPriority: "104",
            },
            {
                name: "CHIANGMA",
                baseUrl: "https://chiangma.com",
                adminPath: "/admin/channels",
                loginPath: "/login",
                username: "root",
                password: "96582666Ss",
                channelName: "Gemini",
                channelPriority: "104",
            }
        ],
        seeker: {
            url: "https://geminikeyseeker.o0o.moe/",
            pageDelay: 2000,
        },
        stepDelay: 2000,
        storageKeys: {
            state: "AUTO_DEPLOYER_STATE_V86",
            keys: "AUTO_DEPLOYER_KEYS_V86",
        }
    };

    // ===================================================================================
    // ---                           🛠️ 核心辅助函数 🛠️                           ---
    // ===================================================================================
    const log = (message) => {
        try {
            console.log(`[AutoDeployer v8.6] ${new Date().toLocaleTimeString()} - ${message}`);
        } catch (e) {
            // 静默处理日志错误
        }
    };
    
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // 安全的字符串处理函数
    function safeString(str) {
        try {
            return String(str).replace(/[\u0000-\u001F\u007F-\u009F]/g, "");
        } catch (e) {
            return "Safe String Error";
        }
    }

    function waitForElement(selector, timeout = 10000, scope = document) {
        return new Promise((resolve, reject) => {
            const intervalTime = 100; 
            let timePassed = 0;
            const interval = setInterval(() => {
                try {
                    const element = scope.querySelector(selector);
                    if (element) {
                        clearInterval(interval); 
                        resolve(element);
                    } else if (timePassed > timeout) {
                        clearInterval(interval);
                        log(`Timeout waiting for element: ${selector}`);
                        reject(new Error(`Element ${selector} not found within ${timeout}ms`));
                    }
                    timePassed += intervalTime;
                } catch (e) {
                    clearInterval(interval);
                    reject(e);
                }
            }, intervalTime);
        });
    }

    // ===================================================================================
    // ---                    🎯 优化的输入模拟函数组 (Enhanced Input) 🎯                    ---
    // ===================================================================================

    async function setReactInputValue(element, value) {
        try {
            const lastValue = element.value;
            element.value = value;
            
            const event = new Event('input', { bubbles: true });
            event.simulated = true;
            
            const tracker = element._valueTracker;
            if (tracker) {
                tracker.setValue(lastValue);
            }
            
            element.dispatchEvent(event);
        } catch (e) {
            log(`React input error: ${e.message}`);
        }
    }

    async function fallbackInputMethod(element, text, clearFirst = true) {
        try {
            log("Using fallback input method (execCommand)...");
            
            element.focus();
            element.click();
            await sleep(100);
            
            if (clearFirst) {
                try {
                    document.execCommand('selectAll');
                    document.execCommand('delete');
                } catch (e) {
                    log("execCommand clear failed, using alternative");
                }
            }
            
            for (let char of text) {
                try {
                    document.execCommand('insertText', false, char);
                } catch (e) {
                    element.value += char;
                }
                await sleep(30);
            }
            
            return element.value === text;
        } catch (e) {
            log(`Fallback input error: ${e.message}`);
            return false;
        }
    }

    async function simulateTyping(element, text, clearFirst = true) {
        try {
            if (!element) {
                throw new Error("Input element does not exist");
            }
            
            log(`Starting input to element ${element.tagName}: "${safeString(text)}"`);
            
            element.focus();
            element.click();
            await sleep(200);
            
            if (clearFirst) {
                element.select();
                element.setSelectionRange(0, element.value.length);
                
                element.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true }));
                element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
                
                const oldValue = element.value;
                element.value = '';
                
                element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                element.dispatchEvent(new InputEvent('input', { 
                    bubbles: true, 
                    cancelable: true,
                    inputType: 'deleteContentBackward',
                    data: null 
                }));
                
                await sleep(200);
                log(`Value after clear: "${safeString(element.value)}"`);
            }
            
            for (let i = 0; i < text.length; i++) {
                const char = text[i];
                
                const keyboardEventOptions = { 
                    key: char, 
                    code: `Key${char.toUpperCase()}`,
                    keyCode: char.charCodeAt(0),
                    which: char.charCodeAt(0),
                    charCode: char.charCodeAt(0),
                    bubbles: true, 
                    cancelable: true 
                };
                
                element.dispatchEvent(new KeyboardEvent('keydown', keyboardEventOptions));
                element.dispatchEvent(new KeyboardEvent('keypress', keyboardEventOptions));
                
                const currentValue = element.value;
                element.value = currentValue + char;
                
                element.setSelectionRange(element.value.length, element.value.length);
                
                element.dispatchEvent(new InputEvent('input', { 
                    bubbles: true, 
                    cancelable: true,
                    inputType: 'insertText',
                    data: char,
                    isComposing: false
                }));
                
                element.dispatchEvent(new KeyboardEvent('keyup', keyboardEventOptions));
                
                await sleep(50);
                
                if (!element.value.endsWith(char)) {
                    log(`Warning: Character "${char}" may not be added correctly, current value: "${safeString(element.value)}"`);
                }
            }
            
            element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
            element.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true }));
            
            if (element._valueTracker) {
                element._valueTracker.setValue('');
            }
            
            const reactEvent = new Event('input', { bubbles: true });
            reactEvent.simulated = true;
            const tracker = element._valueTracker;
            if (tracker) {
                tracker.setValue('');
            }
            element.dispatchEvent(reactEvent);
            
            await sleep(100);
            
            const finalValue = element.value;
            log(`Input completed, target: "${safeString(text)}", actual: "${safeString(finalValue)}"`);
            
            if (finalValue !== text) {
                log("Value mismatch, trying force set...");
                
                const descriptor = Object.getOwnPropertyDescriptor(element, 'value') || 
                                  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value');
                
                if (descriptor && descriptor.set) {
                    descriptor.set.call(element, text);
                }
                
                element.dispatchEvent(new Event('input', { bubbles: true }));
                element.dispatchEvent(new Event('change', { bubbles: true }));
                
                log(`Value after force set: "${safeString(element.value)}"`);
            }
            
            return element.value === text;
        } catch (e) {
            log(`Simulate typing error: ${e.message}`);
            return false;
        }
    }

    async function ultimateInputSimulation(element, text, clearFirst = true) {
        try {
            log(`Starting ultimate input simulation: "${safeString(text)}"`);
            
            log("=== Input Debug Info ===");
            log(`Element type: ${element.tagName}, type: ${element.type}`);
            log(`Current value: "${safeString(element.value)}"`);
            log(`ReadOnly: ${element.readOnly}`);
            log(`Disabled: ${element.disabled}`);
            
            if (element._reactInternalFiber || element.__reactInternalInstance || element._reactInternalInstance) {
                log("Detected React component");
            }
            if (element.__vue__) {
                log("Detected Vue component");
            }
            
            // Method 1: Enhanced simulation
            try {
                let success = await simulateTyping(element, text, clearFirst);
                if (success) {
                    log("Method 1 (enhanced simulation) succeeded");
                    return true;
                }
            } catch (error) {
                log(`Method 1 failed: ${error.message}`);
            }
            
            await sleep(300);
            
            // Method 2: React specific
            try {
                if (clearFirst) {
                    await setReactInputValue(element, '');
                    await sleep(100);
                }
                await setReactInputValue(element, text);
                const success = element.value === text;
                if (success) {
                    log("Method 2 (React specific) succeeded");
                    return true;
                }
            } catch (error) {
                log(`Method 2 failed: ${error.message}`);
            }
            
            await sleep(300);
            
            // Method 3: Fallback (execCommand)
            try {
                const success = await fallbackInputMethod(element, text, clearFirst);
                if (success) {
                    log("Method 3 (execCommand) succeeded");
                    return true;
                }
            } catch (error) {
                log(`Method 3 failed: ${error.message}`);
            }
            
            // Method 4: Direct assignment with events
            log("Using final method (direct assignment)...");
            
            if (clearFirst) {
                element.value = '';
            }
            element.value = text;
            
            const events = ['input', 'change', 'keyup', 'keydown', 'keypress', 'blur', 'focus'];
            for (let eventType of events) {
                element.dispatchEvent(new Event(eventType, { bubbles: true }));
            }
            
            element.dispatchEvent(new InputEvent('input', {
                bubbles: true,
                cancelable: true,
                inputType: 'insertText',
                data: text
            }));
            
            if (typeof element.oninput === 'function') {
                element.oninput({ target: element, type: 'input' });
            }
            if (typeof element.onchange === 'function') {
                element.onchange({ target: element, type: 'change' });
            }
            
            const finalSuccess = element.value === text;
            log(`Final result: ${finalSuccess ? 'Success' : 'Failed'}, value: "${safeString(element.value)}"`);
            
            return finalSuccess;
        } catch (e) {
            log(`Ultimate input simulation error: ${e.message}`);
            return false;
        }
    }

    // ===================================================================================
    // ---                      🔍 安全的用户交互函数 🔍                      ---
    // ===================================================================================
    
    function safeConfirm(message, defaultResult = false) {
        try {
            return confirm(safeString(message));
        } catch (e) {
            log(`Confirm dialog error: ${e.message}`);
            return defaultResult;
        }
    }
    
    function safeAlert(message) {
        try {
            alert(safeString(message));
        } catch (e) {
            log(`Alert dialog error: ${e.message}`);
        }
    }

    async function verifyLoginCredentials(siteConfig, usernameInput, passwordInput) {
        try {
            log("=== Starting login verification ===");
            
            const actualUsername = usernameInput.value.trim();
            const actualPassword = passwordInput.value;
            const expectedUsername = siteConfig.username;
            const expectedPassword = siteConfig.password;
            
            log(`Site: ${siteConfig.name}`);
            log(`Expected username: "${expectedUsername}"`);
            log(`Actual username: "${actualUsername}"`);
            log(`Expected password length: ${expectedPassword.length}`);
            log(`Actual password length: ${actualPassword.length}`);
            
            const usernameMatch = actualUsername === expectedUsername;
            log(`Username match: ${usernameMatch ? 'OK' : 'FAIL'}`);
            
            const passwordMatch = actualPassword === expectedPassword;
            log(`Password match: ${passwordMatch ? 'OK' : 'FAIL'}`);
            
            const isValid = usernameMatch && passwordMatch;
            
            if (isValid) {
                log("Login credentials verification passed!");
                return true;
            } else {
                log("Login credentials verification failed!");
                
                let errorDetails = "Login verification failed. Issues found:\\n\\n";
                
                if (!usernameMatch) {
                    errorDetails += `• Username mismatch\\n  Expected: ${expectedUsername}\\n  Actual: ${actualUsername}\\n\\n`;
                }
                
                if (!passwordMatch) {
                    errorDetails += `• Password mismatch\\n  Expected length: ${expectedPassword.length}\\n  Actual length: ${actualPassword.length}\\n\\n`;
                }
                
                errorDetails += "Choose action:\\n";
                errorDetails += "• Click OK: Re-fill correct credentials\\n";
                errorDetails += "• Click Cancel: Manual correction";
                
                const shouldRetry = safeConfirm(errorDetails);
                
                if (shouldRetry) {
                    log("User chose to re-fill, starting re-input...");
                    
                    if (!usernameMatch) {
                        log("Re-filling username...");
                        const usernameSuccess = await ultimateInputSimulation(usernameInput, expectedUsername, true);
                        if (!usernameSuccess) {
                            log("Username re-fill failed");
                        }
                        await sleep(500);
                    }
                    
                    if (!passwordMatch) {
                        log("Re-filling password...");
                        const passwordSuccess = await ultimateInputSimulation(passwordInput, expectedPassword, true);
                        if (!passwordSuccess) {
                            log("Password re-fill failed");
                        }
                        await sleep(500);
                    }
                    
                    log("Re-fill completed, performing second verification...");
                    await sleep(1000);
                    return await verifyLoginCredentials(siteConfig, usernameInput, passwordInput);
                    
                } else {
                    log("User chose manual correction, waiting for manual operation...");
                    safeAlert("Please manually correct username and password, then click login.\\n\\nScript will continue monitoring login status.");
                    return false;
                }
            }
        } catch (e) {
            log(`Login verification error: ${e.message}`);
            return false;
        }
    }

    // ===================================================================================
    // ---                 ⚙️ 状态机与流程控制 (State & Flow Control) ⚙️                ---
    // ===================================================================================
    const setState = (newState) => {
        try {
            return GM_setValue(CONFIG.storageKeys.state, newState);
        } catch (e) {
            log(`setState error: ${e.message}`);
        }
    };
    
    const getState = () => {
        try {
            return GM_getValue(CONFIG.storageKeys.state, null);
        } catch (e) {
            log(`getState error: ${e.message}`);
            return null;
        }
    };
    
    const getKeys = () => {
        try {
            return GM_getValue(CONFIG.storageKeys.keys);
        } catch (e) {
            log(`getKeys error: ${e.message}`);
            return null;
        }
    };

    async function finishProcess(isError = false, keepTabOpen = false) {
        try {
            const message = isError ? "Process terminated due to error! Clearing state." : "All tasks completed! Clearing state.";
            log(message);
            
            if (window.location.href.startsWith(CONFIG.seeker.url)) {
                const btn = document.getElementById('auto-deploy-btn');
                if (btn && isError) {
                    btn.style.backgroundColor = '#F44336';
                    btn.textContent = 'Process error, please retry';
                    btn.disabled = false;
                }
            } else {
                if (!isError) {
                    safeAlert("All website keys have been updated! This tab will close in 5 seconds.");
                } else {
                    safeAlert("An error occurred and the process was terminated. Please check the console (F12) logs for details.\\nThis tab will remain open for debugging.");
                }
            }
            
            await GM_deleteValue(CONFIG.storageKeys.state);
            await GM_deleteValue(CONFIG.storageKeys.keys);

            if (!isError && !keepTabOpen && !window.location.href.startsWith(CONFIG.seeker.url)) {
                await sleep(5000);
                window.close();
            }
        } catch (e) {
            log(`finishProcess error: ${e.message}`);
        }
    }

    async function processNextSite(currentState) {
        try {
            const nextSiteIndex = currentState.siteIndex + 1;
            if (nextSiteIndex >= CONFIG.sites.length) {
                log("All sites deployment completed.");
                await finishProcess();
            } else {
                const nextSite = CONFIG.sites[nextSiteIndex];
                log(`Preparing next site: ${nextSite.name}`);
                await setState({ ...currentState, status: 'NAVIGATE_TO_LOGIN', siteIndex: nextSiteIndex });
                window.location.href = nextSite.baseUrl + nextSite.loginPath;
            }
        } catch (e) {
            log(`processNextSite error: ${e.message}`);
            await finishProcess(true, true);
        }
    }

    function addResetButton() {
        try {
            if (document.getElementById('auto-deploy-reset-btn')) return;
            
            GM_addStyle(`
                #auto-deploy-reset-btn { position: fixed; bottom: 10px; right: 10px; z-index: 19999; padding: 8px 12px; background-color: #F44336; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 12px; box-shadow: 0 2px 5px rgba(0,0,0,0.3); }
                #auto-deploy-reset-btn:hover { background-color: #d32f2f; }
            `);
            
            const button = document.createElement('button');
            button.id = 'auto-deploy-reset-btn';
            button.textContent = 'Force Reset Process';
            button.onclick = async () => {
                if (safeConfirm("Are you sure you want to force stop and reset the automation process?")) {
                    await finishProcess(true, true);
                    safeAlert("Process has been reset. You can close this page.");
                    button.remove();
                }
            };
            document.body.appendChild(button);
        } catch (e) {
            log(`addResetButton error: ${e.message}`);
        }
    }

    // ===================================================================================
    // ---                       📄 抓取Key模块 (Scraping Module) 📄                       ---
    // ===================================================================================
    async function scrapeAndStoreKeys() {
        const btn = document.getElementById('auto-deploy-btn');
        try {
            log("Starting key scraping...");
            btn.disabled = true;
            btn.style.backgroundColor = '#FF9800';
            btn.textContent = 'Scraping...';

            const currentUrl = new URL(window.location.href);
            if (currentUrl.searchParams.get('status') !== '200') {
                log("Page status is not 200, redirecting to filtered page...");
                currentUrl.searchParams.set('status', '200');
                currentUrl.searchParams.set('page', '1');
                await setState({ status: 'SCRAPING_PENDING' });
                window.location.href = currentUrl.toString();
                return;
            }

            const maxPageStr = document.querySelector('.pagination')?.textContent.match(/(\\d+)\\s*$/)?.[1];
            const maxPage = maxPageStr ? parseInt(maxPageStr, 10) : Math.max(...Array.from(document.querySelectorAll('.pagination a, .pagination button')).map(el => parseInt(el.textContent.trim())).filter(n => !isNaN(n)), 1);
            log(`Detected total pages: ${maxPage}`);
            let allKeys = new Set();
            
            async function scrapePage(pageNumber) {
                if (pageNumber === 1) {
                     Array.from(document.querySelectorAll('tbody tr td:first-child')).map(cell => cell.textContent.trim()).filter(key => key.startsWith('AIzaSy')).forEach(key => allKeys.add(key));
                } else {
                    currentUrl.searchParams.set('page', pageNumber);
                    const response = await fetch(currentUrl.toString());
                    const htmlText = await response.text();
                    const doc = new DOMParser().parseFromString(htmlText, 'text/html');
                    Array.from(doc.querySelectorAll('tbody tr td:first-child')).map(cell => cell.textContent.trim()).filter(key => key.startsWith('AIzaSy')).forEach(key => allKeys.add(key));
                }
            }
            
            await scrapePage(1);
            log(`Page 1 scan completed. Current total: ${allKeys.size}`);

            for (let i = 2; i <= maxPage; i++) {
                btn.textContent = `Scraping... ${i} / ${maxPage}`;
                await scrapePage(i);
                log(`Page ${i} scan completed. Current total: ${allKeys.size}`);
                await sleep(CONFIG.seeker.pageDelay);
            }

            const uniqueKeys = Array.from(allKeys);
            if (uniqueKeys.length === 0) throw new Error("No keys were scraped.");

            log(`Scraping completed! Found ${uniqueKeys.length} unique keys.`);
            await GM_setValue(CONFIG.storageKeys.keys, uniqueKeys.join('\\n'));
            log("Keys saved. Preparing to start deployment process in new tab...");
            btn.style.backgroundColor = '#4CAF50';
            btn.textContent = 'Scraping completed';

            await setState({ status: 'NAVIGATE_TO_LOGIN', siteIndex: 0 });
            GM_openInTab(CONFIG.sites[0].baseUrl + CONFIG.sites[0].loginPath, { active: true });

        } catch (error) {
            log(`Scraping process error: ${error.message}`);
            safeAlert(`Scraping process error: ${error.message}\\nPlease check F12 console for details.`);
            btn.style.backgroundColor = '#F44336';
            btn.textContent = 'Scraping failed, please retry';
            btn.disabled = false;
            await finishProcess(true, true);
        }
    }

    // ===================================================================================
    // ---                     🎯 部署模块 (Deployment Module) 🎯                      ---
    // ===================================================================================
    async function deployerLogic(currentState, allKeys) {
        try {
            log("Deployer module started.");
            addResetButton();

            const siteConfig = CONFIG.sites[currentState.siteIndex];
            const currentPath = window.location.pathname;

            // Step 1: Login or skip
            if (currentPath.includes(siteConfig.loginPath) || currentPath === '/login') {
                log(`On ${siteConfig.name} login page.`);

                await sleep(2000);

                const hasUserMenu = document.querySelector('.ant-layout-header .ant-dropdown') || 
                                   document.querySelector('.ant-layout-header .ant-avatar') ||
                                   document.querySelector('[role="menuitem"]') || 
                                   document.querySelector('.ant-menu-item');
                
                const hasLoginForm = document.querySelector('input[type="password"]') || 
                                    document.querySelector('input[name="password"]') ||
                                    document.querySelector('button[type="submit"]');

                if (hasUserMenu && !hasLoginForm) {
                    log("Already logged in, redirecting to channel management page.");
                    await setState({ ...currentState, status: 'DEPLOYING_KEYS' });
                    window.location.href = siteConfig.baseUrl + siteConfig.adminPath;
                    return;
                }

                log("Need to login, starting auto-fill and login...");
                
                let usernameInput, passwordInput, loginButton;
                
                const usernameSelectors = [
                    "input[name='username']",
                    "input[name='email']", 
                    "input[name='account']",
                    "input[placeholder*='用户名']",
                    "input[placeholder*='邮箱']",
                    "input[placeholder*='账号']",
                    "input[type='text']:not([readonly]):not([disabled])"
                ];
                
                for (const selector of usernameSelectors) {
                    usernameInput = document.querySelector(selector);
                    if (usernameInput) {
                        log(`Found username input: ${selector}`);
                        break;
                    }
                }
                
                const passwordSelectors = [
                    "input[name='password']",
                    "input[type='password']",
                    "input[placeholder*='密码']"
                ];
                
                for (const selector of passwordSelectors) {
                    passwordInput = document.querySelector(selector);
                    if (passwordInput) {
                        log(`Found password input: ${selector}`);
                        break;
                    }
                }
                
                const buttonSelectors = [
                    "button[type='submit']",
                    ".ant-btn-primary",
                    "input[type='submit']"
                ];
                
                for (const selector of buttonSelectors) {
                    loginButton = document.querySelector(selector);
                    if (loginButton) {
                        log(`Found login button: ${selector}`);
                        break;
                    }
                }
                
                if (!loginButton) {
                    const allButtons = document.querySelectorAll('button, input[type="submit"]');
                    if (allButtons.length > 0) {
                        loginButton = allButtons[allButtons.length - 1];
                        log("Using last button as login button");
                    }
                }

                if (!usernameInput || !passwordInput || !loginButton) {
                    log("=== Debug Info ===");
                    log(`Username input: ${usernameInput ? 'Found' : 'Not found'}`);
                    log(`Password input: ${passwordInput ? 'Found' : 'Not found'}`);
                    log(`Login button: ${loginButton ? 'Found' : 'Not found'}`);
                    
                    const allInputs = document.querySelectorAll('input');
                    log(`Total ${allInputs.length} inputs on page:`);
                    allInputs.forEach((input, index) => {
                        log(`  Input${index}: type="${input.type}", name="${input.name}", placeholder="${input.placeholder}", id="${input.id}"`);
                    });
                    
                    throw new Error("Cannot find complete login form elements");
                }

                log("Starting username fill...");
                const usernameSuccess = await ultimateInputSimulation(usernameInput, siteConfig.username);
                if (!usernameSuccess) {
                    log("Username fill failed, but continuing...");
                }
                
                await sleep(500);
                
                log("Starting password fill...");
                const passwordSuccess = await ultimateInputSimulation(passwordInput, siteConfig.password);
                if (!passwordSuccess) {
                    log("Password fill failed, but continuing...");
                }
                
                await sleep(1000);
                
                log(`Verifying fill results - username: "${usernameInput.value}", password length: ${passwordInput.value.length}`);
                
                // Login verification step
                log("Executing pre-login verification...");
                const isValid = await verifyLoginCredentials(siteConfig, usernameInput, passwordInput);
                
                if (!isValid) {
                    log("Waiting for user manual correction of login info...");
                    
                    let verificationPassed = false;
                    let attemptCount = 0;
                    const maxAttempts = 30;
                    
                    while (!verificationPassed && attemptCount < maxAttempts) {
                        await sleep(10000);
                        attemptCount++;
                        
                        log(`Check ${attemptCount} for user correction...`);
                        
                        const currentValid = await verifyLoginCredentials(siteConfig, usernameInput, passwordInput);
                        if (currentValid) {
                            verificationPassed = true;
                            log("User correction completed, verification passed!");
                            break;
                        }
                        
                        if (attemptCount >= maxAttempts - 3) {
                            const shouldContinue = safeConfirm(
                                `Verification still failed, script will auto-terminate in ${maxAttempts - attemptCount} checks.\\n\\n` +
                                `Current status:\\n` +
                                `Username: ${usernameInput.value}\\n` +
                                `Password length: ${passwordInput.value.length}\\n\\n` +
                                `Click OK to continue waiting, Cancel to terminate script.`
                            );
                            
                            if (!shouldContinue) {
                                log("User chose to terminate script");
                                await finishProcess(true, true);
                                return;
                            }
                        }
                    }
                    
                    if (!verificationPassed) {
                        log("Wait timeout, login verification failed");
                        safeAlert("Wait timeout, login info verification failed. Script will terminate.\\nPlease check if username and password are correct.");
                        await finishProcess(true, true);
                        return;
                    }
                }
                
                if (!usernameInput.value || passwordInput.value.length === 0) {
                    const shouldContinue = safeConfirm(
                        `Detected input may have failed:\\nUsername: "${usernameInput.value}"\\nPassword length: ${passwordInput.value.length}\\n\\nContinue to try login? Click Cancel to input manually.`
                    );
                    
                    if (!shouldContinue) {
                        safeAlert("Please manually fill username and password, ensure consistency with config, then click login. Script will continue after login.");
                        return;
                    }
                }
                
                await setState({ ...currentState, status: 'DEPLOYING_KEYS' });
                
                log("Verification passed, clicking login button...");
                loginButton.click();
                
                await sleep(4000);
                return;
            }

            // Step 2: Deploy keys
            if (currentPath.includes(siteConfig.adminPath) || currentPath.includes('/admin')) {
                log(`Entered ${siteConfig.name} channel management page, preparing to deploy keys.`);

                let tbody;
                try {
                    tbody = await waitForElement('.ant-table-tbody', 15000);
                } catch (error) {
                    try {
                        tbody = await waitForElement('table tbody', 5000);
                    } catch (error2) {
                        tbody = await waitForElement('[class*="table"] tbody', 5000);
                    }
                }
                
                const rows = tbody.querySelectorAll('tr');
                let targetRow = null;

                log(`Found ${rows.length} rows, searching for channel "${siteConfig.channelName}"...`);
                
                for (const row of rows) {
                    const cells = row.querySelectorAll('td');
                    const rowText = Array.from(cells).map(cell => cell.textContent.trim()).join(' | ');
                    log(`Checking row: ${rowText}`);
                    
                    for (const cell of cells) {
                        if (cell.textContent.trim() === siteConfig.channelName) {
                            targetRow = row;
                            log(`Found target channel: ${siteConfig.channelName}`);
                            break;
                        }
                    }
                    if (targetRow) break;
                }

                if (!targetRow) {
                    log("Target channel not found, printing all row contents for debugging:");
                    rows.forEach((row, index) => {
                        const cells = row.querySelectorAll('td');
                        const rowData = Array.from(cells).map(cell => cell.textContent.trim()).join(' | ');
                        log(`Row ${index + 1}: ${rowData}`);
                    });
                    throw new Error(`Cannot find channel named "${siteConfig.channelName}".`);
                }

                log("Looking for edit button...");
                let editButton = targetRow.querySelector('button.ant-btn-link:first-of-type') || 
                                targetRow.querySelector('button:contains("编辑")') ||
                                targetRow.querySelector('button:contains("Edit")') ||
                                targetRow.querySelector('a[href*="edit"]') ||
                                targetRow.querySelector('button.ant-btn:first-of-type') ||
                                targetRow.querySelector('button:first-of-type');
                
                if (!editButton) {
                    const allButtons = targetRow.querySelectorAll('button, a[href]');
                    if (allButtons.length > 0) {
                        editButton = allButtons[0];
                        log("Using first clickable element as edit button");
                    }
                }
                
                if (!editButton) {
                    const allClickable = targetRow.querySelectorAll('button, a');
                    log(`Found ${allClickable.length} clickable elements in target row:`);
                    allClickable.forEach((btn, index) => {
                        log(`Element${index}: ${btn.tagName}, text="${btn.textContent.trim()}", class="${btn.className}"`);
                    });
                    throw new Error("Cannot find edit button.");
                }
                
                log("Clicking edit button...");
                editButton.click();

                const modal = await waitForElement('.ant-modal-content', 10000);
                log("Edit window opened, looking for form elements...");

                const keysTextarea = await waitForElement("textarea[placeholder*='一行一个'], textarea[placeholder*='key'], textarea", 5000, modal);
                const priorityInput = await waitForElement("input[id='priority'], input[name='priority'], input[placeholder*='优先级']", 5000, modal);
                const submitButton = modal.querySelector('.ant-modal-footer button.ant-btn-primary') || 
                                   modal.querySelector('button[type="submit"]') ||
                                   modal.querySelector('.ant-btn-primary');

                if (!keysTextarea || !priorityInput || !submitButton) {
                    log("Form element search results:");
                    log(`Keys textarea: ${keysTextarea ? 'Found' : 'Not found'}`);
                    log(`Priority input: ${priorityInput ? 'Found' : 'Not found'}`);
                    log(`Submit button: ${submitButton ? 'Found' : 'Not found'}`);
                    throw new Error("Cannot find necessary input boxes or submit button in edit window.");
                }

                log("Filling keys data...");
                const keysSuccess = await ultimateInputSimulation(keysTextarea, allKeys);
                if (!keysSuccess) {
                    log("Keys fill may have failed, but continuing...");
                }
                await sleep(500);

                log(`Filling priority: ${siteConfig.channelPriority}`);
                const prioritySuccess = await ultimateInputSimulation(priorityInput, siteConfig.channelPriority);
                if (!prioritySuccess) {
                    log("Priority fill may have failed, but continuing...");
                }
                await sleep(500);

                log("=== Fill Result Verification ===");
                log(`Keys textarea content length: ${keysTextarea.value.length}`);
                log(`Priority input content: "${priorityInput.value}"`);
                
                if (keysTextarea.value.length === 0) {
                    const shouldContinue = safeConfirm("Detected keys data may have failed to fill, continue to submit? Click Cancel to manually fill data.");
                    if (!shouldContinue) {
                        safeAlert("Please manually fill keys data, then click submit button.");
                        return;
                    }
                }

                log("Submitting changes...");
                submitButton.click();

                try {
                    await waitForElement(".ant-message-success", 10000);
                    log(`Site ${siteConfig.name} key deployment successful!`);
                } catch (error) {
                    log("No success message detected, waiting for page response...");
                    await sleep(2000);
                    
                    const errorMsg = document.querySelector('.ant-message-error');
                    if (errorMsg) {
                        log(`Detected error message: ${errorMsg.textContent}`);
                        throw new Error(`Deployment failed: ${errorMsg.textContent}`);
                    }
                    
                    log("No clear success/failure message detected, assuming operation successful and continuing...");
                }

                await sleep(CONFIG.stepDelay);
                await processNextSite(currentState);
            }

        } catch (error) {
            log(`Error occurred during ${siteConfig.name} deployment: ${error.message}`);
            console.error("Detailed error info:", error);
            
            const shouldRetry = safeConfirm(`Error occurred during ${siteConfig.name} deployment:\\n${error.message}\\n\\nClick OK to skip this site and continue to next, Cancel to terminate entire process.`);
            
            if (shouldRetry && currentState.siteIndex + 1 < CONFIG.sites.length) {
                log("User chose to skip current site, continuing to next...");
                await processNextSite(currentState);
            } else {
                await finishProcess(true, true);
            }
        }
    }

    // ===================================================================================
    // ---                      🚀 脚本主入口 (Main Entry) 🚀                      ---
    // ===================================================================================
    async function main() {
        try {
            const currentUrl = window.location.href;
            log(`Script loaded on page: ${currentUrl}`);

            const state = await getState();
            log(state ? `Current state: ${JSON.stringify(state)}` : "No active state currently.");

            if (currentUrl.startsWith(CONFIG.seeker.url)) {
                log("Starting button injection scout...");
                const injectionInterval = setInterval(() => {
                    if (document.body && !document.getElementById('auto-deploy-btn')) {
                        log("Construction environment ready, injecting button!");

                        clearInterval(injectionInterval);

                        GM_addStyle(`
                            #auto-deploy-btn { position: fixed; top: 10px; right: 10px; z-index: 9999; padding: 12px 20px; background-color: #4CAF50; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: bold; box-shadow: 0 4px 12px rgba(0,0,0,0.2); transition: all 0.3s ease; }
                            #auto-deploy-btn:hover:not(:disabled) { background-color: #45a049; transform: translateY(-2px); }
                            #auto-deploy-btn:disabled { background-color: #cccccc; cursor: not-allowed; transform: none; }
                        `);

                        const button = document.createElement('button');
                        button.id = 'auto-deploy-btn';
                        button.textContent = '🚀 One-click Scrape & Deploy Keys';
                        button.onclick = scrapeAndStoreKeys;
                        document.body.appendChild(button);
                        log("Scrape button successfully injected!");
                    }
                }, 200);

                setTimeout(() => clearInterval(injectionInterval), 10000);

                if (state && state.status === 'SCRAPING_PENDING') {
                    log("Resuming scrape process...");
                    await GM_deleteValue(CONFIG.storageKeys.state);
                    await sleep(1000);
                    scrapeAndStoreKeys();
                }

            } else if (state && state.siteIndex < CONFIG.sites.length) {

                const siteConfig = CONFIG.sites[state.siteIndex];
                if (currentUrl.startsWith(siteConfig.baseUrl)) {
                    const keys = await getKeys();
                    if (!keys) {
                        await finishProcess(true, true);
                        safeAlert("Error: State exists but cannot find saved keys. Process terminated.");
                        return;
                    }
                    log(`Starting deployment logic on ${siteConfig.name}...`);
                    await deployerLogic(state, keys);
                } else {
                    log(`URL does not match expected site: ${siteConfig.baseUrl}. Current URL: ${currentUrl}`);
                    log("May be redirect issue, showing reset button.");
                    addResetButton();
                }
            } else if (state) {
                log("Detected abnormal state, showing reset button.");
                addResetButton();
            } else {
                log("No active state, script on standby.");
            }
        } catch (e) {
            log(`Main function error: ${e.message}`);
            console.error("Main function detailed error:", e);
            await finishProcess(true, true);
        }
    }
    
    // ===================================================================================
    // ---                      ✅ 执行入口 (Execution) ✅                      ---
    // ===================================================================================
    function initializeScript() {
        try {
            log("Page loading completed, main script starting.");
            main().catch(err => {
                console.error("[AutoDeployer v8.6] Main process uncaught critical error:", err);
                log(`Main process uncaught critical error: ${err.message}`);
                finishProcess(true, true); 
            });
        } catch (e) {
            log(`Initialize script error: ${e.message}`);
        }
    }

    if (document.readyState === 'complete') {
        setTimeout(initializeScript, 100);
    } else {
        window.addEventListener('load', initializeScript);
        
        setTimeout(() => {
            if (document.readyState === 'complete') {
                initializeScript();
            }
        }, 2000);
    }

})();

// --- SCRIPT END --- 
// Version 8.6 - Compatibility Fix Edition
// Main improvements:
// 1. Fixed character encoding issues causing script crash
// 2. Enhanced error handling with try-catch blocks
// 3. Safe string processing functions
// 4. Safe user interaction dialogs
// 5. Better error logging and debugging
// 6. Improved script initialization reliability
// 7. Enhanced compatibility with different page environments
// 8. Maintained all original functionality and variables