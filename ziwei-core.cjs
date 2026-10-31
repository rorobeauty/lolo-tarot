/* 로로의 자미두수 — 명반 계산 코어 (브라우저/Node 공용, UMD)
 * - 별 위치는 전부 iztro(MIT, 버전 고정)가 계산합니다. 이 파일은 "입력 → iztro 호출 → 근거(fact) 추출"만 합니다.
 * - AI는 fact 목록만 받고, 별 위치를 스스로 계산하지 않습니다.
 * - 정책(시간 보정·자시·윤달·나이)은 POLICY 상수로 고정하고 화면에 그대로 공개합니다.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./ziwei-iztro.cjs'), require('./ziwei-lunar.cjs'));
  } else {
    root.ZIWEI_CORE = factory(root.iztro, root.lunarLite);
  }
})(typeof self !== 'undefined' ? self : this, function (iztro, lunarLite) {
  'use strict';
  if (!iztro || !iztro.astro) throw new Error('iztro 라이브러리가 로드되지 않았습니다');
  var astro = iztro.astro;

  /* ───────── 고정 정책 (화면 공개용) ───────── */
  var POLICY = {
    version: 'ziwei-test.v1',
    engine: { name: 'iztro', version: '2.6.3', license: 'MIT', url: 'https://github.com/SylarLong/iztro' },
    lunarEngine: { name: 'lunar-lite', version: '0.2.8', license: 'MIT' },
    region: '한국 출생 기준(KST, UTC+9)으로만 계산해요. 해외 출생은 이 테스트판에서 지원하지 않아요.',
    timeCorrectionMin: 30,
    timeCorrectionText: '한국표준시(KST)는 서울 평균태양시보다 약 30분 빨라요. 그래서 시진 경계를 30분 늦춰요: 자시 23:30~01:30, 축시 01:30~03:30 … 해시 21:30~23:30. (기존 사주 서비스와 같은 규칙)',
    dayDivide: 'forward',
    dayDivideText: '야자시(23:30~24:00 KST)에 태어났으면 명반은 다음 날 기준(forward)으로 그려요. 사주 쪽 "정자시(다음 날)" 설정과 같아요. 00:00~01:30는 조자시로 당일이에요.',
    yearDivide: 'exact',
    yearDivideText: '해(年)의 경계는 입춘(exact)이에요. 1월·2월 초 출생은 전년도 간지로 잡힐 수 있어요.',
    horoscopeDivide: 'exact',
    ageDivide: 'normal',
    ageText: '명반의 허세는 엔진의 음력 연도 기준이고, 화면의 만 나이는 입력한 양력 생일 기준이에요. 둘을 단순히 1~2살 빼서 환산하지 않아요. 인생지도는 대한 경계의 양력 날짜를 구해 만 나이로 표시해요.',
    fixLeap: true,
    leapText: '윤달 생일은 그 해에 실제로 윤달이 있는지 먼저 확인해요(없으면 입력을 막아요). 명반 배치에서 윤달은 iztro의 fixLeap=true 규칙(윤달 전반은 전달, 후반은 다음 달로 취급)을 그대로 따라요.',
    algorithm: 'default',
    unknownTimeText: '출생시간을 모르면 명궁을 정할 수 없어서 개인 명반을 그리지 않아요. 임의의 시간을 넣어 완성한 것처럼 보이게 하지 않아요.',
    lifemapText: '인생지도의 높낮이 점수는 만들지 않아요. 약 10년 단위 대한(大限)의 실제 나이 구간과 그 궁의 별만 보여줘요. 80세까지만 표시하며 수명 예측이 아니에요.'
  };

  function applyConfig() {
    astro.config({ yearDivide: POLICY.yearDivide, horoscopeDivide: POLICY.horoscopeDivide, ageDivide: POLICY.ageDivide, dayDivide: POLICY.dayDivide, algorithm: POLICY.algorithm });
  }

  /* ───────── 시간 → 시진 index (iztro: 0=조자시 00~01, 1=축 … 11=해, 12=야자시 23~24) ─────────
   * 우리 정책: KST 시각에 +30분을 더한 뒤 표준 경계(홀수시)로 나눔 == 경계를 30분 늦추는 것과 동일.
   * 예) 01:00 KST → 01:30 → 자시(0) / 01:30 KST → 02:00 → 축시(1) / 23:30 KST → 00:00(다음날) → 야자시(12) */
  var BRANCH_KO = ['자', '축', '인', '묘', '진', '사', '오', '미', '신', '유', '술', '해'];
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function shiftedRange(idx) { // 화면 표기용 KST 범위
    if (idx === 0) return '00:00~01:30';
    if (idx === 12) return '23:30~24:00';
    var s = (idx * 2 - 1) * 60 + 30; var e = s + 120;
    return pad(Math.floor(s / 60)) + ':' + pad(s % 60) + '~' + pad(Math.floor(e / 60) % 24) + ':' + pad(e % 60);
  }
  function timeIndexFromKST(hhmm) {
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(hhmm || '')) throw new Error('bad_time');
    var p = hhmm.split(':').map(Number);
    // KST → 서울 평균태양시 근사: 30분을 뺀 뒤 표준 시진 경계(조자시 00~01, 축 01~03 … 해 21~23, 야자시 23~24)에 대입
    // 결과적으로 KST 경계는 30분 늦어짐: 조자시 00:00~01:30, 축 01:30~03:30 … 해 21:30~23:30, 야자시 23:30~24:00
    // (사주 공통모듈 LOLO2027의 (분+30)%1440 → floor(/120) 시지 계산과 같은 구간 분할)
    var m = p[0] * 60 + p[1] - POLICY.timeCorrectionMin;
    var idx;
    if (m < 0) idx = 0;            // 00:00~00:29 KST → 당일 조자시
    else if (m >= 1380) idx = 12;  // 23:30~23:59 KST → 야자시
    else if (m < 60) idx = 0;      // 00:30~01:29 KST → 조자시
    else idx = Math.floor((m - 60) / 120) + 1;
    return { index: idx, branch: BRANCH_KO[idx % 12] + '시', rangeKST: shiftedRange(idx), lateZi: idx === 12 };
  }
  function timeIndexInfo(idx) { idx = Number(idx); if (!(idx >= 0 && idx <= 12)) throw new Error('bad_time_index'); return { index: idx, branch: BRANCH_KO[idx % 12] + '시', rangeKST: shiftedRange(idx), lateZi: idx === 12 }; }
  /* 2시간 단위 시간대 블록(00~02, 02~04 …)이 걸치는 시진 후보들 */
  function timeIndicesForBlock(startHour) {
    var set = {}; var list = [];
    for (var mnt = startHour * 60; mnt < startHour * 60 + 120; mnt += 10) {
      var hh = pad(Math.floor(mnt / 60)), mm = pad(mnt % 60);
      var ti = timeIndexFromKST(hh + ':' + mm); if (!set[ti.index]) { set[ti.index] = true; list.push(ti); }
    }
    var boundary = null; // 블록 내부 경계 시각 (KST)
    if (list.length > 1) { var b = (startHour * 60 + 90); boundary = pad(Math.floor(b / 60)) + ':' + pad(b % 60); }
    return { indices: list, boundaryKST: boundary, label: pad(startHour) + '~' + pad(startHour + 2) + '시' };
  }

  /* ───────── 음력 검증/변환 ───────── */
  function lunarLeapMonthOf(lunarYear) { // 그 음력연도의 윤달 번호, 없으면 null (양력 스캔 — lunar-lite는 잘못된 윤달을 조용히 무시하므로 직접 확인)
    if (!lunarLite || !lunarLite.solar2lunar) throw new Error('lunar-lite 미로드');
    var found = null;
    var d = new Date(Date.UTC(lunarYear, 0, 20));
    for (var i = 0; i < 420; i++) {
      var s = d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
      var l = lunarLite.solar2lunar(s);
      if (l.lunarYear === lunarYear && l.isLeap) { found = l.lunarMonth; break; }
      if (l.lunarYear > lunarYear) break;
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return found;
  }
  function lunarToSolar(y, m, d, isLeap) {
    if (!(y >= 1900 && y <= 2100) || !(m >= 1 && m <= 12) || !(d >= 1 && d <= 30)) return { ok: false, error: '음력 날짜 범위가 올바르지 않아요.' };
    if (isLeap) {
      var leap = lunarLeapMonthOf(y);
      if (leap === null) return { ok: false, error: y + '년에는 윤달이 없어요. 윤달 체크를 풀거나 연도를 확인해 주세요.' };
      if (leap !== m) return { ok: false, error: y + '년의 윤달은 ' + leap + '월이에요. 윤' + m + '월은 없어요.' };
    }
    var days = lunarLite.getTotalDaysOfLunarMonth(y + '-' + pad(m) + '-01', !!isLeap);
    if (d > days) return { ok: false, error: '음력 ' + y + '년 ' + (isLeap ? '윤' : '') + m + '월은 ' + days + '일까지만 있어요.' };
    var s = lunarLite.lunar2solar(y + '-' + pad(m) + '-' + pad(d), !!isLeap);
    var solar = s.solarYear + '-' + pad(s.solarMonth) + '-' + pad(s.solarDay);
    var back = lunarLite.solar2lunar(solar);
    if (back.lunarYear !== y || back.lunarMonth !== m || back.lunarDay !== d || !!back.isLeap !== !!isLeap) return { ok: false, error: '음력→양력 변환 검산이 맞지 않아요. 날짜를 다시 확인해 주세요.' };
    return { ok: true, solar: solar };
  }
  function validSolar(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false;
    var p = s.split('-').map(Number); if (p[0] < 1900 || p[0] > 2100) return false;
    var dt = new Date(Date.UTC(p[0], p[1] - 1, p[2])); return dt.getUTCFullYear() === p[0] && dt.getUTCMonth() === p[1] - 1 && dt.getUTCDate() === p[2];
  }

  /* ───────── 명반 생성 ───────── */
  function buildChart(solarDate, timeIndex, gender) {
    if (!validSolar(solarDate)) throw new Error('bad_date');
    if (!(timeIndex >= 0 && timeIndex <= 12)) throw new Error('bad_time_index');
    if (gender !== '여' && gender !== '남') throw new Error('bad_gender');
    applyConfig();
    return astro.bySolar(solarDate, timeIndex, gender === '여' ? '女' : '男', POLICY.fixLeap, 'ko-KR');
  }
  function pn(name) { return name === '명궁' ? '명궁' : name + '궁'; }
  function starList(p) { return p.majorStars.map(function (s) { return s.name + (s.brightness ? s.brightness : '') + (s.mutagen ? '·' + s.mutagen : ''); }); }
  function chartSignature(a) {
    return JSON.stringify({ soul: a.earthlyBranchOfSoulPalace, body: a.earthlyBranchOfBodyPalace, cd: a.chineseDate, p: a.palaces.map(function (p) { return p.name + p.earthlyBranch + ':' + starList(p).join(',') + '|' + p.minorStars.map(function (s) { return s.name + (s.mutagen || ''); }).join(','); }) });
  }

  var PALACE_THEME = {
    '명궁': '나 자신 · 방향을 정하는 힘', '형제': '가까운 동료·형제 · 곁에서 함께하는 사람', '부처': '1:1 관계 · 깊은 관계를 맺는 방식',
    '자녀': '돌봄 · 창작 · 내가 낳는 결과물', '재백': '돈의 흐름 · 벌고 쓰는 습관', '질액': '컨디션 · 몸과 마음의 리듬 관리(예측 아님)',
    '천이': '이동 · 바깥 활동 · 새 환경에서의 나', '노복': '친구 · 동료 · 네트워크', '관록': '일 · 공부 · 커리어에서의 역할',
    '전택': '거주 · 공간 · 삶의 기반', '복덕': '마음의 여유 · 취향 · 내면 만족', '부모': '윗사람 · 보호자 · 배움과 문서'
  };
  var STAR_KEYWORD = { // 14주성 기본 키워드(고정 사전, 성격 묘사용 — 운의 좋고 나쁨 아님)
    '자미': '중심에 서려는 품격·책임감', '천기': '머리 회전·기획·변화 감지', '태양': '드러내고 베푸는 에너지', '무곡': '실행력·결단·실속',
    '천동': '편안함·정서·느긋한 복', '염정': '매력·열정·규칙과 욕망의 줄다리기', '천부': '안정·관리·쌓아두는 힘', '태음': '섬세함·감성·조용한 축적',
    '탐랑': '욕구·사교·다재다능', '거문': '말·분석·의심과 검증', '천상': '보좌·배려·균형 감각', '천량': '보호·원칙·연장자 기질',
    '칠살': '돌파·독립·승부', '파군': '갈아엎기·개척·소비'
  };
  var FOCUS_PALACE = { '종합': ['명궁'], '연애': ['부처'], '일·공부': ['관록', '부모'], '돈': ['재백', '전택'], '사람': ['노복', '형제'] };

  /* ───────── fact 추출 (AI에 넘기는 유일한 근거) ───────── */
  function extractFacts(a, opts) {
    opts = opts || {}; var targetYear = opts.targetYear || 2027; var birthYear = Number(a.solarDate.split('-')[0]);
    var facts = []; var byId = {};
    function F(id, text, data) { var f = { id: id, text: text, data: data || null }; facts.push(f); byId[id] = f; return f; }
    var soul = a.palace('명궁'); var body = a.palaces.filter(function (p) { return p.isBodyPalace; })[0];
    var lateZi = /밤|晚|late/.test(a.time) || a.timeRange === '23:00~24:00';
    var effective = a.solarDate; if (lateZi && POLICY.dayDivide === 'forward') { var dd = new Date(a.solarDate + 'T00:00:00Z'); dd.setUTCDate(dd.getUTCDate() + 1); effective = dd.toISOString().slice(0, 10); }
    F('F-BIRTH', '입력 생년월일(양력) ' + a.solarDate + (effective !== a.solarDate ? ' → 야자시라 명반은 다음 날 ' + effective + ' 기준' : '') + ', ' + a.lunarDate + ', 사주 ' + a.chineseDate + ', ' + a.time + '(' + a.timeRange + ' 표준시진 표기)', { solarDate: a.solarDate, effectiveSolar: effective, lateZi: lateZi, lunarDate: a.lunarDate, chineseDate: a.chineseDate, timeIndexLabel: a.time });
    F('F-BUREAU', '오행국: ' + a.fiveElementsClass + ' (첫 대한 시작 나이를 정함)', { bureau: a.fiveElementsClass });
    F('F-SOUL', '명궁은 ' + soul.earthlyBranch + '궁(' + soul.heavenlyStem + soul.earthlyBranch + '), 주성: ' + (soul.majorStars.length ? starList(soul).join(', ') : '없음(공궁 → 대궁 ' + a.surroundedPalaces('명궁').opposite.name + ' 참고)'), { branch: soul.earthlyBranch, stars: starList(soul) });
    F('F-BODY', '신궁은 ' + pn(body.name) + '에 겹쳐 있음(' + body.earthlyBranch + ')', { palace: body.name, branch: body.earthlyBranch });
    var sp = a.surroundedPalaces('명궁');
    F('F-TRI', '명궁 삼방사정 — 대궁(천이) ' + (starList(sp.opposite).join(',') || '없음') + ' / 재백 ' + (starList(sp.wealth).join(',') || '없음') + ' / 관록 ' + (starList(sp.career).join(',') || '없음'), { opposite: starList(sp.opposite), wealth: starList(sp.wealth), career: starList(sp.career) });
    a.palaces.forEach(function (p) {
      var minors = p.minorStars.map(function (s) { return s.name + (s.mutagen ? '·' + s.mutagen : ''); });
      F('F-P-' + p.name, pn(p.name) + '(' + p.heavenlyStem + p.earthlyBranch + ') 주성 ' + (p.majorStars.length ? starList(p).join(', ') : '없음') + ' / 보좌·살성 ' + (minors.length ? minors.join(', ') : '없음') + ' / 대한 허세 ' + p.decadal.range[0] + '~' + p.decadal.range[1] + '세', { palace: p.name, stem: p.heavenlyStem, branch: p.earthlyBranch, major: starList(p), minor: minors, decadal: p.decadal.range, theme: PALACE_THEME[p.name] });
    });
    var mutLabels = ['록', '권', '과', '기'];
    var mutMap = {};
    a.palaces.forEach(function (p) { p.majorStars.concat(p.minorStars).forEach(function (s) { if (s.mutagen) mutMap[s.mutagen] = s.name + '→' + pn(p.name); }); });
    F('F-MUT', '생년 사화(생년 천간 ' + a.chineseDate.split(' ')[0][0] + '): ' + mutLabels.map(function (m) { return '화' + m + ' ' + (mutMap[m] || '없음'); }).join(' / '), { mutagens: mutMap });

    // 현재 흐름: targetYear 유년·대한
    var h = a.horoscope(targetYear + '-07-01');
    var decP = a.palaces[h.decadal.index]; var yrP = a.palaces[h.yearly.index];
    var manLow = targetYear - birthYear - (a.solarDate.slice(5) === '01-01' ? 0 : 1), manHigh = targetYear - birthYear;
    F('F-AGE', targetYear + '년 7월 1일을 기준으로 본 명반 나이(허세)는 ' + h.age.nominalAge + '세예요. 허세는 음력 연도 기준이며 입춘 기준의 간지 연도와 구분해요. 이 양력 연도의 만 나이는 생일에 따라 ' + manLow + '~' + manHigh + '세 범위예요.', { nominalAge: h.age.nominalAge, referenceDate: targetYear + '-07-01', manAge: [manLow, manHigh] });
    F('F-DEC-NOW', targetYear + '년이 속한 대한: ' + pn(decP.name) + '(' + h.decadal.heavenlyStem + h.decadal.earthlyBranch + ') 허세 ' + decP.decadal.range[0] + '~' + decP.decadal.range[1] + '세, 그 궁 주성 ' + (starList(decP).join(', ') || '없음') + ', 대한 사화 록·권·과·기 = ' + h.decadal.mutagen.join('·'), { palace: decP.name, range: decP.decadal.range, stars: starList(decP), mutagen: h.decadal.mutagen, theme: PALACE_THEME[decP.name] });
    F('F-YEAR-' + targetYear, targetYear + '년(' + h.yearly.heavenlyStem + h.yearly.earthlyBranch + ') 유년 명궁은 본명 ' + pn(yrP.name) + '(' + yrP.earthlyBranch + ') 자리, 그 궁 주성 ' + (starList(yrP).join(', ') || '없음') + ', 유년 사화 록·권·과·기 = ' + h.yearly.mutagen.join('·'), { palace: yrP.name, branch: yrP.earthlyBranch, stars: starList(yrP), mutagen: h.yearly.mutagen });
    // 유년 기준으로 각 본명궁이 어떤 유년궁이 되는지(관심분야용)
    var yearlyMap = {}; a.palaces.forEach(function (p, i) { yearlyMap[h.yearly.palaceNames[i]] = p.name; });
    F('F-YEAR-MAP', targetYear + '년 유년궁 ↔ 본명궁: ' + Object.keys(yearlyMap).map(function (k) { return '유년' + k + '=본명' + yearlyMap[k]; }).join(', '), { map: yearlyMap });

    // 인생지도: 대한 순서대로 (허세 기준), 첫 대한 이전 구간 분리, 80세까지
    var decades = a.palaces.map(function (p) { return { range: p.decadal.range, palace: p.name, branch: p.earthlyBranch, stem: p.heavenlyStem, stars: starList(p), theme: PALACE_THEME[p.name] }; })
      .sort(function (x, y) { return x.range[0] - y.range[0]; });
    var first = decades[0].range[0];
    var birthParts = a.solarDate.split('-').map(Number);
    var birthStamp = Date.UTC(birthParts[0], birthParts[1] - 1, birthParts[2]);
    var displayEnd = Date.UTC(birthParts[0] + 81, birthParts[1] - 1, birthParts[2]) - 86400000;
    var nominalBirthYear = targetYear - h.age.nominalAge + 1;
    function lunarNewYearStamp(y) { var q = lunarLite.lunar2solar(y + '-01-01', false); return Date.UTC(q.solarYear, q.solarMonth - 1, q.solarDay); }
    function ageAt(stamp) { var q = new Date(stamp); var age = q.getUTCFullYear() - birthParts[0]; if (q.getUTCMonth() + 1 < birthParts[1] || (q.getUTCMonth() + 1 === birthParts[1] && q.getUTCDate() < birthParts[2])) age--; return Math.max(0, age); }
    function dateLabel(stamp) { return new Date(stamp).toISOString().slice(0, 10); }
    var firstStamp = lunarNewYearStamp(nominalBirthYear + first - 1);
    var preEnd = Math.min(firstStamp - 86400000, displayEnd);
    var lifemap = { ageBasis: '만 나이 기준. 음력 연도에 바뀌는 대한 경계를 양력 날짜로 바꿔 생일 나이를 계산했어요. 경계가 생일 사이에 있어 같은 만 나이가 두 구간에 걸칠 수 있어요', preFirst: { range: [1, first - 1], manApprox: [0, ageAt(preEnd)], dateRange: [a.solarDate, dateLabel(preEnd)], label: '첫 대한 이전', note: '첫 대한은 명반 나이 ' + first + '세부터 시작해요. 그 전의 출생 초기 구간은 별도로 표시해요.' }, decades: [], displayLimit: 80, limitNote: '화면은 만 0~80세 범위예요. 80세는 수명 예측이 아니고, 이후의 시기도 이어져요.' };
    decades.forEach(function (d) { try { var startYear = nominalBirthYear + d.range[0] - 1; if (startYear > birthParts[0] + 81) return; var start = Math.max(birthStamp, lunarNewYearStamp(startYear)); if (start > displayEnd) return; var end = Math.min(displayEnd, lunarNewYearStamp(nominalBirthYear + d.range[1]) - 86400000); if (end < birthStamp) return; lifemap.decades.push({ range: d.range, manApprox: [ageAt(start), ageAt(end)], dateRange: [dateLabel(start), dateLabel(end)], palace: d.palace, branch: d.branch, stem: d.stem, stars: d.stars, theme: d.theme, isCurrent: d.palace === decP.name }); } catch (e) { lifemap.limitNote += ' 일부 구간은 음양력 변환 라이브러리 범위 밖이라 표시를 보류했어요.'; } });
    F('F-LIFEMAP', '대한 순서: ' + lifemap.decades.map(function (d) { return d.range[0] + '~' + d.range[1] + ' ' + d.palace; }).join(' → '), lifemap);

    return { facts: facts, byId: byId, lifemap: lifemap, now: { decadal: byId['F-DEC-NOW'].data, yearly: byId['F-YEAR-' + targetYear].data, age: byId['F-AGE'].data }, summary: { soul: byId['F-SOUL'].data, body: byId['F-BODY'].data, bureau: a.fiveElementsClass, chineseDate: a.chineseDate, lunarDate: a.lunarDate, solarDate: a.solarDate, effectiveSolar: effective, timeLabel: a.time, gender: a.gender }, focusPalaces: FOCUS_PALACE, starKeyword: STAR_KEYWORD, palaceTheme: PALACE_THEME, engine: { name: 'iztro', version: POLICY.engine.version, copyright: a.copyright }, policy: POLICY };
  }

  /* ───────── 입력 정규화: 화면/서버 공용 ─────────
   * input = { calendar:'solar'|'lunar', date:'YYYY-MM-DD', isLeap, timeMode:'exact'|'block'|'unknown', time:'HH:MM', block:0..22(짝수), gender:'여'|'남' }
   * 반환: { ok, solar, timeIndices:[...], needTimeQuestion, question, chart?, facts? } */
  function resolve(input) {
    var out = { ok: false, policy: POLICY };
    if (!input || (input.gender !== '여' && input.gender !== '남')) { out.error = '계산용 성별을 골라 주세요(대한 순행·역행에만 쓰여요).'; return out; }
    var solar;
    if (input.calendar === 'lunar') {
      var p = (input.date || '').split('-').map(Number);
      var r = lunarToSolar(p[0], p[1], p[2], !!input.isLeap); if (!r.ok) { out.error = r.error; return out; } solar = r.solar; out.lunarInput = { y: p[0], m: p[1], d: p[2], isLeap: !!input.isLeap };
    } else { if (!validSolar(input.date)) { out.error = '생년월일을 확인해 주세요(1900~2100).'; return out; } solar = input.date; }
    out.solar = solar;
    if (input.timeMode === 'unknown') { out.ok = true; out.timeUnknown = true; out.message = POLICY.unknownTimeText; return out; }
    var candidates = [];
    if (input.timeMode === 'exact') { candidates = [timeIndexFromKST(input.time)]; }
    else if (input.timeMode === 'block') { var b = Number(input.block); if (!(b >= 0 && b <= 22 && b % 2 === 0)) { out.error = '시간대를 골라 주세요.'; return out; } var blk = timeIndicesForBlock(b); candidates = blk.indices; out.block = blk; }
    else { out.error = '출생시간 입력 방식을 골라 주세요.'; return out; }
    out.timeCandidates = candidates;
    var charts = candidates.map(function (c) { return { ti: c, chart: buildChart(solar, c.index, input.gender) }; });
    if (charts.length > 1) {
      var sigs = charts.map(function (c) { return chartSignature(c.chart); });
      var same = sigs.every(function (s) { return s === sigs[0]; });
      if (!same) {
        out.ok = true; out.needTimeQuestion = true;
        out.question = { text: '고른 시간대(' + out.block.label + ')가 두 시진에 걸쳐 있고, 어느 쪽인지에 따라 명반이 달라져요. 태어난 시각이 ' + out.block.boundaryKST + ' 이전인지 이후인지 알 수 있을까요?', boundaryKST: out.block.boundaryKST, options: candidates.map(function (c) { return { index: c.index, label: c.branch + ' (' + c.rangeKST + ')' }; }), unknownOption: '모르겠어요 → 명반을 보류하고 시간 없이 볼 수 있는 부분만 보여줘요' };
        return out;
      }
      out.note = '고른 시간대가 두 시진(' + candidates.map(function (c) { return c.branch; }).join('·') + ')에 걸치지만 두 경우의 명반이 같아서 그대로 진행해요.';
    }
    out.ok = true; out.timeIndex = charts[0].ti; out.chart = charts[0].chart; out.signature = chartSignature(out.chart);
    return out;
  }

  return { POLICY: POLICY, timeIndexFromKST: timeIndexFromKST, timeIndexInfo: timeIndexInfo, timeIndicesForBlock: timeIndicesForBlock, lunarLeapMonthOf: lunarLeapMonthOf, lunarToSolar: lunarToSolar, validSolar: validSolar, buildChart: buildChart, chartSignature: chartSignature, extractFacts: extractFacts, resolve: resolve, FOCUS_PALACE: FOCUS_PALACE, STAR_KEYWORD: STAR_KEYWORD, PALACE_THEME: PALACE_THEME };
});
