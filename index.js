  /**
   * Claude API 代理服务 - Cloudflare Workers
   * 优化版本：模块化设计、统一错误处理、缓存优化、安全加固
   * 
   * @author Louism8reise
   * @version 2.0.0
   */

  // ================================
  // 配置常量模块
  // ================================

  /**
   * 应用配置常量
   * @readonly
   */
  const CONFIG = {
    CACHE_TTL: 300,
    VALID_KEY_TTL: 3600,
    ADMIN_PASSWORD: 'xxxxxxxxxx',
    CONVERSATION_CONTEXT_TTL: 7200,
    ITEMS_PER_PAGE: 10,
    SESSION_KEY_PREFIX: 'sk-ant-sid01-',
    MAX_RETRY_ATTEMPTS: 10, // 新增：最大重试次数
    AUTO_SWITCH_ENABLED: true, // 新增：是否启用自动切换
    USER_AGENT: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', // 新增
    CONTEXT_MANAGEMENT: {
      ENABLED: true,                    // 是否启用上下文管理
      MAX_CONTEXT_MESSAGES: 50,        // 最大上下文消息数
      AUTO_CLEANUP_DAYS: 7,           // 自动清理天数
      MERGE_DUPLICATE_MESSAGES: true,   // 是否合并重复消息
      SEAMLESS_SWITCH_ENABLED: true,        // 启用无缝切换
      PRESERVE_CONVERSATION_STATE: true,    // 保持对话状态
      CONTEXT_SWITCH_TIMEOUT: 30000,        // 切换超时时间(ms)
      MAX_CONTEXT_RESTORE_ATTEMPTS: 10       // 最大上下文恢复尝试次数
    },
    AUTO_SWITCH: {
      ENABLED: true,                   // 自动切换开关
      MAX_RETRY_ATTEMPTS: 10,          // 最大重试次数
      RETRY_DELAY_MS: 1000,           // 重试延迟
      SMART_ERROR_DETECTION: true     // 智能错误检测
    },

    API_ENDPOINTS: {
      CLAUDE_OFFICIAL: 'https://api.claude.ai/api/organizations',
      CLAUDE_API: 'https://api.claude.ai',
      FUCLAUDE_AUTH: 'https://demo.xxxx.com/api/auth/session',
      FUCLAUDE_MESSAGES: 'https://demo.xxxx.com/v1/messages',
      FUCLAUDE_LOGIN: 'https://demo.xxxx.com/login_token'
    },
    KV_KEYS: {
      SESSION_KEYS_LIST: 'session_keys_list',
      ADMIN_SESSION_KEYS_LIST: 'admin_session_keys_list',
      VALID_KEY: 'valid_key',
      CONVERSATION_CONTEXT: 'conversation_context_' // 新增：会话上下文前缀
    }
  }

  /**
   * HTTP状态码常量
   * @readonly
   */
  const HTTP_STATUS = {
    OK: 200,
    REDIRECT: 302,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    METHOD_NOT_ALLOWED: 405,
    TOO_MANY_REQUESTS: 429,
    INTERNAL_SERVER_ERROR: 500,
    SERVICE_UNAVAILABLE: 503
  }

  // ================================
  // 工具函数模块
  // ================================

  /**
   * 统一日志记录器
   * @namespace Logger
   */
  const Logger = {
  /**
   * 记录信息日志
   * @param {string} message - 日志消息
   * @param {any} data - 附加数据
   */
  info: (message, data = null) => {
    console.log(`[INFO] ${message}`, data || '')
  },

  /**
   * 记录错误日志
   * @param {string} message - 错误消息
   * @param {Error|any} error - 错误对象
   */
  error: (message, error = null) => {
    console.error(`[ERROR] ${message}`, error || '')
  },

  /**
   * 记录警告日志
   * @param {string} message - 警告消息
   * @param {any} data - 附加数据
   */
  warn: (message, data = null) => {
    console.warn(`[WARN] ${message}`, data || '')
  }
}

  /**
   * 输入验证工具
   * @namespace Validator
   */
  const Validator = {
  /**
   * 验证Session Key格式
   * @param {string} key - 待验证的Key
   * @returns {boolean} 是否有效
   */

  isValidSessionKeyFormat: (key) => {
    return typeof key === 'string' && 
           key.length > 20 && // 增加最小长度验证
           key.startsWith(CONFIG.SESSION_KEY_PREFIX) &&
           /^[a-zA-Z0-9\-_\.]+$/.test(key) // 增加字符格式验证
  },
  /**
   * 验证分页参数
   * @param {string|number} page - 页码
   * @param {number} maxPage - 最大页码
   * @returns {number} 有效的页码
   */

  validatePageNumber: (page, maxPage = 1000) => {
    const pageNum = parseInt(page, 10)
    if (isNaN(pageNum) || pageNum < 1) return 1
    return pageNum > maxPage ? maxPage : pageNum
  },

  /**
   * 清理用户输入的Keys
   * @param {string} input - 用户输入
   * @returns {string[]} 清理后的Key数组
   */
  sanitizeKeysInput: (input) => {
    if (!input || typeof input !== 'string') return []
    
    return input
      .split('\n')
      .map(k => k.trim())
      .filter(k => k && Validator.isValidSessionKeyFormat(k))
  }
}

  /**
   * 字符串工具
   * @namespace StringUtils
   */
  const StringUtils = {
  /**
   * 截断Key显示
   * @param {string} key - 完整Key
   * @param {number} prefixLength - 前缀长度
   * @param {number} suffixLength - 后缀长度
   * @returns {string} 截断后的Key
   */
  truncateKey: (key, prefixLength = 15, suffixLength = 8) => {
    if (!key || key.length <= prefixLength + suffixLength + 3) return key || ''
    return `${key.substring(0, prefixLength)}...${key.substring(key.length - suffixLength)}`
  },

  /**
   * HTML转义
   * @param {string} str - 待转义字符串
   * @returns {string} 转义后的字符串
   */
  escapeHtml: (str) => {
    if (!str) return ''
    const escapeMap = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }
    return str.replace(/[&<>"']/g, match => escapeMap[match])
  }
}

  // ================================
  // 错误处理模块
  // ================================

/**
 * 自定义错误类
 */
class AppError extends Error {
  /**
   * @param {string} message - 错误消息
   * @param {number} statusCode - HTTP状态码
   * @param {string} type - 错误类型
   */
  constructor(message, statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR, type = 'GENERAL_ERROR') {
    super(message)
    this.name = 'AppError'
    this.statusCode = statusCode
    this.type = type
  }
}

  /**
   * 统一错误处理器
   * @namespace ErrorHandler
   */
  const ErrorHandler = {
  /**
   * 创建错误响应
   * @param {Error|AppError} error - 错误对象
   * @param {boolean} isJsonResponse - 是否返回JSON格式
   * @returns {Response} 错误响应
   */
  createErrorResponse: (error, isJsonResponse = false) => {
    const statusCode = error.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR
    const message = error.message || 'Internal Server Error'
    
    Logger.error('Request failed', { 
      message, 
      statusCode, 
      type: error.type || 'UNKNOWN',
      stack: error.stack 
    })

    if (isJsonResponse) {
      return new Response(JSON.stringify({
        error: {
          type: error.type || 'INTERNAL_ERROR',
          message: message
        }
      }), {
        status: statusCode,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    return new Response(
      `<h1>错误 ${statusCode}</h1><p>${message}</p><p><a href="/api">返回管理面板</a></p>`,
      {
        status: statusCode,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      }
    )
  },

  /**
   * 包装异步函数，统一处理错误
   * @param {Function} fn - 异步函数
   * @param {boolean} isJsonResponse - 是否返回JSON格式
   * @returns {Function} 包装后的函数
   */
  asyncWrapper: (fn, isJsonResponse = false) => {
    return async (...args) => {
      try {
        return await fn(...args)
      } catch (error) {
        return ErrorHandler.createErrorResponse(error, isJsonResponse)
      }
    }
  }
}

  // ================================
  // 存储访问模块
  // ================================

  /**
   * KV存储访问层
   * @namespace Storage
   */
  const Storage = {
  // KV 存储实例，将在主函数中初始化
  KV: null,
  // 内存缓存
  _cache: new Map(),
  _cacheTimestamps: new Map(),
  _maxCacheSize: 1000, // 最大缓存条目数
  _isCleaningCache: false,
  /**
   * 检查缓存是否有效
   * @param {string} key - 缓存键
   * @returns {boolean} 是否有效
   */
  _isCacheValid: (key) => {
    const timestamp = Storage._cacheTimestamps.get(key)
    if (!timestamp) return false
    return (Date.now() - timestamp) < (CONFIG.CACHE_TTL * 1000)
  },
  /**
   * 清理过期缓存
   */
  _cleanupExpiredCache: () => {
    const now = Date.now()
    const ttlMs = CONFIG.CACHE_TTL * 1000
    // 只在缓存达到一定数量时才进行清理
    if (Storage._cache.size < 50) {
      return
    }
    // 防止并发清理
    if (Storage._isCleaningCache) {
      return
    }
    Storage._isCleaningCache = true
  
    try {
    const keysToDelete = []
    // 限制单次清理的数量，避免性能问题
    let deleteCount = 0
    const maxDeletePerCleanup = Math.min(100, Math.floor(Storage._cache.size * 0.1)) // 最多清理10%
    for (const [key, timestamp] of Storage._cacheTimestamps.entries()) {
      if (now - timestamp > ttlMs) {
        keysToDelete.push(key)
        deleteCount++
        if (deleteCount >= maxDeletePerCleanup) {
          break
        }
      }
    }
    // 批量删除以提高性能
    if (keysToDelete.length > 0) {
      keysToDelete.forEach(key => {
          Storage._cache.delete(key)
          Storage._cacheTimestamps.delete(key)
      })
      Logger.info(`Cleaned up ${keysToDelete.length} expired cache entries`)
      }
    } finally {
      Storage._isCleaningCache = false
    }
  },
  /**
   * 设置缓存
   * @param {string} key - 缓存键
   * @param {any} value - 缓存值
   */
  _setCache: (key, value) => {
    // 清理过期缓存
    Storage._cleanupExpiredCache()
    
    // 如果缓存已满，删除最旧的条目
    if (Storage._cache.size >= Storage._maxCacheSize) {
      // 先清理过期缓存
      Storage._cleanupExpiredCache()
      // 如果清理后仍然超出限制，删除最旧的条目
      if (Storage._cache.size >= Storage._maxCacheSize) {
        const entries = Array.from(Storage._cacheTimestamps.entries())
        entries.sort((a, b) => a[1] - b[1]) // 按时间戳排序
    
        // 删除最旧的25%条目，避免频繁清理
        const deleteCount = Math.max(1, Math.floor(Storage._maxCacheSize * 0.25))
        for (let i = 0; i < deleteCount && i < entries.length; i++) {
          const [oldKey] = entries[i]
          Storage._cache.delete(oldKey)
          Storage._cacheTimestamps.delete(oldKey)
        }
      }
    }
    Storage._cache.set(key, value)
    Storage._cacheTimestamps.set(key, Date.now())
  },

  /**
   * 清除缓存
   * @param {string} key - 缓存键
   */
  _clearCache: (key) => {
    Storage._cache.delete(key)
    Storage._cacheTimestamps.delete(key)
  },
  /**
   * 清除所有缓存
   */
  _clearAllCache: () => {
    Storage._cache.clear()
    Storage._cacheTimestamps.clear()
  },

  /**
   * 获取所有Token列表（带缓存）
   * @returns {Promise<{publicKeys: string[], adminKeys: string[]}>}
   */
  getAllKeys: async () => {
    const cacheKey = 'all_keys'
    
    // 检查缓存
    if (Storage._isCacheValid(cacheKey)) {
      return Storage._cache.get(cacheKey)
    }

    try {
      const [publicKeysJson, adminKeysJson] = await Promise.all([
        Storage.KV.get(CONFIG.KV_KEYS.SESSION_KEYS_LIST).then(val => val || '[]'),
        Storage.KV.get(CONFIG.KV_KEYS.ADMIN_SESSION_KEYS_LIST).then(val => val || '[]')
      ])

      const publicKeys = JSON.parse(publicKeysJson)
      const adminKeys = JSON.parse(adminKeysJson)
      
      const result = { publicKeys, adminKeys }
      Storage._setCache(cacheKey, result)
      
      return result
    } catch (error) {
      Logger.error('Failed to parse keys from KV storage', error)
      return { publicKeys: [], adminKeys: [] }
    }
  },

  /**
   * 保存公共Keys
   * @param {string[]} keys - Key数组
   */
  savePublicKeys: async (keys) => {
    await Storage.KV.put(CONFIG.KV_KEYS.SESSION_KEYS_LIST, JSON.stringify(keys))
    Storage._clearCache('all_keys')
  },

  /**
   * 保存管理员Keys
   * @param {string[]} keys - Key数组
   */
  saveAdminKeys: async (keys) => {
    await Storage.KV.put(CONFIG.KV_KEYS.ADMIN_SESSION_KEYS_LIST, JSON.stringify(keys))
    Storage._clearCache('all_keys')
  },

  /**
   * 获取当前有效Key
   * @returns {Promise<string|null>}
   */
  getValidKey: async () => {
    return await Storage.KV.get(CONFIG.KV_KEYS.VALID_KEY)
  },

  /**
   * 设置当前有效Key
   * @param {string} key - 有效Key
   */
  setValidKey: async (key) => {
    await Storage.KV.put(CONFIG.KV_KEYS.VALID_KEY, key, {
      expirationTtl: CONFIG.VALID_KEY_TTL
    })
  },

  /**
   * 删除当前有效Key
   */
  deleteValidKey: async () => {
    await Storage.KV.delete(CONFIG.KV_KEYS.VALID_KEY)
  },

  /**
   * 保存会话上下文
   * @param {string} conversationId - 会话ID
   * @param {Object} context - 会话上下文
   */
  saveConversationContext: async (conversationId, context) => {
    const key = `${CONFIG.KV_KEYS.CONVERSATION_CONTEXT}${conversationId}`
    await Storage.KV.put(key, JSON.stringify(context), {
      expirationTtl: CONFIG.CONVERSATION_CONTEXT_TTL
    })
  },

  /**
   * 获取会话上下文
   * @param {string} conversationId - 会话ID
   * @returns {Promise<Object|null>} 会话上下文
   */
  getConversationContext: async (conversationId) => {
    const key = `${CONFIG.KV_KEYS.CONVERSATION_CONTEXT}${conversationId}`
    const contextJson = await Storage.KV.get(key)
    return contextJson ? JSON.parse(contextJson) : null
  },

  /**
   * 删除会话上下文
   * @param {string} conversationId - 会话ID
   */
  deleteConversationContext: async (conversationId) => {
    const key = `${CONFIG.KV_KEYS.CONVERSATION_CONTEXT}${conversationId}`
    await Storage.KV.delete(key)
  }
}
// ================================
// Token验证模块
// ================================

/**
 * Token验证服务
 * @namespace TokenValidator
 */
const TokenValidator = {
  /**
   * 通过官方API验证Token
   * @param {string} key - Session Key
   * @returns {Promise<{valid: boolean, data: object|null, error: string|null}>}
   */
  validateViaOfficialAPI: async (key) => {
    if (!Validator.isValidSessionKeyFormat(key)) {
      return { valid: false, data: null, error: '格式错误' }
    }

    try {
      const response = await fetch(CONFIG.API_ENDPOINTS.CLAUDE_OFFICIAL, {
        headers: {
          'accept': 'application/json',
          'cookie': `sessionKey=${key}`,
          'user-agent': CONFIG.USER_AGENT
        }
      })

      if (!response.ok) {
        return { 
          valid: false, 
          data: null, 
          error: `官方API返回 HTTP ${response.status}` 
        }
      }

      const responseText = await response.text()
      
      // 增强的错误检测
      if (responseText.toLowerCase().includes('unauthorized') || 
          responseText.trim() === '' || 
          responseText.toLowerCase().includes('invalid') ||
          responseText.toLowerCase().includes('expired')) {
        return { valid: false, data: null, error: '未授权或响应为空' }
      }

      try {
        const objects = JSON.parse(responseText)
        if (Array.isArray(objects) && objects.length > 0) {
          // 提取更多组织信息
          const orgData = objects[0]
          const enhancedData = {
            name: orgData.name || '未知组织',
            capabilities: orgData.capabilities || [],
            uuid: orgData.uuid || null,
            ...orgData
          }
          return { valid: true, data: enhancedData, error: null }
        } else {
          return { valid: false, data: null, error: '响应中无组织信息' }
        }
      } catch (parseError) {
        Logger.error(`JSON解析失败: ${StringUtils.truncateKey(key)}`, parseError)
        return { valid: false, data: null, error: 'JSON解析失败' }
      }

    } catch (error) {
      Logger.error(`官方API验证失败: ${StringUtils.truncateKey(key)}`, error)
      return { valid: false, data: null, error: '网络或解析错误' }
    }
  },

  /**
   * 通过第三方网站间接验证Token
   * @param {string} key - Session Key
   * @returns {Promise<{valid: boolean, data: object|null, error: string|null}>}
   */
  validateViaIndirectSite: async (key) => {
    if (!Validator.isValidSessionKeyFormat(key)) {
      return { valid: false, data: null, error: '格式错误' }
    }

    try {
      const response = await fetch(CONFIG.API_ENDPOINTS.FUCLAUDE_AUTH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_key: key })
      })

      const data = await response.json()

      if (!data.detail || data.detail !== 'invalid sessionKey') {
        // 尝试提取更多信息
        const enhancedData = {
          name: data.organization_name || '未知 (间接验证)',
          access_token: data.access_token || null,
          expires_at: data.expires_at || null,
          capabilities: ['间接验证通过']
        }
        return { 
          valid: true, 
          data: enhancedData,
          error: null 
        }
      } else {
        return { valid: false, data: null, error: 'Fuclaude网站返回无效' }
      }

    } catch (error) {
      Logger.error(`间接验证失败: ${StringUtils.truncateKey(key)}`, error)
      return { valid: false, data: null, error: '网络或解析错误' }
    }
  },

  /**
   * 验证调度中心
   * @param {string} key - Session Key
   * @param {'official' | 'indirect'} method - 验证方法
   * @returns {Promise<{valid: boolean, data: object|null, error: string|null}>}
   */
  validate: async (key, method = 'official') => {
    if (method === 'indirect') {
      return TokenValidator.validateViaIndirectSite(key)
    }
    return TokenValidator.validateViaOfficialAPI(key)
  }
}

// ================================
// 身份认证模块
// ================================

/**
 * 身份认证服务
 * @namespace AuthService
 */
const AuthService = {
  /**
   * 检查是否为管理员
   * @param {Request} request - 请求对象
   * @returns {boolean} 是否为管理员
   */
  isAdmin: (request) => {
    const cookies = request.headers.get('Cookie') || ''
    return cookies.includes(`admin_auth=${CONFIG.ADMIN_PASSWORD}`)
  },

  /**
   * 创建管理员登录响应
   * @returns {Response} 重定向响应
   */
  createAdminLoginResponse: () => {
    const response = new Response(null, { 
      status: HTTP_STATUS.REDIRECT, 
      headers: { 'Location': '/tokens' } 
    })
    response.headers.set('Set-Cookie', 
      `admin_auth=${CONFIG.ADMIN_PASSWORD}; Path=/; HttpOnly; Secure; SameSite=Lax`
    )
    return response
  }
}

// ================================
// HTML模板模块
// ================================

/**
 * HTML模板生成器
 * @namespace Templates
 */
const Templates = {
  /**
   * 生成基础CSS样式
   * @returns {string} CSS样式字符串
   */
  getBaseStyles: () => `
    <style>
      body { 
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
        max-width: 800px; margin: 40px auto; padding: 20px; 
        background-color: #f8f9fa; line-height: 1.6; 
      }
      .container { 
        background: white; padding: 30px; border-radius: 8px; 
        box-shadow: 0 4px 6px rgba(0,0,0,0.1); 
      }
      h1, h2, h3 { color: #343a40; }
      .section { 
        margin-bottom: 30px; padding-bottom: 20px; 
        border-bottom: 1px solid #dee2e6; 
      }
      .section:last-child { border-bottom: none; }
      form { margin-top: 15px; }
      input[type="text"], input[type="password"], textarea { 
        width: 95%; max-width:100%; box-sizing: border-box; 
        padding: 10px; border-radius: 4px; border: 1px solid #ced4da; 
        margin-bottom: 10px; 
      }
      textarea { height: 100px; font-family: monospace; resize: vertical; }
      button { 
        background-color: #007bff; color: white; padding: 8px 15px; 
        border: none; border-radius: 4px; cursor: pointer; 
        transition: background-color 0.2s; 
      }
      button:hover { background-color: #0056b3; }
      button.delete { background-color: #dc3545; }
      button.delete:hover { background-color: #c82333; }
      button.validate { background-color: #28a745; }
      button.validate:hover { background-color: #218838; }
      button.copy { background-color: #17a2b8; }
      button.copy:hover { background-color: #138496; }
      ul { list-style-type: none; padding-left: 0; }
      li { 
        background-color: #e9ecef; padding: 10px 15px; border-radius: 4px; 
        margin-bottom: 8px; display: flex; justify-content: flex-start; 
        align-items: center; gap: 10px; 
      }
      .key-code { 
        flex-grow: 1; word-break: break-all; font-family: monospace; 
        font-size: 14px; color: #333; 
      }
      .key-actions { 
        display: flex; align-items: center; gap: 10px; 
        flex-shrink: 0; margin-left: auto; 
      }
      .key-actions form { margin: 0; }
      .message { 
        padding: 15px; margin-bottom: 20px; border-radius: 4px; 
        border: 1px solid transparent; 
      }
      .message-success { 
        color: #155724; background-color: #d4edda; border-color: #c3e6cb; 
      }
      .message-error { 
        color: #721c24; background-color: #f8d7da; border-color: #f5c6cb; 
      }
      .footer { 
        text-align: center; margin-top: 30px; font-size: 14px; 
        color: #6c757d; 
      }
      .footer a { color: #007bff; text-decoration: none; }
      .footer a:hover { text-decoration: underline; }
      details > summary { cursor: pointer; color:#007bff; font-weight: bold; }
      .admin-actions { 
        display: flex; flex-wrap: wrap; gap: 10px; align-items: center; 
      }
      .admin-actions form { margin-top: 0; }
      .status {
        padding: 3px 8px; border-radius: 12px; font-size: 12px;
        font-weight: bold; flex-shrink: 0; cursor: help;
      }
      .status-valid { background-color: #d4edda; color: #155724; }
      .status-invalid { background-color: #f8d7da; color: #721c24; }
      .validate-form {
        display: flex; align-items: center; gap: 10px;
        background-color: #f1f3f5; padding: 10px; border-radius: 6px;
      }
      .validate-form label { 
        font-weight: bold; font-size: 14px; margin-bottom: 0; 
      }
      .validate-form select { 
        padding: 5px; border-radius: 4px; border: 1px solid #ced4da; 
      }
      .admin-grid {
        display: grid; grid-template-columns: repeat(2, 1fr);
        gap: 10px; flex-grow: 1;
      }
      .admin-grid form button { width: 100%; box-sizing: border-box; }
      .pagination {
        margin-top: 20px; display: flex; justify-content: center;
        align-items: center; gap: 8px; flex-wrap: wrap;
      }
      .pagination a, .pagination .current-page {
        color: #007bff; padding: 8px 12px; text-decoration: none;
        border: 1px solid #dee2e6; border-radius: 4px;
        transition: background-color 0.2s;
      }
      .pagination a:hover { background-color: #e9ecef; }
      .pagination .current-page {
        background-color: #007bff; color: white; border-color: #007bff;
        font-weight: bold; cursor: default;
      }
      .validation-notice {
        background-color: #fff3cd; border: 1px solid #ffeaa7;
        border-left: 4px solid #ffc107; border-radius: 4px;
        padding: 15px; margin: 15px 0; color: #856404;
      }
      .validation-notice p { margin: 0; line-height: 1.5; }
      .validation-notice a { 
        color: #007bff; text-decoration: none; font-weight: bold; 
      }
      .validation-notice a:hover { text-decoration: underline; }
    </style>
  `,

  /**
   * 生成主页HTML
   * @param {string} origin - 请求来源
   * @param {string} currentKey - 当前Key
   * @param {string} tokenSource - Token来源
   * @param {number} publicCount - 公共Token数量
   * @param {number} adminCount - 管理员Token数量
   * @returns {string} HTML字符串
   */
  getHomePage: (origin, currentKey, tokenSource, publicCount, adminCount) => {
    const tokenStatus = currentKey ? `
      <div style="background-color: #d4edda; border: 1px solid #c3e6cb; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #28a745;">
        <h3 style="margin-top: 0; margin-bottom: 15px; color: #155724;">🎯 当前Token状态</h3>
        <p><strong>Token:</strong> <code style="background-color: #f8f9fa; padding: 4px 8px; border-radius: 4px; font-family: monospace; font-size: 12px;">${StringUtils.truncateKey(currentKey, 20, 10)}</code></p>
        <p><strong>来源:</strong> ${tokenSource}</p>
      </div>` : `
      <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; border-left: 4px solid #ffc107; border-radius: 8px; padding: 20px; margin: 20px 0;">
        <h3 style="margin-top: 0; margin-bottom: 15px; color: #856404;">⚠️ 未设置Token</h3>
        <p>当前没有可用的Token。请先到 <a href="/tokens">Token管理页面</a> 添加Token。</p>
      </div>`

    return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Claude API 代理服务 - 管理面板</title>
    ${Templates.getBaseStyles()}
    <style>
      .nav-section {
        display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 15px; margin: 30px 0;
      }
      .nav-card {
        background-color: #f8f9fa; border: 1px solid #dee2e6;
        border-radius: 8px; padding: 20px; text-align: center;
        transition: all 0.3s; text-decoration: none; color: #495057;
      }
      .nav-card:hover {
        transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        text-decoration: none; color: #495057;
      }
      .nav-card h3 { margin-top: 0; margin-bottom: 10px; font-weight: bold; }
      .nav-card.manage { border-left: 4px solid #007bff; }
      .nav-card.switch { border-left: 4px solid #28a745; }
      .api-info {
        background-color: #e7f3ff; border: 1px solid #b8daff;
        border-radius: 8px; padding: 20px; margin: 20px 0;
        border-left: 4px solid #007bff;
      }
      .api-info h3 { margin-top: 0; color: #004085; }
      .api-endpoint {
        background-color: #f8f9fa; padding: 10px; border-radius: 4px;
        font-family: monospace; font-size: 14px; margin: 10px 0;
        word-break: break-all;
      }
      .stats {
        display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
        gap: 15px; margin: 20px 0;
      }
      .stat-card {
        background-color: white; padding: 15px; border-radius: 8px;
        border: 1px solid #dee2e6; text-align: center;
      }
      .stat-number { font-size: 20px; font-weight: bold; color: #007bff; }
      .stat-label { font-size: 11px; color: #6c757d; margin-top: 5px; }
      pre {
        background-color: #f8f9fa; padding: 15px; border-radius: 4px;
        overflow-x: auto; font-size: 12px; border: 1px solid #dee2e6;
      }
    </style>
</head>
<body>
    <div class="container">
        <h1>🤖 Claude API 代理服务 - 管理面板</h1>
        ${tokenStatus}
        <div class="stats">
            <div class="stat-card">
                <div class="stat-number">${publicCount}</div>
                <div class="stat-label">普通用户Token</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${adminCount}</div>
                <div class="stat-label">管理员Token</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${publicCount + adminCount}</div>
                <div class="stat-label">总计Token</div>
            </div>
        </div>
        <div class="nav-section">
            <a href="/tokens" class="nav-card manage">
                <h3>🔧 Token 管理</h3>
                <p>添加、查看、验证和管理API Tokens</p>
            </a>
            <a href="/token" class="nav-card switch">
                <h3>🔄 切换 Token</h3>
                <p>在可用的Tokens之间快速切换</p>
            </a>
        </div>
        <div class="api-info">
            <h3>📡 API 使用说明</h3>
            <p><strong>API 端点:</strong></p>
            <div class="api-endpoint">${origin}/v1/messages</div>
            <p><strong>使用方法:</strong></p>
            <ul>
                <li>将此URL作为Claude API的代理端点</li>
                <li>使用标准的Claude API格式发送请求</li>
                <li>系统会自动使用当前设置的Token</li>
                <li>支持流式和非流式响应</li>
                <li>自动处理Token过期和轮换</li>
                <li>兼容原生Claude API接口</li>
            </ul>
            <p><strong>支持的功能:</strong></p>
            <ul>
                <li>✅ 消息对话 (Messages API)</li>
                <li>✅ 流式响应 (Server-Sent Events)</li>
                <li>✅ 自动Token管理和轮换</li>
                <li>✅ 错误处理和重试机制</li>
                <li>✅ CORS跨域支持</li>
            </ul>
            <p><strong>请求示例:</strong></p>
            <pre>POST /v1/messages
Content-Type: application/json

{
  "model": "claude-3-sonnet-20240229",
  "max_tokens": 1024,
  "messages": [
    {"role": "user", "content": "Hello, Claude!"}
  ]
}</pre>
        </div>
        <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6; color: #6c757d;">
            <p><a href="/">返回聊天首页</a> | Claude API 代理服务 - 简化您的API管理</p>
        </div>
    </div>
</body>
</html>`
  },

  /**
   * 生成切换Token页面HTML
   * @param {string} message - 消息
   * @param {Array} allKeys - 所有Keys
   * @param {Array} adminKeys - 管理员Keys
   * @param {string} currentKey - 当前Key
   * @returns {string} HTML字符串
   */
  getSwitchKeyPage: (message, allKeys, adminKeys, currentKey) => {
    const options = allKeys.map(key => {
      const isCurrent = key === currentKey ? 'selected' : ''
      const keyType = adminKeys.includes(key) ? '[管理员]' : '[普通]'
      const truncatedKey = StringUtils.truncateKey(key)
      return `<option value="${key}" ${isCurrent}>${keyType} ${truncatedKey}</option>`
    }).join('')

    return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>切换Key</title>
    ${Templates.getBaseStyles()}
    <style>
      .container { max-width: 600px; }
      select { 
        width: 100%; padding: 10px; border-radius: 4px; 
        border: 1px solid #ced4da; font-size: 16px; box-sizing: border-box; 
      }
      button { 
        background-color: #007bff; color: white; padding: 10px 20px; 
        border: none; border-radius: 4px; cursor: pointer; 
        font-size: 16px; margin-top: 20px; 
      }
      button:hover { background-color: #0056b3; }
      label { font-weight: bold; display: block; margin-bottom: 10px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔄 切换当前Token</h1>
        <p>选择一个Token作为当前API请求和聊天重定向使用的Key。</p>
        <div class="message ${message.includes('错误') ? 'message-error' : 'message-success'}">${message}</div>
        <form action="/token" method="post">
            <label for="session_key">选择要使用的Token:</label>
            <select name="session_key" id="session_key" ${allKeys.length === 0 ? 'disabled' : ''}>
                ${allKeys.length > 0 ? options : '<option>没有可用的Token</option>'}
            </select>
            <button type="submit" ${allKeys.length === 0 ? 'disabled' : ''}>切换</button>
        </form>
    </div>
    <div class="footer">
        <p><a href="/api">🔧 返回管理面板</a> | <a href="/">🏠 聊天首页</a></p>
    </div>
</body>
</html>`
  },

  /**
   * 生成Token管理页面HTML
   * @param {Object} options - 选项参数
   * @returns {string} HTML字符串
   */
  getTokenManagementPage: (options) => {
    const {
      message = '',
      isAdmin = false,
      validationResults = null,
      pagePublic = 1,
      pageAdmin = 1,
      publicKeys = [],
      adminKeys = []
    } = options

    // 分页渲染函数
    const renderPaginatedList = (allKeys, type, currentPage) => {
      if (allKeys.length === 0) {
        return '<p>列表为空。</p>'
      }

      const totalPages = Math.ceil(allKeys.length / CONFIG.ITEMS_PER_PAGE)
      const startIndex = (currentPage - 1) * CONFIG.ITEMS_PER_PAGE
      const endIndex = startIndex + CONFIG.ITEMS_PER_PAGE
      const keysForCurrentPage = allKeys.slice(startIndex, endIndex)

      // 渲染当前页的列表
      const listHTML = `<ul>${keysForCurrentPage.map(key => {
        let statusHTML = ''
        if (validationResults && validationResults[key]) {
          const result = validationResults[key]
          if (result.valid) {
            const orgName = result.data?.name || '未知组织'
            const capabilities = result.data?.capabilities ? result.data.capabilities.join(', ') : '无'
            const title = `组织: ${orgName} | 权限: ${capabilities}`
            statusHTML = `<span class="status status-valid" title="${title}">✅ 有效</span>`
          } else {
            const errorReason = result.error || '未知错误'
            statusHTML = `<span class="status status-invalid" title="原因: ${errorReason}">❌ 无效</span>`
          }
        }

        return `
          <li>
            ${statusHTML}
            <code class="key-code">${key}</code>
            <div class="key-actions">
                <button class="copy" onclick="navigator.clipboard.writeText('${key}').then(() => { this.textContent='已复制!'; setTimeout(() => { this.textContent='复制' }, 2000); }).catch(err => alert('复制失败: ' + err))">复制</button>
                ${isAdmin ? `
                <form action="/tokens" method="post" style="display:inline;">
                  <input type="hidden" name="key" value="${key}">
                  <input type="hidden" name="action" value="delete_${type}">
                  <button type="submit" class="delete" onclick="return confirm('确定要删除这个Token吗？');">删除</button>
                </form>` : ''}
            </div>
          </li>`
      }).join('')}</ul>`

      // 渲染分页按钮
      let paginationHTML = ''
      if (totalPages > 1) {
        paginationHTML += '<div class="pagination">'
        const otherPageParam = type === 'public' ? `page_admin=${pageAdmin}` : `page_public=${pagePublic}`
        
        // 上一页
        if (currentPage > 1) {
          paginationHTML += `<a href="?page_${type}=${currentPage - 1}&${otherPageParam}">&laquo; 上一页</a>`
        }
        
        // 页码
        for (let i = 1; i <= totalPages; i++) {
          if (i === currentPage) {
            paginationHTML += `<span class="current-page">${i}</span>`
          } else {
            paginationHTML += `<a href="?page_${type}=${i}&${otherPageParam}">${i}</a>`
          }
        }
        
        // 下一页
        if (currentPage < totalPages) {
          paginationHTML += `<a href="?page_${type}=${currentPage + 1}&${otherPageParam}">下一页 &raquo;</a>`
        }
        paginationHTML += '</div>'
      }

      return listHTML + paginationHTML
    }

    // 管理员专属操作区域
    const adminActionsHTML = isAdmin ? `
      <div class="section">
          <h2>⚙️ 管理员操作</h2>
          <div class="admin-actions">
              <form action="/tokens" method="post" class="validate-form">
                  <input type="hidden" name="action" value="validate">
                  <label for="validation_method">验证方式:</label>
                  <select name="validation_method" id="validation_method">
                      <option value="indirect" selected>Fuclaude网站 (推荐)</option>
                      <option value="official">官方API (可能无效)</option>
                  </select>
                  <button type="submit" class="validate">开始验证</button>
              </form>
              <div class="admin-grid">
                  <form action="/tokens" method="post" onsubmit="return confirm('确定要删除所有验证为无效的Token吗？此操作将重新执行一次验证。')">
                      <input type="hidden" name="action" value="delete_invalid">
                      <button type="submit" class="delete">删除无效Token</button>
                  </form>
                  <form action="/tokens" method="post" onsubmit="return confirm('确定要清空所有普通用户Token吗？')">
                      <input type="hidden" name="action" value="clear_public">
                      <button type="submit" class="delete">清空普通Token</button>
                  </form>
                  <form action="/tokens" method="post" onsubmit="return confirm('确定要清空所有管理员Token吗？')">
                      <input type="hidden" name="action" value="clear_admin">
                      <button type="submit" class="delete">清空管理员Token</button>
                  </form>
                  <form action="/tokens" method="post" onsubmit="return confirm('警告：此操作将删除所有Token，确定吗？')">
                      <input type="hidden" name="action" value="clear_all">
                      <button type="submit" class="delete">清空所有Token</button>
                  </form>
              </div>
          </div>
      </div>` : ''

    return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Token 管理</title>
    ${Templates.getBaseStyles()}
</head>
<body>
    <div class="container">
        <h1>🔧 Token 管理</h1>
        ${message}
        ${adminActionsHTML}
        
        <!-- 普通用户Token管理区 -->
        <div class="section">
            <h2>👥 普通用户 Token (共 ${publicKeys.length} 个)</h2>
            <p>这些Token由普通用户添加，并由所有用户共享。${isAdmin ? '管理员可以删除这些Token。' : ''}</p>
            ${renderPaginatedList(publicKeys, 'public', pagePublic)}
            <details>
                <summary>+ 添加新的普通用户Token</summary>
                <div class="validation-notice">
                    <p><strong>⚠️ 重要提醒：</strong>为避免系统新增无效session key账号，请各位增加session key之前先在 <a href="https://z-hc.com" target="_blank" rel="noopener noreferrer">Claude SessionKey Checker</a>导入或填入session key点击开始检查，将检查后过滤无效key后有效的session key批量导入到本系统。</p>
                </div>          
                <form action="/tokens" method="post">
                    <input type="hidden" name="action" value="add_public">
                    <textarea name="keys" placeholder="在此输入 session_key，每行一个..." required></textarea>
                    <button type="submit">批量添加</button>
                </form>
            </details>
        </div>

        <!-- 管理员Token管理区或登录区 -->
        ${isAdmin ? `
        <div class="section">
            <h2>🔑 管理员 Token (共 ${adminKeys.length} 个)</h2>
            <p>这些是管理员Token，拥有更高优先级，仅对管理员可见和管理。</p>
            ${renderPaginatedList(adminKeys, 'admin', pageAdmin)}
            <details>
                <summary>+ 添加新的管理员Token</summary>
                <div class="validation-notice">
                    <p><strong>⚠️ 重要提醒：</strong>为避免系统新增无效session key账号，请各位增加session key之前先在 <a href="https://z-hc.com" target="_blank" rel="noopener noreferrer">Claude SessionKey Checker</a>导入或填入session key点击开始检查，将检查后过滤无效key后有效的session key批量导入到本系统。</p>
                </div>
                <form action="/tokens" method="post">
                    <input type="hidden" name="action" value="add_admin">
                    <textarea name="keys" placeholder="在此输入 session_key，每行一个..." required></textarea>
                    <button type="submit">批量添加</button>
                </form>
            </details>
        </div>
        ` : `
        <div class="section">
            <h2>🔑 管理员登录</h2>
            <p>登录以管理所有Token（包括添加和删除管理员Token）。</p>
            <form action="/tokens" method="post">
                <input type="hidden" name="action" value="admin_login">
                <input type="password" name="password" placeholder="输入管理员密码..." required>
                <button type="submit">登录</button>
            </form>
        </div>
        `} 
    </div>
    <div class="footer">
        <p><a href="/api">🔧 返回管理面板</a> | <a href="/">🏠 聊天首页</a></p>
    </div>
</body>
</html>`
  }
}

// ================================
// 业务逻辑模块
// ================================

/**
 * Token管理业务逻辑
 * @namespace TokenManager
 */
const TokenManager = {
  /**
   * 查找有效的Token
   * @returns {Promise<string|null>} 有效的Token或null
   */
  findValidToken: async (excludeKeys = []) => {
    const { publicKeys, adminKeys } = await Storage.getAllKeys()
    const allKeys = [...adminKeys, ...publicKeys]
    // 排除已失败的keys
    const sessionKeys = allKeys.filter(key => !excludeKeys.includes(key))
    if (sessionKeys.length === 0) {
      throw new AppError(
        'No session keys available. Please go to /api to add keys.',
        HTTP_STATUS.NOT_FOUND
      )
    }

    let currentIndex = Math.floor(Math.random() * sessionKeys.length)
    
    for (let i = 0; i < sessionKeys.length; i++) {
      const sessionKey = sessionKeys[currentIndex]
      const validationResult = await TokenValidator.validate(sessionKey, 'official')
      
      if (validationResult.valid) {
        await Storage.setValidKey(sessionKey)
        Logger.info(`Found valid token: ${StringUtils.truncateKey(sessionKey)}`)
        return sessionKey
      }
      
      Logger.warn(`Token invalid, trying next: ${StringUtils.truncateKey(sessionKey)}`)
      currentIndex = (currentIndex + 1) % sessionKeys.length
    }
    // 记录所有Token验证失败的情况
    Logger.error('All tokens validation failed', { 
      totalTokens: sessionKeys.length,
      adminCount: adminKeys.length,
      publicCount: publicKeys.length 
    })

    throw new AppError(
      'No valid session keys found. Please go to /api to add valid keys.',
      HTTP_STATUS.SERVICE_UNAVAILABLE,
      'NO_VALID_TOKENS'
    )
  }, 
  /**
   * 新增方法：获取下一个可用Token（自动切换）
   * @param {string} currentKey - 当前失效的Key
   * @param {string[]} failedKeys - 已失败的Keys列表
   * @returns {Promise<string|null>} 下一个有效Token或null
   */
  getNextValidToken: async (currentKey, failedKeys = []) => {
    const { publicKeys, adminKeys } = await Storage.getAllKeys()
    const allKeys = [...adminKeys, ...publicKeys]

    // 将当前失效的key也加入失败列表
    const updatedFailedKeys = [...new Set([...failedKeys, currentKey].filter(k => k))]

    // 获取还未尝试的keys，优先使用管理员keys
    const remainingAdminKeys = adminKeys.filter(key => 
      key !== currentKey && !updatedFailedKeys.includes(key)
    )
    const remainingPublicKeys = publicKeys.filter(key => 
      key !== currentKey && !updatedFailedKeys.includes(key)
    )
  
    // 优先尝试管理员token，然后是普通token
    const remainingKeys = [...remainingAdminKeys, ...remainingPublicKeys]

    if (remainingKeys.length === 0) {
      Logger.warn('No more tokens to try', {
        totalKeys: allKeys.length,
        failedKeys: updatedFailedKeys.length 
      })
      return null
    }

    // 优先尝试管理员token，然后是普通token
    for (const nextKey of remainingKeys) {
    Logger.info(`Trying next token: ${StringUtils.truncateKey(nextKey)}`)

    // 智能验证（通过auth接口，增加超时和重试）
    try {
      // 快速验证token是否有效，添加超时控制
      const authcontroller = new AbortController()
      const timeoutId = setTimeout(() => authcontroller.abort(), 5000) // 5秒超时
      
      const authResponse = await fetch(CONFIG.API_ENDPOINTS.FUCLAUDE_AUTH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_key: nextKey }),
        signal: authcontroller.signal
      })
      
      clearTimeout(timeoutId)
      // 检查响应状态和内容
      if (!authResponse.ok) {
        Logger.warn(`Auth request failed with status ${authResponse.status}: ${StringUtils.truncateKey(nextKey)}`)
        continue // 尝试下一个token
      }

      const authText = await authResponse.text()
      let authData = null

      try {
        authData = JSON.parse(authText)
      } catch (parseError) {
        // 如果不是JSON，检查是否是HTML错误页面
        if (authText.toLowerCase().includes('out of free messages') || 
            authText.toLowerCase().includes('daily limit') ||
            authText.toLowerCase().includes('upgrade')) {
          Logger.warn(`Token has usage limits: ${StringUtils.truncateKey(nextKey)}`)
          continue // 尝试下一个token
        }
        Logger.warn(`Could not parse auth response: ${StringUtils.truncateKey(nextKey)}`, parseError)
        continue
      }
    
      if (authData.detail !== 'invalid sessionKey' && authData.access_token) {
        await Storage.setValidKey(nextKey)
        Logger.info(`Successfully switched to: ${StringUtils.truncateKey(nextKey)}`)
        return nextKey
      } else {
        Logger.warn(`Token invalid during switch: ${StringUtils.truncateKey(nextKey)}`, {
          detail: authData.detail,
          hasAccessToken: !!authData.access_token
        })
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        Logger.warn(`Token validation timeout: ${StringUtils.truncateKey(nextKey)}`)
      } else {
        Logger.error(`Error validating next token: ${StringUtils.truncateKey(nextKey)}`, error)
      }
      // 网络错误也继续尝试下一个token
    }
  }
  // 所有剩余token都验证失败
  Logger.error('All remaining tokens are invalid')
  return null
  },
  /**
   * 添加公共Token
   * @param {string} keysInput - 用户输入的Keys
   * @returns {Promise<string>} 操作结果消息
   */
  addPublicTokens: async (keysInput) => {
    const newKeys = Validator.sanitizeKeysInput(keysInput)
    
    if (newKeys.length === 0) {
      return '<div class="message message-error">❌ 未找到任何有效格式的Token。Token必须以 sk-ant-sid01- 开头。</div>'
    }

    const { publicKeys } = await Storage.getAllKeys()
    const updatedKeys = [...new Set([...publicKeys, ...newKeys])]
    
    await Storage.savePublicKeys(updatedKeys)
    Storage._clearCache('all_keys') // 清除缓存
    
    const addedCount = updatedKeys.length - publicKeys.length
    return `<div class="message message-success">✅ 操作完成！新增 ${addedCount} 个，总计 ${updatedKeys.length} 个普通用户Token。</div>`
  },

  /**
   * 添加管理员Token
   * @param {string} keysInput - 用户输入的Keys
   * @returns {Promise<string>} 操作结果消息
   */
  addAdminTokens: async (keysInput) => {
    const newKeys = Validator.sanitizeKeysInput(keysInput)
    
    if (newKeys.length === 0) {
      return '<div class="message message-error">❌ 未找到任何有效格式的Token。Token必须以 sk-ant-sid01- 开头。</div>'
    }

    const { adminKeys } = await Storage.getAllKeys()
    const updatedKeys = [...new Set([...adminKeys, ...newKeys])]
    
    await Storage.saveAdminKeys(updatedKeys)
    Storage._clearCache('all_keys') // 清除缓存
    
    const addedCount = updatedKeys.length - adminKeys.length
    return `<div class="message message-success">✅ 操作完成！新增 ${addedCount} 个，总计 ${updatedKeys.length} 个管理员Token。</div>`
  },

  /**
   * 删除指定Token
   * @param {string} key - 要删除的Key
   * @param {string} type - Token类型 ('public' | 'admin')
   * @returns {Promise<string>} 操作结果消息
   */
  deleteToken: async (key, type) => {
    const { publicKeys, adminKeys } = await Storage.getAllKeys()
    
    if (type === 'public') {
      const updatedKeys = publicKeys.filter(k => k !== key)
      await Storage.savePublicKeys(updatedKeys)
      return '<div class="message message-success">✅ 普通用户Token已删除。</div>'
    } else if (type === 'admin') {
      const updatedKeys = adminKeys.filter(k => k !== key)
      await Storage.saveAdminKeys(updatedKeys)
      return '<div class="message message-success">✅ 管理员Token已删除。</div>'
    }
    
    return '<div class="message message-error">❌ 删除失败：未知的Token类型。</div>'
  },

  /**
   * 清空指定类型的Token
   * @param {string} type - Token类型 ('public' | 'admin' | 'all')
   * @returns {Promise<string>} 操作结果消息
   */
  clearTokens: async (type) => {
    switch (type) {
      case 'public':
        await Storage.savePublicKeys([])
        return '<div class="message message-success">✅ 已清空所有普通用户Token。</div>'
      case 'admin':
        await Storage.saveAdminKeys([])
        return '<div class="message message-success">✅ 已清空所有管理员Token。</div>'
      case 'all':
        await Storage.savePublicKeys([])
        await Storage.saveAdminKeys([])
        return '<div class="message message-success">✅ 已清空所有Token。</div>'
      default:
        return '<div class="message message-error">❌ 清空失败：未知的类型。</div>'
    }
  },

  /**
   * 验证所有Token
   * @param {string} method - 验证方法
   * @returns {Promise<{message: string, validationResults: Object}>} 验证结果
   */
  validateAllTokens: async (method = 'indirect') => {
    const { publicKeys, adminKeys } = await Storage.getAllKeys()
    const allKeys = [...adminKeys, ...publicKeys]

    // 并行验证，提升性能
    const results = await Promise.all(allKeys.map(async (token) => {
      const result = await TokenValidator.validate(token, method)
      return { key: token, ...result }
    }))

    const validationResults = {}
    results.forEach(r => {
      validationResults[r.key] = r
    })

    const validCount = results.filter(r => r.valid).length
    const invalidCount = allKeys.length - validCount
    const methodName = method === 'official' ? 'CLAUDE官方API' : 'FUCLAUDE网站'
    
    const message = `<div class="message message-success">🔍 验证完成 (使用 ${methodName})！有效: ${validCount},无效: ${invalidCount}。</div>`

    return { message, validationResults }
  },

  /**
   * 删除无效Token
   * @returns {Promise<string>} 操作结果消息
   */
  deleteInvalidTokens: async () => {
    const { publicKeys, adminKeys } = await Storage.getAllKeys()
    const allKeys = [...adminKeys, ...publicKeys]

    // 使用间接方式验证（更可靠）
    const validationPromises = allKeys.map(key => TokenValidator.validate(key, 'indirect'))
    const results = await Promise.all(validationPromises)

    const validKeys = allKeys.filter((key, index) => results[index].valid)

    // 筛选出仍然有效的Key
    const newPublicKeys = publicKeys.filter(key => validKeys.includes(key))
    const newAdminKeys = adminKeys.filter(key => validKeys.includes(key))

    const deletedCount = allKeys.length - validKeys.length

    // 保存清理后的列表
    await Storage.savePublicKeys(newPublicKeys)
    await Storage.saveAdminKeys(newAdminKeys)
    await Storage.deleteValidKey() // 清除缓存

    return `<div class="message message-success">✅ 操作完成！已删除 ${deletedCount} 个无效Token。</div>`
  }
}

// ================================
// 路由处理模块
// ================================

/**
 * 路由处理器
 * @namespace RouteHandler
 */
const RouteHandler = {
  /**
   * 处理主页请求
   * @param {Request} request - 请求对象
   * @returns {Promise<Response>} 响应对象
   */
  handleHomePage: ErrorHandler.asyncWrapper(async (request) => {
    const url = new URL(request.url)
    const forceRefresh = url.searchParams.get('force_refresh') === 'true'

    // 处理POST请求中的用户提供Key
    let userProvidedKey = null
    if (request.method === 'POST') {
      try {
        const body = await request.json()
        userProvidedKey = body.session_key
      } catch (e) {
        // 不是JSON请求，忽略
        Logger.warn('Could not parse request body', e)
      }
    }

    // 如果用户提供了Key，验证并重定向
    if (userProvidedKey) {
      const validationResult = await TokenValidator.validate(userProvidedKey)
      if (validationResult.valid) {
        return RouteHandler.redirectWithKey(userProvidedKey)
      } else {
        const errorMsg = validationResult.error || '未知验证错误'
        throw new AppError(`Provided session key is invalid: ${errorMsg}`, HTTP_STATUS.BAD_REQUEST)
      }
    }

    // 检查缓存的有效Key
    const cachedValidKey = await Storage.getValidKey()
    if (cachedValidKey && !forceRefresh) {
      Logger.info('Using cached valid key')
      return RouteHandler.redirectWithKey(cachedValidKey)
    }

    // 查找有效Token
    const validKey = await TokenManager.findValidToken()
    return RouteHandler.redirectWithKey(validKey)
  }),

  /**
   * 处理API管理页面请求
   * @param {Request} request - 请求对象
   * @returns {Promise<Response>} 响应对象
   */
  handleApiPage: ErrorHandler.asyncWrapper(async (request) => {
    const url = new URL(request.url)
    const currentKey = await Storage.getValidKey() || ''
    
    let tokenSource = ''
    if (currentKey) {
      const { publicKeys, adminKeys } = await Storage.getAllKeys()
      if (adminKeys.includes(currentKey)) {
        tokenSource = '🔧 管理员添加'
      } else if (publicKeys.includes(currentKey)) {
        tokenSource = '👥 普通用户添加'
      } else {
        tokenSource = '❓ 未知来源 (可能已从列表中移除)'
      }
    }

    const { publicKeys, adminKeys } = await Storage.getAllKeys()
    const html = Templates.getHomePage(
      url.origin,
      currentKey,
      tokenSource,
      publicKeys.length,
      adminKeys.length
    )

    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    })
  }),

  /**
   * 处理Token切换请求
   * @param {Request} request - 请求对象
   * @returns {Promise<Response>} 响应对象
   */
  handleSwitchToken: ErrorHandler.asyncWrapper(async (request) => {
    if (request.method === 'GET') {
      return RouteHandler.handleSwitchTokenGet()
    }
    
    if (request.method === 'POST') {
      return RouteHandler.handleSwitchTokenPost(request)
    }
    throw new AppError('Method not allowed', HTTP_STATUS.METHOD_NOT_ALLOWED)
  }),


  /**
   * 处理Token切换GET请求
   * @returns {Promise<Response>} 响应对象
   */
  handleSwitchTokenGet: async () => {
    const { publicKeys, adminKeys } = await Storage.getAllKeys()
    const allKeys = [...adminKeys, ...publicKeys]
    const currentKey = await Storage.getValidKey() || ''

    const html = Templates.getSwitchKeyPage('', allKeys, adminKeys, currentKey)
    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    })
  },

  /**
   * 处理Token切换POST请求
   * @param {Request} request - 请求对象
   * @returns {Promise<Response>} 响应对象
   */
  handleSwitchTokenPost: async (request) => {
    const formData = await request.formData()
    const newKey = formData.get('session_key')

    if (!newKey) {
      const { publicKeys, adminKeys } = await Storage.getAllKeys()
      const allKeys = [...adminKeys, ...publicKeys]
      const currentKey = await Storage.getValidKey() || ''
      
      const html = Templates.getSwitchKeyPage('❌ 错误：没有选择任何Token！', allKeys, adminKeys, currentKey)
      return new Response(html, {
        status: HTTP_STATUS.BAD_REQUEST,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      })
    }

    const { publicKeys, adminKeys } = await Storage.getAllKeys()
    const allKeys = [...adminKeys, ...publicKeys]

    if (allKeys.includes(newKey)) {
      await Storage.setValidKey(newKey)
      const currentKey = newKey
      
      const html = Templates.getSwitchKeyPage('✅ 成功切换到新的Token！', allKeys, adminKeys, currentKey)
      return new Response(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      })
    } else {
      const currentKey = await Storage.getValidKey() || ''
      const html = Templates.getSwitchKeyPage('❌ 错误：该Token已失效或不存在！', allKeys, adminKeys, currentKey)
      return new Response(html, {
        status: HTTP_STATUS.BAD_REQUEST,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      })
    }
  },

  /**
   * 处理Token管理请求
   * @param {Request} request - 请求对象
   * @returns {Promise<Response>} 响应对象
   */
  handleTokenManagement: ErrorHandler.asyncWrapper(async (request) => {
    const url = new URL(request.url)
    const isAdmin = AuthService.isAdmin(request)
    let message = ''
    let validationResults = null

    // 获取分页参数
    const pagePublic = Validator.validatePageNumber(url.searchParams.get('page_public') || '1')
    const pageAdmin = Validator.validatePageNumber(url.searchParams.get('page_admin') || '1')

    // 处理POST请求
    if (request.method === 'POST') {
      const result = await RouteHandler.handleTokenManagementPost(request, isAdmin)
      message = result.message
      validationResults = result.validationResults
      
      // 如果是管理员登录成功，返回重定向响应
      if (result.redirect) {
        return result.redirect
      }
    }

    // 获取Token数据
    const { publicKeys, adminKeys: allAdminKeys } = await Storage.getAllKeys()
    const adminKeys = isAdmin ? allAdminKeys : []

    const html = Templates.getTokenManagementPage({
      message,
      isAdmin,
      validationResults,
      pagePublic,
      pageAdmin,
      publicKeys,
      adminKeys
    })

    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    })
  }),

  /**
   * 处理Token管理POST请求
   * @param {Request} request - 请求对象
   * @param {boolean} isAdmin - 是否为管理员
   * @returns {Promise<{message: string, validationResults: Object|null, redirect: Response|null}>}
   */
  handleTokenManagementPost: async (request, isAdmin) => {
    const formData = await request.formData()
    const action = formData.get('action')
    let message = ''
    let validationResults = null

    switch (action) {
      case 'add_public':
        const publicKeysInput = formData.get('keys')
        if (!publicKeysInput || publicKeysInput.trim() === '') {
          message = '<div class="message message-error">❌ 请输入要添加的Token！</div>'
        } else {
          message = await TokenManager.addPublicTokens(publicKeysInput)
        }
        break

      case 'add_admin':
        if (!isAdmin) {
          throw new AppError('Unauthorized', HTTP_STATUS.UNAUTHORIZED)
        }
        const adminKeysInput = formData.get('keys')
        if (!adminKeysInput || adminKeysInput.trim() === '') {
          message = '<div class="message message-error">❌ 请输入要添加的Token！</div>'
        } else {
          message = await TokenManager.addAdminTokens(adminKeysInput)
        }
        break

      case 'delete_public':
        if (!isAdmin) {
          throw new AppError('Unauthorized', HTTP_STATUS.UNAUTHORIZED)
        }
        const publicKeyToDelete = formData.get('key')
        message = await TokenManager.deleteToken(publicKeyToDelete, 'public')
        break

      case 'delete_admin':
        if (!isAdmin) {
          throw new AppError('Unauthorized', HTTP_STATUS.UNAUTHORIZED)
        }
        const adminKeyToDelete = formData.get('key')
        message = await TokenManager.deleteToken(adminKeyToDelete, 'admin')
        break

      case 'clear_public':
        if (!isAdmin) {
          throw new AppError('Unauthorized', HTTP_STATUS.UNAUTHORIZED)
        }
        message = await TokenManager.clearTokens('public')
        break

      case 'clear_admin':
        if (!isAdmin) {
          throw new AppError('Unauthorized', HTTP_STATUS.UNAUTHORIZED)
        }
        message = await TokenManager.clearTokens('admin')
        break

      case 'clear_all':
        if (!isAdmin) {
          throw new AppError('Unauthorized', HTTP_STATUS.UNAUTHORIZED)
        }
        message = await TokenManager.clearTokens('all')
        break

      case 'validate':
        if (!isAdmin) {
          throw new AppError('Unauthorized', HTTP_STATUS.UNAUTHORIZED)
        }
        const method = formData.get('validation_method') || 'indirect'
        const result = await TokenManager.validateAllTokens(method)
        message = result.message
        validationResults = result.validationResults
        break

      case 'delete_invalid':
        if (!isAdmin) {
          throw new AppError('Unauthorized', HTTP_STATUS.UNAUTHORIZED)
        }
        message = await TokenManager.deleteInvalidTokens()
        break

      case 'admin_login':
        const password = formData.get('password')
        if (password === CONFIG.ADMIN_PASSWORD) {
          return { 
            message: '', 
            validationResults: null, 
            redirect: AuthService.createAdminLoginResponse() 
          }
        } else {
          message = '<div class="message message-error">❌ 管理员密码错误！</div>'
        }
        break

      default:
        message = '<div class="message message-error">❌ 未知的操作！</div>'
    }

    return { message, validationResults, redirect: null }
  },

  /**
   * 处理API代理请求
   * @param {Request} request - 请求对象
   * @returns {Promise<Response>} 响应对象
   */
  handleApiProxy: ErrorHandler.asyncWrapper(async (request) => {
    Logger.info('Processing API proxy request')
    // 获取有效的Token
    let sessionKey = await Storage.getValidKey()
    
    if (!sessionKey) {
      Logger.warn('No valid token found, searching for one')
      sessionKey = await TokenManager.findValidToken()
    }

    Logger.info(`Using token: ${StringUtils.truncateKey(sessionKey)}`)
  // 使用新的带自动重试的API请求方法
  return await RouteHandler.makeApiRequest(request, sessionKey, 0, [])
}, true),
  /**
   * 发起API请求
   * @param {Request} request - 请求对象  
   * @param {string} sessionKey - Session Key
   * @param {number} retryCount - 重试次数
   * @param {string[]} failedKeys - 失败的Keys列表
   * @returns {Promise<Response>} 响应对象
   */
makeApiRequest: async (request, sessionKey, retryCount = 0, failedKeys = []) => {
  try {
    let conversationId = null
    let requestBody = null
    let shouldSaveContext = false
    let originalMessages = []
    let originalBodyText = null
    
    // **新增**: 安全读取request body，避免重复消费
    if (request.body && !originalBodyText) {
      try {
        const requestClone = request.clone()
        originalBodyText = await requestClone.text()
        if (originalBodyText) {
          requestBody = JSON.parse(originalBodyText)
          originalMessages = [...(requestBody.messages || [])]
        }

        conversationId = requestBody.conversation_id || 
                        request.headers.get('x-conversation-id') || 
                        `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        
        // **新增**: 智能上下文管理逻辑
        if (conversationId) {
          const savedContext = await Storage.getConversationContext(conversationId)
          
          if (retryCount > 0 && savedContext) {
            // 重试时：恢复完整上下文并无缝继续
            Logger.info(`Seamless context restoration for retry ${retryCount}: ${conversationId}`)
            
            // 获取历史消息和当前消息
            const historicalMessages = savedContext.messages || []
            const newMessages = originalMessages
            
            // 智能合并算法：确保对话连续性
            const mergedMessages = [...historicalMessages]
            
            // 检查新消息是否为重复或续写
            newMessages.forEach(newMsg => {
              const isDuplicate = historicalMessages.some(histMsg => 
                histMsg.role === newMsg.role && 
                histMsg.content === newMsg.content &&
                Math.abs((histMsg.timestamp || 0) - (newMsg.timestamp || Date.now())) < 5000
              )
              
              if (!isDuplicate) {
                mergedMessages.push({
                  ...newMsg,
                  timestamp: Date.now(),
                  retry_context: true, // 标记为重试上下文
                  original_key: savedContext.lastUsedKey, // 记录原始key
                  switched_key: sessionKey // 记录切换后的key
                })
              }
            })
            
            // 智能上下文长度管理
            if (mergedMessages.length > CONFIG.CONTEXT_MANAGEMENT.MAX_CONTEXT_MESSAGES) {
              const keepCount = CONFIG.CONTEXT_MANAGEMENT.MAX_CONTEXT_MESSAGES
              // 保留最近的对话，但确保包含完整的问答对
              const startIndex = Math.max(0, mergedMessages.length - keepCount)
              requestBody.messages = mergedMessages.slice(startIndex)
            } else {
              requestBody.messages = mergedMessages
            }
            
            // 继承对话模型和参数
            requestBody.model = savedContext.model || requestBody.model
            if (savedContext.temperature) requestBody.temperature = savedContext.temperature
            if (savedContext.max_tokens) requestBody.max_tokens = savedContext.max_tokens
            
            // 添加切换标识，让API知道这是无缝切换
            requestBody.context_switch = {
              from_key: StringUtils.truncateKey(savedContext.lastUsedKey || ''),
              to_key: StringUtils.truncateKey(sessionKey),
              retry_count: retryCount,
              switch_reason: 'token_exhausted_or_invalid'
            }
            
          } else if (retryCount === 0 && savedContext) {
            // 首次请求且有历史上下文：加载历史对话
            Logger.info(`Loading conversation history for seamless continuation: ${conversationId}`)
            
            const historicalMessages = savedContext.messages || []
            const currentMessages = requestBody.messages || []
            
            // 检查是否为对话延续
            if (historicalMessages.length > 0 && currentMessages.length > 0) {
              const lastHistMsg = historicalMessages[historicalMessages.length - 1]
              const firstCurrentMsg = currentMessages[0]
              
              // 如果当前消息不是重复，则合并历史对话
              const isNewConversation = !historicalMessages.some(histMsg => 
                histMsg.role === firstCurrentMsg.role && 
                histMsg.content === firstCurrentMsg.content
              )
              
              if (isNewConversation) {
                const allMessages = [...historicalMessages, ...currentMessages.map(msg => ({
                  ...msg,
                  timestamp: Date.now(),
                  conversation_continued: true
                }))]
                
                // 智能截取，保持对话完整性
                if (allMessages.length > CONFIG.CONTEXT_MANAGEMENT.MAX_CONTEXT_MESSAGES) {
                  const keepCount = CONFIG.CONTEXT_MANAGEMENT.MAX_CONTEXT_MESSAGES
                  let startIndex = allMessages.length - keepCount
                  
                  // 确保从完整的用户问题开始
                  while (startIndex > 0 && allMessages[startIndex].role !== 'user') {
                    startIndex--
                  }
                  
                  requestBody.messages = allMessages.slice(startIndex)
                } else {
                  requestBody.messages = allMessages
                }
              }
            }
          }
          
          shouldSaveContext = true
          requestBody.conversation_id = conversationId
        }
        
      } catch (e) {
        Logger.warn('Could not parse request body for context handling', e)
        requestBody = null
      }
    }

    // 获取OAuth token的错误处理增强
    const authController = new AbortController()
    const authTimeoutId = setTimeout(() => authController.abort(), 10000) // 10秒超时
    const authResponse = await fetch(CONFIG.API_ENDPOINTS.FUCLAUDE_AUTH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_key: sessionKey }),
      signal: authController.signal
    })
    clearTimeout(authTimeoutId)
    const authData = await authResponse.json()

    if (authData.detail === 'invalid sessionKey' || !authData.access_token) {
      Logger.warn(`Session key invalid or no access token: ${StringUtils.truncateKey(sessionKey)}`)

      // **新增**: 详细保存当前对话状态
      if (conversationId && requestBody && shouldSaveContext) {
        try {
          const contextToSave = {
            messages: requestBody.messages || [],
            originalRequest: originalMessages,
            lastFailedKey: sessionKey,
            failureReason: authData.detail || 'no_access_token',
            timestamp: Date.now(),
            model: requestBody.model || 'claude-3-sonnet-20240229',
            retryCount: retryCount,
            conversationState: 'auto_switching',
            switchReason: 'invalid_session_key',
            // 保存请求参数以便恢复
            requestParams: {
              temperature: requestBody.temperature,
              max_tokens: requestBody.max_tokens,
              system: requestBody.system
            }
          }
      
          await Storage.saveConversationContext(conversationId, contextToSave)
          Logger.info(`Saved context before seamless token switch: ${conversationId}`)
        } catch (contextError) {
          Logger.warn('Failed to save context before token switch', contextError)
        }
      }

      // 立即标记当前key为失效并尝试无缝切换
      await Storage.deleteValidKey()
      
      if (retryCount < CONFIG.MAX_RETRY_ATTEMPTS && CONFIG.AUTO_SWITCH_ENABLED) {
        const nextKey = await TokenManager.getNextValidToken(sessionKey, failedKeys)
        
        if (nextKey) {
          const newFailedKeys = [...failedKeys, sessionKey]
          Logger.info(`Seamless auto-switching to next token (attempt ${retryCount + 1}/${CONFIG.MAX_RETRY_ATTEMPTS}): ${StringUtils.truncateKey(nextKey)}`)
          
          // 重新构建请求，保持所有原始数据
          const newRequest = new Request(request.url, {
            method: request.method,
            headers: new Headers(request.headers),
            body: originalBodyText ? originalBodyText : null
          })
          
          return await RouteHandler.makeApiRequest(newRequest, nextKey, retryCount + 1, newFailedKeys)
        }
      }
      
      throw new AppError('All available tokens are invalid, conversation context preserved', HTTP_STATUS.UNAUTHORIZED, 'ALL_TOKENS_INVALID')
    }

    // 构建代理请求 (保持原有逻辑)
    const accessToken = authData.access_token
    
    const fetchConfig = {
      method: request.method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'anthropic-version': '2023-06-01'
      }
    }

    if ((requestBody || request.body) && request.method !== 'GET' && request.method !== 'HEAD') {
      fetchConfig.body = requestBody ? JSON.stringify(requestBody) : request.body
      if (request.body instanceof ReadableStream) {
        fetchConfig.duplex = 'half'
      }
      fetchConfig.duplex = 'half'
    }

    const claudeResponse = await fetch(CONFIG.API_ENDPOINTS.FUCLAUDE_MESSAGES, fetchConfig)

    // **新增**: 改进的错误处理和重试逻辑
    
    if (!claudeResponse.ok || claudeResponse.status === HTTP_STATUS.REDIRECT) {
      // 特殊处理重定向：可能是token失效导致的重定向到登录页
      if (claudeResponse.status === HTTP_STATUS.REDIRECT) {
        const location = claudeResponse.headers.get('location') || ''
        Logger.warn('Received redirect response, likely token expired', { 
          location: location,
          key: StringUtils.truncateKey(sessionKey)
        })
        await Storage.deleteValidKey()
      }
      const shouldRetry = await RouteHandler.handleApiError(claudeResponse, sessionKey)
      
      if (shouldRetry && retryCount < CONFIG.MAX_RETRY_ATTEMPTS && CONFIG.AUTO_SWITCH_ENABLED) {
        Logger.info(`API error (${claudeResponse.status}), auto-retry ${retryCount + 1}/${CONFIG.MAX_RETRY_ATTEMPTS}`)
        
        // 在重试前保存当前完整上下文
        if (conversationId && requestBody) {
          const contextToSave = {
            messages: requestBody.messages || [],
            originalRequest: originalMessages, // 保存原始请求
            lastUsedKey: sessionKey,
            timestamp: Date.now(),
            model: requestBody.model || 'claude-3-sonnet-20240229',
            retryCount: retryCount
          }
          
          try {
            await Storage.saveConversationContext(conversationId, contextToSave)
            Logger.info(`Saved context before retry: ${conversationId}`)
          } catch (contextError) {
            Logger.warn('Failed to save context before retry', contextError)
          }
        }
        
        await Storage.deleteValidKey()
        const nextKey = await TokenManager.getNextValidToken(sessionKey, failedKeys)
        
        if (nextKey) {
          const newFailedKeys = [...failedKeys, sessionKey]
          Logger.info(`Switching to next token: ${StringUtils.truncateKey(nextKey)}`)
          
          // 重新构建request对象以保持原始body
          const newRequest = new Request(request.url, {
            method: request.method,
            headers: request.headers,
            body: originalBodyText ? JSON.stringify({
              ...requestBody,
              conversation_id: conversationId
            }) : null
          })
          
          return await RouteHandler.makeApiRequest(newRequest, nextKey, retryCount + 1, newFailedKeys)
        } else {
          Logger.error('No more valid tokens available for retry')
        }
      }
    }

    // 成功响应时保存上下文
    if (shouldSaveContext && conversationId && requestBody && claudeResponse.ok) {
      try {
        // 构建完整的上下文快照，限制消息数量防止内存泄漏
        const finalMessages = (requestBody.messages || []).slice(-CONFIG.CONTEXT_MANAGEMENT.MAX_CONTEXT_MESSAGES)
        
        // 如果是流式响应，我们需要额外处理
        const isStreaming = claudeResponse.headers.get('content-type')?.includes('text/event-stream')
        
        // 尝试解析响应内容以保存AI回复（仅非流式）
        let aiResponse = null
        if (!isStreaming && claudeResponse.body) {
          try {
            const responseClone = claudeResponse.clone()
            const responseData = await responseClone.json()
            if (responseData.content && responseData.content.length > 0) {
              aiResponse = {
                role: 'assistant',
                content: responseData.content[0].text || '',
                timestamp: Date.now()
              }
            }
          } catch (parseError) {
            Logger.warn('Could not parse AI response for context saving', parseError)
          }
        }

        const contextToSave = {
          messages: aiResponse ? [...finalMessages, aiResponse] : finalMessages,
          originalRequest: originalMessages,
          lastUsedKey: sessionKey,
          timestamp: Date.now(),
          model: requestBody.model || 'claude-3-sonnet-20240229',
          isStreaming: isStreaming,
          responseStatus: claudeResponse.status,
          retryCount: retryCount,
          conversationState: 'active',
          tokenSwitchHistory: retryCount > 0 ? failedKeys : [],
          lastSuccessfulKey: sessionKey
        }
        
        await Storage.saveConversationContext(conversationId, contextToSave)
        Logger.info(`Updated conversation context: ${conversationId} (${finalMessages.length} messages, ${retryCount > 0 ? 'after token switch' : 'normal'})`)
        
      } catch (contextError) {
        Logger.warn('Failed to save conversation context', contextError)
      }
    }

    // **新增**: 构建响应时添加上下文信息
    const responseHeaders = new Headers(claudeResponse.headers)
    if (conversationId) {
      responseHeaders.set('X-Conversation-ID', conversationId)
      // 添加重试信息到响应头
      if (retryCount > 0) {
        responseHeaders.set('X-Retry-Count', retryCount.toString())
        responseHeaders.set('X-Token-Switched', 'true')
      }
    }

    return new Response(claudeResponse.body, {
      status: claudeResponse.status,
      statusText: claudeResponse.statusText,
      headers: responseHeaders
    })

  } catch (error) {
    Logger.error('Error in makeApiRequest', error)
    
    // **新增**: 网络错误重试逻辑
    if (!(error instanceof AppError) && retryCount < CONFIG.MAX_RETRY_ATTEMPTS) {
      Logger.info(`Network error, retry ${retryCount + 1}/${CONFIG.MAX_RETRY_ATTEMPTS}`)
      
      const nextKey = await TokenManager.getNextValidToken(sessionKey, failedKeys)
      if (nextKey) {
        const newFailedKeys = [...failedKeys, sessionKey]
        const newRequest = new Request(request.url, {
          method: request.method,
          headers: request.headers,
          body: originalBodyText || null
        })
        return await RouteHandler.makeApiRequest(newRequest, nextKey, retryCount + 1, newFailedKeys)
      }
    }
    
    if (error instanceof AppError) {
      throw error
    }
    throw new AppError(`API Error: ${error.message}`, HTTP_STATUS.INTERNAL_SERVER_ERROR)
  }
},

