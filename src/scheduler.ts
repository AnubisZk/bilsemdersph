export type Shift="Sabah"|"Öğle"|"Tam Gün"|"Bilinmiyor";
export type LessonRef={code:string;raw:string;previousDay?:string;previousTime?:string};
export type Student={id:string;name:string;grade:string;school:string;shift:Shift;unavailable:string[];lessons:LessonRef[]};
export type TeacherRecord={id:string;name:string;patterns:string[];available:string[];unavailable:string[];maxDaily?:number};
export type ScheduleRow={day:string;time:string;codes:string[];teacher:string;students:Student[];merged:boolean;note:string};
export type ScheduleResult={rows:ScheduleRow[];studentRows:Array<{student:Student;row:ScheduleRow}>;warnings:string[];unplaced:Array<{codes:string[];reason:string}>;teacherNames:string[]};
export type AiAssignment={codes:string[];day:string;time:string;teacher?:string;note?:string};
export type ScheduleOptions={days:string[];weekdaySlots:string[];saturdaySlots:string[];teacherMapText:string;customRules:string;teacherAvailability:TeacherRecord[];preventStudentConflicts:boolean;preventTeacherConflicts:boolean;preferPrivateSaturday:boolean;preferMorningWeekday:boolean;preservePrevious:boolean;mergeWhenNeeded:boolean;mergeMax:number;maxStudentDaily:number;maxTeacherDaily:number};

const norm=(s:string)=>String(s||"").toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/ı/g,"i").replace(/[^a-z0-9*]/g,"");
const dayNorm=(s:string)=>{const n=norm(s);if(n.startsWith("sal"))return "Salı";if(n.startsWith("cumart"))return "Cumartesi";if(n.startsWith("pazart"))return "Pazartesi";if(n.startsWith("cars"))return "Çarşamba";if(n.startsWith("pers"))return "Perşembe";if(n==="cuma"||n.startsWith("cum"))return "Cuma";return s};
const stageKey=(code:string)=>{const m=code.toLocaleUpperCase("tr-TR").match(/^([ÖP]?[A-ZÇĞİÖŞÜ]+)(\d)/);return m?`${m[1]}${m[2]}`:code.replace(/\d+$/,'')};

// BİLSEM kapasite kuralı: P ile başlayan proje grupları en fazla 3,
// BYF/ÖYG ve diğer proje dışı gruplar en fazla 8 öğrenciden oluşur.
export function groupStudentLimit(codes:string[],configuredLimit=Number.POSITIVE_INFINITY){
  const curriculumLimit=codes.some(code=>String(code||"").trim().toLocaleUpperCase("tr-TR").startsWith("P"))?3:8;
  return Number.isFinite(configuredLimit)&&configuredLimit>0?Math.min(curriculumLimit,Math.floor(configuredLimit)):curriculumLimit;
}

export function parseTeacherMap(text:string){
  const entries:Array<{pattern:string;teacher:string}>=[];
  for(const raw of text.split(/[\n;]/)){const line=raw.trim();if(!line)continue;const eq=line.match(/^([^=]+)=([^=]+)$/);if(eq){entries.push({pattern:eq[1].trim().toLocaleUpperCase("tr-TR"),teacher:eq[2].trim()});continue}const colon=line.match(/^([^:]+):(.+)$/);if(colon){for(const p of colon[2].split(/[,|]/))entries.push({pattern:p.trim().toLocaleUpperCase("tr-TR"),teacher:colon[1].trim()})}}
  return entries;
}
function teacherFor(code:string,map:ReturnType<typeof parseTeacherMap>){const u=norm(code);const exact=map.find(x=>!norm(x.pattern).endsWith("*")&&norm(x.pattern)===u);if(exact)return exact.teacher;const wild=map.filter(x=>norm(x.pattern).endsWith("*")&&u.startsWith(norm(x.pattern).slice(0,-1))).sort((a,b)=>norm(b.pattern).length-norm(a.pattern).length)[0];return wild?.teacher||"Atanmamış"}

