/* 「사주로 보는 2027년의 한마디」 어댑터 (브라우저/Node 공용)
 * - 공통 선정 모듈 vendor/y2027_block.js(원본 복사본, 수정 금지)의 전역 LOLO2027.compute만 호출합니다.
 * - 같은 양력 생년월일 + 시간 + 자시 설정이면 기존 사주 서비스와 동일한 성어가 나오는 것이 목표입니다.
 * - 모듈이 없거나 오류이면 상태를 그대로 돌려주고, 임의 성어로 대체(fallback)하지 않습니다.
 * - 시간 보정(+30분)·자시 판정은 모듈 내부에서 처리하므로 여기서는 KST 원시각(HH:MM)을 그대로 넘깁니다.
 * - 공통파일을 새 버전으로 교체할 때는 vendor/y2027_block.js만 바꾸면 되고, 아래 계약 검사(checkContract)가 깨지면 화면에 "미연결"로 표시됩니다.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.Y2027_ADAPTER = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var SOURCE_LABEL = '사주로 보는 2027년의 한마디';
  var EXPECTED = { year: 2027, rule: '2027.v2' };

  function getModule(explicit) {
    if (explicit) return explicit;
    if (typeof LOLO2027 !== 'undefined') return LOLO2027; // eslint-disable-line no-undef
    if (typeof self !== 'undefined' && self.LOLO2027) return self.LOLO2027;
    return null;
  }
  function checkContract(r) {
    var errs = [];
    if (!r || typeof r !== 'object') return ['결과가 객체가 아님'];
    if (r.year !== EXPECTED.year) errs.push('year≠2027');
    if (r.rule !== EXPECTED.rule) errs.push('rule≠' + EXPECTED.rule);
    ['key', 'idiom', 'hanja', 'meaning', 'commentary'].forEach(function (k) { if (typeof r[k] !== 'string' || !r[k]) errs.push(k + ' 누락'); });
    if (!Array.isArray(r.why) || r.why.length !== 4) errs.push('why[4] 아님');
    if (!r.basis || !r.pillars || !r.input) errs.push('basis/pillars/input 누락');
    if (r.idiom && !/^[가-힣]{4}$/.test(r.idiom)) errs.push('idiom 4글자 아님');
    if (r.hanja && !/^[㐀-鿿]{4}$/.test(r.hanja)) errs.push('hanja 4자 아님');
    return errs;
  }
  /* jasiMode: 자미두수 dayDivide 'forward' → 사주 'jeong'(정자시·다음 날), 'current' → 'ya'(야자시·당일) */
  function jasiFromDayDivide(dayDivide) { return dayDivide === 'current' ? 'ya' : 'jeong'; }

  /* compute(solar 'YYYY-MM-DD', time 'HH:MM'|'' , dayDivide) → {status:'ok'|'unavailable'|'error', ...} */
  function compute(solar, time, dayDivide, mod) {
    var M = getModule(mod);
    if (!M || typeof M.compute !== 'function') return { status: 'unavailable', source: SOURCE_LABEL, reason: '공통 성어 모듈(LOLO2027)이 로드되지 않았어요.' };
    var jasi = jasiFromDayDivide(dayDivide);
    try {
      var r = M.compute(solar, time || '', { jasi: jasi });
      var errs = checkContract(r);
      if (errs.length) return { status: 'error', source: SOURCE_LABEL, reason: '공통 모듈 결과 계약 불일치: ' + errs.join(', ') };
      var rep = null; try { if (typeof M.report === 'function') rep = M.report(r); } catch (e) { rep = null; }
      return { status: 'ok', source: SOURCE_LABEL, module: { year: M.YEAR, rule: M.RULE, cells: M.CELL_COUNT }, input: r.input, key: r.key, idiom: r.idiom, hanja: r.hanja, meaning: r.meaning, why: r.why, commentary: r.commentary, basisText: r.basis && r.basis.basisText, chips: r.basis && r.basis.chips, pillars: r.pillars, hourUnknown: !r.pillars.h, report: rep };
    } catch (e) {
      return { status: 'error', source: SOURCE_LABEL, reason: '공통 모듈 오류: ' + (e && e.message) };
    }
  }
  /* 시간대(2시간 블록) 입력: 블록 안의 여러 시각으로 계산해 성어가 모두 같을 때만 ok, 다르면 hold */
  function computeForBlock(solar, startHour, dayDivide, mod) {
    var results = [], keys = {};
    for (var mnt = startHour * 60; mnt < startHour * 60 + 120; mnt += 10) {
      var t = (mnt / 60 < 10 ? '0' : '') + Math.floor(mnt / 60) + ':' + (mnt % 60 < 10 ? '0' : '') + (mnt % 60);
      var r = compute(solar, t, dayDivide, mod); if (r.status !== 'ok') return r; results.push(r); keys[r.key] = true;
    }
    var ks = Object.keys(keys);
    if (ks.length === 1) return results[0];
    return { status: 'hold', source: SOURCE_LABEL, reason: '고른 시간대 안에서 사주 시주가 바뀌어 2027 한마디가 달라질 수 있어요. 정확한 시각이 있어야 확정할 수 있어요.', candidates: results.map(function (r) { return r.idiom; }).filter(function (v, i, a) { return a.indexOf(v) === i; }) };
  }
  return { SOURCE_LABEL: SOURCE_LABEL, compute: compute, computeForBlock: computeForBlock, checkContract: checkContract, jasiFromDayDivide: jasiFromDayDivide };
});
