const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4.1-mini";
const MAX_ITEMS = 60;
const MAX_CHARS = 12000;

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
}

function parseBody(request) {
  if (request.body && typeof request.body === "object") {
    return request.body;
  }

  if (typeof request.body === "string") {
    return JSON.parse(request.body);
  }

  return new Promise((resolve, reject) => {
    let raw = "";
    request.on("data", chunk => {
      raw += chunk;
    });
    request.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function normalizeItems(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .filter(item => item && typeof item.id === "string" && typeof item.text === "string")
    .map(item => ({
      id: item.id.slice(0, 80),
      text: item.text.slice(0, 2200)
    }))
    .filter(item => item.text.trim());
}

function getTotalChars(items) {
  return items.reduce((total, item) => total + item.text.length, 0);
}

function buildPrompt({ items, path, title }) {
  return {
    source: "ko",
    target: "en",
    site: "Paul Archive Notes",
    page: {
      path: path || "",
      title: title || ""
    },
    instructions: [
      "Translate each Korean text segment into natural, polished English suitable for a literary webzine.",
      "Preserve proper names, book titles, album titles, dates, issue numbers, and existing English words unless they need light grammatical integration.",
      "Do not summarize, omit, explain, romanize Korean words unnecessarily, or add new information.",
      "Keep the tone calm, intelligent, essayistic, and editorial.",
      "Return JSON only, with exactly this shape: {\"translations\":[{\"id\":\"...\",\"text\":\"...\"}]}."
    ],
    items
  };
}

async function callOpenAI({ apiKey, model, payload, useJsonMode }) {
  const body = {
    model,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: "You are the English translator for Paul Archive Notes, a Korean webzine about books, records, images, philosophy, history, and criticism. Translate faithfully but elegantly."
      },
      {
        role: "user",
        content: JSON.stringify(payload)
      }
    ]
  };

  if (useJsonMode) {
    body.response_format = { type: "json_object" };
  }

  const response = await fetch(process.env.OPENAI_API_BASE_URL || OPENAI_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.error && data.error.message ? data.error.message : "OpenAI translation request failed.";
    const error = new Error(message);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  const content = data.choices && data.choices[0] && data.choices[0].message
    ? data.choices[0].message.content
    : "";

  return JSON.parse(content);
}

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    sendJson(response, 405, { error: "POST only." });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    sendJson(response, 503, { error: "OPENAI_API_KEY is not configured for this deployment." });
    return;
  }

  let body;
  try {
    body = await parseBody(request);
  } catch (error) {
    sendJson(response, 400, { error: "Invalid JSON body." });
    return;
  }

  const items = normalizeItems(body.items);
  const totalChars = getTotalChars(items);

  if (!items.length) {
    sendJson(response, 400, { error: "No translatable items were provided." });
    return;
  }

  if (items.length > MAX_ITEMS || totalChars > MAX_CHARS) {
    sendJson(response, 413, { error: "Translation batch is too large." });
    return;
  }

  const model = process.env.OPENAI_TRANSLATION_MODEL || process.env.OPENAI_MODEL || DEFAULT_MODEL;
  const payload = buildPrompt({
    items,
    path: body.path,
    title: body.title
  });

  try {
    let translated;
    try {
      translated = await callOpenAI({ apiKey, model, payload, useJsonMode: true });
    } catch (error) {
      if (error.status !== 400) {
        throw error;
      }
      translated = await callOpenAI({ apiKey, model, payload, useJsonMode: false });
    }

    const translations = normalizeItems(translated.translations);
    sendJson(response, 200, { translations });
  } catch (error) {
    sendJson(response, 502, { error: error.message || "GPT translation failed." });
  }
};
