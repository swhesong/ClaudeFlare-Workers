/**
 * @fileoverview Cloudflare Worker proxy for Gemini API with robust streaming retry and standardized error responses.
 * Handles model's "thought" process and can filter thoughts after retries to maintain a clean output stream.
 * @version 3.9.0
 * @license MIT
 */

const CONFIG = {
  upstream_url_base: "https://generativelanguage.googleapis.com",
  max_consecutive_retries: 100,
  debug_mode: false,
  retry_delay_ms: 750,
  swallow_thoughts_after_retry: true,
  // 新增：用于重试时告知模型的指令，建议使用中文
  retry_prompt: "请严格按照之前的格式和语言，直接从你上次中断的地方无缝继续，不要有任何重复、前言或额外的解释。",
  // 新增：用于注入系统提示的文本，告知模型结束标志
  system_prompt_injection: "你的回答必须以 `[done]` 作为结束标记，以便我能准确识别你已完成输出。"
};

const NON_RETRYABLE_STATUSES = new Set([400, 401, 403, 404, 429]);
// A set of punctuation marks that are considered to signal a "complete" sentence ending.
// If a stream stops with "finishReason: STOP" but the last character is not in this set,
// it will be treated as an incomplete generation and trigger a retry.
const FINAL_PUNCTUATION = new Set(['.', '?', '!', '。', '？', '！', '}', ']', ')', '"', "'", '”', '’', '`', '\n']);


const logDebug = (...args) => { if (CONFIG.debug_mode) console.log(`[DEBUG ${new Date().toISOString()}]`, ...args); };
const logInfo  = (...args) => console.log(`[INFO ${new Date().toISOString()}]`, ...args);
const logError = (...args) => console.error(`[ERROR ${new Date().toISOString()}]`, ...args);
const truncate = (s, n = 8000) => {
  if (typeof s !== "string") return s;
  return s.length > n ? `${s.slice(0, n)}... [truncated]` : s;
};
function textToUnicodeEscapes(text) {
  let result = "";
  for (let i = 0; i < text.length; i++) {
    const hex = text.charCodeAt(i).toString(16).padStart(4, '0');
    result += `\\u${hex}`;
  }
  return result;
}
const handleOPTIONS = () => new Response(null, {
  headers: {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Goog-Api-Key",
  },
});

const jsonError = (status, message, details = null) => {
  return new Response(JSON.stringify({ error: { code: status, message, status: statusToGoogleStatus(status), details } }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" },
  });
};

function statusToGoogleStatus(code) {
  if (code === 400) return "INVALID_ARGUMENT";
  if (code === 401) return "UNAUTHENTICATED";
  if (code === 403) return "PERMISSION_DENIED";
  if (code === 404) return "NOT_FOUND";
  if (code === 429) return "RESOURCE_EXHAUSTED";
  if (code === 500) return "INTERNAL";
  if (code === 503) return "UNAVAILABLE";
  if (code === 504) return "DEADLINE_EXCEEDED";
  return "UNKNOWN";
}

function buildUpstreamHeaders(reqHeaders) {
  const h = new Headers();
  const copy = (k) => { const v = reqHeaders.get(k); if (v) h.set(k, v); };
  copy("authorization");
  copy("x-goog-api-key");
  copy("content-type");
  copy("accept");
  return h;
}

async function standardizeInitialError(initialResponse) {
  let upstreamText = "";
  try {
    upstreamText = await initialResponse.clone().text();
    logError(`Upstream error body: ${truncate(upstreamText, 2000)}`);
  } catch (e) {
    logError(`Failed to read upstream error text: ${e.message}`);
  }

  let standardized = null;
  if (upstreamText) {
    try {
      const parsed = JSON.parse(upstreamText);
      if (parsed && parsed.error && typeof parsed.error === "object" && typeof parsed.error.code === "number") {
        if (!parsed.error.status) parsed.error.status = statusToGoogleStatus(parsed.error.code);
        standardized = parsed;
      }
    } catch (_) {}
  }

  if (!standardized) {
    const code = initialResponse.status;
    const message = code === 429 ? "Resource has been exhausted (e.g. check quota)." : (initialResponse.statusText || "Request failed");
    const status = statusToGoogleStatus(code);
    standardized = {
      error: {
        code,
        message,
        status,
        details: upstreamText ? [{ "@type": "proxy.upstream", upstream_error: truncate(upstreamText) }] : undefined
      }
    };
  }

  const safeHeaders = new Headers();
  safeHeaders.set("Content-Type", "application/json; charset=utf-8");
  safeHeaders.set("Access-Control-Allow-Origin", "*");
  safeHeaders.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Goog-Api-Key");
  const retryAfter = initialResponse.headers.get("Retry-After");
  if (retryAfter) safeHeaders.set("Retry-After", retryAfter);

  return new Response(JSON.stringify(standardized), {
    status: initialResponse.status,
    statusText: initialResponse.statusText,
    headers: safeHeaders
  });
}

