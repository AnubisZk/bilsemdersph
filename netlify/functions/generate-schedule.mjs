const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

const schema = {
  type: "object",
  properties: {
    assignments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          codes: { type: "array", items: { type: "string" } },
          day: { type: "string" },
          time: { type: "string" },
          teacher: { type: "string" },
          note: { type: "string" },
        },
        required: ["codes", "day", "time", "teacher", "note"],
        additionalProperties: false,
      },
    },
    warnings: { type: "array", items: { type: "string" } },
  },
  required: ["assignments", "warnings"],
  additionalProperties: false,
};

const instructions = [
  "Sen BİLSEM için ders programı optimizasyon uzmanısın.",
  "Girdideki her benzersiz ders kodunu mümkünse tam bir kez programa yerleştir.",
  "Yalnız verilen günleri ve saat bloklarını kullan; saati değiştirme veya yeni saat uydurma.",
  "Aynı ders kodundaki öğrenciler tek gruptur. Öğrenci ve öğretmen çakışmalarını engelle.",
  "Öğretmen kod eşlemelerini, yazılı kuralları, vardiyaları, okul türü tercihlerini, önceki programı ve günlük sınırları uygula.",
  "Kodları yalnız birleştirme açık ve uyumluysa birleştir; öğrenci üst sınırını aşma.",
  "Yerleştirilemeyen bir kod varsa assignments içine uydurma satır ekleme, nedenini warnings alanına yaz.",
].join(" ");

function openAIText(response) {
  for (const item of response.output || []) for (const content of item.content || []) if (content.type === "output_text" && content.text) return content.text;
  return "";
}

async function openAI(input) {
  const model = process.env.OPENAI_SCHEDULE_MODEL || process.env.OPENAI_RULE_MODEL || "gpt-5.4";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ model, store: false, instructions, input, reasoning: { effort: "high" }, text: { format: { type: "json_schema", name: "bilsem_schedule", strict: true, schema } } }),
  });
  const body = await response.json();if(!response.ok)throw new Error(body?.error?.message||"OpenAI API hatası.");return{parsed:JSON.parse(openAIText(body)),provider:"OpenAI",model};
}

async function claude(input) {
  const model = process.env.ANTHROPIC_SCHEDULE_MODEL || process.env.ANTHROPIC_RULE_MODEL || "claude-sonnet-5";
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens: 12000, system: instructions, messages: [{ role: "user", content: input }], output_config: { effort: "high", format: { type: "json_schema", schema } } }),
  });
  const body = await response.json();if(!response.ok)throw new Error(body?.error?.message||"Claude API hatası.");const text=(body.content||[]).find(item=>item.type==="text")?.text||"";return{parsed:JSON.parse(text),provider:"Claude",model};
}

export default async (request) => {
  if(request.method!=="POST")return json({error:"Yalnız POST desteklenir."},405);
  try{
    const payload=await request.json(),provider=payload.provider||"auto";if(!["auto","openai","anthropic"].includes(provider))return json({error:"Geçersiz AI sağlayıcısı."},400);
    if(!Array.isArray(payload.students)||!payload.students.length)return json({error:"Program için öğrenci verisi bulunamadı."},400);
    const selected=provider==="auto"?(process.env.ANTHROPIC_API_KEY?"anthropic":"openai"):provider;if(selected==="anthropic"&&!process.env.ANTHROPIC_API_KEY)return json({error:"Claude için Netlify’da ANTHROPIC_API_KEY tanımlanmalı."},503);if(selected==="openai"&&!process.env.OPENAI_API_KEY)return json({error:"OpenAI için Netlify’da OPENAI_API_KEY tanımlanmalı."},503);
    const input=JSON.stringify({students:payload.students.slice(0,1500),options:payload.options});if(input.length>900000)return json({error:"Excel verisi AI isteği için çok büyük."},413);
    const result=selected==="anthropic"?await claude(input):await openAI(input);return json({assignments:Array.isArray(result.parsed.assignments)?result.parsed.assignments:[],warnings:Array.isArray(result.parsed.warnings)?result.parsed.warnings:[],provider:result.provider,model:result.model});
  }catch(error){return json({error:error instanceof Error?error.message:"AI programı oluşturulamadı."},502)}
};
