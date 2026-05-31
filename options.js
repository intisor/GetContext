(() => {
  const form = document.getElementById("settings-form");
  const status = document.getElementById("status");

  const fields = {
    providerOrder: document.getElementById("providerOrder"),
    pollinationsModel: document.getElementById("pollinationsModel"),
    groqApiKey: document.getElementById("groqApiKey"),
    groqModel: document.getElementById("groqModel"),
    nvidiaApiKey: document.getElementById("nvidiaApiKey"),
    nvidiaModel: document.getElementById("nvidiaModel"),
    openrouterApiKey: document.getElementById("openrouterApiKey"),
    openrouterModel: document.getElementById("openrouterModel"),
    mistralApiKey: document.getElementById("mistralApiKey"),
    mistralModel: document.getElementById("mistralModel"),
    timeoutMs: document.getElementById("timeoutMs"),
    maxInputChars: document.getElementById("maxInputChars"),
  };

  function setStatus(message) {
    status.textContent = message;
  }

  function populateForm(settings) {
    fields.providerOrder.value = settings.providerOrder.join(", ");
    fields.pollinationsModel.value = settings.providers.pollinations.model;
    fields.groqApiKey.value = settings.providers.groq.apiKey;
    fields.groqModel.value = settings.providers.groq.model;
    fields.nvidiaApiKey.value = settings.providers.nvidia.apiKey;
    fields.nvidiaModel.value = settings.providers.nvidia.model;
    fields.openrouterApiKey.value = settings.providers.openrouter.apiKey;
    fields.openrouterModel.value = settings.providers.openrouter.model;
    fields.mistralApiKey.value = settings.providers.mistral.apiKey;
    fields.mistralModel.value = settings.providers.mistral.model;
    fields.timeoutMs.value = settings.timeoutMs;
    fields.maxInputChars.value = settings.maxInputChars;
  }

  async function load() {
    const settings = await window.ReconAI.getStoredSettings();
    populateForm(settings);
    setStatus("Settings loaded.");
  }

  function buildSettingsFromForm() {
    const defaults = window.ReconAI.getDefaultSettings();
    return {
      ...defaults,
      providerOrder: fields.providerOrder.value
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      timeoutMs: Number(fields.timeoutMs.value) || defaults.timeoutMs,
      maxInputChars: Number(fields.maxInputChars.value) || defaults.maxInputChars,
      providers: {
        pollinations: {
          ...defaults.providers.pollinations,
          model: fields.pollinationsModel.value.trim() || defaults.providers.pollinations.model,
        },
        groq: {
          ...defaults.providers.groq,
          model: fields.groqModel.value.trim() || defaults.providers.groq.model,
          apiKey: fields.groqApiKey.value.trim(),
        },
        nvidia: {
          ...defaults.providers.nvidia,
          model: fields.nvidiaModel.value.trim() || defaults.providers.nvidia.model,
          apiKey: fields.nvidiaApiKey.value.trim(),
        },
        openrouter: {
          ...defaults.providers.openrouter,
          model: fields.openrouterModel.value.trim() || defaults.providers.openrouter.model,
          apiKey: fields.openrouterApiKey.value.trim(),
        },
        mistral: {
          ...defaults.providers.mistral,
          model: fields.mistralModel.value.trim() || defaults.providers.mistral.model,
          apiKey: fields.mistralApiKey.value.trim(),
        },
      },
    };
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const settings = buildSettingsFromForm();
    await window.ReconAI.saveSettings(settings);
    setStatus("Saved. Reload an Upwork job page to use the new provider settings.");
  });

  document.getElementById("testProvider").addEventListener("click", async () => {
    try {
      setStatus("Testing primary provider...");
      const settings = buildSettingsFromForm();
      await window.ReconAI.saveSettings(settings);
      const result = await window.ReconAI.testProvider(settings.providerOrder[0] || "pollinations");
      setStatus(`Success via ${settings.providerOrder[0] || "pollinations"}.\nSummary: ${result.summary}`);
    } catch (error) {
      setStatus(`Test failed: ${error.message || error}`);
    }
  });

  load().catch((error) => setStatus(`Failed to load settings: ${error.message || error}`));
})();