// helper: write one SSE error event based on upstream error response (used when retry hits non-retryable status)
const SSE_ENCODER = new TextEncoder();
async function writeSSEErrorFromUpstream(writer, upstreamResp) {
  const std = await standardizeInitialError(upstreamResp);
  let text = await std.text();
  const ra = upstreamResp.headers.get("Retry-After");
  if (ra) {
    try {
      const obj = JSON.parse(text);
      obj.error.details = (obj.error.details || []).concat([{ "@type": "proxy.retry", retry_after: ra }]);
      text = JSON.stringify(obj);
    } catch (_) {}
  }
  await writer.write(SSE_ENCODER.encode(`event: error\ndata: ${text}\n\n`));
}

async function* sseLineIterator(reader) {
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let lineCount = 0;
  logDebug("Starting SSE line iteration");
  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      logDebug(`SSE stream ended. Total lines processed: ${lineCount}. Remaining buffer: "${buffer.trim()}"`);
      if (buffer.trim()) yield buffer;
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (line.trim()) {
        lineCount++;
        logDebug(`SSE Line ${lineCount}: ${line.length > 200 ? line.substring(0, 200) + "..." : line}`);
        yield line;
      }
    }
  }
}

const isDataLine = (line) => line.startsWith("data: ");
const isBlockedLine = (line) => line.includes("blockReason");

function extractFinishReason(line) {
  if (!line.includes("finishReason")) return null;
  try {
    const i = line.indexOf("{");
    if (i === -1) return null;
    const data = JSON.parse(line.slice(i));
    const fr = data?.candidates?.[0]?.finishReason || null;
    logDebug(`Extracted finishReason: ${fr}`);
    return fr;
  } catch (e) {
    logDebug(`Failed to extract finishReason from line: ${e.message}`);
    return null;
  }
}

/**
 * Parses a "data:" line from an SSE stream to extract text content and determine if it's a "thought" chunk.
 * @param {string} line The "data: " line from the SSE stream.
 * @returns {{text: string, isThought: boolean}} An object containing the extracted text and a boolean indicating if it's a thought.
 */
function parseLineContent(line) {
  try {
    const jsonStr = line.slice(line.indexOf('{'));
    const data = JSON.parse(jsonStr);
    const part = data?.candidates?.[0]?.content?.parts?.[0];
    if (!part) return { text: "", isThought: false };

    const text = part.text || "";
    const isThought = part.thought === true;
    
    if (isThought) {
        logDebug("Extracted thought chunk. This will be tracked.");
    } else if (text) {
        logDebug(`Extracted text chunk (${text.length} chars): ${text.length > 100 ? text.substring(0, 100) + "..." : text}`);
    }

    return { text, isThought };
  } catch (e) {
    logDebug(`Failed to parse content from data line: ${e.message}`);
    return { text: "", isThought: false };
  }
}

