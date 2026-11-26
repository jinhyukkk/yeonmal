/**
 * 연말정산 계산 로직 (2025·2026년 귀속). 연도별 차이는 inputs.taxYear로 분기
 */

const TAX_CONSTANTS = {
    // 근로소득공제 한도
    MAX_EARNED_INCOME_DEDUCTION: 20000000,

    // 인적공제
    BASIC_DEDUCTION_PER_PERSON: 1500000,

    // 세액공제 (2025년 확대)
    CHILD_CREDIT_1: 250000, // 15만 -> 25만
    CHILD_CREDIT_2: 550000, // 35만 -> 55만
    CHILD_CREDIT_3_PLUS_PER: 400000, // 2명 초과 1명당 30만 -> 40만

    MARRIAGE_CREDIT: 500000, // 결혼세액공제 (1인당)

    STANDARD_CREDIT: 130000, // 표준세액공제

    // 장기주택저당차입금 이자상환액 한도 (소득세법 제52조⑤, 2024년 이후 이자상환분)
    MORTGAGE_LIMITS: {
        fixedAndNonDeferred: 20000000, // 상환 15년 이상 + 고정금리 + 비거치식 분할상환
        fixedOrNonDeferred: 18000000,  // 상환 15년 이상 + 고정금리 또는 비거치식
        other15: 8000000,              // 상환 15년 이상 + 그 외
        tenYears: 6000000,             // 상환 10년 이상 + 고정금리 또는 비거치식
    },

    // 소득공제 종합한도 (조특법 제132조의2)
    OVERALL_DEDUCTION_LIMIT: 25000000,

    // 근로소득세액공제 한도
    EARNED_INCOME_CREDIT_LIMIT_A: 740000, // 3300이하
    EARNED_INCOME_CREDIT_LIMIT_B: 660000, // 3300~7000
    EARNED_INCOME_CREDIT_LIMIT_C: 500000, // 7000~1.2억
    EARNED_INCOME_CREDIT_LIMIT_D: 200000, // 1.2억 초과
};

/**
 * 근로소득공제 계산
 * @param {number} totalSalary 총급여액
 * @returns {number} 공제액
 */
function calculateEarnedIncomeDeduction(totalSalary) {
    let deduction = 0;
    if (totalSalary <= 5000000) {
        deduction = totalSalary * 0.7;
    } else if (totalSalary <= 15000000) {
        deduction = 3500000 + (totalSalary - 5000000) * 0.4;
    } else if (totalSalary <= 45000000) {
        deduction = 7500000 + (totalSalary - 15000000) * 0.15;
    } else if (totalSalary <= 100000000) {
        deduction = 12000000 + (totalSalary - 45000000) * 0.05;
    } else {
        deduction = 14750000 + (totalSalary - 100000000) * 0.02;
    }
    return Math.floor(Math.min(deduction, TAX_CONSTANTS.MAX_EARNED_INCOME_DEDUCTION));
}

/**
 * 산출세액 계산 (기본세율)
 * @param {number} taxBase 과세표준
 * @returns {number} 산출세액
 */
function calculateCalculatedTax(taxBase) {
    if (taxBase <= 14000000) return taxBase * 0.06;
    if (taxBase <= 50000000) return taxBase * 0.15 - 1260000;
    if (taxBase <= 88000000) return taxBase * 0.24 - 5760000;
    if (taxBase <= 150000000) return taxBase * 0.35 - 15440000;
    if (taxBase <= 300000000) return taxBase * 0.38 - 19940000;
    if (taxBase <= 500000000) return taxBase * 0.40 - 25940000;
    if (taxBase <= 1000000000) return taxBase * 0.42 - 35940000;
    return taxBase * 0.45 - 65940000;
}

/**
 * 근로소득세액공제 계산
 * @param {number} calculatedTax 산출세액
 * @param {number} totalSalary 총급여액
 * @returns {number} 공제액
 */
function calculateEarnedIncomeTaxCredit(calculatedTax, totalSalary) {
    let credit = 0;
    if (calculatedTax <= 1300000) {
        credit = calculatedTax * 0.55;
    } else {
        credit = 715000 + (calculatedTax - 1300000) * 0.30;
    }

    // 한도 적용
    let limit = 0;
    if (totalSalary <= 33000000) limit = TAX_CONSTANTS.EARNED_INCOME_CREDIT_LIMIT_A;
    else if (totalSalary <= 70000000) {
        limit = Math.max(TAX_CONSTANTS.EARNED_INCOME_CREDIT_LIMIT_B, 740000 - (totalSalary - 33000000) * 0.008);
    } else if (totalSalary <= 120000000) {
        limit = Math.max(TAX_CONSTANTS.EARNED_INCOME_CREDIT_LIMIT_C, 660000 - (totalSalary - 70000000) * 0.5);
    } else {
        limit = Math.max(TAX_CONSTANTS.EARNED_INCOME_CREDIT_LIMIT_D, 500000 - (totalSalary - 120000000) * 0.5);
    }

    return Math.floor(Math.min(credit, limit));
}

