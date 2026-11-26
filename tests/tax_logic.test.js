// 홈택스 「(예상) 세액계산 결과.pdf」(2025 귀속) 수치를 기준값으로 쓰는 회귀 테스트
const test = require('node:test');
const assert = require('node:assert');
const { calculateTax, childCreditMinAge, recommendDeductions } = require('../public/tax_logic.js');

const base = {
    totalSalary: 0, nonTaxableIncome: 0, prePaidTax: 0,
    dependentCount: 1, childCount: 0, isMarried2024_2026: false,
    nationalPension: 0, healthInsurance: 0, employmentInsurance: 0,
    housingSubscription: 0, housingRentalLoan: 0, housingMortgageLoan: 0,
    youthLongTermFund: 0, insurancePremium: 0, pensionAccount: 0,
    creditCard: 0, debitCard: 0, publicTransport: 0, traditionalMarket: 0, booksPerformance: 0,
    medicalExpense: 0, medicalExpenseOther: 0, educationExpense: 0, donation: 0, politicalDonation: 0, hometownDonation: 0, monthlyRent: 0,
};

// 배포용: 실제 개인 금액 대신 가상 사례. 계산 엔진은 개인용 버전에서 실제 홈택스 예상세액 PDF와 일치함을 확인함
// 손 검산: 근로소득공제 1,200만+(5,000만-4,500만)×5% / 카드 (2,900만-1,250만)×15% / 산출 84만+(2,737.5만-1,400만)×15%
//         세액공제 근로 66만 + 보험 12만 + 교육 1,250만×15% = 265.5만
const SAMPLE = {
    ...base,
    totalSalary: 50000000,
    prePaidTax: 2400000,
    nationalPension: 1900000,
    healthInsurance: 2100000,
    youthLongTermFund: 6000000,     // 공제액 2,400,000
    creditCard: 29000000,           // 공제액 2,475,000
    insurancePremium: 1000000,
    educationExpense: 12500000,
};

test('가상 사례 전체 계산 (손 검산값과 일치)', () => {
    const r = calculateTax(SAMPLE);
    assert.strictEqual(r.earnedIncomeDeduction, 12250000);
    assert.strictEqual(r.totalDeductions, 10375000);
    assert.strictEqual(r.taxBase, 27375000);
    assert.strictEqual(r.calculatedTax, 2846250);
    assert.strictEqual(r.totalCredits, 2655000);
    assert.strictEqual(r.determinedTax, 191250);
    assert.strictEqual(r.finalTax, -2208750);
    assert.strictEqual(r.overallLimitExcess, 0);
    assert.strictEqual(r.standardCreditApplied, false);
    // 지방소득세: 결정 19,125 / 기납부(미입력 시 소득세 기납부의 10%) 240,000 / 차감 -220,875 → 10원 미만 절사
    assert.strictEqual(r.localDeterminedTax, 19125);
    assert.strictEqual(r.prePaidLocalTax, 240000);
    assert.strictEqual(r.finalLocalTax, -220870);
});

test('지방소득세: 기납부 지방소득세를 직접 입력하면 그 값 사용', () => {
    const r = calculateTax({ ...base, totalSalary: 50000000, prePaidTax: 2400000, prePaidLocalTax: 250000 });
    assert.strictEqual(r.prePaidLocalTax, 250000);
    assert.strictEqual(r.finalLocalTax, Math.trunc((r.localDeterminedTax - 250000) / 10) * 10);
});

test('월세: 총급여 8천만 이하, 한도 1,000만', () => {
    const r = calculateTax({ ...base, totalSalary: 75000000, monthlyRent: 12000000 });
    assert.strictEqual(r.limitInfo.monthlyRent.deduction, 1500000); // 1,000만 × 15%
    const r2 = calculateTax({ ...base, totalSalary: 85000000, monthlyRent: 12000000 });
    assert.strictEqual(r2.limitInfo.monthlyRent.deduction, 0);
});