function buildRetryRequestBody(originalBody, accumulatedText) {
  logDebug(`Building retry request body. Accumulated text length: ${accumulatedText.length}`);
  logDebug(`Accumulated text preview: ${accumulatedText.length > 200 ? accumulatedText.substring(0, 200) + "..." : accumulatedText}`);
  const retryBody = JSON.parse(JSON.stringify(originalBody));
  if (!retryBody.contents) retryBody.contents = [];
  const lastUserIndex = retryBody.contents.map(c => c.role).lastIndexOf("user");

  // 使用Unicode转义策略增强重试稳定性
  const preservedLength = 15; // 保留一小部分文本为纯文本，以提供直接上下文
  const plainPart = accumulatedText.slice(Math.max(0, accumulatedText.length - preservedLength));
  const escapedPart = accumulatedText.slice(0, Math.max(0, accumulatedText.length - preservedLength));
  const escapedAccumulatedText = textToUnicodeEscapes(escapedPart) + plainPart;
  logDebug(`Applied Unicode escaping to ${escapedPart.length} chars for retry prompt.`);

  const history = [
    { role: "model", parts: [{ text: escapedAccumulatedText }] },
    { role: "user", parts: [{ text: CONFIG.retry_prompt }] } // 使用配置的提示文本
  ];
  if (lastUserIndex !== -1) {
    retryBody.contents.splice(lastUserIndex + 1, 0, ...history);
    logDebug(`Inserted retry context after user message at index ${lastUserIndex}`);
  } else {
    retryBody.contents.push(...history);
    logDebug(`Appended retry context to end of conversation`);
  }
  logDebug(`Final retry request has ${retryBody.contents.length} messages`);
  return retryBody;
}