/**
 * 자녀세액공제 대상 최소 연령 (아동수당과 중복 방지)
 * 2025 이전 8세, 2026 9세부터 매년 1세씩 올라 2030 이후 13세 (소득세법 법률 제21548호, 2026.4.21)
 */
function childCreditMinAge(taxYear) {
    return Math.min(Math.max(8, (taxYear ?? 2025) - 2017), 13);
}

/**
 * 기부금 세액공제 (원 미만 절사)
 * - 정치자금(조특법 §76): 10만 이하 100/110, 초과 15% (3천만 초과 25%)
 * - 고향사랑(조특법 §58): 10만 이하 100/110, 초과 15% / 2026 귀속부터 10~20만 구간 40%, 연 2,000만 한도
 * - 특례(donation)·일반(generalDonation)·종교(religiousDonation) (소득세법 §59조의4④, §34):
 *   한도: 특례 = 근로소득금액, 일반 = (근로소득금액 − 특례) × 10% + min(× 20%, 종교 외 일반)
 *   공제율: 인정액 합계 1천만 이하 15%, 초과분 30%
 */
function calculateDonationCredits(inputs, earnedIncomeAmount) {
    const tiered = (amount, tiers) => {
        // tiers: [[구간 상한, 공제율], ...] 순서대로 누진 적용
        let prev = 0, sum = 0;
        for (const [upper, rate] of tiers) {
            sum += Math.max(0, Math.min(amount, upper) - prev) * rate;
            prev = upper;
        }
        return Math.floor(sum);
    };
    const political = tiered(inputs.politicalDonation || 0,
        [[100000, 100 / 110], [30000000, 0.15], [Infinity, 0.25]]);
    const hometownTiers = (inputs.taxYear ?? 2025) >= 2026
        ? [[100000, 100 / 110], [200000, 0.40], [Infinity, 0.15]]
        : [[100000, 100 / 110], [Infinity, 0.15]];
    const hometown = tiered(Math.min(inputs.hometownDonation || 0, 20000000), hometownTiers);
    const special = Math.min(inputs.donation || 0, earnedIncomeAmount);
    const remaining = earnedIncomeAmount - special;
    const nonReligious = inputs.generalDonation || 0;
    const generalLimit = remaining * 0.1 + Math.min(remaining * 0.2, nonReligious);
    const generalAllowed = Math.min(nonReligious + (inputs.religiousDonation || 0), generalLimit);
    const general = tiered(special + generalAllowed, [[10000000, 0.15], [Infinity, 0.30]]);
    return { political, hometown, general };
}

/**
 * 한 가지 공제 선택(특별공제 / 표준세액공제)에 대한 세금 계산
 */