type ParsedRules={fixed:Map<string,{day:string;time?:string}>;studentUnavailable:Map<string,Set<string>>;teacherAllowed:Map<string,Set<string>>;teacherUnavailable:Map<string,Set<string>>;teacherMaxDaily:Map<string,number>;noMerge:Set<string>;warnings:string[]};
function parseRules(text:string,students:Student[],teachers:string[]):ParsedRules{
  const fixed=new Map<string,{day:string;time?:string}>(),studentUnavailable=new Map<string,Set<string>>(),teacherAllowed=new Map<string,Set<string>>(),teacherUnavailable=new Map<string,Set<string>>(),teacherMaxDaily=new Map<string,number>(),noMerge=new Set<string>(),warnings:string[]=[];
  for(const raw of text.split(/\n/)){
    const line=raw.trim();if(!line)continue;
    const upper=line.toLocaleUpperCase("tr-TR"),code=upper.match(/[ÖP]?[A-ZÇĞİÖŞÜ]{2,}\d{2,}/)?.[0];
    const dayMatches=[...line.matchAll(/(Pazartesi|Salı|Çarşamba|Perşembe|Cumartesi|Cuma)/gi)].map(x=>dayNorm(x[1])),dayMatch=dayMatches[0];
    const time=line.match(/(\d{1,2}:\d{2})\s*[-_]\s*(\d{1,2}:\d{2})/);
    if(code&&dayMatch){fixed.set(code,{day:dayMatch,time:time?`${time[1].padStart(5,"0")}-${time[2].padStart(5,"0")}`:undefined});if(/birleşmesin|birlestirme/i.test(line))noMerge.add(code);continue}
    if(code&&/birleşmesin|birlestirme/i.test(line)){noMerge.add(code);continue}
    const teacher=teachers.slice().sort((a,b)=>b.length-a.length).find(t=>norm(line).startsWith(norm(t)));
    if(teacher){let understood=false;if(dayMatches.length&&/yalnız|yalniz|sadece/i.test(line)){teacherAllowed.set(teacher,new Set(dayMatches));understood=true}else if(dayMatch&&/uygun değil|uygun degil|gelemez|çalışmaz|calismaz/i.test(line)){const set=teacherUnavailable.get(teacher)||new Set<string>();set.add(dayMatch);teacherUnavailable.set(teacher,set);understood=true}const maximum=line.match(/günde\s+(?:en\s+fazla\s+)?(\d+)/i);if(maximum){teacherMaxDaily.set(teacher,Number(maximum[1]));understood=true}if(understood)continue}
    const student=students.find(s=>norm(line).startsWith(norm(s.name)));if(student&&dayMatch&&/uygun değil|uygun degil|gelemez/i.test(line)){const set=studentUnavailable.get(student.id)||new Set<string>();set.add(dayMatch);studentUnavailable.set(student.id,set);continue}
    warnings.push(`Yazılı kural anlaşılamadı: “${line}”`)
  }
  return{fixed,studentUnavailable,teacherAllowed,teacherUnavailable,teacherMaxDaily,noMerge,warnings};
}