test('신용카드 기본한도: 7천만 초과는 250만', () => {
    const r = calculateTax({ ...base, totalSalary: 130000000, creditCard: 100000000 });
    assert.strictEqual(r.limitInfo.creditCard.deduction, 2500000);
});

test('신용카드 추가한도: 전통시장·대중교통·문화 합산 300만(7천 이하) / 200만(7천 초과)', () => {
    // 기본 300만 + min(전통시장 400만, 300만)
    const r = calculateTax({ ...base, totalSalary: 50000000, creditCard: 50000000, traditionalMarket: 10000000 });
    assert.strictEqual(r.limitInfo.creditCard.deduction, 6000000);
    // 기본 250만 + min(전통시장 400만, 200만)
    const r2 = calculateTax({ ...base, totalSalary: 80000000, creditCard: 100000000, traditionalMarket: 10000000 });
    assert.strictEqual(r2.limitInfo.creditCard.deduction, 4500000);
});

test('2026 귀속: 신용카드 기본한도 자녀 1명당 50만(7천 초과 25만), 최대 2명', () => {
    const card = (taxYear, totalSalary, cardChildCount) =>
        calculateTax({ ...base, taxYear, totalSalary, creditCard: 200000000, cardChildCount }).limitInfo.creditCard.deduction;
    assert.strictEqual(card(2026, 50000000, 1), 3500000);
    assert.strictEqual(card(2026, 50000000, 2), 4000000);
    assert.strictEqual(card(2026, 50000000, 3), 4000000);   // 2명 이상 동일
    assert.strictEqual(card(2026, 80000000, 1), 2750000);
    assert.strictEqual(card(2026, 80000000, 2), 3000000);
    assert.strictEqual(card(2025, 50000000, 2), 3000000);   // 2025 귀속은 자녀 가산 없음
    assert.strictEqual(card(undefined, 50000000, 2), 3000000); // 연도 없는 옛 기록 = 2025
});

test('고향사랑기부금: 10만까지 100/110, 2026 귀속부터 10~20만 구간 40%', () => {
    const d = (taxYear, hometownDonation) =>
        calculateTax({ ...base, taxYear, totalSalary: 50000000, hometownDonation }).donationCredits.hometown;
    assert.strictEqual(d(2025, 100000), 90909);
    assert.strictEqual(d(2025, 200000), 105909);  // 90,909 + 10만×15%
    assert.strictEqual(d(2026, 200000), 130909);  // 90,909 + 10만×40%
    assert.strictEqual(d(2026, 300000), 145909);  // + 20만 초과 10만×15%
});

test('정치자금기부금: 10만까지 100/110, 초과 15%', () => {
    const r = calculateTax({ ...base, totalSalary: 50000000, politicalDonation: 500000 });
    assert.strictEqual(r.donationCredits.political, 150909);
});

test('특례·일반기부금: 1천만 이하 15%, 초과분 30%', () => {
    const r = calculateTax({ ...base, totalSalary: 100000000, donation: 15000000 });
    assert.strictEqual(r.donationCredits.general, 3000000);
});

test('표준세액공제를 골라도 정치자금·고향사랑기부금 공제는 유지', () => {
    const r = calculateTax({ ...base, totalSalary: 20000000, healthInsurance: 700000, hometownDonation: 100000 });
    assert.strictEqual(r.standardCreditApplied, true);
    assert.strictEqual(r.determinedTax, 146750 - 90909);
});

test('자녀세액공제 최소 연령: 2025 8세, 2026 9세 … 2030 이후 13세', () => {
    assert.deepStrictEqual([2025, 2026, 2027, 2029, 2030, 2031].map(childCreditMinAge), [8, 9, 10, 12, 13, 13]);
});

test('청년형 장기펀드: 총급여 8천만 초과 연도만 공제 배제 (가입 후 연봉 상승은 공제 유지)', () => {
    const y = (totalSalary) => calculateTax({ ...base, totalSalary, youthLongTermFund: 6000000 }).limitInfo.youthFund.deduction;
    assert.strictEqual(y(60000000), 2400000);
    assert.strictEqual(y(85000000), 0);
});

