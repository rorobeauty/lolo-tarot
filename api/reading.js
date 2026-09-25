// 로로 타로 — 해석 중계 함수 (Vercel Serverless Function)
// API 키는 서버 환경변수에만 존재하며 방문자에게 절대 노출되지 않습니다.

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
const MODEL = _cleanModel(process.env.LOLO_MODEL) || "gemini-3.7-flash";
const MODEL_CHAIN = [...new Set([MODEL, ...["gemini-2.5-flash-lite", "gemini-3.5-flash-lite", "gemini-3.7-flash"]])];

const MAJORS = ["The Fool","The Magician","The High Priestess","The Empress","The Emperor","The Hierophant","The Lovers","The Chariot","Strength","The Hermit","Wheel of Fortune","Justice","The Hanged Man","Death","Temperance","The Devil","The Tower","The Star","The Moon","The Sun","Judgement","The World"];
const SUITS = ["Wands","Cups","Swords","Pentacles"];
const RANKS = ["Ace","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Page","Knight","Queen","King"];
const VALID_CARDS = new Set([...MAJORS, ...SUITS.flatMap(s => RANKS.map(r => `${r} of ${s}`))]);

const KO_MAJOR = {"The Fool":"바보","The Magician":"마법사","The High Priestess":"여사제","The Empress":"여황제","The Emperor":"황제","The Hierophant":"교황","The Lovers":"연인","The Chariot":"전차","Strength":"힘","The Hermit":"은둔자","Wheel of Fortune":"운명의 수레바퀴","Justice":"정의","The Hanged Man":"매달린 사람","Death":"죽음","Temperance":"절제","The Devil":"악마","The Tower":"탑","The Star":"별","The Moon":"달","The Sun":"태양","Judgement":"심판","The World":"세계"};
const KO_SUIT = {"Wands":"완드","Cups":"컵","Swords":"소드","Pentacles":"펜타클"};
const KO_RANK = {"Ace":"에이스","Two":"2","Three":"3","Four":"4","Five":"5","Six":"6","Seven":"7","Eight":"8","Nine":"9","Ten":"10","Page":"페이지","Knight":"기사","Queen":"퀸","King":"킹"};
const CATS = {work:"일·진로", rel:"관계", new:"새로운 도전", money:"돈·현실", mind:"마음·회복"};
const POS = ["현재 상황","살펴볼 점","행동 조언"];

function koName(card){
  if (KO_MAJOR[card]) return KO_MAJOR[card];
  const [r, s] = card.split(" of ");
  return `${KO_SUIT[s]} ${KO_RANK[r]}`;
}

function buildPrompt(q, cat, cards){
  const names = cards.map((c,i)=>`${POS[i]}: ${koName(c)}`).join(" / ");
  return [
"당신은 '로로'라는 타로 리더입니다. 아래 고민과 이미 무작위로 뽑힌 카드 3장(모두 정방향, 라이더-웨이트-스미스)을 해석하세요. 타로는 오락용 상징 해석입니다.",
"말투: 다정하고 야무진 언니가 마주 앉아 말해주듯 따뜻한 해요체. 유행어·과한 이모지 금지, 품위 있게. 겁주지 않되 필요한 말은 돌리지 말고 분명하게. 출력 전 모든 문장의 맞춤법과 오탈자를 스스로 검수해 정확한 한국어로만 쓸 것.",
`고민(${CATS[cat]} 영역): ${q}`,
`뽑힌 카드: ${names}`,
"구성: 같은 카드 3장을 로로가 두 갈래로 읽습니다. [직설 해석]은 놓치기 쉬운 문제와 현실적 선택을 직설적으로(겁주기·비난 금지). [교과서 해석]은 전통적 의미·배치 위치·세 카드의 연결 중심으로, 해석이 갈리면 조건을 설명. 억지 반대 의견을 만들지 말고 실제로 다른 부분만 구분. 본문에서는 두 갈래를 '직설 해석'·'교과서 해석'이라고만 부르고, a·bR 같은 데이터 키 이름은 절대 언급 금지.",
"원칙: 사용자가 말하지 않은 과거·속마음·타인의 의도를 사실처럼 만들지 말 것. 확률·날짜·합격·수익 보장 등 근거 없는 예측 금지. 건강·수명·임신·죽음 예언 금지, 의료·법률·투자 판단 대행 금지. 카드를 이유로 퇴사·관계 단절·큰 지출 단정 권유 금지. 죽음·탑·악마류 카드는 재난이 아닌 변화·구조의 흔들림·집착의 상징으로. 모든 카드를 무조건 좋게 비틀지 말 것. 범용 위로 대신 카드 상징과 이 고민 문장을 직접 연결한 구체적 문장.",
"분량: 각 항목 t는 한글 최대 2문장(항목당 100자 이내), b는 '카드명 · 상징 요약' 형식 20자 이내. common/diff 각 120자 이내, acts는 이 고민에 맞는 작고 구체적인 행동 3개(각 40자 이내). q는 고민을 60자 이내로 요약.",
'JSON만 출력하고 다른 텍스트·마크다운 금지: {"q":"...","a":[{"t":"...","b":"..."},{"t":"...","b":"..."},{"t":"...","b":"..."}],"bR":[동일 형식 3개],"common":"...","diff":"...","acts":["...","...","..."]}',
"JSON에서 a에는 직설 해석 3항목, bR에는 교과서 해석 3항목을 담고, 두 배열의 순서는 [현재 상황, 살펴볼 점, 행동 조언]입니다."
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
  const okItem = x => x && typeof x === "object" && typeof x.t === "string" && x.t.trim() && typeof x.b === "string";
  const okStrs = (a, n) => Array.isArray(a) && a.length === n && a.every(v => typeof v === "string" && v.trim());
  if (!data || typeof data !== "object"
      || !Array.isArray(data.a) || data.a.length !== 3 || !data.a.every(okItem)
      || !Array.isArray(data.bR) || data.bR.length !== 3 || !data.bR.every(okItem)
      || typeof data.common !== "string" || typeof data.diff !== "string"
      || !okStrs(data.acts, 3) || (data.q !== undefined && typeof data.q !== "string")) return null;
  return data;
}

export default async function handler(req, res){
  if (!guard(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({error:"method"});
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({error:"no_key"});

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch(e){ body = null; } }
  const q = (body && typeof body.q === "string") ? body.q.trim().slice(0, 200) : "";
  const cat = body && body.cat;
  const cards = body && body.cards;
  if (!q || typeof cat !== "string" || !Object.hasOwn(CATS, cat)) return res.status(400).json({error:"bad_input"});
  if (!Array.isArray(cards) || cards.length !== 3 || new Set(cards).size !== 3
      || cards.some(c => !VALID_CARDS.has(c))) return res.status(400).json({error:"bad_cards"});

  const PROMPT = buildPrompt(q, cat, cards);
  const MAXTOK = 2600;
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