function calculateTaxCase(inputs, useStandard) {
    const {
        totalSalary, nonTaxableIncome, prePaidTax,
        dependentCount, childCount, isMarried2024_2026,
        nationalPension, housingSubscription, youthLongTermFund, insurancePremium, pensionAccount,
        creditCard, medicalExpense, educationExpense, donation, monthlyRent
    } = inputs;

    // 1. 총급여액 (과세대상)
    const taxableSalary = Math.max(0, totalSalary - nonTaxableIncome);

    // 2. 근로소득공제
    const earnedIncomeDeduction = calculateEarnedIncomeDeduction(taxableSalary);
    const earnedIncomeAmount = taxableSalary - earnedIncomeDeduction;

    // 3. 소득공제
    // 인적공제: 기본공제 1인당 150만 + 추가공제
    // 경로우대(70세 이상) 100만, 장애인 200만, 부녀자 50만(근로소득금액 3천만 이하), 한부모 100만(부녀자와 중복 시 한부모만)
    const womanDeduction = inputs.isWomanDeduction && !inputs.isSingleParent && earnedIncomeAmount <= 30000000 ? 500000 : 0;
    const basicDeduction = dependentCount * TAX_CONSTANTS.BASIC_DEDUCTION_PER_PERSON
        + (inputs.elderlyCount || 0) * 1000000
        + (inputs.disabledCount || 0) * 2000000
        + womanDeduction
        + (inputs.isSingleParent ? 1000000 : 0);

    // 연금보험료공제 (국민연금 전액)
    const pensionDeduction = nationalPension;

    // 건강보험료, 고용보험료 공제 (전액)
    const healthInsuranceDeduction = inputs.healthInsurance;
    const employmentInsuranceDeduction = inputs.employmentInsurance;

    // 특별소득공제
    // 주택자금공제
    // 1. 주택청약종합저축 + 주택임차차입금 원리금상환액 (합산 한도 400만원)
    // * 주택청약: 총급여 7천이하 무주택 세대주, 납입액의 40%
    // * 주택임차차입금: 무주택 세대주, 원리금상환액의 40%
    let housingSubscriptionDeduction = 0;
    if (taxableSalary <= 70000000) {
        housingSubscriptionDeduction = Math.min(housingSubscription, 3000000) * 0.4; // 납입 인정한도 300만
    }
    const housingRentalLoanDeduction = inputs.housingRentalLoan * 0.4;

    // 합산 한도 적용 (400만원)
    let housingRentalAndSubscription = Math.min(housingSubscriptionDeduction + housingRentalLoanDeduction, 4000000);

    // 2. 장기주택저당차입금 이자상환액
    // shortcut: 2015년 이후 차입분 기준(2024년 이후 이자상환분 한도). 2014년 이전 차입분이 생기면 구간 추가
    const mortgageLimit = TAX_CONSTANTS.MORTGAGE_LIMITS[inputs.mortgageType] ?? TAX_CONSTANTS.MORTGAGE_LIMITS.fixedAndNonDeferred;
    const housingMortgageDeduction = Math.min(inputs.housingMortgageLoan, mortgageLimit);

    const housingDeduction = housingRentalAndSubscription + housingMortgageDeduction;

    // 청년형 장기집합투자증권저축 소득공제: 납입액(연 600만 한도)의 40%
    // 총급여 5천만 이하는 가입 시 요건이므로 입력했다면 가입 요건은 충족한 것으로 봄
    // 해당 연도 총급여 8천만 초과 시에만 공제 배제
    const youthFundDeduction = taxableSalary <= 80000000 ? Math.min(youthLongTermFund, 6000000) * 0.4 : 0;

    // 신용카드 등 소득공제 상세 로직
    // 1. 최저사용금액 (총급여의 25%)
    const minUsageThreshold = taxableSalary * 0.25;

    // 2. 공제 대상 사용액 합계
    const totalUsage = creditCard + inputs.debitCard + inputs.publicTransport + inputs.traditionalMarket + inputs.booksPerformance;

    let creditCardDeduction = 0;
    let basicLimit = 0;
    let additionalLimit = 0;

    if (totalUsage > minUsageThreshold) {
        // 공제 순서: 신용카드 -> 직불/현금 -> 도서공연 -> 전통시장/대중교통 (일반적으로 공제율 낮은 순서로 채움)
        // 초과금액 산정
        let remainingThreshold = minUsageThreshold;

        // (1) 신용카드 (15%)
        // 총급여 7천만 초과자는 문화비 공제가 없어 도서·공연 사용분을 일반 신용카드분으로 처리
        // shortcut: 체크카드·현금으로 결제한 도서·공연분도 15%로 계산(실제 30%). 필요하면 결제수단 구분 입력 추가
        const cardAmount = creditCard + (taxableSalary > 70000000 ? inputs.booksPerformance : 0);
        let creditCardUsedForThreshold = Math.min(cardAmount, remainingThreshold);
        let creditCardDeductible = cardAmount - creditCardUsedForThreshold;
        remainingThreshold -= creditCardUsedForThreshold;

        // (2) 직불/현금 (30%)
        let debitUsedForThreshold = Math.min(inputs.debitCard, remainingThreshold);
        let debitDeductible = inputs.debitCard - debitUsedForThreshold;
        remainingThreshold -= debitUsedForThreshold;

        // (3) 도서/공연 (30%) - 총급여 7천만원 이하만
        let booksUsedForThreshold = 0;
        let booksDeductible = 0;
        if (taxableSalary <= 70000000) {
            booksUsedForThreshold = Math.min(inputs.booksPerformance, remainingThreshold);
            booksDeductible = inputs.booksPerformance - booksUsedForThreshold;
            remainingThreshold -= booksUsedForThreshold;
        }

        // (4) 전통시장 (40%)
        let marketUsedForThreshold = Math.min(inputs.traditionalMarket, remainingThreshold);
        let marketDeductible = inputs.traditionalMarket - marketUsedForThreshold;
        remainingThreshold -= marketUsedForThreshold;

        // (5) 대중교통 (40%)
        let transportUsedForThreshold = Math.min(inputs.publicTransport, remainingThreshold);
        let transportDeductible = inputs.publicTransport - transportUsedForThreshold;
        remainingThreshold -= transportUsedForThreshold;

        // 공제액 계산
        let deductionAmount =
            (creditCardDeductible * 0.15) +
            (debitDeductible * 0.30) +
            (booksDeductible * 0.30) +
            (marketDeductible * 0.40) +
            (transportDeductible * 0.40);

        // 한도 적용
        // 기본 한도: 7천만 이하 300만, 초과 250만
        // 2026 귀속부터 자녀 1명당 50만(7천 초과 25만) 가산, 최대 2명 (조특법 §126조의2, 2025.12 개정)
        const under70m = taxableSalary <= 70000000;
        const cardChildren = (inputs.taxYear ?? 2025) >= 2026 ? Math.min(inputs.cardChildCount || 0, 2) : 0;
        basicLimit = (under70m ? 3000000 : 2500000) + cardChildren * (under70m ? 500000 : 250000);

        // 추가 한도: 전통시장·대중교통(·문화, 7천 이하만) 공제액 합산, 7천 이하 300만 / 초과 200만
        // 공제액 합계를 기본+추가로 자르면 "기본한도 초과분 중 추가공제 대상분" 규칙과 같음
        const extraTarget = marketDeductible * 0.4 + transportDeductible * 0.4 + booksDeductible * 0.3;
        additionalLimit = Math.min(extraTarget, under70m ? 3000000 : 2000000);

        creditCardDeduction = Math.floor(Math.min(deductionAmount, basicLimit + additionalLimit));
    }

    // 소득공제 종합한도: 주택자금(임차차입금·장기주택저당)·주택청약·신용카드 등 합계 2,500만원
    // 인적공제·연금보험료·건강/고용보험료·청년형 장기펀드는 한도 밖
    const overallLimitTarget = housingDeduction + creditCardDeduction;
    const overallLimitExcess = Math.max(0, overallLimitTarget - TAX_CONSTANTS.OVERALL_DEDUCTION_LIMIT);

    const totalDeductions = basicDeduction + pensionDeduction + healthInsuranceDeduction + employmentInsuranceDeduction
        + housingDeduction + youthFundDeduction + creditCardDeduction - overallLimitExcess;

    // 4. 과세표준
    const taxBase = Math.max(0, earnedIncomeAmount - totalDeductions);

    // 5. 산출세액
    const calculatedTax = Math.floor(calculateCalculatedTax(taxBase));

    // 6. 세액공제
    // 근로소득세액공제
    // 중소기업 취업 청년 소득세 감면 (조특법 §30): 산출세액 × 90%, 연 200만 한도
    // shortcut: 급여 전액이 감면 대상이라고 가정. 중도 취업 등으로 일부만 대상이면 감면 대상 급여 비율 입력 추가
    const taxReduction = inputs.smeYouthReduction ? Math.min(Math.floor(calculatedTax * 0.9), 2000000) : 0;
    // 감면을 받으면 근로소득세액공제는 (1 − 감면세액/산출세액) 비율만큼만 인정
    const earnedIncomeTaxCredit = Math.floor(calculateEarnedIncomeTaxCredit(calculatedTax, taxableSalary)
        * (calculatedTax > 0 ? 1 - taxReduction / calculatedTax : 1));

    // 자녀세액공제 (2025년 확대 적용)
    let childCredit = 0;
    if (childCount === 1) childCredit = TAX_CONSTANTS.CHILD_CREDIT_1;
    else if (childCount === 2) childCredit = TAX_CONSTANTS.CHILD_CREDIT_2;
    else if (childCount >= 3) childCredit = TAX_CONSTANTS.CHILD_CREDIT_2 + (childCount - 2) * TAX_CONSTANTS.CHILD_CREDIT_3_PLUS_PER;

    // 출산·입양 세액공제: 해당 연도 출생·입양 자녀가 첫째 30만, 둘째 50만, 셋째 이상 70만
    // shortcut: 한 해 1명만 입력 가능, 쌍둥이 등 2명 이상이면 순서별 개수 입력으로 확장
    const birthCredit = [0, 300000, 500000, 700000][Math.min(inputs.birthAdoptionOrder || 0, 3)];

    // 결혼세액공제 (2025년 신설)
    const marriageCredit = isMarried2024_2026 ? TAX_CONSTANTS.MARRIAGE_CREDIT : 0;

    // 연금계좌세액공제 (12% or 15%)
    // 총급여 5500이하 15%, 초과 12%
    const pensionRate = taxableSalary <= 55000000 ? 0.15 : 0.12;
    // 연금저축(pensionAccount) 단독 600만, IRP 합산 900만
    const pensionTarget = Math.min(Math.min(pensionAccount, 6000000) + (inputs.irpAccount || 0), 9000000);
    const pensionAccountCredit = pensionTarget * pensionRate;

    // 특별세액공제
    // 보장성보험료 (12%, 한도 100만원 대상액)
    const insuranceCredit = Math.min(insurancePremium, 1000000) * 0.12;

    // 의료비 (총급여 3% 초과분의 15%)
    // medicalExpense: 본인·65세 이상·장애인·6세 이하 (한도 없음)
    // medicalExpenseOther: 그 외 부양가족 (공제대상금액 700만 한도)
    // 3% 문턱은 그 외 의료비에서 먼저 빼고, 모자라면 본인 등 의료비에서 뺌
    const medicalThreshold = taxableSalary * 0.03;
    const otherOverThreshold = (inputs.medicalExpenseOther || 0) - medicalThreshold;
    const medicalOtherTarget = Math.min(Math.max(otherOverThreshold, 0), 7000000);
    const medicalSelfTarget = Math.max(medicalExpense + Math.min(otherOverThreshold, 0), 0);
    const medicalCredit = (medicalSelfTarget + medicalOtherTarget) * 0.15;

    // 교육비 15%: 본인(educationExpense) 한도 없음, 취학전·초중고 1인당 300만, 대학생 1인당 900만
    // 자녀별 금액은 "300만, 100만"처럼 쉼표로 구분해 입력
    // shortcut: 장애인 특수교육비(한도 없음)는 본인 칸에 입력
    const perPersonCapped = (list, cap) => String(list || '').split(/[,\s]+/)
        .map(Number).filter((n) => n > 0).reduce((sum, n) => sum + Math.min(n, cap), 0);
    const educationTarget = (educationExpense || 0)
        + perPersonCapped(inputs.educationSchoolList, 3000000)
        + perPersonCapped(inputs.educationUnivList, 9000000);
    const educationCredit = educationTarget * 0.15;

    // 기부금
    const donationCredits = calculateDonationCredits(inputs, earnedIncomeAmount);
    const donationCredit = donationCredits.general; // 특례·일반기부금만 특별세액공제 (표준세액공제와 택1)

    // 월세세액공제 (총급여 5,500만 이하 17%, 8,000만 이하 15%, 한도 1,000만)
    let monthlyRentCredit = 0;
    if (taxableSalary <= 80000000) {
        const rate = taxableSalary <= 55000000 ? 0.17 : 0.15;
        monthlyRentCredit = Math.min(monthlyRent, 10000000) * rate;
    }

    // 표준세액공제는 특별소득공제·특별세액공제·월세를 신청하지 않은 경우에만 적용 (calculateTax에서 유리한 쪽 선택)
    const specialCreditsSum = [insuranceCredit, medicalCredit, educationCredit, donationCredit, monthlyRentCredit]
        .reduce((sum, v) => sum + Math.floor(v), 0);
    const finalSpecialCredit = useStandard ? TAX_CONSTANTS.STANDARD_CREDIT : specialCreditsSum;

    // 항목별 세액공제는 원 미만 절사 후 합산
    // 정치자금·고향사랑기부금은 조특법 공제라 표준세액공제와 함께 받을 수 있음
    const totalCredits = earnedIncomeTaxCredit + childCredit + birthCredit + marriageCredit
        + Math.floor(pensionAccountCredit) + Math.floor(finalSpecialCredit)
        + donationCredits.political + donationCredits.hometown;

    // 7. 결정세액
    const determinedTax = Math.max(0, calculatedTax - taxReduction - totalCredits);

    // 8. 차감징수세액
    // 차감징수세액은 10원 미만 절사 (환급도 0 방향)
    const finalTax = Math.trunc((determinedTax - prePaidTax) / 10) * 10;

    // 9. 지방소득세: 결정세액의 10%(원 미만 절사) - 기납부 지방소득세, 10원 미만 절사
    // 기납부 지방소득세를 입력하지 않으면 매월 원천징수 관행대로 소득세 기납부의 10%로 추정
    const localDeterminedTax = Math.floor(determinedTax * 0.1);
    const prePaidLocalTax = inputs.prePaidLocalTax ?? Math.floor(prePaidTax * 0.1);
    const finalLocalTax = Math.trunc((localDeterminedTax - prePaidLocalTax) / 10) * 10;

    // Return object construction with limit details
    const limitInfo = {
        overall: {
            name: '소득공제 종합한도 (주택자금·청약·신용카드)',
            deduction: overallLimitTarget,
            limit: TAX_CONSTANTS.OVERALL_DEDUCTION_LIMIT,
            isReached: overallLimitTarget >= TAX_CONSTANTS.OVERALL_DEDUCTION_LIMIT
        },
        housing: {
            name: '주택청약/임차차입금',
            deduction: housingRentalAndSubscription,
            limit: 4000000,
            isReached: housingRentalAndSubscription >= 4000000
        },
        mortgage: {
            name: '장기주택저당차입금',
            deduction: housingMortgageDeduction,
            limit: mortgageLimit,
            isReached: housingMortgageDeduction >= mortgageLimit
        },
        youthFund: {
            name: '청년형 장기펀드',
            deduction: youthFundDeduction,
            limit: 2400000,
            isReached: youthFundDeduction >= 2400000
        },
        creditCard: {
            name: '신용카드 등',
            deduction: creditCardDeduction,
            limit: basicLimit + additionalLimit,
            isReached: creditCardDeduction >= (basicLimit + additionalLimit)
        },
        pensionAccount: {
            name: '연금계좌',
            deduction: pensionAccountCredit, // This is tax credit amount, not deduction base
            baseAmount: pensionTarget,
            limit: 9000000, // Input limit
            isReached: pensionTarget >= 9000000
        },
        insurance: {
            name: '보장성보험',
            deduction: insuranceCredit,
            baseAmount: Math.min(insurancePremium, 1000000),
            limit: 1000000,
            isReached: insurancePremium >= 1000000
        },
        medical: {
            name: '의료비',
            deduction: medicalCredit,
            baseAmount: medicalOtherTarget, // 한도는 그 외 부양가족분에만 적용
            limit: 7000000,
            isReached: medicalOtherTarget >= 7000000
        },
        monthlyRent: {
            name: '월세',
            deduction: monthlyRentCredit,
            baseAmount: Math.min(monthlyRent, 10000000),
            limit: 10000000,
            isReached: monthlyRent >= 10000000
        }
    };

    return {
        taxableSalary,
        earnedIncomeDeduction,
        earnedIncomeAmount,
        totalDeductions,
        overallLimitExcess,
        taxBase,
        calculatedTax,
        totalCredits,
        determinedTax,
        finalTax,
        personalDeduction: basicDeduction,
        taxReduction,
        educationTarget,
        birthCredit,
        localDeterminedTax,
        prePaidLocalTax,
        finalLocalTax,
        standardCreditApplied: useStandard,
        donationCredits,
        limitInfo // Added limit details
    };
}

