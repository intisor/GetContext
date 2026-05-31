/**
 * Recon – Upwork Client Intel
 * Content script: runs on upwork.com/jobs/* pages
 * Collects page text and asks a free AI provider to analyze it.
 */

(() => {
  const OVERLAY_ID = "recon-hud";

  const SELECTORS = {
    reviews: [
      '[data-test="FeedbackToClient"]',
      '[data-test="feedback-to-client"]',
      ".feedback-to-client",
      '[data-cy="feedback-to-client"]',
      ".up-card-section",
    ],
    pastJobs: [
      '[data-test="past-job-title"]',
      ".job-title-heading",
      '[data-cy="job-title"]',
      'h4[class*="title"]',
    ],
    clientInfo: [
      '[data-test="client-info"]',
      ".client-info",
      '[data-cy="client-info"]',
    ],
  };

  function waitForElement(selectors, timeout = 8000) {
    return new Promise((resolve) => {
      const flat = selectors.flat();

      const found = flat.map((selector) => document.querySelector(selector)).find(Boolean);
      if (found) return resolve(found);

      const observer = new MutationObserver(() => {
        const element = flat.map((selector) => document.querySelector(selector)).find(Boolean);
        if (element) {
          observer.disconnect();
          resolve(element);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, timeout);
    });
  }

  function collectTextFromSelectors(selectors, minLength = 20) {
    const collected = [];

    for (const selector of selectors) {
      const nodes = document.querySelectorAll(selector);
      nodes.forEach((node) => {
        const text = node.innerText?.trim();
        if (text && text.length >= minLength) {
          collected.push(text.replace(/\s+/g, " "));
        }
      });
    }

    return collected;
  }

  function collectPageData() {
    const reviewTexts = collectTextFromSelectors(SELECTORS.reviews);
    const pastJobTitles = collectTextFromSelectors(SELECTORS.pastJobs, 4);
    const clientInfo = collectTextFromSelectors(SELECTORS.clientInfo, 8).join("\n");

    const reviewText = reviewTexts.join("\n\n");
    if (!reviewText && !pastJobTitles.length && !clientInfo) {
      return null;
    }

    return {
      url: location.href,
      title: document.title?.trim() || "",
      reviewText,
      pastJobTitles,
      clientInfo,
      reviewCount: reviewTexts.length,
    };
  }

  function buildLinkedInURL(keywords) {
    if (!keywords.length) return null;
    return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(keywords.join(" "))}`;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#96;");
  }

  function renderOverlay(result) {
    if (document.getElementById(OVERLAY_ID)) return;

    const analysis = result.analysis;
    const linkedInURL = buildLinkedInURL(
      analysis.searchKeywords.length ? analysis.searchKeywords : analysis.clientNames
    );

    const hud = document.createElement("div");
    hud.id = OVERLAY_ID;
    hud.setAttribute("data-dragging", "false");

    hud.innerHTML = `
      <div class="recon-header">
        <span class="recon-logo">◈ RECON AI</span>
        <div class="recon-header-actions">
          <span class="recon-provider">${escapeHtml(result.providerLabel)}</span>
          <span class="recon-sentiment recon-sentiment--${analysis.sentimentLabel.toLowerCase()}">${escapeHtml(analysis.sentimentLabel)}</span>
          <button class="recon-settings" title="Open settings">⚙</button>
          <button class="recon-close" title="Close">✕</button>
        </div>
      </div>

      <div class="recon-body">
        <div class="recon-section">
          <div class="recon-label">AI SUMMARY</div>
          <p class="recon-summary">${escapeHtml(analysis.summary || "No summary returned.")}</p>
        </div>

        ${analysis.clientNames.length ? `
          <div class="recon-section">
            <div class="recon-label">CLIENT NAMES</div>
            <div class="recon-chips">
              ${analysis.clientNames.map((name) => `<span class="recon-chip recon-chip--name">${escapeHtml(name)}</span>`).join("")}
            </div>
          </div>
        ` : ""}

        ${analysis.techStack.length ? `
          <div class="recon-section">
            <div class="recon-label">TECH STACK</div>
            <div class="recon-chips">
              ${analysis.techStack.map((tech) => `<span class="recon-chip recon-chip--tech">${escapeHtml(tech)}</span>`).join("")}
            </div>
          </div>
        ` : ""}

        ${analysis.evidence.length ? `
          <div class="recon-section">
            <div class="recon-label">EVIDENCE</div>
            <div class="recon-snippets">
              ${analysis.evidence.map((snippet) => `<p class="recon-snippet">${escapeHtml(snippet)}</p>`).join("")}
            </div>
          </div>
        ` : ""}

        ${analysis.riskNotes.length ? `
          <div class="recon-section">
            <div class="recon-label">RISK NOTES</div>
            <div class="recon-snippets">
              ${analysis.riskNotes.map((note) => `<p class="recon-snippet">${escapeHtml(note)}</p>`).join("")}
            </div>
          </div>
        ` : ""}

        ${linkedInURL ? `
          <div class="recon-section">
            <button class="recon-cta" data-url="${escapeAttribute(linkedInURL)}">🔍 Search on LinkedIn</button>
          </div>
        ` : ""}

        <div class="recon-footnote">
          Confidence ${Math.round((analysis.confidence || 0) * 100)}% · ${escapeHtml(result.model)}
        </div>
      </div>
    `;

    document.body.appendChild(hud);

    hud.querySelector(".recon-close").addEventListener("click", () => hud.remove());

    hud.querySelector(".recon-settings").addEventListener("click", () => {
      chrome.runtime.openOptionsPage();
    });

    const cta = hud.querySelector(".recon-cta");
    if (cta) {
      cta.addEventListener("click", () => {
        window.open(cta.dataset.url, "_blank", "noopener,noreferrer");
      });
    }

    let isDragging = false;
    let startX;
    let startY;
    let origLeft;
    let origTop;

    const header = hud.querySelector(".recon-header");

    header.addEventListener("mousedown", (event) => {
      if (event.target.closest("button")) return;

      isDragging = true;
      hud.setAttribute("data-dragging", "true");

      const rect = hud.getBoundingClientRect();
      startX = event.clientX;
      startY = event.clientY;
      origLeft = rect.left;
      origTop = rect.top;

      hud.style.right = "unset";
      hud.style.bottom = "unset";
      hud.style.left = `${origLeft}px`;
      hud.style.top = `${origTop}px`;

      event.preventDefault();
    });

    document.addEventListener("mousemove", (event) => {
      if (!isDragging) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      hud.style.left = `${Math.max(0, origLeft + dx)}px`;
      hud.style.top = `${Math.max(0, origTop + dy)}px`;
    });

    document.addEventListener("mouseup", () => {
      isDragging = false;
      hud.setAttribute("data-dragging", "false");
    });
  }

  async function init() {
    await waitForElement([...SELECTORS.reviews, ...SELECTORS.pastJobs, ...SELECTORS.clientInfo], 10000);
    await new Promise((resolve) => setTimeout(resolve, 1200));

    const pageData = collectPageData();
    if (!pageData || !window.ReconAI) return;

    try {
      const result = await window.ReconAI.analyzePage(pageData);
      renderOverlay(result);
    } catch (error) {
      console.error("Recon AI analysis failed", error);
    }
  }

  let lastURL = location.href;
  new MutationObserver(() => {
    if (location.href !== lastURL) {
      lastURL = location.href;
      const existing = document.getElementById(OVERLAY_ID);
      if (existing) existing.remove();
      setTimeout(init, 1800);
    }
  }).observe(document.body, { childList: true, subtree: true });

  init();
})();
