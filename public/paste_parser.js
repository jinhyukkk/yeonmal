// 붙여넣은 텍스트에서 입력값 추출
// 1) 급여 엑셀(급여명세 목록): 머리행의 열 이름으로 찾아 데이터 행을 합산 (총계·합계 행 제외)
// 2) 홈택스 연말정산 미리보기: "신용카드 15,000,000"처럼 항목 이름 바로 뒤 첫 금액
// 양식이 바뀌어도 열 순서와는 무관하게 동작하도록 이름 기준으로만 찾는다

const toNumber = (s) => {
    const t = String(s ?? '').trim().replace(/,/g, '');
    return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null;
};
const norm = (s) => String(s ?? '').replace(/\s+/g, '');

// 엑셀 복사 텍스트(TSV) → 2차원 배열. 줄바꿈이 든 셀은 "..."로 감싸져 오므로 따옴표 처리
function parseTsv(text) {
    const rows = [];
    let row = [], cell = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (quoted) {
            if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
            else if (ch === '"') quoted = false;
            else cell += ch;
        } else if (ch === '"' && cell === '') quoted = true;
        else if (ch === '\t') { row.push(cell); cell = ''; }
        else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && text[i + 1] === '\n') i++;
            row.push(cell); rows.push(row); row = []; cell = '';
        } else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
}

// 입력 키 ← 급여 엑셀 열 이름 (여러 열이면 합산). '연말정산 소득세'처럼 다른 열은 이름이 정확히 같지 않아 제외됨
const PAYROLL_COLUMNS = {
    totalSalary: ['지급총액'],
    nonTaxableIncome: ['비과세총액'],
    nationalPension: ['국민연금'],
    healthInsurance: ['건강보험', '장기요양보험료', '장기요양'],
    employmentInsurance: ['고용보험'],
    prePaidTax: ['소득세'],
    prePaidLocalTax: ['지방소득세'],
};
const TOTAL_ROW = /^(총계|합계|소계|계|누계)$/;

function parsePayroll(text) {
    const rows = parseTsv(text);
    const headerIdx = rows.findIndex((r) => r.some((c) => ['지급총액', '과세총액'].includes(norm(c))));
    if (headerIdx < 0) return null;
    const header = rows[headerIdx].map(norm);
    const colsOf = (names) => header.flatMap((h, i) => (names.includes(h) ? [i] : []));
    const monthCol = header.findIndex((h) => h === '귀속년월' || h === '귀속연월');

    const dataRows = rows.slice(headerIdx + 1)
        .filter((r) => !r.some((c) => TOTAL_ROW.test(norm(c))))
        .filter((r) => r.some((c) => toNumber(c) !== null));
    if (!dataRows.length) return null;

    const sumCols = (cols) => dataRows.reduce((acc, r) => acc + cols.reduce((a, i) => a + (toNumber(r[i]) ?? 0), 0), 0);
    const values = {};
    for (const [key, names] of Object.entries(PAYROLL_COLUMNS)) {
        const cols = colsOf(names);
        if (cols.length) values[key] = sumCols(cols);
    }
    // 지급총액 열이 없으면 과세총액 + 비과세총액
    if (values.totalSalary === undefined) {
        const taxable = colsOf(['과세총액']);
        if (taxable.length) values.totalSalary = sumCols(taxable) + (values.nonTaxableIncome ?? 0);
    }

    const months = monthCol >= 0 ? [...new Set(dataRows.map((r) => norm(r[monthCol])).filter(Boolean))] : [];
    const year = Number(months[0]?.match(/^(\d{4})/)?.[1]) || null;
    return { source: 'payroll', label: '급여 내역', values, months: months.length || null, year };
}

// 홈택스 미리보기 항목 → 입력 키. 문화체육사용분은 결제수단과 무관하게 도서·공연으로 합산
const CARD_LABEL = /(신용카드|직불카드|현금영수증|전통시장(?:\s*사용액)?|대중교통(?:\s*이용액)?)(\s*\(문화체육사용분\))?[^\d가-힣]{0,12}?(-?\d[\d,]*)/g;

function parseHometaxCard(text) {
    const found = {};
    for (const m of text.matchAll(CARD_LABEL)) {
        const base = norm(m[1]).replace(/(사용액|이용액)$/, '');
        const name = m[2] ? `${base}(문화체육)` : base;
        // 같은 항목이 여러 번 나오면 첫 번째(1~9월 사용액 열)만 사용
        if (!(name in found)) found[name] = toNumber(m[3]) ?? 0;
    }
    if (!('신용카드' in found)) return null;
    const get = (k) => found[k] ?? 0;
    const months = Number(text.match(/1월\s*[~∼-]\s*(\d{1,2})월\s*사용액/)?.[1]) || null;
    return {
        source: 'hometaxCard', label: '홈택스 신용카드 등 사용액', months, year: null,
        values: {
            creditCard: get('신용카드'),
            debitCard: get('직불카드') + get('현금영수증'),
            booksPerformance: get('신용카드(문화체육)') + get('직불카드(문화체육)') + get('현금영수증(문화체육)'),
            traditionalMarket: get('전통시장'),
            publicTransport: get('대중교통'),
        },
    };
}

// 인식한 결과 목록 (둘 다 들어 있으면 둘 다)
function parsePasted(text) {
    return [parsePayroll(text), parseHometaxCard(text)].filter(Boolean);
}

// shortcut: 연간 환산은 월평균 × 12. 상여·복지포인트 등 특정 달에 몰린 금액이 있으면 과대 추정될 수 있음
function annualize(values, months) {
    if (!months || months >= 12) return { ...values };
    return Object.fromEntries(Object.entries(values).map(([k, v]) => [k, Math.floor((v / months) * 12)]));
}

if (typeof module !== 'undefined') module.exports = { parseTsv, parsePayroll, parseHometaxCard, parsePasted, annualize };
