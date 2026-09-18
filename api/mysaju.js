// 두 명의 명리학자가 바라본 나 — 해석 중계 함수 (Vercel Serverless Function)

const MODEL = process.env.LOLO_MYSAJU_MODEL || "claude-haiku-4-5-20251001";

const STEMS="갑을병정무기경신임계", BRS="자축인묘진사오미신유술해";
const SEL="목목화화토토금금수수", BEL="수토목목토화화토금금토수";
const ELK={"목":"목(木)","화":"화(火)","토":"토(土)","금":"금(金)","수":"수(水)"};
const ANIMAL=["쥐","소","호랑이","토끼","용","뱀","말","양","원숭이","닭","개","돼지"];

function jdn(y,m,d){const a=Math.floor((14-m)/12),yy=y+4800-a,mm=m+12*a-3;
 return d+Math.floor((153*mm+2)/5)+365*yy+Math.floor(yy/4)-Math.floor(yy/100)+Math.floor(yy/400)-32045;}

// 절기 경계 근사(고정 날짜 기준) — m*100+d 비교식
function sajuMonth(m, d){
  const mk = m*100 + d;
  if (mk <= 105)  return 11; // 1/1~1/5 자월
  if (mk <= 203)  return 12; // 1/6~2/3 축월
  if (mk <= 305)  return 1;  // 2/4~3/5 인월
  if (mk <= 404)  return 2;  // 3/6~4/4 묘월
  if (mk <= 505)  return 3;  // 4/5~5/5 진월
  if (mk <= 605)  return 4;  // 5/6~6/5 사월
  if (mk <= 706)  return 5;  // 6/6~7/6 오월
  if (mk <= 807)  return 6;  // 7/7~8/7 미월
  if (mk <= 907)  return 7;  // 8/8~9/7 신월
  if (mk <= 1007) return 8;  // 9/8~10/7 유월
  if (mk <= 1106) return 9;  // 10/8~11/6 술월
  if (mk <= 1206) return 10; // 11/7~12/6 해월
  return 11;                 // 12/7~12/31 자월
}

function fourPillars(dateStr, timeStr){
  const [y,m,d]=dateStr.split("-").map(Number);
  // 연주 (입춘 기준 근사) — 1월 전체와 2/1~2/3은 직전 연도 연간 사용
  let yy=y; if(m<2||(m===2&&d<4)) yy=y-1;
  const ys=((yy-4)%10+10)%10, yb=((yy-4)%12+12)%12;
  // 월주
  const sm=sajuMonth(m,d);
  const mb=(2+(sm-1))%12;                       // 인=2부터
  const mStart=((ys%5)*2+2)%10;                 // 갑기→병인 시작
  const ms=(mStart+(sm-1))%10;
  // 일주
  const dn=(jdn(y,m,d)+49)%60, ds=dn%10, db=dn%12;
  // 시주
  let hp=null;
  if(timeStr){const H=+timeStr.slice(0,2);const hb=Math.floor(((H+1)%24)/2);const hs=((ds%5)*2+hb)%10;hp={s:hs,b:hb};}
  return {y:{s:ys,b:yb}, m:{s:ms,b:mb}, d:{s:ds,b:db}, h:hp};
}
const pn=p=>STEMS[p.s]+BRS[p.b];
const pe=p=>ELK[SEL[p.s]]+"·"+ELK[BEL[p.b]];

function msText(P, sex){
  let t=`연주 ${pn(P.y)}(${pe(P.y)}) / 월주 ${pn(P.m)}(${pe(P.m)}) / 일주 ${pn(P.d)}(${pe(P.d)})`;
  if(P.h) t+=` / 시주 ${pn(P.h)}(${pe(P.h)})`; else t+=" / 시주 미상";
  t+=` / 일간 ${STEMS[P.d.s]}${ELK[SEL[P.d.s]]} / ${ANIMAL[P.y.b]}띠 / 성별 ${sex==="f"?"여성":"남성"}`;
  return t;
}
function msPils(P){
  const arr=[{l:"연주",v:pn(P.y),e:pe(P.y)},{l:"월주",v:pn(P.m),e:pe(P.m)},{l:"일주",v:pn(P.d),e:pe(P.d)}];
  if(P.h)arr.push({l:"시주",v:pn(P.h),e:pe(P.h)});
  return arr;
}