/**
 * 创建代理响应
 * @param {Response} response - 原始响应
 * @returns {Response} 代理响应
 */
createProxyResponse: (response) => {
  const headers = new Headers()
  
  // 复制必要的响应头
  const headersToForward = [
    'content-type',
    'content-encoding',
    'cache-control',
    'access-control-allow-origin',
    'access-control-allow-methods',
    'access-control-allow-headers'
  ]

  headersToForward.forEach(headerName => {
    const headerValue = response.headers.get(headerName)
    if (headerValue) {
      headers.set(headerName, headerValue)
    }
  })

  // 设置CORS头
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  })
},

/**
 * 处理CORS预检请求
 * @returns {Response} CORS响应
 */
handleCorsOptions: () => {
  return new Response(null, {
    status: HTTP_STATUS.OK,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    }
  })
},

/**
 * 处理API特定错误
 * @param {Response} response - API响应
 * @param {string} sessionKey - 使用的Session Key
 * @returns {Promise<boolean>} 是否需要重试
 */
handleApiError: async (response, sessionKey) => {
  const contentType = response.headers.get('content-type') || ''
  // 首先尝试读取响应文本，不管内容类型
  let errorText = ''
  try {
    // 克隆响应以避免流被消费
    const responseClone = response.clone()
    errorText = await responseClone.text()

  } catch (readError) {
    Logger.warn('Could not read response text', readError)
    return false
  }

  // 检查HTML内容中的限制提示（针对FuClaude网站返回的HTML页面）
  if (errorText) {
    const errorLower = errorText.toLowerCase()
    const limitPatterns = [
      'out of free messages',
      'you are out of free messages',
      'free messages until',
      'daily limit reached',
      'message limit exceeded',
      'upgrade to continue',
      'free tier limit'
    ]
  
    const hasLimitIssue = limitPatterns.some(pattern => errorLower.includes(pattern))
    if (hasLimitIssue) {
      Logger.warn('Detected usage limit in response content, switching token', { 
        key: StringUtils.truncateKey(sessionKey),
        matchedPattern: limitPatterns.find(p => errorLower.includes(p))
      })
      await Storage.deleteValidKey()
      return true
    }
  }

  if (contentType.includes('application/json')) {
    try {
      // 检查是否为空响应
      if (!errorText || errorText.trim() === '') {
        Logger.warn('Empty error response received')
        return true // 空响应也尝试切换
      }

      const errorData = JSON.parse(errorText)
      // 处理各种错误类型
      if (errorData.error) {
        const errorType = errorData.error.type
        const errorMessage = errorData.error.message
        const errorLower = errorMessage.toLowerCase() // 定义errorLower变量
        switch (errorType) {
          case 'invalid_request_error':
            // 检查是否是token相关错误
            if (errorMessage.toLowerCase().includes('token') || 
                errorMessage.toLowerCase().includes('session') ||
                errorMessage.toLowerCase().includes('authentication')) {
              Logger.warn('Token-related invalid request, switching key')
              await Storage.deleteValidKey()
              return true
            }
            Logger.error('Invalid request error', { message: errorMessage })
            throw new AppError(`Invalid request: ${errorMessage}`, HTTP_STATUS.BAD_REQUEST, 'INVALID_REQUEST')
        
          case 'authentication_error':
          case 'permission_error':
          case 'rate_limit_error':
            Logger.warn(`${errorType} detected, switching token`, { key: StringUtils.truncateKey(sessionKey) })
            await Storage.deleteValidKey()
            return true // 需要重试
          case 'usage_limit_error':
          case 'quota_exceeded_error':
            Logger.warn('Usage/quota exceeded, switching token', { key: StringUtils.truncateKey(sessionKey) })
            await Storage.deleteValidKey()
            return true
          default:
            // 增强关键词检测，包含更多可能的错误情况
            const tokenIssueKeywords = [
              'expired', 'invalid', 'limit', 'quota', 'exceeded', 'suspended',
              'disabled', 'blocked', 'unauthorized', 'forbidden', 'credit',
              'balance', 'overdue', 'usage', 'billing', 'payment', 'account',
              'subscription', 'plan', 'tier', 'throttled', 'rate limit',
              'out of free messages', 'free messages', 'daily limit', 'message limit',
              'usage exceeded', 'free tier', 'upgrade', 'try again'
            ]

            const hasTokenIssue = tokenIssueKeywords.some(keyword => 
              errorLower.includes(keyword)
            )

            if (hasTokenIssue) {
              Logger.warn('Error suggests token issue, switching', { 
                type: errorType, 
                message: errorMessage,
                matchedKeywords: tokenIssueKeywords.filter(k => errorLower.includes(k))
              })
              await Storage.deleteValidKey()
              return true
            }
            Logger.error('Unknown API error', { type: errorType, message: errorMessage })
            await Storage.deleteValidKey()
            return false
        }
      }
      // 检查响应中的特定错误提示
      if (errorText.toLowerCase().includes('session') ||
          errorText.toLowerCase().includes('expired') ||
          errorText.toLowerCase().includes('invalid') ||
          errorText.toLowerCase().includes('limit exceeded') ||
          errorText.toLowerCase().includes('out of free messages') ||
          errorText.toLowerCase().includes('free messages until')) {
        Logger.warn('Error text suggests token issue, switching key')
        await Storage.deleteValidKey()
        return true
      }
    } catch (parseError) {
      Logger.warn('Could not parse error response', { parseError: parseError.message })
      // 解析失败时，根据状态码决定是否切换，但不删除key（在后面统一处理）
    }
  }

  // 基于HTTP状态码的处理
  const shouldRetryStatus = response.status === HTTP_STATUS.UNAUTHORIZED || 
      response.status === HTTP_STATUS.FORBIDDEN ||
      response.status === HTTP_STATUS.TOO_MANY_REQUESTS ||
      response.status === HTTP_STATUS.REDIRECT || // 302重定向可能表示需要重新登录
      response.status === 402 || // Payment Required - 可能是配额用完
      response.status >= 500   // 服务器错误也尝试切换
  if (shouldRetryStatus) {
    await Storage.deleteValidKey()
    return true // 需要重试
  }

  return false // 不需要重试
},
  
  /**
   * 使用Key重定向
   * @param {string} sessionKey - Session Key
   * @returns {Response} 重定向响应
   */
  redirectWithKey: (sessionKey) => {
    const timestamp = new Date().getTime()
    const redirectUrl = `${CONFIG.API_ENDPOINTS.FUCLAUDE_LOGIN}?session_key=${sessionKey}&t=${timestamp}`
    Logger.info(`Redirecting to FuClaude with key: ${StringUtils.truncateKey(sessionKey)}`)

    return new Response(null, {
      status: HTTP_STATUS.REDIRECT,
      headers: { 'Location': redirectUrl }
    })
  }
}