/**
 * 전체 세금 계산 메인 함수
 * 특별공제를 받는 경우와 표준세액공제(13만)를 받는 경우를 모두 계산해 결정세액이 낮은 쪽을 반환
 */
function calculateTax(inputs) {
    const withSpecial = calculateTaxCase(inputs, false);
    // 표준세액공제 선택 시 포기하는 항목: 특별소득공제(건강·고용보험, 주택자금), 특별세액공제, 월세
    const withStandard = calculateTaxCase({
        ...inputs,
        healthInsurance: 0, employmentInsurance: 0, housingRentalLoan: 0, housingMortgageLoan: 0,
        insurancePremium: 0, medicalExpense: 0, medicalExpenseOther: 0,
        educationExpense: 0, educationSchoolList: '', educationUnivList: '',
        donation: 0, generalDonation: 0, religiousDonation: 0, monthlyRent: 0,
    }, true);
    return withStandard.determinedTax < withSpecial.determinedTax ? withStandard : withSpecial;
}

/**
 * 공제 추천: 한도가 남은 항목을 채웠다고 가정하고 계산을 다시 돌려 절세액(지방소득세 포함)을 구함
 * 절세 효과가 0인 항목(결정세액 0원, 이미 한도 도달 등)은 제외하고 절세액 큰 순으로 반환
 * @returns {{key, title, amount, saving, note}[]} amount: 추가 납입·지출(또는 결제수단 전환) 금액
 */
