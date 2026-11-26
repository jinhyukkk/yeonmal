// 붙여넣기 파서: 급여 엑셀(TSV) · 홈택스 미리보기 텍스트
const test = require('node:test');
const assert = require('node:assert');
const { parsePayroll, parseHometaxCard, parsePasted, annualize } = require('../public/paste_parser.js');

const tsv = (rows) => rows.map((r) => r.join('\t')).join('\r\n');

// 급여 목록 일부 (줄바꿈 든 머리 셀, 연말정산 환급 행, 총계 행 포함)
const HEADER = ['', '귀속년월', '순번', '급여제목', '과세총액', '비과세총액', '"초과근무수당\n소급분"', '지급총액',
    '국민연금', '건강보험', '장기요양보험료', '고용보험', '연말정산 소득세', '연말정산 지방소득세', '소득세', '지방소득세'];
const PAYROLL = tsv([
    HEADER,
    ['1', '2026/01', '1', '급여', '4,016,670', '150,000', '', '4,166,670', '180,210', '138,670', '18,220', '34,710', '', '', '195,960', '19,590'],
    ['2', '2026/01', '2', '통신비', '50,000', '', '', '50,000', '', '', '', '', '', '', '', ''],
    ['3', '2026/02', '1', '급여', '4,016,670', '150,000', '', '4,166,670', '180,210', '138,670', '18,220', '34,710', '-1,693,180', '-169,250', '195,960', '19,590'],
    ['', '총계', '', '', '8,083,340', '300,000', '', '8,383,340', '360,420', '277,340', '36,440', '69,420', '-1,693,180', '-169,250', '391,920', '39,180'],
]);

test('급여 엑셀: 열 이름으로 합산, 총계 행·연말정산 열 제외', () => {
    const r = parsePayroll(PAYROLL);
    assert.deepStrictEqual(r.values, {
        totalSalary: 8383340,
        nonTaxableIncome: 300000,
        nationalPension: 360420,
        healthInsurance: 277340 + 36440, // 건강보험 + 장기요양
        employmentInsurance: 69420,
        prePaidTax: 391920,              // '연말정산 소득세' 열은 합산하지 않음
        prePaidLocalTax: 39180,
    });
    assert.strictEqual(r.months, 2);
    assert.strictEqual(r.year, 2026);
});

test('급여 엑셀: 지급총액 열이 없으면 과세총액 + 비과세총액', () => {
    const r = parsePayroll(tsv([['과세총액', '비과세총액'], ['1,000', '200'], ['1,000', '200']]));
    assert.strictEqual(r.values.totalSalary, 2400);
});

// 홈택스 미리보기 화면을 복사했을 때 형태 (위 요약표 머리·값 행 + 아래 항목별 표)
const HOMETAX = [
    '선택\t성명\t신용카드 등 사용금액',
    '합계\t신용카드\t직불카드\t현금영수증\t문화체육사용분\t전통시장\t대중교통',
    '신용카드\t직불카드\t현금영수증',
    '\t홍길동(000000)\t21,000,000\t15,000,000\t2,000,000\t3,000,000\t300,000\t20,000\t50,000\t0\t1,000,000',
    '2026년 신용카드등 사용금액 확인(10월 ~ 12월 예상액 입력)\t(단위:원)',
    '항목\t1월~9월 사용액\t10월~12월 예상액\t합계',
    '소계\t21,000,000\t0\t21,000,000',
    '신용카드\t15,000,000\t\t15,000,000',
    '직불카드\t2,000,000\t\t2,000,000',
    '현금영수증\t3,000,000\t\t3,000,000',
    '신용카드\n(문화체육사용분) ?\t300,000\t\t300,000',
    '직불카드\n(문화체육사용분) ?\t20,000\t\t20,000',
    '현금영수증\n(문화체육사용분) ?\t50,000\t\t50,000',
    '전통시장 사용액\t0\t\t0',
    '대중교통 이용액\t1,000,000\t\t1,000,000',
    '총급여의 25%인 12,500,000원을 초과하여 사용한 신용카드 등 사용금액은 8,500,000원이며',
].join('\n');

test('홈택스 미리보기: 항목별 1~9월 사용액을 앱 입력으로 묶음', () => {
    const r = parseHometaxCard(HOMETAX);
    assert.deepStrictEqual(r.values, {
        creditCard: 15000000,
        debitCard: 2000000 + 3000000,
        booksPerformance: 300000 + 20000 + 50000,
        traditionalMarket: 0,
        publicTransport: 1000000,
    });
    assert.strictEqual(r.months, 9);
});

test('인식 못 하는 텍스트는 빈 결과, 연간 환산은 월평균 × 12', () => {
    assert.deepStrictEqual(parsePasted('아무 내용 123'), []);
    assert.deepStrictEqual(annualize({ a: 900, b: 10 }, 9), { a: 1200, b: 13 });
    assert.deepStrictEqual(annualize({ a: 900 }, null), { a: 900 });
});