// ================================
// 主处理函数
// ================================

/**
 * Cloudflare Worker 主处理函数
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境变量
 * @param {Object} ctx - 执行上下文
 * @returns {Promise<Response>} 响应对象
 */

export default {
  async fetch(request, env, ctx) {
    try {
      // 首先检查必要的环境变量
      if (!env.SESSION_KEYS) {
        throw new AppError('SESSION_KEYS KV namespace not found', HTTP_STATUS.INTERNAL_SERVER_ERROR)
      }

      // 首先初始化存储
      if (!env.SESSION_KEYS) {
        throw new AppError('SESSION_KEYS KV namespace is required', HTTP_STATUS.INTERNAL_SERVER_ERROR)
      }
      Storage.KV = env.SESSION_KEYS
      
      // 然后初始化配置
      if (env.ADMIN_PASSWORD && env.ADMIN_PASSWORD.trim() !== '') {
        CONFIG.ADMIN_PASSWORD = env.ADMIN_PASSWORD
      } else {
        Logger.warn('ADMIN_PASSWORD not set in environment, using default password')
      }

      // 最后记录环境配置状态
      Logger.info('Environment check completed', {
        hasSessionKeys: !!env.SESSION_KEYS,
        hasAdminPassword: !!env.ADMIN_PASSWORD,
        usingDefaultPassword: !env.ADMIN_PASSWORD
      })

      const url = new URL(request.url)
      const pathname = url.pathname

      Logger.info(`${request.method} ${pathname}`)

      // 处理CORS预检请求
      if (request.method === 'OPTIONS') {
        return RouteHandler.handleCorsOptions()
      }

      // 路由分发
      switch (pathname) {
        case '/':
          return RouteHandler.handleHomePage(request)
        
        case '/api':
          return RouteHandler.handleApiPage(request)
        
        case '/token':
          return RouteHandler.handleSwitchToken(request)
        
        case '/tokens':
          return RouteHandler.handleTokenManagement(request)
        
        case '/v1/messages':
          return RouteHandler.handleApiProxy(request)
        
        default:
          throw new AppError('Page not found', HTTP_STATUS.NOT_FOUND)
      }
    } catch (error) {
      // 判断是否为API请求，决定返回格式
      const isApiRequest = request.url.includes('/v1/') || 
                          request.headers.get('content-type')?.includes('application/json')
      return ErrorHandler.createErrorResponse(error, isApiRequest)
    }
  }
}


// ================================
// 类型定义和接口（JSDoc注释）
// ================================

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - 是否有效
 * @property {Object|null} data - 验证数据
 * @property {string|null} error - 错误信息
 */

/**
 * @typedef {Object} TokenData
 * @property {string[]} publicKeys - 公共Token列表
 * @property {string[]} adminKeys - 管理员Token列表
 */

/**
 * @typedef {Object} PageOptions
 * @property {string} message - 页面消息
 * @property {boolean} isAdmin - 是否为管理员
 * @property {Object|null} validationResults - 验证结果
 * @property {number} pagePublic - 公共Token页码
 * @property {number} pageAdmin - 管理员Token页码
 * @property {string[]} publicKeys - 公共Token列表
 * @property {string[]} adminKeys - 管理员Token列表
 */

// ================================
// 导出配置（用于测试或外部引用）
// ================================



