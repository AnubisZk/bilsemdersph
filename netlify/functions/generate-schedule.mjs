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
  "Ana ÖYG kuralını kesin uygula: turuncu olmayan 7. sınıf öğrencisi Salı, turuncu olmayan 8. sınıf öğrencisi Çarşamba, turuncu öğrenci Cumartesi gelir. artDayException=true olan Müzik/Resim öğrencisi istisnadır: kendi ana gününde kalabilir veya gerektiğinde yalnız Perşembe ya da Cuma gününe alınabilir; Salı ile Çarşamba arasında sınıf günü değişimi yapma. Öğrenci yine yalnız tek gün gelir ve iki dersi o gün art arda kalır.",
  "Her öğrencinin iki dersini aynı gün ve mutlaka art arda gelen iki farklı periyoda yerleştir; iki ders arasında boş periyot veya gün farkı olamaz.",
  "Her assignment tam olarak bir ders kodunu, bir öğretmeni ve seçeneklerde verilen tek bir saat bloğunu temsil etsin. İki ders kodunu, iki öğretmeni veya iki periyodu aynı assignment içinde kesinlikle birleştirme.",
  "Öğrencinin iki dersi için aynı studentId ile iki ayrı assignment üret; birini ilk periyoda, diğerini hemen sonraki periyoda yaz.",
  "Hafta içi öğleden sonra periyotları 14:40-16:10, 16:20-17:50, 18:00-19:30'dur. Cuma günü seçeneklerde verilen 09:00-10:30 ile 10:40-12:10 sabah çifti de Müzik/Resim istisnası için kullanılabilir; 10:40-12:10 ile 14:40-16:10 ardışık sayılmaz. Cumartesi 09:00-10:30 kullanılmaz ve son periyot 16:00-17:30'dur.",
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
  "Girdide lockedAssignments varsa bunlar daha önce kesinleşmiş derslerdir; aynı öğretmeni aynı gün/saatte tekrar kullanma ve bu satırları çıktı assignments listesine kopyalama.",
  "Öğrencide missingLessonCodes alanı varsa yalnız bu eksik kodlar için yeni assignment üret; öğrencinin lockedAssignments içindeki diğer dersine aynı gün bitişik periyot seç.",
  "Öğrencide allowedDays alanı varsa yalnız bu listedeki günlerden birini kullan; başka bir öğrencinin Müzik/Resim istisnasını bu öğrenciye uygulama.",
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

async function openAIRepair(input) {
  const model = process.env.OPENAI_REPAIR_MODEL || process.env.OPENAI_SCHEDULE_MODEL || "gpt-5.4";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ model, store: false, instructions, input, reasoning: { effort: "high" }, text: { format: { type: "json_schema", name: "bilsem_schedule_repair", strict: true, schema } } }),
  });
  const body = await response.json();if(!response.ok)throw new Error(body?.error?.message||"OpenAI tamamlama API hatası.");return{parsed:JSON.parse(openAIText(body)),provider:"OpenAI",model};
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
    const studentList=payload.students.slice(0,1500).map(student=>({...student,lessons:Array.isArray(student.lessons)?student.lessons.slice(0,2):[]})),regular=new Map([["Salı",[]],["Çarşamba",[]],["Cumartesi",[]]]);for(const student of studentList){const color=String(student.color||"").toLocaleLowerCase("tr-TR"),grade=String(student.grade||""),targetDay=color==="turuncu"?"Cumartesi":grade.trim().startsWith("7")?"Salı":"Çarşamba";regular.get(targetDay).push(student)}
    const baseBatches=[...regular].filter(([,students])=>students.length),baseInputs=baseBatches.map(([targetDay,students])=>JSON.stringify({targetDay,students,options:payload.options}));if(baseInputs.some(input=>input.length>900000))return json({error:"Excel verisi AI isteği için çok büyük."},413);const baseResults=await Promise.all(baseInputs.map(input=>selected==="anthropic"?claude(input):openAI(input))),baseAssignments=baseResults.flatMap(result=>Array.isArray(result.parsed.assignments)?result.parsed.assignments:[]),baseWarnings=baseResults.flatMap((result,index)=>[`${baseBatches[index][0]} ana grubu planlandı.`,...(Array.isArray(result.parsed.warnings)?result.parsed.warnings:[])]);
    let assignments=[...baseAssignments];const warnings=[...baseWarnings,"Müzik/Resim öğrencileri ana günleriyle birlikte değerlendirildi; gerektiğinde Perşembe/Cuma istisnası açıktır."];
    for(let repairAttempt=1;repairAttempt<=1;repairAttempt++){const covered=new Set(assignments.flatMap(assignment=>(assignment.studentIds||[]).flatMap(studentId=>(assignment.codes||[]).map(code=>`${studentId}|${String(code).toLocaleUpperCase("tr-TR")}`)))),missing=studentList.filter(student=>student.lessons.length>=2&&student.lessons.some(lesson=>!covered.has(`${student.id}|${String(lesson.code).toLocaleUpperCase("tr-TR")}`))).map(student=>{const color=String(student.color||"").toLocaleLowerCase("tr-TR"),grade=String(student.grade||""),primary=color==="turuncu"?"Cumartesi":grade.trim().startsWith("7")?"Salı":"Çarşamba",allowedDays=student.artDayException?[primary,"Perşembe","Cuma"]:[primary];return{...student,allowedDays,missingLessonCodes:student.lessons.filter(lesson=>!covered.has(`${student.id}|${String(lesson.code).toLocaleUpperCase("tr-TR")}`)).map(lesson=>lesson.code)}});if(!missing.length)break;const allowedPairs=new Set(missing.flatMap(student=>student.missingLessonCodes.map(code=>`${student.id}|${String(code).toLocaleUpperCase("tr-TR")}`))),repairInput=JSON.stringify({targetDay:"EKSİK ÖĞRENCİ TAMAMLAMA TURU — allowedDays KESİNDİR",students:missing,lockedAssignments:assignments,options:payload.options,repairAttempt});if(repairInput.length>900000)break;const repairResult=selected==="openai"?await openAIRepair(repairInput):await claude(repairInput),rawRepaired=Array.isArray(repairResult.parsed.assignments)?repairResult.parsed.assignments:[],repaired=rawRepaired.map(assignment=>({...assignment,studentIds:(assignment.studentIds||[]).filter(studentId=>(assignment.codes||[]).some(code=>allowedPairs.has(`${studentId}|${String(code).toLocaleUpperCase("tr-TR")}`)))})).filter(assignment=>assignment.studentIds.length);assignments=[...assignments,...repaired];warnings.push(`${missing.length} eksik öğrenci için güçlü otomatik tamamlama turu çalıştırıldı (${repairResult.model}); yalnız eksik öğrenci–ders çiftleri kabul edildi.`,...(Array.isArray(repairResult.parsed.warnings)?repairResult.parsed.warnings:[]));if(!repaired.length)break}
    const first=baseResults[0];return json({assignments,warnings,provider:first.provider,model:first.model});
  }catch(error){return json({error:error instanceof Error?error.message:"AI programı oluşturulamadı."},502)}
};