function buildPrompt(c, P){
  return [
"당신은 서로 다른 성향의 사주명리 전문가 2명입니다. 아래에 이미 산출된 사주 명식을 바탕으로 각자 독립적으로 해석하세요. 사주는 오락용 상징 해석입니다.",
`의뢰인: ${c.name} / 양력 ${c.date}${c.time?` ${c.time} 출생`:""}${c.region?` / 출생지 ${c.region}`:""}`,
`산출된 명식: ${msText(P, c.sex)}`,
`현재 고민: ${c.q}`,
"전문가 구성: [직설적인 현실파]는 좋은 말로 돌려 말하지 않고 가장 강한 장점·약점·반복되기 쉬운 문제를 솔직하고 구체적으로. [신중한 정통파]는 월령·오행의 균형·십성·합충을 종합해 근거가 분명한 내용만 보수적으로, 여러 가능성이 있으면 단정하지 말고 조건을 설명. 두 사람 모두 해요체의 정중한 전문가 말투.",
"다섯 항목 순서(두 전문가 동일): 1) 타고난 성향 2) 재능과 약점 3) 직업·재물운 4) 인간관계·연애운 5) 현재 고민에 대한 조언.",
"원칙: 위에 제공된 명식의 간지·오행만 재료로 사용하고 없는 요소를 지어내지 말 것. 사주를 확정된 운명처럼 단정하거나 불안감을 조성하지 말 것. 건강·수명·죽음·임신 예언 금지, 의료·법률·투자 판단 대행 금지. 퇴사·이별 등 큰 결정을 단정 권유하지 말 것. 뻔하거나 누구에게나 맞는 표현 금지, 이 명식과 이 고민에만 맞는 문장으로. 시주가 미상이면 시주 관련 해석은 생략.",
"분량: 각 항목 t는 최대 2문장(110자 이내). 각 항목 b는 명식 근거 1줄(25자 이내, 예: '일간 계수 · 월지 인목, 식상 발달'). common과 diff는 각 3줄(150자) 이내, diff에는 갈린 이유 포함. acts는 이 고민에 맞는 작고 구체적인 행동 3개(각 40자 이내). 맞춤법과 오탈자를 스스로 검수할 것.",
'JSON만 출력하고 다른 텍스트·마크다운 금지: {"a":[{"t":"...","b":"..."},{...},{...},{...},{...}],"bR":[동일 형식 5개],"common":"...","diff":"...","acts":["...","...","..."]}',
"a는 직설적인 현실파의 5개 항목, bR는 신중한 정통파의 5개 항목이며 순서는 위 다섯 항목 순서를 따릅니다. 본문에서 a·bR 같은 키 이름은 언급 금지.",
  ].join("\n");
}

function parseJsonLoose(text){
  try { return JSON.parse(text); } catch(e) {}
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1]); } catch(e) {} }
  const i = text.indexOf("{"), j = text.lastIndexOf("}");
  if (i > -1 && j > i) { try { return JSON.parse(text.slice(i, j+1)); } catch(e) {} }
  return null;
}

function todaySeoul(){
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const g = t => parts.find(p => p.type === t).value;
  return `${g("year")}-${g("month")}-${g("day")}`;
}

function validateBody(b){
  if (typeof b !== "object" || b === null || Array.isArray(b)) return null;
  // date
  if (typeof b.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(b.date)) return null;
  const [y, m, d] = b.date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  if (b.date < "1900-01-01" || b.date > todaySeoul()) return null;
  // time
  if (typeof b.time !== "string") return null;
  if (b.time !== "" && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(b.time)) return null;
  // name
  if (typeof b.name !== "string") return null;
  const name = b.name.trim();
  if (name.length < 1 || name.length > 10) return null;
  // sex
  if (b.sex !== "f" && b.sex !== "m") return null;
  // q
  if (typeof b.q !== "string") return null;
  const q = b.q.trim();
  if (q.length < 1 || q.length > 200) return null;
  // region
  if (typeof b.region !== "string") return null;
  const region = b.region.trim();
  if (region.length > 20) return null;
  return { name, date: b.date, time: b.time, sex: b.sex, q, region };
}

export const maxDuration = 60;

export default async function handler(req, res){
  if (req.method !== "POST") return res.status(405).json({error:"method"});
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({error:"no_key"});

  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch(e){ b = null; } }
  const c = validateBody(b);
  if (!c) return res.status(400).json({error:"bad_input"});

  const P = fourPillars(c.date, c.time);

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2400,
        messages: [{ role: "user", content: buildPrompt(c, P) }],
      }),
    });
    if (r.status === 429) return res.status(429).json({error:"rate_limited"});
    if (!r.ok) return res.status(502).json({error:"upstream"});
    const out = await r.json();
    const text = (out.content || []).filter(x => x.type === "text").map(x => x.text).join("\n");
    const data = parseJsonLoose(text);
    const norm = a => Array.isArray(a) ? a.map(x => typeof x === "string" ? {t:x,b:""} : (x && typeof x.t === "string") ? {t:x.t, b: typeof x.b === "string" ? x.b : ""} : null) : null;
    if (data){ data.a = norm(data.a); data.bR = norm(data.bR); }
    const ok = a => a && a.length === 5 && !a.includes(null);
    if (!data || !ok(data.a) || !ok(data.bR)
        || typeof data.common !== "string" || typeof data.diff !== "string"
        || !Array.isArray(data.acts) || data.acts.length !== 3)
      return res.status(502).json({error:"bad_json"});
    data.ms = { pils: msPils(P) };
    return res.status(200).json(data);
  } catch (e) {
    return res.status(502).json({error:"upstream"});
  }
}