test('연금계좌: 연금저축 단독 600만, IRP 합산 900만', () => {
    const p = (pensionAccount, irpAccount) =>
        calculateTax({ ...base, totalSalary: 50000000, pensionAccount, irpAccount }).limitInfo.pensionAccount.deduction;
    assert.strictEqual(p(9000000, 0), 900000);          // 600만 × 15%
    assert.strictEqual(p(6000000, 5000000), 1350000);   // 900만 × 15%
    assert.strictEqual(p(0, 9000000), 1350000);         // IRP만 900만
});

test('인적 추가공제: 경로우대 100만, 장애인 200만, 부녀자 50만(소득 3천만 이하), 한부모 100만(부녀자와 중복 불가)', () => {
    const d = (extra) => calculateTax({ ...base, totalSalary: 30000000, ...extra }).personalDeduction;
    assert.strictEqual(d({ dependentCount: 3, elderlyCount: 1, disabledCount: 1 }), 4500000 + 1000000 + 2000000);
    assert.strictEqual(d({ isWomanDeduction: true }), 1500000 + 500000);
    assert.strictEqual(d({ isWomanDeduction: true, isSingleParent: true }), 1500000 + 1000000);
    // 총급여 5천만 → 근로소득금액 3,775만 > 3천만 → 부녀자공제 불가
    assert.strictEqual(calculateTax({ ...base, totalSalary: 50000000, isWomanDeduction: true }).personalDeduction, 1500000);
});

test('출산·입양 세액공제: 첫째 30만, 둘째 50만, 셋째 이상 70만', () => {
    const b = (birthAdoptionOrder) => calculateTax({ ...base, totalSalary: 50000000, birthAdoptionOrder }).birthCredit;
    assert.deepStrictEqual([0, 1, 2, 3].map(b), [0, 300000, 500000, 700000]);
});

test('교육비: 본인 무제한, 취학전·초중고 1인당 300만, 대학생 1인당 900만', () => {
    const r = calculateTax({ ...base, totalSalary: 100000000, educationExpense: 20000000,
        educationSchoolList: '5000000, 1000000', educationUnivList: '10000000' });
    assert.strictEqual(r.educationTarget, 20000000 + 3000000 + 1000000 + 9000000);
});

test('기부금 한도: 일반 30%(종교 10%), 특례 100% — 근로소득금액 기준', () => {
    // 총급여 5천만 → 근로소득금액 3,775만
    const g = (extra) => calculateTax({ ...base, totalSalary: 50000000, ...extra }).donationCredits.general;
    assert.strictEqual(g({ generalDonation: 20000000 }), 1897500);   // 한도 1,132.5만: 1천만×15% + 132.5만×30%
    assert.strictEqual(g({ religiousDonation: 10000000 }), 566250);  // 한도 377.5만 × 15%
    assert.strictEqual(g({ donation: 5000000, generalDonation: 20000000 }), 2947500); // 500만 + (3,275만×30%=982.5만)
});

test('신용카드: 총급여 7천만 초과자의 도서·공연 사용분은 신용카드(15%)로 공제', () => {
    const r = calculateTax({ ...base, totalSalary: 80000000, creditCard: 20000000, booksPerformance: 10000000 });
    assert.strictEqual(r.limitInfo.creditCard.deduction, 1500000);
});

test('중소기업 취업 청년 감면: 산출세액 90%, 연 200만 한도, 근로소득세액공제는 감면 비율만큼 축소', () => {
    const r = calculateTax({ ...base, totalSalary: 50000000, smeYouthReduction: true });
    assert.strictEqual(r.taxReduction, 2000000);
    assert.strictEqual(r.determinedTax, 4177500 - 2000000 - 344021 - 130000);
});

const pensionCombo = (extra) =>
    recommendDeductions({ ...base, totalSalary: 50000000, ...extra }).find((i) => i.key === 'pensionCombo');