type Group={codes:string[];teacher:string;students:Student[];previousDay?:string;previousTime?:string;merged:boolean};
const uniqueStudents=(items:Student[])=>[...new Map(items.map(s=>[s.id,s])).values()];
const chunks=<T,>(items:T[],size:number)=>Array.from({length:Math.ceil(items.length/size)},(_,index)=>items.slice(index*size,(index+1)*size));
function slotsFor(options:ScheduleOptions){return options.days.flatMap(day=>(day==="Cumartesi"?options.saturdaySlots:options.weekdaySlots).map((time,index)=>({day,time,index})))}
function isPrivateOrRemote(s:Student){return s.shift==="Tam Gün"||s.shift==="Öğle"||/(özel|kolej|açı|istanbul|izmir|bandırma|tam gün)/i.test(s.school)}
function availabilityMatches(value:string,day:string,time:string){const n=norm(value);return n.includes(norm(day))&&(!/:/.test(value)||n.includes(norm(time.split("-")[0]))||n.includes(norm(time)))}
function teacherRecord(name:string,records:TeacherRecord[]){return records.find(x=>norm(x.name)===norm(name))}
function teacherCanTeach(name:string,day:string,time:string,records:TeacherRecord[]){const record=teacherRecord(name,records);if(!record)return true;if(record.unavailable.some(x=>availabilityMatches(x,day,time)))return false;return !record.available.length||record.available.some(x=>availabilityMatches(x,day,time))}

