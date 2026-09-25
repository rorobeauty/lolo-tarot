// 로로 사주궁합 — 해석 중계 함수 (Vercel Serverless Function)

export const maxDuration = 60;

// ── 보호막: 일시정지 · 출처 확인 · 속도 제한 ──
const ALLOWED_HOST = process.env.LOLO_ALLOWED_HOST || "lolo-tarot.vercel.app";
const _rm = Number(process.env.LOLO_RATE_MAX);
const RATE_MAX = (Number.isFinite(_rm) && _rm > 0) ? Math.floor(_rm) : 8;  // 1분당 IP별 허용 횟수(잘못된 값이면 8)
const _BUCKET = new Map();
function _ip(req){ return ((req.headers["x-forwarded-for"]||"").split(",")[0].trim()) || "?"; }
function _originOk(req){
  const o = String(req.headers.origin || req.headers.referer || "");
  let host = "";
  try { host = new URL(o).hostname; } catch (e) { return false; }
  if (host === ALLOWED_HOST) return true;
  const dev = process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production";
  return !!dev && (host === "localhost" || host === "127.0.0.1");
}
function _allow(ip){
  const now = Date.now();
  const arr = (_BUCKET.get(ip) || []).filter(t => now - t < 60000);
  if (arr.length >= RATE_MAX) { _BUCKET.set(ip, arr); return false; }
  arr.push(now); _BUCKET.set(ip, arr);
  if (_BUCKET.size > 5000) { for (const [k, v] of _BUCKET) { if (!v.some(t => now - t < 60000)) _BUCKET.delete(k); } }
  return true;
}
function guard(req, res){
  if (process.env.LOLO_PAUSED === "1") { res.status(503).json({error:"paused"}); return false; }
  if (!_originOk(req)) { res.status(403).json({error:"forbidden"}); return false; }
  if (!_allow(_ip(req))) { res.status(429).json({error:"slow_down"}); return false; }
  return true;
}


// 모델 이름 정리: 전각 문자(ｇｅｍｉｎｉ)·공백·대문자·같이 복사된 설명 문구가 섞여도 gemini-xxx만 뽑아냄
function _cleanModel(s){
  const m = String(s || "").normalize("NFKC").toLowerCase().match(/gemini-[a-z0-9.\-]+/);
  return m ? m[0].replace(/[.\-]+$/, "") : "";
}
const MODEL = _cleanModel(process.env.LOLO_SAJU_MODEL) || "gemini-3.7-flash";
const MODEL_CHAIN = [...new Set([MODEL, ...["gemini-2.5-flash-lite", "gemini-3.5-flash-lite", "gemini-3.7-flash"]])];
const RELS = { friend: "친구", couple: "연인", family: "가족", coworker: "동료" };

const STEMS="갑을병정무기경신임계",BRS="자축인묘진사오미신유술해";
const SEL="목목화화토토금금수수",BEL="수토목목토화화토금금토수";
const ELK={"목":"목(木)","화":"화(火)","토":"토(土)","금":"금(金)","수":"수(水)"};
function jdn(y,m,d){const a=Math.floor((14-m)/12),yy=y+4800-a,mm=m+12*a-3;return d+Math.floor((153*mm+2)/5)+365*yy+Math.floor(yy/4)-Math.floor(yy/100)+Math.floor(yy/400)-32045;}
function pillars(dateStr,timeStr){const [y,m,d]=dateStr.split("-").map(Number);
 let yy=y;if(m<2||(m===2&&d<4))yy=y-1;
 const ys=((yy-4)%10+10)%10, yb=((yy-4)%12+12)%12;
 const dn=(jdn(y,m,d)+49)%60, ds=dn%10, db=dn%12;
 let hp=null;
 if(timeStr){const [H,Mi]=timeStr.split(":").map(Number);const t=(H*60+Mi+30)%1440;const hb=Math.floor(t/120);const hs=((ds%5)*2+hb)%10;hp={s:hs,b:hb};} // 시주: 한국 표준시(동경135°)와 실제 경도 차이 30분 보정 — 자시 23:30~01:30, 유시 17:30~19:30
 return {y:{s:ys,b:yb},d:{s:ds,b:db},h:hp};}
function pilName(p){return STEMS[p.s]+BRS[p.b];}
function pilDesc(P){let t="연주 "+pilName(P.y)+"("+ELK[SEL[P.y.s]]+"·"+ELK[BEL[P.y.b]]+") · 일주 "+pilName(P.d)+"(일간 "+ELK[SEL[P.d.s]]+")";if(P.h)t+=" · 시주 "+pilName(P.h)+"("+ELK[SEL[P.h.s]]+")";return t;}


function todaySeoul(){
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const g = t => parts.find(p => p.type === t).value;
  return `${g("year")}-${g("month")}-${g("day")}`;
}
function validPerson(p){
  if (!p || typeof p !== "object" || Array.isArray(p)) return false;
  if (typeof p.name !== "string" || !p.name.trim() || p.name.trim().length > 10) return false;
  if (typeof p.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(p.date)) return false;
  const [y, m, d] = p.date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return false;
  if (p.date < "1900-01-01" || p.date > todaySeoul()) return false;
  if (typeof p.time !== "string") return false;
  if (p.time !== "" && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(p.time)) return false;
  return true;
}

function personLine(label, p){
  return `${label}: ${p.name} / 양력 ${p.date}` + (p.time ? ` ${p.time} 출생` : " (태어난 시간 미상)") + " / 사주 데이터: " + pilDesc(pillars(p.date, p.time));
}

