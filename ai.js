(() => {
  const STORAGE_KEY = "recon-ai-settings";
  const COOLDOWN_KEY = "recon-ai-cooldowns";

  const DEFAULT_SETTINGS = {
    providerOrder: ["pollinations", "groq", "nvidia", "openrouter", "mistral"],
    timeoutMs: 20000,
    maxInputChars: 12000,
    providers: {
      pollinations: {
        id: "pollinations",
        label: "Pollinations",
        baseUrl: "https://gen.pollinations.ai/v1",
        model: "openai",
        apiKey: "",
        requiresApiKey: false,
        headers: {},
      },
      groq: {
        id: "groq",
        label: "Groq",
        baseUrl: "https://api.groq.com/openai/v1",
        model: "llama-3.1-8b-instant",
        apiKey: "",
        requiresApiKey: true,
        headers: {},
      },
      nvidia: {
        id: "nvidia",
        label: "NVIDIA Build",
        baseUrl: "https://integrate.api.nvidia.com/v1",
        model: "nvidia/nemotron-3-nano-30b-a3b",
        apiKey: "",
        requiresApiKey: true,
        headers: {
          "X-OpenRouter-Title": "Recon Upwork Client Intel",
        },
      },
      mistral: {
        id: "mistral",
        label: "Mistral",
        baseUrl: "https://api.mistral.ai/v1",
        model: "mistral-small-latest",
        apiKey: "",
        requiresApiKey: true,
        headers: {},
      },
      openrouter: {
        id: "openrouter",
        label: "OpenRouter",
        baseUrl: "https://openrouter.ai/api/v1",
        model: "openrouter/free",
        apiKey: "",
        requiresApiKey: true,
        headers: {
          "HTTP-Referer": "https://www.upwork.com",
          "X-OpenRouter-Title": "Recon Upwork Client Intel",
        },
      },
    },
  };

  const ANALYSIS_PROMPT = [
    "You analyze an Upwork job page using only the supplied text.",
    "Return strict JSON only. No markdown, no code fences, no commentary.",
    "Schema:",
    "{",
    '  "clientNames": [string],',
    '  "techStack": [string],',
    '  "sentimentLabel": "Strong" | "Mixed" | "Neutral" | "Flags",',
    '  "sentimentScore": number,',
    '  "summary": string,',
    '  "evidence": [string],',
    '  "searchKeywords": [string],',
    '  "riskNotes": [string],',
    '  "confidence": number',
    "}",
    "Rules:",
    "- Use empty arrays when a field is not supported by the text.",
    "- Do not invent names, technologies, or evidence.",
    "- Prefer explicit mentions from reviews or job history.",
    "- Keep summary concise and decision-oriented.",
  ].join("\n");

  const API_TIMEOUT_MS = 20000;

  function cloneDefaultSettings() {
    return {
      providerOrder: [...DEFAULT_SETTINGS.providerOrder],
      timeoutMs: DEFAULT_SETTINGS.timeoutMs,
      maxInputChars: DEFAULT_SETTINGS.maxInputChars,
      providers: {
        pollinations: {
          ...DEFAULT_SETTINGS.providers.pollinations,
          headers: { ...DEFAULT_SETTINGS.providers.pollinations.headers },
        },
        groq: {
          ...DEFAULT_SETTINGS.providers.groq,
          headers: { ...DEFAULT_SETTINGS.providers.groq.headers },
        },
        nvidia: {
          ...DEFAULT_SETTINGS.providers.nvidia,
          headers: { ...DEFAULT_SETTINGS.providers.nvidia.headers },
        },
        mistral: {
          ...DEFAULT_SETTINGS.providers.mistral,
          headers: { ...DEFAULT_SETTINGS.providers.mistral.headers },
        },
        openrouter: {
          ...DEFAULT_SETTINGS.providers.openrouter,
          headers: { ...DEFAULT_SETTINGS.providers.openrouter.headers },
        },
      },
    };
  }

  function normalizeSettings(rawSettings) {
    const settings = cloneDefaultSettings();
    const source = rawSettings && typeof rawSettings === "object" ? rawSettings : {};

    if (Array.isArray(source.providerOrder) && source.providerOrder.length) {
      settings.providerOrder = source.providerOrder
        .map((value) => String(value).trim())
        .filter(Boolean);
    }

    if (Number.isFinite(source.timeoutMs) && source.timeoutMs >= 5000) {
      settings.timeoutMs = Math.min(Number(source.timeoutMs), 60000);
    }

    if (Number.isFinite(source.maxInputChars) && source.maxInputChars >= 1000) {
      settings.maxInputChars = Math.min(Number(source.maxInputChars), 50000);
    }

    for (const providerId of Object.keys(settings.providers)) {
      const providerSource = source.providers?.[providerId];
      if (!providerSource || typeof providerSource !== "object") continue;

      if (typeof providerSource.model === "string" && providerSource.model.trim()) {
        settings.providers[providerId].model = providerSource.model.trim();
      }

      if (typeof providerSource.apiKey === "string") {
        settings.providers[providerId].apiKey = providerSource.apiKey.trim();
      }

      if (typeof providerSource.baseUrl === "string" && providerSource.baseUrl.trim()) {
        settings.providers[providerId].baseUrl = providerSource.baseUrl.trim().replace(/\/+$/, "");
      }

      if (providerSource.headers && typeof providerSource.headers === "object") {
        settings.providers[providerId].headers = {
          ...settings.providers[providerId].headers,
          ...providerSource.headers,
        };
      }
    }

    settings.providerOrder = settings.providerOrder.filter((providerId, index, array) => {
      return array.indexOf(providerId) === index && providerId in settings.providers;
    });

    if (!settings.providerOrder.length) {
      settings.providerOrder = [...DEFAULT_SETTINGS.providerOrder];
    }

    return settings;
  }

  async function getStoredSettings() {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    return normalizeSettings(stored[STORAGE_KEY]);
  }

  async function saveSettings(settings) {
    await chrome.storage.local.set({ [STORAGE_KEY]: normalizeSettings(settings) });
  }

  async function getStoredCooldowns() {
    const stored = await chrome.storage.local.get(COOLDOWN_KEY);
    return stored[COOLDOWN_KEY] && typeof stored[COOLDOWN_KEY] === "object" ? stored[COOLDOWN_KEY] : {};
  }

  async function saveCooldowns(cooldowns) {
    await chrome.storage.local.set({ [COOLDOWN_KEY]: cooldowns });
  }

  function getRetryAfterMs(response) {
    const header = response.headers.get("Retry-After");
    if (!header) return 30000;

    const seconds = Number(header);
    if (Number.isFinite(seconds)) return Math.max(seconds * 1000, 1000);

    const date = new Date(header).getTime();
    if (Number.isFinite(date)) return Math.max(date - Date.now(), 1000);

    return 30000;
  }

  function isRetriableStatus(status) {
    return status === 429 || status >= 500;
  }

  function isRetriableError(error) {
    return error?.name === "AbortError" || error?.code === "ETIMEDOUT" || error?.retriable === true;
  }

  function createTimeoutSignal(timeoutMs) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    return {
      signal: controller.signal,
      cleanup() {
        clearTimeout(timeoutId);
      },
    };
  }

  function truncateText(text, limit) {
    if (text.length <= limit) return text;
    return `${text.slice(0, limit)}\n[truncated]`;
  }

  function buildPrompt(pageData) {
    const sections = [];
    if (pageData.url) sections.push(`URL: ${pageData.url}`);
    if (pageData.title) sections.push(`Title: ${pageData.title}`);
    if (pageData.clientInfo) sections.push(`Client info:\n${pageData.clientInfo}`);
    if (pageData.reviewText) sections.push(`Review history:\n${pageData.reviewText}`);
    if (pageData.pastJobTitles?.length) {
      sections.push(`Past job titles:\n${pageData.pastJobTitles.join("\n")}`);
    }

    return `${ANALYSIS_PROMPT}\n\n${sections.join("\n\n")}`.trim();
  }

  function extractJsonCandidate(text) {
    const trimmed = text.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;

    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    if (first >= 0 && last > first) {
      return trimmed.slice(first, last + 1);
    }

    return null;
  }

  function normalizeArray(value) {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => String(item).trim())
      .filter(Boolean)
      .filter((item, index, array) => array.indexOf(item) === index);
  }

  function normalizeAnalysis(raw) {
    const sentimentLabel = ["Strong", "Mixed", "Neutral", "Flags"].includes(raw?.sentimentLabel)
      ? raw.sentimentLabel
      : "Neutral";
    const sentimentScore = Number.isFinite(raw?.sentimentScore) ? raw.sentimentScore : 0;
    const confidence = Number.isFinite(raw?.confidence) ? Math.max(0, Math.min(1, raw.confidence)) : 0;

    return {
      clientNames: normalizeArray(raw?.clientNames),
      techStack: normalizeArray(raw?.techStack),
      sentimentLabel,
      sentimentScore,
      summary: typeof raw?.summary === "string" ? raw.summary.trim() : "",
      evidence: normalizeArray(raw?.evidence),
      searchKeywords: normalizeArray(raw?.searchKeywords),
      riskNotes: normalizeArray(raw?.riskNotes),
      confidence,
    };
  }

  async function readSettings() {
    const [settings, cooldowns] = await Promise.all([getStoredSettings(), getStoredCooldowns()]);
    return { settings, cooldowns };
  }

  async function writeCooldowns(cooldowns) {
    await saveCooldowns(cooldowns);
  }

  async function callProvider(provider, settings, promptText) {
    const timeoutMs = settings.timeoutMs || API_TIMEOUT_MS;
    const { signal, cleanup } = createTimeoutSignal(timeoutMs);

    try {
      const headers = {
        "Content-Type": "application/json",
        ...provider.headers,
      };

      if (provider.apiKey) {
        headers.Authorization = `Bearer ${provider.apiKey}`;
      }

      const response = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        signal,
        body: JSON.stringify({
          model: provider.model,
          messages: [
            { role: "system", content: "Return JSON only." },
            { role: "user", content: promptText },
          ],
          temperature: 0.2,
          stream: false,
        }),
      });

      if (!response.ok) {
        const error = new Error(`Provider ${provider.id} failed with HTTP ${response.status}`);
        error.status = response.status;
        error.retriable = isRetriableStatus(response.status);
        error.retryAfterMs = response.status === 429 ? getRetryAfterMs(response) : 0;
        throw error;
      }

      const payload = await response.json();
      const content = payload?.choices?.[0]?.message?.content;

      if (typeof content !== "string" || !content.trim()) {
        throw new Error(`Provider ${provider.id} returned an empty completion`);
      }

      const jsonText = extractJsonCandidate(content);
      if (!jsonText) {
        throw new Error(`Provider ${provider.id} did not return JSON`);
      }

      return normalizeAnalysis(JSON.parse(jsonText));
    } finally {
      cleanup();
    }
  }

  async function analyzePage(pageData) {
    const { settings, cooldowns } = await readSettings();
    const promptText = truncateText(buildPrompt(pageData), settings.maxInputChars);
    const providerOrder = settings.providerOrder.length ? settings.providerOrder : ["pollinations"];

    const now = Date.now();
    const updatedCooldowns = { ...cooldowns };
    let lastError = null;

    for (const providerId of providerOrder) {
      const provider = settings.providers[providerId];
      if (!provider) continue;

      if (provider.requiresApiKey && !provider.apiKey) {
        continue;
      }

      const cooldownUntil = Number(updatedCooldowns[providerId]) || 0;
      if (cooldownUntil > now) {
        continue;
      }

      try {
        const analysis = await callProvider(provider, settings, promptText);
        updatedCooldowns[providerId] = 0;
        await writeCooldowns(updatedCooldowns);
        return {
          providerId,
          providerLabel: provider.label,
          model: provider.model,
          analysis,
        };
      } catch (error) {
        lastError = error;

        if (error?.status === 429) {
          updatedCooldowns[providerId] = now + (error.retryAfterMs || 30000);
          await writeCooldowns(updatedCooldowns);
          continue;
        }

        if (isRetriableError(error)) {
          updatedCooldowns[providerId] = now + 15000;
          await writeCooldowns(updatedCooldowns);
          continue;
        }
      }
    }

    throw lastError || new Error("No AI provider was available");
  }

  async function testProvider(providerId) {
    const { settings } = await readSettings();
    const provider = settings.providers[providerId];
    if (!provider) throw new Error(`Unknown provider: ${providerId}`);

    return callProvider(
      provider,
      settings,
      'Return strict JSON: {"clientNames":[],"techStack":[],"sentimentLabel":"Neutral","sentimentScore":0,"summary":"health check","evidence":[],"searchKeywords":[],"riskNotes":[],"confidence":1}'
    );
  }

  function getDefaultSettings() {
    return cloneDefaultSettings();
  }

  window.ReconAI = {
    getDefaultSettings,
    getStoredSettings,
    saveSettings,
    analyzePage,
    testProvider,
  };
})();
