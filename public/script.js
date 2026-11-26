// ===== 금액 입력칸 천 단위 쉼표 =====
// type=number는 쉼표를 표시할 수 없어, 단위가 '원'인 칸을 숫자 키패드용 text 칸으로 바꿔 쉼표 형식으로 다룬다
const toComma = (v) => {
    const digits = String(v ?? '').replace(/\D/g, '');
    return digits === '' ? '' : Number(digits).toLocaleString('ko-KR');
};
// 입력칸 값 → 숫자 (쉼표 무시). 빈칸은 0
const num = (id) => Number(document.getElementById(id).value.replace(/,/g, '')) || 0;
// 코드로 값을 넣을 때: 금액칸이면 쉼표 형식, 아니면 그대로
const setAmount = (el, v) => { el.value = el.dataset.amount ? toComma(v) : v; };
window.setAmount = setAmount; // manage.js(기록 불러오기)에서 사용

for (const el of document.querySelectorAll('#taxForm input[type="number"]')) {
    if (el.parentElement.querySelector(':scope > .unit')?.textContent !== '원') continue;
    el.type = 'text';
    el.inputMode = 'numeric';
    el.autocomplete = 'off';
    el.dataset.amount = '1';
    el.value = toComma(el.value);
    // 입력 중 쉼표를 다시 넣어도 커서가 같은 숫자 뒤에 머물도록 커서 앞 숫자 개수로 위치 복원
    el.addEventListener('input', () => {
        const digitsBefore = el.value.slice(0, el.selectionStart).replace(/\D/g, '').length;
        el.value = toComma(el.value);
        let pos = 0;
        for (let seen = 0; pos < el.value.length && seen < digitsBefore; pos++) {
            if (/\d/.test(el.value[pos])) seen++;
        }
        el.setSelectionRange(pos, pos);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('taxForm');
    const calcPensionBtn = document.getElementById('calcPensionBtn');
    const calcHealthBtn = document.getElementById('calcHealthBtn');
    const calcEmploymentBtn = document.getElementById('calcEmploymentBtn');
    const resultContainer = document.getElementById('resultContainer');

    // 귀속연도별 자녀세액공제 최소 연령 안내 (불러오기로 값이 바뀌어도 계산 시 다시 갱신)
    const taxYearSelect = document.getElementById('taxYear');
    const updateChildHelp = () => {
        const year = Number(taxYearSelect.value);
        document.getElementById('childCountHelp').textContent =
            `* ${year}년 귀속: ${childCreditMinAge(year)}세 이상 20세 이하 기본공제 대상 자녀 (아동수당 대상 연령 제외)`;
    };
    taxYearSelect.addEventListener('change', updateChildHelp);
    updateChildHelp();

    // 공제 추천 표 (textContent만 사용)
    const renderRecommendations = (inputs, result) => {
        const items = recommendDeductions(inputs);
        const tbody = document.getElementById('recommendList');
        tbody.replaceChildren();
        document.getElementById('recommendStatus').textContent = result.determinedTax === 0
            ? '결정세액이 이미 0원이라 추가 공제로 줄일 세금이 없습니다.'
            : '실질 비용(사라지는 돈) 0 이하 → 절세율 → 자금 묶임 짧은 순으로 정렬했습니다. 각 항목은 따로 계산한 값이라 합산하면 실제보다 클 수 있습니다. 「해당 시」 항목은 실제 지출·대출·가입 요건이 있을 때만 받을 수 있고, 회색 행은 지금은 효과가 없는 항목입니다.';
        for (const i of items) {
            const tr = document.createElement('tr');
            let minText;
            if (i.saving === 0) minText = '—';
            else if (i.example) minText = '한도 없음 (예시 금액)';
            // 최소 금액 < 한도까지 금액: 남은 세금이 적거나 다른 한도(예: 카드 공제 한도)에 먼저 닿는 경우
            else minText = i.minAmount < i.amount ? formatNumber(i.minAmount) + '원이면 충분' : '한도까지 필요';
            if (i.split) {
                minText += ` → 연금저축 ${formatNumber(i.split.pension)}원 + IRP ${formatNumber(i.split.irp)}원`;
            }
            const savingText = i.saving > 0 ? formatNumber(i.saving) + '원' : `0원 (${i.reason})`;
            if (i.saving === 0) tr.className = 'muted';
            const title = i.conditional ? `${i.title} · 해당 시` : i.title;
            // 실질 비용: 0 이하면 손해 없음(음수는 답례품 등으로 이득)
            const costText = i.netCost === null ? '—'
                : i.netCost < 0 ? `이득 ${formatNumber(-i.netCost)}원` : i.netCost === 0 ? '0원' : formatNumber(i.netCost) + '원';
            const rateText = i.saving > 0 ? (i.rate * 100).toFixed(1) + '%' : '—';
            for (const text of [title, formatNumber(i.amount) + '원', minText, savingText, rateText, costText, i.lock, i.note]) {
                const td = document.createElement('td');
                td.textContent = text;
                tr.appendChild(td);
            }
            tbody.appendChild(tr);
        }

        // 결과 패널 요약: 지금 선택 가능하고 효과 있는 항목만 우선순위순 (전체는 대화상자 표)
        const top = document.getElementById('recommendTop');
        top.replaceChildren();
        const actionable = items.filter((i) => i.saving > 0 && !i.conditional);
        for (const i of actionable) {
            const li = document.createElement('li');
            li.title = i.title; // 전체 제목은 마우스를 올리면 표시
            const used = i.minAmount ?? i.amount;
            const name = document.createElement('span');
            name.textContent = `${SHORT_TITLE[i.key] ?? i.title} ${toMan(used)}`;
            const saving = document.createElement('span');
            saving.className = 'rec-saving';
            saving.textContent = `+${formatNumber(i.saving)}`;
            // 부가 정보는 필요한 것만 한 줄로 (연금 배분, 자금 묶임)
            const meta = [];
            if (i.split) meta.push(`연금저축 ${toMan(i.split.pension)} + IRP ${toMan(i.split.irp)}`);
            if (i.lockRank > 0) meta.push(i.lock);
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'link-btn';
            btn.textContent = '적용';
            btn.setAttribute('aria-label', `${i.title} 적용`);
            btn.addEventListener('click', () => applyRecommendation(i));
            li.append(name, saving, btn);
            if (meta.length) {
                const small = document.createElement('span');
                small.className = 'rec-meta';
                small.textContent = meta.join(' · ');
                li.append(small);
            }
            top.appendChild(li);
        }
        if (!actionable.length) {
            const li = document.createElement('li');
            li.textContent = result.determinedTax === 0 ? '결정세액이 이미 0원이라 더 줄일 세금이 없습니다.' : '지금 추가로 채울 수 있는 항목이 없습니다.';
            top.appendChild(li);
        }
    };

    // 추천 적용 → 입력칸에 값 반영 후 재계산. 되돌리기용으로 바꾸기 전 값을 쌓아 둠 (저장은 하지 않음)
    const applied = [];
    const renderApplied = () => {
        const bar = document.getElementById('appliedBar');
        bar.replaceChildren();
        bar.hidden = !applied.length;
        if (!applied.length) return;
        bar.append(`적용 중: ${applied.map((a) => a.title).join(', ')} `);
        const undo = document.createElement('button');
        undo.type = 'button';
        undo.className = 'link-btn';
        undo.textContent = '마지막 적용 되돌리기';
        undo.addEventListener('click', () => {
            const { prev } = applied.pop();
            for (const [id, v] of Object.entries(prev)) document.getElementById(id).value = v;
            renderApplied();
            calculate();
        });
        bar.append(undo);
    };
    const applyRecommendation = (item) => {
        const prev = {};
        for (const [id, v] of Object.entries(item.changes)) {
            const el = document.getElementById(id);
            prev[id] = el.value;
            setAmount(el, v);
        }
        applied.push({ title: item.title, prev });
        renderApplied();
        calculate();
    };
    // 기록을 불러오면 이전 적용 내역은 의미가 없으므로 비움 (manage.js fillForm에서 호출)
    window.resetApplied = () => { applied.length = 0; renderApplied(); };

    // 추천 요약용 짧은 이름 (전체 이름은 전체 표·툴팁에)
    const SHORT_TITLE = {
        pensionCombo: '연금저축·IRP', housingSubscription: '주택청약', cardSwitch: '체크카드 전환',
        hometown: '고향사랑', political: '정치자금', cardExtra: '전통시장·대중교통', insurance: '보장성 보험',
    };
    // 만원 단위 표시 (예: 9,000,000 → 900만)
    const toMan = (n) => `${formatNumber(Math.round(n / 10000))}만`;

    // 숫자 포맷팅 (1,000)
    const formatNumber = (num) => {
        return Math.round(num).toLocaleString('ko-KR');
    };

    // 국민연금 자동계산 버튼
    calcPensionBtn.addEventListener('click', () => {
        const salary = num('totalSalary');
        if (salary > 0) {
            // 국민연금 요율 4.5% (근로자 부담분)
            const pension = Math.floor(salary * 0.045);
            setAmount(document.getElementById('nationalPension'), pension);
        } else {
            alert('총급여액을 먼저 입력해주세요.');
        }
    });

    // 건강보험료 자동계산 버튼
    calcHealthBtn.addEventListener('click', () => {
        const salary = num('totalSalary');
        if (salary > 0) {
            // 건강보험 3.545% + 장기요양(건강보험료의 12.95%) => 약 4.004%
            // 정확히는: 건강보험 = 보수월액 * 3.545%
            // 장기요양 = 건강보험료 * 12.95%
            const health = Math.floor(salary * 0.03545);
            const care = Math.floor(health * 0.1295);
            setAmount(document.getElementById('healthInsurance'), health + care);
        } else {
            alert('총급여액을 먼저 입력해주세요.');
        }
    });

    // 고용보험료 자동계산 버튼
    calcEmploymentBtn.addEventListener('click', () => {
        const salary = num('totalSalary');
        if (salary > 0) {
            // 고용보험 0.9%
            const employment = Math.floor(salary * 0.009);
            setAmount(document.getElementById('employmentInsurance'), employment);
        } else {
            alert('총급여액을 먼저 입력해주세요.');
        }
    });

    // 계산 실행: 입력이 바뀔 때마다 자동 호출 (submit은 기록 불러오기·Enter 키용)
    const calculate = () => {
        // 총급여가 없으면 계산하지 않음
        if (!(num('totalSalary') > 0)) return;

        // 입력값 수집
        const inputs = {
            taxYear: num('taxYear'),
            cardChildCount: num('cardChildCount') || 0,
            totalSalary: num('totalSalary') || 0,
            nonTaxableIncome: num('nonTaxableIncome') || 0,
            prePaidTax: num('prePaidTax') || 0,
            // 빈칸이면 undefined → 계산에서 기납부세액의 10%로 추정
            prePaidLocalTax: document.getElementById('prePaidLocalTax').value === ''
                ? undefined : num('prePaidLocalTax'),
            dependentCount: num('dependentCount') || 1,
            childCount: num('childCount') || 0,
            isMarried2024_2026: document.getElementById('marriage2024_2026').checked,
            nationalPension: num('nationalPension') || 0,
            healthInsurance: num('healthInsurance') || 0,
            employmentInsurance: num('employmentInsurance') || 0,
            housingSubscription: num('housingSubscription') || 0,
            housingRentalLoan: num('housingRentalLoan') || 0,
            housingMortgageLoan: num('housingMortgageLoan') || 0,
            mortgageType: document.getElementById('mortgageType').value,
            youthLongTermFund: num('youthLongTermFund') || 0,
            insurancePremium: num('insurancePremium') || 0,
            pensionAccount: num('pensionAccount') || 0,
            creditCard: num('creditCard') || 0,
            debitCard: num('debitCard') || 0,
            publicTransport: num('publicTransport') || 0,
            traditionalMarket: num('traditionalMarket') || 0,
            booksPerformance: num('booksPerformance') || 0,
            medicalExpense: num('medicalExpense') || 0,
            medicalExpenseOther: num('medicalExpenseOther') || 0,
            educationExpense: num('educationExpense') || 0,
            donation: num('donation') || 0,
            politicalDonation: num('politicalDonation') || 0,
            hometownDonation: num('hometownDonation') || 0,
            monthlyRent: num('monthlyRent') || 0,
            elderlyCount: num('elderlyCount') || 0,
            disabledCount: num('disabledCount') || 0,
            isWomanDeduction: document.getElementById('isWomanDeduction').checked,
            isSingleParent: document.getElementById('isSingleParent').checked,
            birthAdoptionOrder: num('birthAdoptionOrder') || 0,
            irpAccount: num('irpAccount') || 0,
            educationSchoolList: document.getElementById('educationSchoolList').value,
            educationUnivList: document.getElementById('educationUnivList').value,
            generalDonation: num('generalDonation') || 0,
            religiousDonation: num('religiousDonation') || 0,
            smeYouthReduction: document.getElementById('smeYouthReduction').checked,
        };

        // 계산 실행 (tax_logic.js 함수 호출)
        updateChildHelp();
        const result = calculateTax(inputs);
        window.lastCalc = { inputs, result }; // manage.js에서 기록 저장에 사용
        renderRecommendations(inputs, result);

        // 결과 표시
        resultContainer.classList.remove('hidden');
        document.getElementById('resultPlaceholder').classList.add('hidden');

        // 최종 세액 표시
        const finalTaxElement = document.getElementById('finalTax');
        const messageElement = document.getElementById('resultMessage');

        // 지방소득세(10%) 포함하여 보여주기
        const finalIncomeTax = result.finalTax;
        const finalLocalTax = result.finalLocalTax;
        const totalFinalTax = finalIncomeTax + finalLocalTax;

        if (totalFinalTax < 0) {
            finalTaxElement.textContent = `${formatNumber(Math.abs(totalFinalTax))}원 환급`;
            finalTaxElement.style.color = 'var(--primary-color)';
            messageElement.textContent = '축하합니다! 13월의 월급을 받으시겠네요. (지방소득세 포함)';
            messageElement.className = 'message refund';
        } else if (totalFinalTax > 0) {
            finalTaxElement.textContent = `${formatNumber(totalFinalTax)}원 추가 납부`;
            finalTaxElement.style.color = 'var(--danger-color)';
            messageElement.textContent = '아쉽게도 세금을 더 내셔야 합니다. (지방소득세 포함)';
            messageElement.className = 'message pay';
        } else {
            finalTaxElement.textContent = '0원';
            finalTaxElement.style.color = 'var(--text-color)';
            messageElement.textContent = '정산할 세금이 없습니다.';
            messageElement.className = 'message';
        }

        // 좁은 화면용 하단 고정 요약
        const sticky = document.getElementById('stickySummary');
        sticky.textContent = finalTaxElement.textContent + ' · 결과 보기';
        sticky.classList.remove('hidden');

        // 상세 내역 업데이트
        document.getElementById('detailTotalSalary').textContent = formatNumber(result.taxableSalary) + '원';
        document.getElementById('detailEarnedIncomeDeduction').textContent = formatNumber(result.earnedIncomeDeduction) + '원';
        document.getElementById('detailEarnedIncomeAmount').textContent = formatNumber(result.earnedIncomeAmount) + '원';
        document.getElementById('detailTotalDeductions').textContent = formatNumber(result.totalDeductions) + '원';
        document.getElementById('detailTaxReduction').textContent = formatNumber(result.taxReduction) + '원';
        document.getElementById('detailOverallLimitExcess').textContent = formatNumber(result.overallLimitExcess) + '원';
        document.getElementById('detailTaxBase').textContent = formatNumber(result.taxBase) + '원';
        document.getElementById('detailCalculatedTax').textContent = formatNumber(result.calculatedTax) + '원';
        document.getElementById('detailTotalCredits').textContent = formatNumber(result.totalCredits) + '원';
        document.getElementById('detailCreditMode').textContent = result.standardCreditApplied
            ? '표준세액공제 13만원 (특별공제 포기가 유리)' : '특별공제 적용';
        document.getElementById('detailDeterminedTax').textContent = formatNumber(result.determinedTax) + '원';
        document.getElementById('detailPrePaidTax').textContent = formatNumber(inputs.prePaidTax) + '원';
        document.getElementById('detailFinalTax').textContent = formatNumber(result.finalTax) + '원';
        document.getElementById('detailLocalDeterminedTax').textContent = formatNumber(result.localDeterminedTax) + '원';
        document.getElementById('detailPrePaidLocalTax').textContent = formatNumber(result.prePaidLocalTax)
            + (inputs.prePaidLocalTax === undefined ? '원 (추정)' : '원');
        document.getElementById('detailFinalLocalTax').textContent = formatNumber(result.finalLocalTax) + '원';

        // 한도 정보 표시 (새로 추가된 로직)
        const limitContainer = document.getElementById('limitStatusContainer');
        if (!limitContainer) {
            // 상세 내역 아래에 한도 정보 섹션 추가
            const detailsElement = resultContainer.querySelector('details');
            const newDiv = document.createElement('div');
            newDiv.id = 'limitStatusContainer';
            newDiv.className = 'limit-status-container';
            newDiv.innerHTML = '<h3>주요 항목 공제 한도 현황</h3><div id="limitList" class="limit-list"></div>';
            detailsElement.appendChild(newDiv);
        }

        const limitList = document.getElementById('limitList');
        limitList.innerHTML = ''; // 초기화

        const { limitInfo } = result;

        // 한도 체크할 항목들 순회
        Object.keys(limitInfo).forEach(key => {
            const info = limitInfo[key];
            // 공제액이 0보다 클 때만 표시 (또는 사용자가 입력했을 때)
            if (info.deduction > 0 || (info.baseAmount && info.baseAmount > 0)) {
                const item = document.createElement('div');
                item.className = 'limit-item';

                const isReached = info.isReached;
                const statusClass = isReached ? 'reached' : 'safe';
                const statusText = isReached ? '한도 도달' : '한도 내';

                // 금액 표시 (세액공제 항목은 대상금액 기준이 더 직관적일 수 있음)
                // 여기서는 간단히 공제받은 금액(또는 인정액) vs 한도액(또는 인정상한) 느낌으로 표시
                // 소득공제: 공제액 / 한도
                // 세액공제: 대상액 / 한도 (연금, 보험, 월세 등)

                let displayAmount = 0;
                let displayLimit = info.limit;

                if (['pensionAccount', 'insurance', 'monthlyRent'].includes(key)) {
                    displayAmount = info.baseAmount;
                } else if (key === 'medical') {
                    // 의료비는 한도 700만원이 세액공제액 한도가 아니라 공제대상금액 한도임
                    displayAmount = info.baseAmount;
                } else {
                    displayAmount = info.deduction;
                }

                item.innerHTML = `
                    <div class="limit-label">
                        <span>${info.name}</span>
                        <span class="badge ${statusClass}">${statusText}</span>
                    </div>
                    <div class="limit-bar-bg">
                        <div class="limit-bar-fill ${statusClass}" style="width: ${Math.min(100, (displayAmount / displayLimit) * 100)}%"></div>
                    </div>
                    <div class="limit-values">
                        ${formatNumber(displayAmount)} / ${formatNumber(displayLimit)} 원
                    </div>
                `;
                limitList.appendChild(item);
            }
        });

    };

    form.addEventListener('submit', (e) => { e.preventDefault(); calculate(); });

    // 입력 중 자동 계산 (타이핑마다 추천 재계산이 돌지 않도록 200ms 지연)
    let timer;
    const schedule = () => { clearTimeout(timer); timer = setTimeout(calculate, 200); };
    form.addEventListener('input', schedule);
    taxYearSelect.addEventListener('change', schedule);
    // 자동계산 버튼은 값을 코드로 넣어 input 이벤트가 없으므로 직접 호출
    [calcPensionBtn, calcHealthBtn, calcEmploymentBtn].forEach((b) => b.addEventListener('click', schedule));
});

// 소항목(h3) 제목 클릭/Enter/Space로 접기·펼치기 (큰 영역은 탭으로 전환)
document.querySelectorAll('#taxForm .subsection > h3').forEach((h) => {
    h.classList.add('collapsible');
    h.tabIndex = 0;
    h.setAttribute('role', 'button');
    h.setAttribute('aria-expanded', 'true');
    const toggle = () => {
        const collapsed = h.parentElement.classList.toggle('collapsed');
        h.setAttribute('aria-expanded', String(!collapsed));
    };
    h.addEventListener('click', toggle);
    h.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
});

// 입력 탭: 선택한 영역만 표시, 좌우 화살표로 이동
const tabs = [...document.querySelectorAll('.tabs [role="tab"]')];
const selectTab = (tab) => {
    for (const t of tabs) {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        document.querySelector(`[role="tabpanel"][data-tab="${t.dataset.tab}"]`).hidden = !on;
    }
};
tabs.forEach((t, i) => {
    t.addEventListener('click', () => selectTab(t));
    t.addEventListener('keydown', (e) => {
        const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
        if (!step) return;
        const next = tabs[(i + step + tabs.length) % tabs.length];
        selectTab(next);
        next.focus();
    });
});
selectTab(tabs[0]);

// 대화상자(전체 추천 표·기록) 열기/닫기
document.getElementById('openRecommendBtn').addEventListener('click', () => document.getElementById('recommendDialog').showModal());
document.getElementById('openRecordsBtn').addEventListener('click', () => document.getElementById('recordsDialog').showModal());
document.querySelectorAll('dialog [data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