test('추천: 연금계좌 조합 — 900만 채우면 15% + 지방세 10%, 연금저축 600만 우선 + IRP 300만', () => {
    const c = pensionCombo({});
    assert.strictEqual(c.amount, 9000000);
    assert.strictEqual(c.saving, 1485000); // 135만 + 지방소득세 13.5만
    assert.strictEqual(c.minAmount, 9000000);
    assert.deepStrictEqual(c.split, { pension: 6000000, irp: 3000000 });
});

test('추천: 연금계좌 조합 — 기존 납입분 반영 (연금저축 600만 초과분은 IRP로)', () => {
    assert.deepStrictEqual(pensionCombo({ pensionAccount: 4000000 }).split, { pension: 2000000, irp: 3000000 });
    assert.deepStrictEqual(pensionCombo({ pensionAccount: 8000000 }).split, { pension: 0, irp: 3000000 });
    assert.deepStrictEqual(pensionCombo({ irpAccount: 5000000 }).split, { pension: 4000000, irp: 0 });
    assert.strictEqual(pensionCombo({ pensionAccount: 6000000, irpAccount: 3000000 }).amount, 0);
});

test('추천: 남은 세금이 적으면 같은 효과를 내는 최소 금액(만원 단위)과 그때의 조합 제시', () => {
    // 가상 사례: 결정세액 191,250 + 지방세 19,125 → 16.5%로 상쇄하려면 1,275,000원 이상 → 128만원, 전부 연금저축
    const c = recommendDeductions(SAMPLE).find((i) => i.key === 'pensionCombo');
    assert.strictEqual(c.saving, 210375);
    assert.strictEqual(c.minAmount, 1280000);
    assert.deepStrictEqual(c.split, { pension: 1280000, irp: 0 });
});

test('추천: 최저사용액 초과 신용카드분을 체크카드로 바꾸면 절세', () => {
    const items = recommendDeductions({ ...base, totalSalary: 50000000, creditCard: 30000000 });
    const card = items.find((i) => i.key === 'cardSwitch');
    assert.strictEqual(card.amount, 17500000); // 3천만 - 최저사용액 1,250만
    assert.ok(card.saving > 0);
});

test('추천: 효과 없는 항목도 사유와 함께 모두 표시', () => {
    const zero = recommendDeductions({ ...base, totalSalary: 10000000 });
    assert.ok(zero.length >= 14);
    assert.ok(zero.every((i) => i.saving === 0 && i.reason));
    assert.strictEqual(zero.find((i) => i.key === 'insurance').reason, '결정세액이 이미 0원');
    const items = recommendDeductions({ ...base, totalSalary: 50000000, pensionAccount: 6000000, irpAccount: 3000000 });
    assert.strictEqual(items.find((i) => i.key === 'pensionCombo').reason, '이미 한도까지 채움');
    // 총급여 8천만 초과면 월세는 대상 아님
    assert.strictEqual(recommendDeductions({ ...base, totalSalary: 90000000 }).find((i) => i.key === 'monthlyRent').reason, '총급여 8천만원 초과');
    // 효과 있는 항목 → 선택 가능 항목 우선, 대출·월세 등 '해당 시' 항목은 그 뒤
    const order = items.map((i) => i.key);
    assert.ok(order.indexOf('housingSubscription') < order.indexOf('mortgage'));
    assert.strictEqual(items[items.length - 1].saving, 0);
});

test('주택청약 납입 인정한도 300만 (최대 120만 공제)', () => {
    const r = calculateTax({ ...base, totalSalary: 50000000, housingSubscription: 5000000 });
    assert.strictEqual(r.limitInfo.housing.deduction, 1200000);
});

test('의료비: 그 외 부양가족만 700만 한도, 총급여 3%는 그 외 의료비에서 먼저 차감', () => {
    // 문턱 150만. 그 외 1,000만-150만=850만 → 700만, 본인 100만 → 800만 × 15%
    const r = calculateTax({ ...base, totalSalary: 50000000, medicalExpense: 1000000, medicalExpenseOther: 10000000 });
    assert.strictEqual(r.limitInfo.medical.deduction, 1200000);
    // 그 외 100만 < 문턱 → 부족분 50만을 본인 의료비에서 차감: (500만-50만) × 15%
    const r2 = calculateTax({ ...base, totalSalary: 50000000, medicalExpense: 5000000, medicalExpenseOther: 1000000 });
    assert.strictEqual(r2.limitInfo.medical.deduction, 675000);
});

