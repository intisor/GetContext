# Recon – Upwork Client Intel

Recon is a Manifest V3 Chrome extension that scans Upwork job pages, collects review/history text, and asks a free AI provider to summarize the client context.

## What it does

- Collects review text, past job titles, and client info from `https://www.upwork.com/jobs/*`
- Sends the collected text to a free AI provider
- Renders a draggable HUD with:
  - AI summary
  - client name candidates
  - tech stack signals
  - evidence snippets
  - risk notes
  - LinkedIn search shortcut

## Provider defaults

- Primary: Pollinations
- Fallbacks: Groq, NVIDIA Build, OpenRouter, and Mistral if you provide keys where required
- Settings are stored locally in Chrome extension storage
- Mistral is included as an optional OpenAI-compatible provider, but availability depends on your account setup
- NVIDIA Build uses the hosted OpenAI-compatible endpoint at `https://integrate.api.nvidia.com/v1`

## Setup

1. Load the `recon-ext` folder as an unpacked extension in Chrome.
2. Open the extension settings page from the HUD gear icon or Chrome extension details.
3. Adjust provider order and, if needed, add an OpenRouter API key.
4. Reload an Upwork job page.

## Notes

- The extension is configured to prefer free providers first.
- If a provider returns `429` or a transient `5xx`, the extension cools that provider down and falls back.
- The AI output is only as good as the page text available on the current job page.
- If you want stricter privacy, avoid entering an API key and keep the provider order to Pollinations only.