async function processStreamAndRetryInternally({ initialReader, writer, originalRequestBody, upstreamUrl, originalHeaders }) {
  let accumulatedText = "";
  let consecutiveRetryCount = 0;
  let currentReader = initialReader;
  let totalLinesProcessed = 0;
  const sessionStartTime = Date.now();
  
  let isOutputtingFormalText = false; // Tracks if we have started sending real content.
  let swallowModeActive = false; // Is the worker actively swallowing thoughts post-retry?

  logInfo(`Starting stream processing session. Max retries: ${CONFIG.max_consecutive_retries}`);

  const cleanup = (reader) => { if (reader) { logDebug("Cleaning up reader"); reader.cancel().catch(() => {}); } };

  while (true) {
    let interruptionReason = null; // "DROP", "BLOCK", "FINISH_DURING_THOUGHT", "FINISH_ABNORMAL", "FINISH_INCOMPLETE", "FETCH_ERROR"
    let cleanExit = false; // Flag to signal a valid, successful end of the stream.
    const streamStartTime = Date.now();
    let linesInThisStream = 0;
    let textInThisStream = "";

    logDebug(`=== Starting stream attempt ${consecutiveRetryCount + 1}/${CONFIG.max_consecutive_retries + 1} ===`);

    try {
      for await (const line of sseLineIterator(currentReader)) {
        totalLinesProcessed++;
        linesInThisStream++;

        const { text: textChunk, isThought } = isDataLine(line) ? parseLineContent(line) : { text: "", isThought: false };
        
        // --- Thought Swallowing Logic ---
        if (swallowModeActive) {
            if (isThought) {
                logDebug("Swallowing thought chunk due to post-retry filter:", line);
                const finishReasonOnSwallowedLine = extractFinishReason(line);
                if (finishReasonOnSwallowedLine) {
                    logError(`Stream stopped with reason '${finishReasonOnSwallowedLine}' while swallowing a 'thought' chunk. Triggering retry.`);
                    interruptionReason = "FINISH_DURING_THOUGHT";
                    break; 
                }
                continue; // Skip the rest of the loop for this line.
            } else {
                logInfo("First formal text chunk received after swallowing. Resuming normal stream.");
                swallowModeActive = false;
            }
        }

        // --- Retry Decision Logic ---
        const finishReason = extractFinishReason(line);
        let needsRetry = false;
        
        if (finishReason && isThought) {
          logError(`Stream stopped with reason '${finishReason}' on a 'thought' chunk. This is an invalid state. Triggering retry.`);
          interruptionReason = "FINISH_DURING_THOUGHT";
          needsRetry = true;
        } else if (isBlockedLine(line)) {
          logError(`Content blocked detected in line: ${line}`);
          interruptionReason = "BLOCK";
          needsRetry = true;
        } else if (finishReason === "STOP") {
          const tempAccumulatedText = accumulatedText + textChunk;
          const trimmedText = tempAccumulatedText.trim();
          const lastChar = trimmedText.slice(-1);
          // A stream is considered complete if:
          // 1. It's empty.
          // 2. It ends with the "[done]" marker (primary, most reliable check).
          // 3. As a fallback, it ends with a standard punctuation mark.
          if (!(trimmedText.length === 0 || trimmedText.endsWith('[done]') || FINAL_PUNCTUATION.has(lastChar))) {
            logError(`Finish reason 'STOP' treated as incomplete: text does not end with '[done]' or final punctuation. Last char: '${lastChar}'. Triggering retry.`);
            interruptionReason = "FINISH_INCOMPLETE";
            needsRetry = true;
          }
        } else if (finishReason && finishReason !== "MAX_TOKENS" && finishReason !== "STOP") {
          logError(`Abnormal finish reason: ${finishReason}. Triggering retry.`);

          interruptionReason = "FINISH_ABNORMAL";
          needsRetry = true;
        }

        if (needsRetry) {
          break;
        }
        
        // --- Line is Good: Forward and Update State ---
        await writer.write(new TextEncoder().encode(line + "\n\n"));

        if (textChunk && !isThought) {
          isOutputtingFormalText = true; // Mark that we've started sending real text.
          accumulatedText += textChunk;
          textInThisStream += textChunk;
        }

        if (finishReason === "STOP" || finishReason === "MAX_TOKENS") {
          logInfo(`Finish reason '${finishReason}' accepted as final. Stream complete.`);
          cleanExit = true;
          break;
        }
      }

      // 如果在这次流中成功输出了文本，即使最后因为网络问题等需要重试，
      // 我们也重置连续失败计数器，因为这代表取得了进展，而不是完全卡死。
      if (textInThisStream.length > 0) {
        if (consecutiveRetryCount > 0) {
            logInfo(`Progress was made in the last stream attempt. Resetting consecutive retry count from ${consecutiveRetryCount} to 0.`);
        }
        consecutiveRetryCount = 0;
      }

      if (!cleanExit && interruptionReason === null) {
        logError("Stream ended without finish reason - detected as DROP");
        interruptionReason = "DROP";
      }

    } catch (e) {
      logError(`Exception during stream processing:`, e.message, e.stack);
      interruptionReason = "FETCH_ERROR";
    } finally {
      cleanup(currentReader);
      const streamDuration = Date.now() - streamStartTime;
      logDebug(`Stream attempt summary:`);
      logDebug(`  Duration: ${streamDuration}ms`);
      logDebug(`  Lines processed: ${linesInThisStream}`);
      logDebug(`  Text generated this stream: ${textInThisStream.length} chars`);
      logDebug(`  Total accumulated text: ${accumulatedText.length} chars`);
    }

    if (cleanExit) {
      const sessionDuration = Date.now() - sessionStartTime;
      logInfo(`=== STREAM COMPLETED SUCCESSFULLY ===`);
      logInfo(`Total session duration: ${sessionDuration}ms`);
      logInfo(`Total lines processed: ${totalLinesProcessed}`);
      logInfo(`Total text generated: ${accumulatedText.length} characters`);
      logInfo(`Total retries needed: ${consecutiveRetryCount}`);
      return writer.close();
    }

    // --- Interruption & Retry Activation ---
    logError(`=== STREAM INTERRUPTED ===`);
    logError(`Reason: ${interruptionReason}`);
    
    if (CONFIG.swallow_thoughts_after_retry && isOutputtingFormalText) {
        logInfo("Retry triggered after formal text output. Will swallow subsequent thought chunks until formal text resumes.");
        swallowModeActive = true;
    }

    logError(`Current retry count: ${consecutiveRetryCount}`);
    logError(`Max retries allowed: ${CONFIG.max_consecutive_retries}`);
    logError(`Text accumulated so far: ${accumulatedText.length} characters`);

    if (consecutiveRetryCount >= CONFIG.max_consecutive_retries) {
      const payload = {
        error: {
          code: 504,
          status: "DEADLINE_EXCEEDED",
          message: `Retry limit (${CONFIG.max_consecutive_retries}) exceeded after stream interruption. Last reason: ${interruptionReason}.`,
          details: [{ "@type": "proxy.debug", accumulated_text_chars: accumulatedText.length }]
        }
      };
      await writer.write(SSE_ENCODER.encode(`event: error\ndata: ${JSON.stringify(payload)}\n\n`));
      return writer.close();
    }

    consecutiveRetryCount++;
    logInfo(`=== STARTING RETRY ${consecutiveRetryCount}/${CONFIG.max_consecutive_retries} ===`);

    try {
      const retryBody = buildRetryRequestBody(originalRequestBody, accumulatedText);
      const retryHeaders = buildUpstreamHeaders(originalHeaders);

      logDebug(`Making retry request to: ${upstreamUrl}`);
      logDebug(`Retry request body size: ${JSON.stringify(retryBody).length} bytes`);

      const retryResponse = await fetch(upstreamUrl, {
        method: "POST",
        headers: retryHeaders,
        body: JSON.stringify(retryBody)
      });

      logInfo(`Retry request completed. Status: ${retryResponse.status} ${retryResponse.statusText}`);

      if (NON_RETRYABLE_STATUSES.has(retryResponse.status)) {
        logError(`=== FATAL ERROR DURING RETRY ===`);
        logError(`Received non-retryable status ${retryResponse.status} during retry attempt ${consecutiveRetryCount}`);
        await writeSSEErrorFromUpstream(writer, retryResponse);
        return writer.close();
      }

      if (!retryResponse.ok) {
        logError(`Retry attempt ${consecutiveRetryCount} failed with status ${retryResponse.status}`);
        logError(`This is considered a retryable error - will try again if retries remain`);
        throw new Error(`Upstream server error on retry: ${retryResponse.status}`);
      }

      logInfo(`✓ Retry attempt ${consecutiveRetryCount} successful - got new stream`);
      logInfo(`Continuing with accumulated context (${accumulatedText.length} chars)`);
      currentReader = retryResponse.body.getReader();

    } catch (e) {
      logError(`=== RETRY ATTEMPT ${consecutiveRetryCount} FAILED ===`);
      logError(`Exception during retry:`, e.message);
      logError(`Will wait ${CONFIG.retry_delay_ms}ms before next attempt (if any)`);
      await new Promise(res => setTimeout(res, CONFIG.retry_delay_ms));
    }
  }
}

