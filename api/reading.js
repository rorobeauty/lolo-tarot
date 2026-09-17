// 로로 타로 — 해석 중계 함수 (Vercel Serverless Function)
// API 키는 서버 환경변수에만 존재하며 방문자에게 절대 노출되지 않습니다.

const MODEL = process.env.LOLO_MODEL || "claude-haiku-4-5-20251001";

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

export default async function handler(req, res){
  if (req.method !== "POST") return res.status(405).json({error:"method"});
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({error:"no_key"});

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch(e){ body = null; } }
  const q = (body && typeof body.q === "string") ? body.q.trim().slice(0, 200) : "";
  const cat = body && body.cat;
  const cards = body && body.cards;
  if (!q || !CATS[cat]) return res.status(400).json({error:"bad_input"});
  if (!Array.isArray(cards) || cards.length !== 3 || new Set(cards).size !== 3
      || cards.some(c => !VALID_CARDS.has(c))) return res.status(400).json({error:"bad_cards"});

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
        max_tokens: 1300,
        messages: [{ role: "user", content: buildPrompt(q, cat, cards) }],
      }),
    });
    if (r.status === 429) return res.status(429).json({error:"rate_limited"});
    if (!r.ok) return res.status(502).json({error:"upstream"});
    const out = await r.json();
    const text = (out.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
    const data = parseJsonLoose(text);
    if (!data || !Array.isArray(data.a) || data.a.length !== 3
        || !Array.isArray(data.bR) || data.bR.length !== 3
        || !Array.isArray(data.acts)) return res.status(502).json({error:"bad_json"});
    return res.status(200).json(data);
  } catch (e) {
    return res.status(502).json({error:"upstream"});
  }
}
