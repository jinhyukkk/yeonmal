// 연도별 기록 관리 (배포용: 서버 없이 이 브라우저의 localStorage에만 저장)
// 저장 데이터는 textContent로 넣는다 (XSS 방지)

const won = (n) => (n == null ? '-' : Math.round(n).toLocaleString('ko-KR'));

function row(cells) {
    const tr = document.createElement('tr');
    for (const c of cells) {
        const td = document.createElement('td');
        if (c instanceof Node) td.appendChild(c); else td.textContent = c ?? '';
        tr.appendChild(td);
    }
    return tr;
}

function button(text, onClick, extraClass = '') {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `link-btn ${extraClass}`.trim();
    b.textContent = text;
    b.addEventListener('click', onClick);
    return b;
}

// 기록 형식: { "2026": { inputs, result, savedAt } } — 개인용 서버 버전과 같은 모양
const STORAGE_KEY = 'yearEndTax.records.v1';

function readRecords() {
    try {
        const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    } catch {
        return {}; // 저장소 사용 불가(사생활 보호 모드 등)이거나 손상된 값이면 빈 기록
    }
}

// 저장 실패(용량 초과·저장소 차단)는 호출한 곳에서 알림
function writeRecords(records) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

// 입력 키 ↔ 폼 id가 다른 항목
const ID_OF = { isMarried2024_2026: 'marriage2024_2026' };

function fillForm(inputs) {
    window.resetApplied?.();
    for (const [key, value] of Object.entries(inputs)) {
        if (key === 'taxYear') continue; // 배포용은 2026년 귀속 고정이라 기록의 연도로 바꾸지 않음
        const el = document.getElementById(ID_OF[key] || key);
        if (!el) continue;
        if (el.type === 'checkbox') el.checked = !!value; else window.setAmount(el, value);
    }
    document.getElementById('taxForm').requestSubmit();
    document.getElementById('recordsDialog').close(); // 불러온 뒤 결과가 바로 보이도록
}

function loadRecords() {
    const records = readRecords();
    const tbody = document.getElementById('recordList');
    tbody.replaceChildren();
    const years = Object.keys(records).sort().reverse();
    if (!years.length) tbody.appendChild(row(['저장된 기록이 없습니다']));
    for (const y of years) {
        const { inputs, result, savedAt } = records[y];
        const actions = document.createElement('span');
        actions.append(
            // taxYear가 없는 옛 기록은 저장 키(연도)로 채움
            button('불러오기', () => fillForm({ ...inputs, taxYear: inputs.taxYear ?? y })),
            button('삭제', () => {
                if (!confirm(`${y}년 기록을 삭제할까요?`)) return;
                const next = readRecords();
                delete next[y];
                try { writeRecords(next); } catch (e) { return alert(`삭제 실패: ${e.message}`); }
                loadRecords();
            }, 'danger'),
        );
        // 지방소득세 필드가 없는 예전 기록은 '재저장 필요'로 표시
        const total = result?.finalLocalTax == null ? '재저장 필요' : won(result.finalTax + result.finalLocalTax);
        tbody.appendChild(row([y, won(inputs.totalSalary), won(result?.determinedTax), won(result?.finalTax), total, savedAt, actions]));
    }
}

document.getElementById('saveRecordBtn').addEventListener('click', () => {
    if (!window.lastCalc) return alert('먼저 총급여액을 입력해 계산해주세요.');
    const { inputs, result } = window.lastCalc;
    const year = inputs.taxYear;
    const { limitInfo, ...summary } = result; // 요약 수치만 저장
    try {
        // 저장일은 사용자 기준 날짜 (YYYY-MM-DD)
        const savedAt = new Date().toLocaleDateString('sv-SE');
        writeRecords({ ...readRecords(), [year]: { inputs, result: summary, savedAt } });
        loadRecords();
        // 기록 표가 대화상자 안에 있어 저장 결과를 버튼에 잠깐 표시
        const btn = document.getElementById('saveRecordBtn');
        btn.textContent = `${year}년 저장됨 ✓`;
        setTimeout(() => { btn.textContent = '현재 계산 저장'; }, 1500);
    } catch (e) {
        alert(`저장 실패: ${e.message}`);
    }
});

loadRecords();