test('표준세액공제: 특별소득공제·특별세액공제를 포기하는 편이 유리하면 13만 적용', () => {
    // 특별 적용 시 결정세액 257,850 > 표준 적용 시 146,750
    const r = calculateTax({ ...base, totalSalary: 20000000, healthInsurance: 700000 });
    assert.strictEqual(r.standardCreditApplied, true);
    assert.strictEqual(r.determinedTax, 146750);
});

test('장기주택저당차입금 상환조건별 한도', () => {
    const cases = [
        ['fixedAndNonDeferred', 20000000],
        ['fixedOrNonDeferred', 18000000],
        ['other15', 8000000],
        ['tenYears', 6000000],
    ];
    for (const [mortgageType, limit] of cases) {
        const r = calculateTax({ ...base, totalSalary: 100000000, housingMortgageLoan: 30000000, mortgageType });
        assert.strictEqual(r.limitInfo.mortgage.deduction, limit, mortgageType);
    }
    // 이자가 한도보다 적으면 전액
    const r = calculateTax({ ...base, totalSalary: 100000000, housingMortgageLoan: 5000000, mortgageType: 'tenYears' });
    assert.strictEqual(r.limitInfo.mortgage.deduction, 5000000);
});

test('소득공제 종합한도 2,500만원 초과분 제외 (청년형 펀드는 한도 밖)', () => {
    const r = calculateTax({
        ...base,
        totalSalary: 100000000,
        housingRentalLoan: 10000000,    // 40% → 400만 (청약 합산 한도)
        housingMortgageLoan: 20000000,  // 2,000만
        creditCard: 50000000,           // (5천만-2,500만)×15%=375만 → 한도 250만
    });
    // 한도 대상 합계 400만+2,000만+250만=2,650만 → 초과 150만
    assert.strictEqual(r.overallLimitExcess, 1500000);
    assert.strictEqual(r.totalDeductions, 1500000 + 25000000); // 본인 기본공제 + 한도액
});

test('추천 정렬: 실질 비용 0 이하 → 절세율 → 자금 묶임 짧은 순', () => {
    const items = recommendDeductions({ ...base, taxYear: 2026, totalSalary: 50000000, prePaidTax: 0,
        creditCard: 20000000, publicTransport: 1000000, healthInsurance: 2300000, employmentInsurance: 500000 });
    const keys = items.filter((i) => i.saving > 0 && !i.conditional).map((i) => i.key);
    // 정치자금(100%) → 고향사랑(답례품 포함 이득) → 연금(16.5%, 비용 0) → … → 보험(소비라 비용 발생)은 비용 0 항목 뒤
    assert.deepStrictEqual(keys.slice(0, 3), ['political', 'hometown', 'pensionCombo']);
    assert.strictEqual(keys[keys.length - 1], 'insurance');
    // 절세율 같으면(6.6%) 묶임 없는 카드 추가한도가 청약보다 먼저
    assert.ok(keys.indexOf('cardExtra') < keys.indexOf('housingSubscription'));
    assert.ok(items.find((i) => i.key === 'hometown').netCost < 0);
});

test('추천 적용: changes를 입력에 반영하면 예상 절세만큼 세금이 줄어듦', () => {
    const inputs = { ...base, taxYear: 2026, totalSalary: 50000000, healthInsurance: 2300000, creditCard: 20000000 };
    const total = (r) => r.determinedTax + r.localDeterminedTax;
    const before = total(calculateTax(inputs));
    for (const i of recommendDeductions(inputs).filter((x) => x.saving > 0)) {
        assert.strictEqual(before - total(calculateTax({ ...inputs, ...i.changes })), i.saving, i.key);
    }
    const pension = recommendDeductions(inputs).find((i) => i.key === 'pensionCombo');
    assert.deepStrictEqual(pension.changes, { pensionAccount: 6000000, irpAccount: 3000000 });
});