function buildPrompt(c){
  return [
"당신은 '로로'라는 사주 궁합 리더입니다. 아래 두 사람의 생년월일(양력)로 관계 궁합을 해석하세요. 사주는 오락용 상징 해석입니다.",
"말투: 다정하고 야무진 언니가 마주 앉아 말해주듯 따뜻한 해요체. 유행어·과한 이모지 금지, 품위 있게. 겁주지 않되 필요한 말은 돌리지 말고 분명하게. 출력 전 모든 문장의 맞춤법과 오탈자를 스스로 검수해 정확한 한국어로만 쓸 것.",
personLine("첫째 사람(나)", c.p1),
personLine("둘째 사람(상대)", c.p2),
`관계: ${RELS[c.rel]}`,
"해석 방식: 위에 계산되어 제공된 각자의 사주 데이터(연주·일주·시주의 간지와 오행)만을 재료로 두 사람의 결을 읽을 것. 오행의 상생(목→화→토→금→수→목)·상극(목↔토, 토↔수, 수↔화, 화↔금, 금↔목)·같은 기운 관계를 실제로 대조해 해석할 것. 전문 용어는 근거 표기에만 쓰고 본문은 일상 언어로. 시주가 없는 사람은 있는 데이터만으로 해석하고 한계를 굳이 언급하지 말 것. 두 사람의 이름을 자연스럽게 불러줄 것.",
"원칙: 이별·절연·퇴사 등 관계를 끊으라는 단정 권유 금지. 결혼·출산·수명·건강·재산에 대한 예언 금지. '반드시', '절대' 같은 운명 단정 금지. 한쪽을 나쁜 사람으로 만들지 말 것. 좋은 말만 나열하지 말고 부딪힐 수 있는 지점도 솔직하게 하나 이상 짚을 것. 관계 유형에 맞는 어휘를 쓸 것(친구면 우정, 동료면 협업 중심).",
"분량과 근거: verdict는 궁합 요약 키워드(12자 이내, 점수·퍼센트 금지). sum은 총평 2~3문장(150자 이내, 오행 관계를 자연스럽게 녹일 것). good은 2~3개, clash는 1~2개이며 각 항목은 {\"t\":\"내용(60자 이내)\",\"b\":\"근거(25자 이내)\"} 형태. b에는 위 사주 데이터에 실제로 존재하는 간지·오행 관계만 인용할 것(예: '로로 일간 수 ↔ 공쥬 일간 화 · 상극'). 데이터에 없는 요소를 지어내지 말 것. tips는 실천 3개(각 40자 이내).",
'JSON만 출력하고 다른 텍스트·마크다운 금지: {"verdict":"...","sum":"...","good":[{"t":"...","b":"..."}],"clash":[{"t":"...","b":"..."}],"tips":["...","...","..."]}',
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

function finalizeOut(data){
  if (!data || typeof data !== "object" || typeof data.verdict !== "string" || typeof data.sum !== "string"
      || !Array.isArray(data.good) || !data.good.length || !data.good.every(x => x && typeof x.t === "string" && typeof x.b === "string")
      || !Array.isArray(data.clash) || !data.clash.length || !data.clash.every(x => x && typeof x.t === "string" && typeof x.b === "string")
      || !Array.isArray(data.tips) || data.tips.length !== 3 || !data.tips.every(v => typeof v === "string" && v.trim())) return null;
  return data;
}

export default async function handler(req, res){
  if (!guard(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({error:"method"});
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({error:"no_key"});

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch(e){ body = null; } }
  if (!body || typeof body !== "object" || Array.isArray(body)
      || typeof body.rel !== "string" || !Object.hasOwn(RELS, body.rel)
      || !validPerson(body.p1) || !validPerson(body.p2))
    return res.status(400).json({error:"bad_input"});

  const PROMPT = buildPrompt(body);
  const MAXTOK = 2200;
  const t0 = Date.now();
  let lastErr = "none", sawRate = false;
  // 자동 갈아타기: 모델 없음(404)·한도(429)·장애(5xx)·형식 실패면 다음 모델로 (과금은 성공/형식실패 건만)
  for (const m of MODEL_CHAIN) {
    const left = 50000 - (Date.now() - t0);
    if (left < 8000) break;                                   // 서버 시간 예산 보호
    let r;
    try {
      r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            contents: [{ parts: [{ text: PROMPT }] }],
            generationConfig: Object.assign(
              { maxOutputTokens: MAXTOK, responseMimeType: "application/json" },
              /^gemini-3/.test(m)
                ? { thinkingConfig: { thinkingLevel: "low" } }   // 3.x 세대
                : { thinkingConfig: { thinkingBudget: 0 } }      // 2.5 세대: 생각 끔
            ),
          }),
          signal: (typeof AbortSignal !== "undefined" && AbortSignal.timeout) ? AbortSignal.timeout(left) : undefined,
        });
    } catch (e) {
      console.error("gemini_exception", m, String(e).slice(0, 200));
      lastErr = "exc"; continue;
    }
    if (!r.ok) {
      const eb = await r.text().catch(() => "");
      console.error("gemini_upstream", m, r.status, eb.slice(0, 300));
      if (r.status === 429) sawRate = true;
      lastErr = String(r.status); continue;
    }
    const out = await r.json().catch(() => null);
    const cand = ((out && out.candidates) || [])[0] || {};
    const text = ((cand.content && cand.content.parts) || []).filter(p => !p.thought).map(p => p.text || "").join("\n");
    const data = finalizeOut(parseJsonLoose(text));
    if (!data) {
      console.error("gemini_bad_json", m, cand.finishReason || "-", "len=" + text.length);
      lastErr = "bad_json"; continue;
    }
    if (m !== MODEL_CHAIN[0]) console.log("gemini_fallback_ok", m);
    return res.status(200).json(data);
  }
  if (sawRate) return res.status(429).json({error:"rate_limited"});
  return res.status(502).json({error: lastErr === "bad_json" ? "bad_json" : "upstream_" + lastErr});
}