async function handleStreamingPost(request) {
  const urlObj = new URL(request.url);
  const upstreamUrl = `${CONFIG.upstream_url_base}${urlObj.pathname}${urlObj.search}`;

  logInfo(`=== NEW STREAMING REQUEST ===`);
  logInfo(`Upstream URL: ${upstreamUrl}`);
  logInfo(`Request method: ${request.method}`);
  logInfo(`Content-Type: ${request.headers.get("content-type")}`);

  // system prompt inject
  const body = await request.json();
  const newSystemPromptPart = {
          text: CONFIG.system_prompt_injection // 使用配置的系统指令
      };
  // Case 1: `systemInstruction` field is missing or null.
      // Create the `systemInstruction` object with the new prompt part.
      if (!body.systemInstruction) {
        body.systemInstruction = { parts: [newSystemPromptPart] };
      } 
      // Case 2: `systemInstruction` exists, but its `parts` array is missing, null, or not an array.
      // Overwrite `parts` with a new array containing the new prompt part.
      else if (!Array.isArray(body.systemInstruction.parts)) {
        body.systemInstruction.parts = [newSystemPromptPart];
      } 
      // Case 3: `systemInstruction` and its `parts` array both exist.
      // Append the new prompt part to the end of the existing array.
      else {
        body.systemInstruction.parts.push(newSystemPromptPart);
      }
  // 自动识别新模型并强制开启 includeThoughts 以支持思考吞咽等高级功能
  const geminiVersionMatch = urlObj.pathname.match(/gemini-([\d.]+)/);
  // 假设版本 >= 1.5 的模型支持 "thoughts"
  const isReasoningModel = geminiVersionMatch && parseFloat(geminiVersionMatch[1]) >= 1.5; 

  if (isReasoningModel) {
    if (!body.generationConfig) body.generationConfig = {};
    if (!body.generationConfig.thinkingConfig) body.generationConfig.thinkingConfig = {};
    if (body.generationConfig.thinkingConfig.includeThoughts !== true) {
        logInfo(`Detected reasoning model (v${geminiVersionMatch[1]}). Forcing 'includeThoughts: true' for robust retry handling.`);
        body.generationConfig.thinkingConfig.includeThoughts = true;
    }
  }
  request = new Request(request, { body: JSON.stringify(body) });

  let originalRequestBody;
  try {
    const requestText = await request.clone().text();
    logDebug(`Request body size: ${requestText.length} bytes`);
    originalRequestBody = JSON.parse(requestText);
    logDebug(`Parsed request body with ${originalRequestBody.contents?.length || 0} messages`);
  } catch (e) {
    logError("Failed to parse request body:", e.message);
    return jsonError(400, "Invalid JSON in request body", e.message);
  }

  logInfo("=== MAKING INITIAL REQUEST ===");
  const initialHeaders = buildUpstreamHeaders(request.headers);
  const initialRequest = new Request(upstreamUrl, {
    method: request.method,
    headers: initialHeaders,
    body: JSON.stringify(originalRequestBody),
    duplex: "half"
  });

  const t0 = Date.now();
  const initialResponse = await fetch(initialRequest);
  const dt = Date.now() - t0;

  logInfo(`Initial request completed in ${dt}ms`);
  logInfo(`Initial response status: ${initialResponse.status} ${initialResponse.statusText}`);

  // Initial failure: return non-200 JSON error (do not start SSE)
  if (!initialResponse.ok) {
    logError(`=== INITIAL REQUEST FAILED ===`);
    logError(`Status: ${initialResponse.status}`);
    logError(`Status Text: ${initialResponse.statusText}`);
    return await standardizeInitialError(initialResponse);
  }

  logInfo("=== INITIAL REQUEST SUCCESSFUL - STARTING STREAM PROCESSING ===");
  const initialReader = initialResponse.body?.getReader();
  if (!initialReader) {
    logError("Initial response body is missing despite 200 status");
    return jsonError(502, "Bad Gateway", "Upstream returned a success code but the response body is missing.");
  }

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  processStreamAndRetryInternally({
    initialReader,
    writer,
    originalRequestBody,
    upstreamUrl,
    originalHeaders: request.headers
  }).catch(e => {
    logError("=== UNHANDLED EXCEPTION IN STREAM PROCESSOR ===");
    logError("Exception:", e.message);
    logError("Stack:", e.stack);
    try { writer.close(); } catch (_) {}
  });

  logInfo("Returning streaming response to client");
  return new Response(readable, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*"
    }
  });
}