function recommendDeductions(inputs) {
    const totalTax = (r) => r.determinedTax + r.localDeterminedTax;
    const baseTax = totalTax(calculateTax(inputs));
    const salary = Math.max(0, inputs.totalSalary - (inputs.nonTaxableIncome || 0));
    const pension = inputs.pensionAccount || 0;
    const irp = inputs.irpAccount || 0;
    const hometownTarget = (inputs.taxYear ?? 2025) >= 2026 ? 200000 : 100000;
    const cardOverThreshold = (inputs.creditCard || 0) - salary * 0.25;
    const add = (key, x) => ({ [key]: (inputs[key] || 0) + x });
    const under70m = salary <= 70000000;
    const won = (n) => Math.round(n).toLocaleString('ko-KR');
    const medicalThresholdLeft = Math.max(0, salary * 0.03 - (inputs.medicalExpense || 0) - (inputs.medicalExpenseOther || 0));
    // shortcut: 전통시장·대중교통·도서분이 모두 최저사용액 위에 있다고 보고 추가한도 잔여를 계산. 최저사용액 미달이면 절세 0으로 표시됨
    const extraUsed = ((inputs.traditionalMarket || 0) + (inputs.publicTransport || 0)) * 0.4 + (under70m ? (inputs.booksPerformance || 0) * 0.3 : 0);
    const mortgageLimit = TAX_CONSTANTS.MORTGAGE_LIMITS[inputs.mortgageType] ?? TAX_CONSTANTS.MORTGAGE_LIMITS.fixedAndNonDeferred;

    // apply(x): 금액 x를 추가(또는 전환)했을 때 바뀌는 입력값
    const candidates = [
        {
            // 연금저축·IRP는 공제율이 같아 합계만 중요 → 중도 인출이 자유로운 연금저축을 600만까지 먼저, 나머지 IRP
            key: 'pensionCombo', kind: 'asset', lock: [3, '55세까지 (중도 인출 시 16.5% 과세)'], title: '연금계좌 추가 납입 (연금저축 우선, 초과분 IRP)',
            amount: 9000000 - Math.min(pension, 6000000) - irp,
            split: (x) => {
                const toPension = Math.min(x, Math.max(0, 6000000 - pension));
                return { pension: toPension, irp: x - toPension };
            },
            apply(x) {
                const s = this.split(x);
                return { pensionAccount: pension + s.pension, irpAccount: irp + s.irp };
            },
            note: '공제율은 같음. 연금저축(단독 600만)을 먼저 채우고 초과분만 IRP. 12월 31일 납입분까지 반영',
        },
        {
            key: 'housingSubscription', kind: 'asset', lock: [1, '해지 전까지 (해지는 자유)'], title: '주택청약종합저축 300만원까지 납입',
            amount: salary <= 70000000 ? 3000000 - (inputs.housingSubscription || 0) : 0,
            apply: (x) => add('housingSubscription', x),
            note: '총급여 7천만원 이하 무주택 세대주(배우자 포함). 은행에 무주택확인서 제출 필요',
        },
        {
            key: 'cardSwitch', kind: 'shift', title: '최저사용액 초과분은 체크카드·현금영수증으로 결제',
            amount: Math.max(0, Math.floor(cardOverThreshold)),
            apply: (x) => ({ creditCard: inputs.creditCard - x, debitCard: (inputs.debitCard || 0) + x }),
            note: '총급여 25%까지는 신용카드(혜택), 넘는 금액은 체크카드(공제율 30%)가 유리. 추가 지출 없음',
            zeroReason: '카드 공제 기본한도 도달',
        },
        {
            key: 'hometown', kind: 'donation', gift: 0.3, title: `고향사랑기부금 ${hometownTarget / 10000}만원까지 기부`,
            amount: hometownTarget - (inputs.hometownDonation || 0), apply: (x) => add('hometownDonation', x),
            note: '10만원까지는 전액 돌려받고 기부액 30% 상당 답례품 제공. 순수 절세가 아니라 기부',
        },
        {
            key: 'political', kind: 'donation', title: '정치자금기부금 10만원 기부',
            amount: 100000 - (inputs.politicalDonation || 0), apply: (x) => add('politicalDonation', x),
            note: '10만원까지 전액 세액공제(지방세 포함). 순수 절세가 아니라 기부',
        },
        {
            key: 'cardExtra', kind: 'shift', title: '전통시장·대중교통 사용 (카드 추가한도)',
            amount: Math.max(0, Math.ceil(((under70m ? 3000000 : 2000000) - extraUsed) / 0.4)),
            apply: (x) => add('publicTransport', x),
            note: `공제율 40%, 기본한도와 별도로 추가한도 ${under70m ? 300 : 200}만원. 도서·공연(30%, 총급여 7천만 이하)도 같은 추가한도`,
            zeroReason: '최저사용액(총급여 25%) 미달',
        },
        {
            key: 'insurance', kind: 'spend', title: '보장성 보험료 100만원까지',
            amount: 1000000 - (inputs.insurancePremium || 0), apply: (x) => add('insurancePremium', x),
            note: '12% 세액공제(장애인전용 15%). 특별세액공제 합계가 표준세액공제 13만원보다 커야 효과',
            zeroReason: '표준세액공제(13만원)가 더 유리',
        },
        {
            key: 'youthFund', kind: 'asset', lock: [2, '가입 후 3년'], conditional: true, title: '청년형 장기집합투자증권저축 600만원까지',
            amount: 6000000 - (inputs.youthLongTermFund || 0), apply: (x) => add('youthLongTermFund', x),
            eligible: salary <= 80000000, ineligibleReason: '총급여 8천만원 초과',
            note: '납입액 40% 소득공제. 가입 당시 만 19~34세·총급여 5천만 이하로 가입한 계좌만, 3년 이상 유지',
        },
        {
            key: 'monthlyRent', kind: 'spend', conditional: true, title: '월세 1,000만원까지',
            amount: 10000000 - (inputs.monthlyRent || 0), apply: (x) => add('monthlyRent', x),
            eligible: salary <= 80000000, ineligibleReason: '총급여 8천만원 초과',
            note: `무주택 세대주(2026 귀속부터 배우자 포함), 국민주택규모 또는 기준시가 4억 이하. ${salary <= 55000000 ? 17 : 15}% 세액공제`,
            zeroReason: '표준세액공제(13만원)가 더 유리',
        },
        {
            key: 'rentalLoan', kind: 'asset', conditional: true, title: '전세자금대출 원리금 상환',
            amount: Math.max(0, 10000000 - (inputs.housingRentalLoan || 0) - (under70m ? inputs.housingSubscription || 0 : 0)),
            apply: (x) => add('housingRentalLoan', x),
            note: '무주택 세대주, 상환액 40% 소득공제. 주택청약과 합산 공제 400만원 한도',
        },
        {
            key: 'mortgage', kind: 'spend', conditional: true, title: '주택담보대출 이자',
            amount: mortgageLimit - (inputs.housingMortgageLoan || 0), apply: (x) => add('housingMortgageLoan', x),
            note: `이자상환액 소득공제, 선택한 상환 조건 한도 ${won(mortgageLimit)}원. 취득 당시 기준시가 6억 이하 등 요건`,
        },
        {
            // 한도 없는 지출 항목은 예시 금액으로 효과만 보여줌
            key: 'medical', kind: 'spend', conditional: true, title: '의료비 (예시: 문턱 + 100만원)', example: true,
            amount: Math.ceil(medicalThresholdLeft) + 1000000, apply: (x) => add('medicalExpense', x),
            note: `총급여 3%(${won(salary * 0.03)}원) 초과분부터 15%. 본인·65세 이상·장애인·6세 이하는 한도 없음`,
            zeroReason: '표준세액공제(13만원)가 더 유리',
        },
        {
            key: 'education', kind: 'spend', conditional: true, title: '본인 교육비 (예시: 100만원)', example: true,
            amount: 1000000, apply: (x) => add('educationExpense', x),
            note: '대학원·직업능력개발훈련 등 본인분은 한도 없이 15%',
            zeroReason: '표준세액공제(13만원)가 더 유리',
        },
        {
            key: 'generalDonation', kind: 'donation', conditional: true, title: '일반기부금 (예시: 100만원)', example: true,
            amount: 1000000, apply: (x) => add('generalDonation', x),
            note: '15% (특례·일반 합산 1천만원 초과분 30%), 근로소득금액 30% 한도. 순수 절세가 아니라 기부',
            zeroReason: '표준세액공제(13만원)가 더 유리',
        },
    ];

    const savingOf = (c, x) => baseTax - totalTax(calculateTax({ ...inputs, ...c.apply(x) }));
    // 절세액은 금액에 대해 단조 증가 → 같은 최대 효과를 내는 최소 금액을 만원 단위 이분 탐색
    const minAmountFor = (c, target) => {
        let lo = 0, hi = Math.ceil(c.amount / 10000);
        while (lo < hi) {
            const mid = Math.floor((lo + hi) / 2);
            if (savingOf(c, Math.min(mid * 10000, c.amount)) >= target) hi = mid; else lo = mid + 1;
        }
        return Math.min(lo * 10000, c.amount);
    };

    const reasonOf = (c, saving) => {
        if (c.eligible === false) return c.ineligibleReason;
        if (c.amount <= 0) return c.key === 'cardSwitch' ? '신용카드 사용액이 최저사용액 이하' : '이미 한도까지 채움';
        if (saving > 0) return null;
        if (baseTax === 0) return '결정세액이 이미 0원';
        return c.zeroReason ?? '다른 한도에 이미 도달';
    };

    // 실질 비용: 써서 사라지는 돈 − 절세액 (음수면 이득). 자산으로 남는 돈·결제수단 전환은 0
    // shortcut: shift(전통시장·대중교통 등)는 원래 쓸 돈을 옮기는 경우만 비용 0. 추가 소비라면 spend로 봐야 함
    const netCostOf = (c, x, saving) => {
        if (c.kind === 'asset' || c.kind === 'shift') return 0;
        return Math.round(x * (1 - (c.gift || 0)) - saving);
    };

    // 효과 없는 항목도 사유와 함께 모두 반환
    const items = candidates.map((c) => {
        const saving = c.eligible !== false && c.amount > 0 ? savingOf(c, c.amount) : 0;
        const reason = reasonOf(c, saving);
        const amount = Math.max(0, c.amount);
        // 최소 금액 탐색은 한도가 있는 항목만 (예시 금액 항목은 의미 없음)
        const minAmount = saving > 0 && !c.example ? minAmountFor(c, saving) : null;
        const used = minAmount ?? amount; // 같은 효과를 내는 데 실제로 넣는 돈
        return { key: c.key, title: c.title, amount, note: c.note, saving, minAmount, reason,
            rate: saving > 0 && used > 0 ? saving / used : 0,
            netCost: saving > 0 ? netCostOf(c, used, saving) : null,
            lock: c.lock?.[1] ?? '없음', lockRank: c.lock?.[0] ?? 0,
            // 화면 "적용" 버튼용: 이 금액을 넣었을 때의 입력값 (입력 키 → 새 값)
            changes: saving > 0 ? c.apply(used) : null,
            ...(c.example && { example: true }), ...(c.conditional && { conditional: true }),
            ...(c.split && minAmount !== null && { split: c.split(minAmount) }) };
    });

    // 정렬: 효과 있음 → 지금 선택 가능(해당 시 항목은 뒤) → 실질 비용 0 이하 먼저 → 절세율(1%p 단위) → 자금 묶임 짧은 순 → 절세액
    const pct = (r) => Math.round(r * 100);
    return items.sort((a, b) =>
        (b.saving > 0) - (a.saving > 0)
        || !!a.conditional - !!b.conditional
        || (a.netCost > 0) - (b.netCost > 0)
        || pct(b.rate) - pct(a.rate)
        || a.lockRank - b.lockRank
        || b.saving - a.saving);
}

// Node 테스트용 export (브라우저에서는 무시)
if (typeof module !== 'undefined') module.exports = { calculateTax, childCreditMinAge, recommendDeductions };