export function createStudentSchedule(students:Student[],options:ScheduleOptions):ScheduleResult{
  const map=parseTeacherMap(options.teacherMapText),mappedTeachers=[...new Set(map.map(x=>x.teacher))],rules=parseRules(options.customRules,students,mappedTeachers),warnings=[...rules.warnings];
  const grouped=new Map<string,Student[]>(),refs=new Map<string,LessonRef[]>();
  for(const s of students)for(const l of s.lessons){grouped.set(l.code,[...(grouped.get(l.code)||[]),s]);refs.set(l.code,[...(refs.get(l.code)||[]),l])}
  let groups:Group[]=[...grouped].flatMap(([code,list])=>{const r=refs.get(code)||[];const days=r.map(x=>x.previousDay).filter(Boolean) as string[],times=r.map(x=>x.previousTime).filter(Boolean) as string[],studentsForCode=uniqueStudents(list),limit=groupStudentLimit([code],options.mergeMax);if(studentsForCode.length>limit)warnings.push(`${code}: ${studentsForCode.length} öğrenci, grup başına ${limit} sınırı nedeniyle ${Math.ceil(studentsForCode.length/limit)} gruba bölündü.`);return chunks(studentsForCode,limit).map(groupStudents=>({codes:[code],teacher:teacherFor(code,map),students:groupStudents,previousDay:days.sort((a,b)=>days.filter(x=>x===b).length-days.filter(x=>x===a).length)[0],previousTime:times.sort((a,b)=>times.filter(x=>x===b).length-times.filter(x=>x===a).length)[0],merged:false}))});
  const allSlots=slotsFor(options),capacity=allSlots.length;
  if(options.mergeWhenNeeded){
    const teachers=[...new Set(groups.map(g=>g.teacher).filter(x=>x!=="Atanmamış"))];
    for(const teacher of teachers){let mine=groups.filter(g=>g.teacher===teacher);while(mine.length>capacity){let best:[Group,Group]|undefined;for(let i=0;i<mine.length;i++)for(let j=i+1;j<mine.length;j++){const a=mine[i],b=mine[j];if(stageKey(a.codes[0])!==stageKey(b.codes[0])||a.codes.some(c=>rules.noMerge.has(c))||b.codes.some(c=>rules.noMerge.has(c)))continue;const mergedCodes=[...a.codes,...b.codes],size=uniqueStudents([...a.students,...b.students]).length;if(size>groupStudentLimit(mergedCodes,options.mergeMax))continue;if(!best||size<uniqueStudents([...best[0].students,...best[1].students]).length)best=[a,b]}if(!best)break;const [a,b]=best,merged:Group={codes:[...a.codes,...b.codes],teacher,students:uniqueStudents([...a.students,...b.students]),previousDay:a.previousDay===b.previousDay?a.previousDay:undefined,previousTime:a.previousTime===b.previousTime?a.previousTime:undefined,merged:true};groups=groups.filter(g=>g!==a&&g!==b).concat(merged);mine=groups.filter(g=>g.teacher===teacher);warnings.push(`${a.codes.join("+")} ile ${b.codes.join("+")} aynı öğretmenin programına sığması için birleştirildi.`)}}
  }
  groups.sort((a,b)=>{const af=a.codes.some(c=>rules.fixed.has(c))?0:1,bf=b.codes.some(c=>rules.fixed.has(c))?0:1;return af-bf||b.students.length-a.students.length});
  const rows:ScheduleRow[]=[],unplaced:ScheduleResult["unplaced"]=[],studentBusy=new Set<string>(),teacherBusy=new Set<string>(),studentDaily=new Map<string,number>(),teacherDaily=new Map<string,number>();
  for(const g of groups){const fixed=g.codes.map(c=>rules.fixed.get(c)).find(Boolean);let best:{day:string;time:string;index:number;score:number}|undefined;
    for(const slot of allSlots){if(fixed&&(slot.day!==fixed.day||(fixed.time&&slot.time!==fixed.time)))continue;const allowed=rules.teacherAllowed.get(g.teacher),teacherUnavailable=rules.teacherUnavailable.get(g.teacher);if((allowed&&!allowed.has(slot.day))||teacherUnavailable?.has(slot.day)||!teacherCanTeach(g.teacher,slot.day,slot.time,options.teacherAvailability))continue;let invalid=false;for(const s of g.students){const custom=rules.studentUnavailable.get(s.id);if(custom?.has(slot.day)||s.unavailable.some(x=>norm(x).includes(norm(slot.day))&&(norm(x).includes(norm(slot.time.split('-')[0]))||!/:/.test(x)))){invalid=true;break}if(options.preventStudentConflicts&&studentBusy.has(`${s.id}|${slot.day}|${slot.time}`)){invalid=true;break}if((studentDaily.get(`${s.id}|${slot.day}`)||0)>=options.maxStudentDaily){invalid=true;break}}if(invalid)continue;if(options.preventTeacherConflicts&&g.teacher!=="Atanmamış"&&teacherBusy.has(`${g.teacher}|${slot.day}|${slot.time}`))continue;const teacherLimit=teacherRecord(g.teacher,options.teacherAvailability)?.maxDaily??rules.teacherMaxDaily.get(g.teacher)??options.maxTeacherDaily;if(g.teacher!=="Atanmamış"&&(teacherDaily.get(`${g.teacher}|${slot.day}`)||0)>=teacherLimit)continue;
      let score=slot.index*.1;if(options.preferPrivateSaturday){const privateCount=g.students.filter(isPrivateOrRemote).length;score+=slot.day==="Cumartesi"?-privateCount*4:privateCount*4}if(options.preferMorningWeekday){const morning=g.students.filter(s=>s.shift==="Sabah").length;score+=slot.day==="Cumartesi"?morning*2:-morning*2}if(options.preservePrevious){if(g.previousDay&&slot.day===dayNorm(g.previousDay))score-=5;if(g.previousTime&&slot.time===g.previousTime.replace('_','-'))score-=2}const teacherDay=teacherDaily.get(`${g.teacher}|${slot.day}`)||0;score+=teacherDay*1.5;if(!best||score<best.score)best={...slot,score}}
    if(!best){unplaced.push({codes:g.codes,reason:fixed?"Sabitlenen gün/saatte çakışma veya kapasite sınırı var":"Uygun boş zaman bulunamadı"});continue}const row:ScheduleRow={day:best.day,time:best.time,codes:g.codes,teacher:g.teacher,students:g.students,merged:g.merged,note:g.merged?"Birleştirilmiş grup":""};rows.push(row);for(const s of g.students){studentBusy.add(`${s.id}|${best.day}|${best.time}`);studentDaily.set(`${s.id}|${best.day}`,(studentDaily.get(`${s.id}|${best.day}`)||0)+1)}if(g.teacher!=="Atanmamış"){teacherBusy.add(`${g.teacher}|${best.day}|${best.time}`);teacherDaily.set(`${g.teacher}|${best.day}`,(teacherDaily.get(`${g.teacher}|${best.day}`)||0)+1)}}
  if(groups.some(g=>g.teacher==="Atanmamış"))warnings.push("Bazı ders kodlarına öğretmen eşleştirilmedi; bu gruplar öğrenci çakışmasına göre planlandı.");
  for(const s of students.filter(x=>!x.lessons.length))warnings.push(`${s.name}: ders kodu bulunamadı.`);
  const dayOrder=new Map(options.days.map((d,i)=>[d,i]));rows.sort((a,b)=>(dayOrder.get(a.day)??99)-(dayOrder.get(b.day)??99)||a.time.localeCompare(b.time,"tr"));
  const studentRows=rows.flatMap(row=>row.students.map(student=>({student,row}))).sort((a,b)=>a.student.name.localeCompare(b.student.name,"tr")||(dayOrder.get(a.row.day)??99)-(dayOrder.get(b.row.day)??99)||a.row.time.localeCompare(b.row.time));
  return{rows,studentRows,warnings,unplaced,teacherNames:[...new Set(rows.map(r=>r.teacher))].sort((a,b)=>a.localeCompare(b,"tr"))};
}