async function handleNonStreaming(request) {
  const url = new URL(request.url);
  const upstreamUrl = `${CONFIG.upstream_url_base}${url.pathname}${url.search}`;

  const upstreamReq = new Request(upstreamUrl, {
    method: request.method,
    headers: buildUpstreamHeaders(request.headers),
    body: (request.method === "GET" || request.method === "HEAD") ? undefined : request.body
  });

  const resp = await fetch(upstreamReq);
  if (!resp.ok) return await standardizeInitialError(resp);

  const headers = new Headers(resp.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers });
}

// Main request handler for Cloudflare Workers
async function handleRequest(request, env) {
  try {
    Object.assign(CONFIG, env);

    logInfo(`=== WORKER REQUEST ===`);
    logInfo(`Method: ${request.method}`);
    logInfo(`URL: ${request.url}`);
    logInfo(`User-Agent: ${request.headers.get("user-agent") || "unknown"}`);
    logInfo(`CF-Connecting-IP: ${request.headers.get("cf-connecting-ip") || "unknown"}`);

    if (request.method === "OPTIONS") {
      logDebug("Handling CORS preflight request");
      return handleOPTIONS();
    }

    const url = new URL(request.url);
    const alt = url.searchParams.get("alt");
    const isStream = /stream|sse/i.test(url.pathname) || alt === "sse";
    logInfo(`Detected streaming request: ${isStream}`);

    if (request.method === "POST" && isStream) {
      return await handleStreamingPost(request);
    }

    return await handleNonStreaming(request);

  } catch (e) {
    logError("=== TOP-LEVEL EXCEPTION ===");
    logError("Message:", e.message);
    logError("Stack:", e.stack);
    return jsonError(500, "Internal Server Error", "The proxy worker encountered a critical, unrecoverable error.");
  }
}

// Export for Cloudflare Workers
export default { fetch: handleRequest };

// Export for Cloudflare Pages Functions
export const onRequest = (context) => {
  return handleRequest(context.request, context.env);
};

// Deno runtime support for local development
if (typeof Deno !== "undefined") {
  const port = Number(Deno.env.get("PORT")) || 8000;
  console.log(`Deno server listening on http://localhost:${port}`);
  Deno.serve({ port }, (request) => {
    const env = {}; // Simple Deno env mock
    for (const key in Deno.env.toObject()) {
        env[key] = Deno.env.get(key);
    }
    return handleRequest(request, env);
  });
}

