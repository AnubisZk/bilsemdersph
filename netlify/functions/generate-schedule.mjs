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
          codes: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 1 },
          studentIds: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 8 },
          day: { type: "string" },
          time: { type: "string" },
          teacher: { type: "string" },
          note: { type: "string" },
        },
        required: ["codes", "studentIds", "day", "time", "teacher", "note"],
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
  "Girdideki her öğrenci-ders eşleşmesini tam bir kez programa yerleştir. Aynı ders kodunu farklı studentIds alt gruplarıyla birden fazla assignment satırında kullanabilirsin.",
  "Yalnız verilen günleri ve saat bloklarını kullan; saati değiştirme veya yeni saat uydurma.",
  "Ana ÖYG kuralını kesin uygula: turuncu olmayan 7. sınıf öğrencisi Salı, turuncu olmayan 8. sınıf öğrencisi Çarşamba, turuncu öğrenci yalnız Cumartesi gelir. artDayException=true olan Müzik/Resim öğrencisi istisnadır ve gerektiğinde Salı veya Çarşamba günlerinden birine alınabilir; yine yalnız tek gün gelir ve iki dersi o gün art arda kalır.",
  "Her öğrencinin iki dersini aynı gün ve mutlaka art arda gelen iki farklı periyoda yerleştir; iki ders arasında boş periyot veya gün farkı olamaz.",
  "Her assignment tam olarak bir ders kodunu, bir öğretmeni ve seçeneklerde verilen tek bir saat bloğunu temsil etsin. İki ders kodunu, iki öğretmeni veya iki periyodu aynı assignment içinde kesinlikle birleştirme.",
  "Öğrencinin iki dersi için aynı studentId ile iki ayrı assignment üret; birini ilk periyoda, diğerini hemen sonraki periyoda yaz.",
  "Hafta içi periyotları 14:40-16:10, 16:20-17:50, 18:00-19:30'dur. Cumartesi 09:00-10:30 kullanılmaz ve son periyot 16:00-17:30'dur.",
  "Sarı öğrenci erken periyotlara önceliklidir; mavi öğrenci hafta içi yalnız 2. veya 3. periyoda; turuncu öğrenci yalnız Cumartesiye yerleştirilir.",
  "Aynı ders kodundaki öğrenciler aynı gruptur. Öğrenci ve öğretmen çakışmalarını engelle.",
  "Her assignment içinde yalnız o grupta bulunan öğrencilerin gerçek id değerlerini studentIds alanında döndür; öğrenci uydurma ve bir öğrenciyi almadığı derse ekleme.",
  "Ders kodunu öğrencinin lessons alanında yazıldığı biçimle harfiyen kopyala; kısaltma, yeniden adlandırma veya yeni kod üretme.",
  "Grupları mümkünse 3-5 kişi oluştur; gerekirse BYF/ÖYG için 8'e kadar çık. Proje kodlarında 3'ü aşma. 1-2 kişilik grubu yalnız zorunluysa kullan.",
  "P ile başlayan proje ders kodlarında bir gruba en fazla 3 öğrenci, diğer BYF/ÖYG gruplarında en fazla 8 öğrenci ata.",
  "Bir ders kodunda bu sayıdan fazla öğrenci varsa kapasiteyi aşan tek grup üretme; yerleştiremiyorsan nedenini warnings alanına yaz.",
  "Öğretmen kod eşlemelerini, yazılı kuralları, vardiyaları, okul türü tercihlerini, önceki programı ve günlük sınırları uygula.",
  "Kodları yalnız birleştirme açık ve uyumluysa birleştir; öğrenci üst sınırını aşma.",
  "Yerleştirilemeyen bir kod varsa assignments içine uydurma satır ekleme, nedenini warnings alanına yaz.",
  "Bir öğrenci yerleştirilemiyorsa warnings alanında öğrenci id değerini, ders kodunu ve kesin engeli açıkça belirt; öğrenciyi sessizce atlama.",
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
    body: JSON.stringify({ model, max_tokens: 12000, system: instructions, messages: [{ role: "user", content: input }], output_config: { effort: "low", format: { type: "json_schema", schema } } }),
  });
  const body = await response.json();if(!response.ok)throw new Error(body?.error?.message||"Claude API hatası.");const text=(body.content||[]).find(item=>item.type==="text")?.text||"";return{parsed:JSON.parse(text),provider:"Claude",model};
}

export default async (request) => {
  if(request.method!=="POST")return json({error:"Yalnız POST desteklenir."},405);
  try{
    const payload=await request.json(),provider=payload.provider||"auto";if(!["auto","openai","anthropic"].includes(provider))return json({error:"Geçersiz AI sağlayıcısı."},400);
    if(!Array.isArray(payload.students)||!payload.students.length)return json({error:"Program için öğrenci verisi bulunamadı."},400);
    const selected=provider==="auto"?(process.env.OPENAI_API_KEY?"openai":"anthropic"):provider;if(selected==="anthropic"&&!process.env.ANTHROPIC_API_KEY)return json({error:"Claude için Netlify’da ANTHROPIC_API_KEY tanımlanmalı."},503);if(selected==="openai"&&!process.env.OPENAI_API_KEY)return json({error:"OpenAI için Netlify’da OPENAI_API_KEY tanımlanmalı."},503);
    const studentList=payload.students.slice(0,1500).map(student=>({...student,lessons:Array.isArray(student.lessons)?student.lessons.slice(0,2):[]})),input=JSON.stringify({students:studentList,options:payload.options});if(input.length>900000)return json({error:"Excel verisi AI isteği için çok büyük."},413);
    const result=selected==="anthropic"?await claude(input):await openAI(input),assignments=Array.isArray(result.parsed.assignments)?result.parsed.assignments:[],warnings=["Bütün öğrenciler öğretmen çakışmaları ve Müzik/Resim gün istisnasıyla tek model çağrısında birlikte planlandı.",...(Array.isArray(result.parsed.warnings)?result.parsed.warnings:[])];return json({assignments,warnings,provider:result.provider,model:result.model});
  }catch(error){return json({error:error instanceof Error?error.message:"AI programı oluşturulamadı."},502)}
};
