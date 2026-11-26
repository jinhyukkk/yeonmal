// 붙여넣기로 채우기: 텍스트 → 미리보기(현재 값 / 넣을 값) → 입력칸에 적용
// 화면 출력은 textContent만 사용 (붙여넣은 내용이 HTML로 해석되지 않도록)

(() => {
    const dialog = document.getElementById('pasteDialog');
    const textarea = document.getElementById('pasteText');
    const preview = document.getElementById('pastePreview');
    const applyBtn = document.getElementById('pasteApplyBtn');
    const yearSelect = document.getElementById('taxYear');

    const LABELS = {
        totalSalary: '총급여액', nonTaxableIncome: '비과세 소득', prePaidTax: '기납부세액',
        prePaidLocalTax: '기납부 지방소득세', nationalPension: '국민연금', healthInsurance: '건강보험(장기요양 포함)',
        employmentInsurance: '고용보험', creditCard: '신용카드', debitCard: '체크카드·현금영수증',
        booksPerformance: '도서·공연', traditionalMarket: '전통시장', publicTransport: '대중교통',
    };
    const fmt = (n) => Math.round(n).toLocaleString('ko-KR');
    const el = (tag, text, cls) => {
        const e = document.createElement(tag);
        if (text !== undefined) e.textContent = text;
        if (cls) e.className = cls;
        return e;
    };

    let parsed = [];

    const render = () => {
        preview.replaceChildren();
        applyBtn.disabled = !parsed.length;
        if (!textarea.value.trim()) return;
        if (!parsed.length) {
            preview.append(el('p', '인식한 항목이 없습니다. 급여 엑셀은 머리행(지급총액·국민연금 등)까지 함께, 홈택스는 표 전체를 복사해 주세요.', 'help-text'));
            return;
        }
        parsed.forEach((p, idx) => {
            const box = el('div', undefined, 'paste-source');
            const title = el('h3', `${p.label}${p.months ? ` · ${p.months}개월분` : ''}${p.year ? ` · ${p.year}년` : ''}`);
            box.append(title);
            // 12개월 미만이면 연간 환산 선택 (기본 켬: 연말정산 예상 계산 목적)
            if (p.months && p.months < 12) {
                const label = el('label', undefined, 'paste-annualize');
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.checked = p.annualize ?? true;
                cb.addEventListener('change', () => { p.annualize = cb.checked; render(); });
                label.append(cb, ` ${p.months}개월분을 12개월로 환산 (월평균 × 12)`);
                box.append(label);
            }
            const values = p.annualize === false ? p.values : annualize(p.values, p.months);
            p.finalValues = values;
            const table = el('table', undefined, 'data-table');
            const head = el('tr');
            ['항목', '현재 값', '붙여넣은 값', '넣을 값'].forEach((h) => head.append(el('th', h)));
            table.append(head);
            for (const [key, v] of Object.entries(values)) {
                const tr = el('tr');
                const current = document.getElementById(key).value || '0';
                tr.append(el('td', LABELS[key] ?? key), el('td', current), el('td', fmt(p.values[key])), el('td', fmt(v), 'paste-new'));
                table.append(tr);
            }
            box.append(table);
            preview.append(box);
            if (idx === 0 && p.year && ![...yearSelect.options].some((o) => Number(o.value) === p.year)) {
                box.append(el('p', `${p.year}년 귀속은 지원하지 않아 귀속연도는 바꾸지 않습니다.`, 'help-text'));
            }
        });
    };

    textarea.addEventListener('input', () => {
        parsed = parsePasted(textarea.value);
        render();
    });

    applyBtn.addEventListener('click', () => {
        for (const p of parsed) {
            for (const [key, v] of Object.entries(p.finalValues)) window.setAmount(document.getElementById(key), v);
            // 급여 내역의 귀속연도가 선택 가능한 연도면 맞춰 줌
            if (p.year && [...yearSelect.options].some((o) => Number(o.value) === p.year)) {
                yearSelect.value = String(p.year);
                yearSelect.dispatchEvent(new Event('change'));
            }
        }
        dialog.close();
        textarea.value = '';
        parsed = [];
        render();
        document.getElementById('taxForm').requestSubmit();
    });

    document.getElementById('openPasteBtn').addEventListener('click', () => {
        dialog.showModal();
        textarea.focus();
    });
})();
