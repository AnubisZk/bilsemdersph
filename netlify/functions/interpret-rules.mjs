const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

const schema = {
  type: "object",
  properties: {
    teacherMappings: { type: "array", items: { type: "string" } },
    ruleLines: { type: "array", items: { type: "string" } },
  },
  required: ["teacherMappings", "ruleLines"],
  additionalProperties: false,
};

const instructions = [
  "Türkçe okul ders programı kurallarını sadece desteklenen satır biçimlerine dönüştür.",
  "Öğretmen eşlemeleri PATTERN=Öğretmen biçiminde olsun; * jokeri kullanılabilir.",
  "Diğer kurallar yalnız şu biçimlerden biri olsun: KOD Gün SS:DD-SS:DD; KOD birleşmesin; ÖĞRETMEN yalnız Gün,Gün; ÖĞRETMEN Gün uygun değil; ÖĞRETMEN günde en fazla N ders; ÖĞRENCİ_ADI Gün uygun değil.",
  "Metinde olmayan bilgiyi uydurma. Desteklenmeyen isteği çıktı listelerine ekleme.",
].join(" ");

function openAIOutputText(response) {
  for (const item of response.output || []) for (const content of item.content || []) {
    if (content.type === "output_text" && content.text) return content.text;
  }
  return "";
}

async function useOpenAI(input) {
  const model = process.env.OPENAI_RULE_MODEL || "gpt-5.4";
  const apiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      store: false,
      instructions,
      input,
      text: { format: { type: "json_schema", name: "schedule_rules", strict: true, schema } },
    }),
  });
  const responseBody = await apiResponse.json();
  if (!apiResponse.ok) throw new Error(responseBody?.error?.message || "OpenAI API hatası.");
  return { parsed: JSON.parse(openAIOutputText(responseBody)), provider: "OpenAI", model };
}

async function useClaude(input) {
  const model = process.env.ANTHROPIC_RULE_MODEL || "claude-sonnet-5";
  const apiResponse = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1200,
      system: instructions,
      messages: [{ role: "user", content: input }],
      output_config: { effort: "high", format: { type: "json_schema", schema } },
    }),
  });
  const responseBody = await apiResponse.json();
  if (!apiResponse.ok) throw new Error(responseBody?.error?.message || "Claude API hatası.");
  const text = (responseBody.content || []).find((item) => item.type === "text")?.text || "";
  return { parsed: JSON.parse(text), provider: "Claude", model };
}

export default async (request) => {
  if (request.method !== "POST") return json({ error: "Yalnız POST desteklenir." }, 405);
  try {
    const { text, courseCodes = [], provider = "auto" } = await request.json();
    const cleanText = String(text || "").trim();
    if (!cleanText) return json({ error: "Kural metni boş." }, 400);
    if (cleanText.length > 5000) return json({ error: "Kural metni 5000 karakterden kısa olmalı." }, 400);
    if (!["auto", "openai", "anthropic"].includes(provider)) return json({ error: "Geçersiz AI sağlayıcısı." }, 400);

    const selected = provider === "auto" ? (process.env.ANTHROPIC_API_KEY ? "anthropic" : "openai") : provider;
    if (selected === "anthropic" && !process.env.ANTHROPIC_API_KEY) return json({ error: "Claude için Netlify’da ANTHROPIC_API_KEY tanımlanmalı." }, 503);
    if (selected === "openai" && !process.env.OPENAI_API_KEY) return json({ error: "OpenAI için Netlify’da OPENAI_API_KEY tanımlanmalı." }, 503);

    const input = JSON.stringify({ kuralMetni: cleanText, bilinenDersKodlari: courseCodes.slice(0, 500) });
    const result = selected === "anthropic" ? await useClaude(input) : await useOpenAI(input);
    return json({
      teacherMappings: Array.isArray(result.parsed.teacherMappings) ? result.parsed.teacherMappings : [],
      ruleLines: Array.isArray(result.parsed.ruleLines) ? result.parsed.ruleLines : [],
      provider: result.provider,
      model: result.model,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Kural yorumlanamadı." }, 502);
  }
};
