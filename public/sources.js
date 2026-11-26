// 입력 항목별 "어디서 확인하나" 안내
// 간소화 = 홈택스 연말정산 간소화 서비스 (매년 1월 15일 공개)
// 연중(귀속연도 진행 중)에는 급여명세서 누계·홈택스 '연말정산 미리보기'·각 금융사 앱으로 추정
const INPUT_SOURCES = {
    totalSalary: '근로소득 원천징수영수증 「총급여」(홈택스 > 지급명세서 조회) / 연중엔 급여명세서 지급액 누계',
    nonTaxableIncome: '급여명세서 비과세 항목(식대 월 20만원, 6세 이하 보육수당 자녀당 월 20만원 등) 연간 합계',
    prePaidTax: '급여명세서 「소득세」 연간 합계 / 원천징수영수증 「기납부세액」',
    prePaidLocalTax: '급여명세서 「지방소득세」 연간 합계',


    nationalPension: '급여명세서 「국민연금」 합계 / 간소화 「국민연금」 / 내곁에국민연금 앱 납부내역',
    healthInsurance: '급여명세서 「건강보험」+「장기요양」 합계 / 간소화 「건강보험료」 / The건강보험 앱',
    employmentInsurance: '급여명세서 「고용보험」 연간 합계',
    housingSubscription: '간소화 「주택마련저축」 / 은행 앱 청약통장 납입내역 (은행에 무주택확인서 제출 필요)',
    housingRentalLoan: '간소화 「주택임차차입금」 / 대출 은행의 원리금 상환증명서',
    housingMortgageLoan: '간소화 「장기주택저당차입금」 / 대출 은행의 이자상환증명서',
    youthLongTermFund: '간소화 「장기집합투자증권저축」 / 증권사 앱 납입증명서',

    creditCard: '간소화 「신용카드」 / 연중엔 홈택스 「연말정산 미리보기」(1~9월 사용액) + 카드사 앱 연간 이용내역',
    debitCard: '간소화 「직불·선불카드」+「현금영수증」 / 홈택스 현금영수증 조회',
    publicTransport: '간소화 「신용카드 등」 중 대중교통 사용분 (카드사·교통카드 앱)',
    traditionalMarket: '간소화 「신용카드 등」 중 전통시장 사용분',
    booksPerformance: '간소화 「신용카드 등」 중 도서·공연·박물관·영화·체육시설 사용분',

    pensionAccount: '간소화 「연금저축」 / 금융사 앱 연금저축 납입증명서',
    irpAccount: '간소화 「퇴직연금」 / 금융사 앱 IRP 납입증명서 (회사 부담금 제외, 본인 납입분만)',

    insurancePremium: '간소화 「보험료」 중 보장성보험 / 보험사 앱 납입증명서',
    medicalExpense: '간소화 「의료비」 (사람별로 표시). 안경·콘택트렌즈·산후조리원은 영수증 별도',
    medicalExpenseOther: '간소화 「의료비」에서 본인·65세 이상·장애인·6세 이하를 뺀 부양가족분',
    educationExpense: '간소화 「교육비」 본인분 / 대학(원) 교육비납입증명서',
    educationSchoolList: '간소화 「교육비」 자녀별 금액 / 학원·체육시설 교육비납입증명서 (간소화에 없으면 직접 발급)',
    educationUnivList: '간소화 「교육비」 자녀별 대학 등록금',
    donation: '간소화 「기부금」 중 특례기부금 / 기부처 기부금영수증',
    generalDonation: '간소화 「기부금」 중 일반기부금 / 기부처 기부금영수증',
    religiousDonation: '종교단체 기부금영수증 (간소화에 없는 경우가 많아 직접 발급 요청)',
    politicalDonation: '간소화 「기부금」 중 정치자금 / 선거관리위원회·정당 영수증',
    hometownDonation: '고향사랑e음 사이트 기부 내역 / 간소화 「기부금」',
    monthlyRent: '임대차계약서 + 월세 계좌이체 내역 (간소화에 없음, 직접 합산)',
};

// 각 입력 칸 아래에 확인처 표시 (브라우저에서만)
if (typeof document !== 'undefined') {
    for (const [id, text] of Object.entries(INPUT_SOURCES)) {
        const group = document.getElementById(id)?.closest('.sub-group, .input-group');
        if (!group) continue;
        const p = document.createElement('p');
        p.className = 'source-hint';
        p.textContent = `📍 확인: ${text}`;
        group.appendChild(p);
    }

    // 안내 문구(* 도움말, 📍 확인처)는 기본으로 숨기고 라벨 옆 ⓘ 버튼으로 펼침
    let n = 0;
    for (const group of document.querySelectorAll('#taxForm .input-group, #taxForm .sub-group')) {
        const hints = group.querySelectorAll(':scope > .help-text, :scope > .source-hint');
        const label = group.querySelector(':scope > label');
        if (!hints.length || !label) continue;
        const box = document.createElement('div');
        box.className = 'hints';
        box.id = `hints-${n++}`;
        box.hidden = true;
        box.append(...hints);
        group.appendChild(box);
        // 버튼은 label 안에 두지만 대화형 요소라 클릭해도 입력칸 포커스로 넘어가지 않음
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'info-btn';
        btn.textContent = 'ⓘ';
        btn.setAttribute('aria-label', '안내 보기');
        btn.setAttribute('aria-expanded', 'false');
        btn.setAttribute('aria-controls', box.id);
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            box.hidden = !box.hidden;
            btn.setAttribute('aria-expanded', String(!box.hidden));
        });
        label.append(' ', btn);
    }
}

// Node 테스트용 export
if (typeof module !== 'undefined') module.exports = { INPUT_SOURCES };
