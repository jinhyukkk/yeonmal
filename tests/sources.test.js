// 폼의 금액 입력 항목에만 "어디서 확인" 안내가 있는지 검사 (항목 추가 시 누락 방지)
// 금액 항목 = 단위가 "원"인 입력 + 자녀별 금액을 쉼표로 받는 텍스트 입력
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { INPUT_SOURCES } = require('../public/sources.js');

test('금액 입력 항목에만 확인처 안내가 있음', () => {
    const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
    const form = html.slice(html.indexOf('<form'), html.indexOf('</form>'));
    const wonInputs = [...form.matchAll(/<input[^>]*\bid="([^"]+)"[^>]*>\s*<span class="unit">원<\/span>/g)].map((m) => m[1]);
    const listInputs = [...form.matchAll(/<input[^>]*type="text"[^>]*\bid="([^"]+)"/g)].map((m) => m[1]);
    const ids = [...wonInputs, ...listInputs];
    assert.ok(ids.length >= 30, `금액 항목 파싱 실패: ${ids.length}개`);
    const missing = ids.filter((id) => !INPUT_SOURCES[id]);
    assert.deepStrictEqual(missing, []);
    // 반대로 화면에 없는 id가 맵에 남아 있지 않은지
    const stale = Object.keys(INPUT_SOURCES).filter((id) => !ids.includes(id));
    assert.deepStrictEqual(stale, []);
});