export function createScheduleFromAi(students:Student[],options:ScheduleOptions,assignments:AiAssignment[],aiWarnings:string[]=[]):ScheduleResult{
  const map=parseTeacherMap(options.teacherMapText),mappedTeachers=[...new Set(map.map(x=>x.teacher))],rules=parseRules(options.customRules,students,mappedTeachers),warnings=[...rules.warnings,...aiWarnings],unplaced:ScheduleResult["unplaced"]=[];
  const studentsByCode=new Map<string,Student[]>();for(const student of students)for(const lesson of student.lessons)studentsByCode.set(lesson.code,[...(studentsByCode.get(lesson.code)||[]),student]);
  const knownCodes=new Set(studentsByCode.keys()),usedCodes=new Set<string>(),validSlots=new Set(slotsFor(options).map(x=>`${x.day}|${x.time}`)),rows:ScheduleRow[]=[];
  const studentBusy=new Set<string>(),teacherBusy=new Set<string>(),studentDaily=new Map<string,number>(),teacherDaily=new Map<string,number>();
  for(const proposal of assignments){
    const codes=[...new Set((proposal.codes||[]).map(x=>String(x).toLocaleUpperCase("tr-TR")).filter(x=>knownCodes.has(x)))];if(!codes.length){warnings.push("AI, Excel’de bulunmayan bir ders kodu önerdi; satır atlandı.");continue}
    if(codes.some(code=>usedCodes.has(code))){unplaced.push({codes,reason:"AI aynı ders kodunu birden fazla kez yerleştirdi"});continue}
    const day=dayNorm(proposal.day),time=String(proposal.time||"").replace("_","-");if(!validSlots.has(`${day}|${time}`)){unplaced.push({codes,reason:"AI geçersiz gün veya saat bloğu önerdi"});continue}
    if(codes.length>1&&(codes.some(code=>rules.noMerge.has(code))||!options.mergeWhenNeeded)){unplaced.push({codes,reason:"Bu ders kodlarının birleştirilmesine izin verilmiyor"});continue}
    const groupStudents=uniqueStudents(codes.flatMap(code=>studentsByCode.get(code)||[])),groupLimit=groupStudentLimit(codes,options.mergeMax);if(groupStudents.length>groupLimit){unplaced.push({codes,reason:`Grup ${groupStudents.length} öğrenci içeriyor; ${codes.some(code=>code.startsWith("P"))?"proje":"BYF/ÖYG"} üst sınırı ${groupLimit}`});continue}
    const configuredTeachers=[...new Set(codes.map(code=>teacherFor(code,map)).filter(x=>x!=="Atanmamış"))];if(configuredTeachers.length>1){unplaced.push({codes,reason:"Birleştirilen kodlar farklı öğretmenlere bağlı"});continue}
    const teacher=configuredTeachers[0]||String(proposal.teacher||"Atanmamış");const fixed=codes.map(code=>rules.fixed.get(code)).find(Boolean);if(fixed&&(fixed.day!==day||(fixed.time&&fixed.time!==time))){unplaced.push({codes,reason:"AI sabit gün/saat kuralına uymadı"});continue}
    const allowed=rules.teacherAllowed.get(teacher),teacherUnavailable=rules.teacherUnavailable.get(teacher);if((allowed&&!allowed.has(day))||teacherUnavailable?.has(day)||!teacherCanTeach(teacher,day,time,options.teacherAvailability)){unplaced.push({codes,reason:"AI öğretmenin gün/saat uygunluk kuralına uymadı"});continue}
    let reason="";for(const student of groupStudents){if(rules.studentUnavailable.get(student.id)?.has(day)||student.unavailable.some(x=>norm(x).includes(norm(day))&&(norm(x).includes(norm(time.split("-")[0]))||!/:/.test(x)))){reason=`${student.name} bu gün/saatte uygun değil`;break}if(options.preventStudentConflicts&&studentBusy.has(`${student.id}|${day}|${time}`)){reason=`${student.name} için saat çakışması`;break}if((studentDaily.get(`${student.id}|${day}`)||0)>=options.maxStudentDaily){reason=`${student.name} günlük ders sınırını aşıyor`;break}}
    if(!reason&&options.preventTeacherConflicts&&teacher!=="Atanmamış"&&teacherBusy.has(`${teacher}|${day}|${time}`))reason=`${teacher} için saat çakışması`;const teacherLimit=teacherRecord(teacher,options.teacherAvailability)?.maxDaily??rules.teacherMaxDaily.get(teacher)??options.maxTeacherDaily;if(!reason&&teacher!=="Atanmamış"&&(teacherDaily.get(`${teacher}|${day}`)||0)>=teacherLimit)reason=`${teacher} günlük grup sınırını aşıyor`;if(reason){unplaced.push({codes,reason});continue}
    const row:ScheduleRow={day,time,codes,teacher,students:groupStudents,merged:codes.length>1,note:proposal.note||"AI tarafından planlandı"};rows.push(row);codes.forEach(code=>usedCodes.add(code));for(const student of groupStudents){studentBusy.add(`${student.id}|${day}|${time}`);studentDaily.set(`${student.id}|${day}`,(studentDaily.get(`${student.id}|${day}`)||0)+1)}if(teacher!=="Atanmamış"){teacherBusy.add(`${teacher}|${day}|${time}`);teacherDaily.set(`${teacher}|${day}`,(teacherDaily.get(`${teacher}|${day}`)||0)+1)}
  }
  for(const code of knownCodes)if(!usedCodes.has(code)&&!unplaced.some(x=>x.codes.includes(code)))unplaced.push({codes:[code],reason:"AI bu ders kodunu programa yerleştirmedi"});
  const dayOrder=new Map(options.days.map((d,i)=>[d,i]));rows.sort((a,b)=>(dayOrder.get(a.day)??99)-(dayOrder.get(b.day)??99)||a.time.localeCompare(b.time,"tr"));const studentRows=rows.flatMap(row=>row.students.map(student=>({student,row}))).sort((a,b)=>a.student.name.localeCompare(b.student.name,"tr")||(dayOrder.get(a.row.day)??99)-(dayOrder.get(b.row.day)??99)||a.row.time.localeCompare(b.row.time));
  if(unplaced.length)warnings.push("AI önerisinin kurallara uymayan bölümleri güvenlik doğrulamasında reddedildi.");return{rows,studentRows,warnings,unplaced,teacherNames:[...new Set(rows.map(r=>r.teacher))].sort((a,b)=>a.localeCompare(b,"tr"))};
}
