class SimplexView {
    constructor() {
        this.sidebar = document.querySelector('.sidebar');
        this.main = document.querySelector('.main-content');
    }

    renderSidebar(state) {
        const { trainTypes, wagonTypes, tableData, passengers, parkData, extraConstraints } = state;
        const n = trainTypes.length;

        const objCoeffs = new Array(n).fill(0);
        for (let t = 0; t < n; t++) {
            for (let w = 0; w < wagonTypes.length; w++) {
                const coeff = (tableData[w] && tableData[w][t]) || 0;
                const pass = passengers[w] || 0;
                objCoeffs[t] += coeff * pass;
            }
        }
        const objTerms = objCoeffs.map((c, i) => {
            if (c === 0) return null;
            return `${c}<span class="var-sub">x<sub>${i + 1}</sub></span>`;
        }).filter(Boolean).join(' + ');

        const thTrains = trainTypes.map((t, ti) =>
            `<th class="th-train"><div class="cell-with-del"><input type="text" class="inp-train-name" data-ti="${ti}" value="${t}"> <button class="btn-del-col" data-col="${ti}" title="Видалити">×</button></div></th>`
        ).join('');

        const rows = wagonTypes.map((w, wi) => {
            const parkCell = `<td><input type="number" class="inp-park" data-wi="${wi}" value="${parkData[wi] || 0}" min="0"></td>`;
            const trainCells = trainTypes.map((_, ti) => {
                const val = (tableData[wi] && tableData[wi][ti] !== undefined) ? tableData[wi][ti] : 0;
                return `<td><input type="number" class="inp-cell" data-wi="${wi}" data-ti="${ti}" value="${val}" min="0"></td>`;
            }).join('');
            const passCell = `<td><input type="number" class="inp-pass" data-wi="${wi}" value="${passengers[wi] || 0}" min="0"></td>`;
            return `<tr>
                <td><div class="cell-with-del"><input type="text" class="inp-wagon-name" data-wi="${wi}" value="${w}">
                    <button class="btn-del-row" data-wi="${wi}" title="Видалити">×</button></div></td>
                ${parkCell}${trainCells}${passCell}
            </tr>`;
        }).join('');

        const ecHtml = (extraConstraints || []).map((ec, idx) => {
            const opts = trainTypes.map((_, i) => `<option value="${i}" ${ec.varIdx === i ? 'selected' : ''}>x${i + 1}</option>`).join('');
            return `<div class="ec-row">
                <select class="ec-var" data-idx="${idx}">${opts}</select>
                <select class="ec-sign" data-idx="${idx}">
                    <option value="le" ${ec.sign === 'le' ? 'selected' : ''}>≤</option>
                    <option value="ge" ${ec.sign === 'ge' ? 'selected' : ''}>≥</option>
                    <option value="eq" ${ec.sign === 'eq' ? 'selected' : ''}>=</option>
                </select>
                <input type="number" class="ec-val" data-idx="${idx}" value="${ec.value || 0}">
                <button class="btn-del-ec" data-idx="${idx}" title="Видалити">×</button>
            </div>`;
        }).join('');

        this.sidebar.innerHTML = `
            <div class="sb-brand">
                <div class="sb-icon">∑</div>
                <div class="sb-title-wrap">
                    <span class="sb-title">Симплекс</span>
                    <span class="sb-subtitle">метод</span>
                </div>
            </div>

            <div class="sb-section">
                <div class="sb-label">Цільова функція</div>
                <div class="sb-objective">
                    <span class="obj-z">F</span>
                    <span class="obj-eq">=</span>
                    <span class="obj-expr">${objTerms || '—'}</span>
                    <span class="sb-subtitle">→</span>
                    <span class="obj-kw">max</span>
                </div>
            </div>

            <div class="sb-section">
                <div class="sb-label">Початкові дані</div>
                <div class="sb-table-wrap">
                    <table class="data-table" id="dataTable">
                        <thead>
                            <tr>
                                <th class="th-wagon">Вагон</th>
                                <th>Парк</th>
                                ${thTrains}
                                <th>К-сть пасажирів</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>

            <div class="sb-add-row">
                <button class="btn-add" id="btnAddWagon">+ Вагон</button>
                <button class="btn-add" id="btnAddTrain">+ Потяг</button>
            </div>

            <div class="sb-section">
                <div class="sb-label">Додаткові обмеження</div>
                <div class="extra-constraints" id="extraConstraints">${ecHtml}</div>
            </div>
            <div class="sb-add-row">
                <button class="btn-add" id="btnAddEC">+ Обмеження</button>
            </div>

            <button class="solve-btn" id="solveBtn">
                <span>Розв'язати</span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
            </button>

            <button class="btn-history" id="btnHistory">Історія обчислень</button>

            <div class="sb-footer">Курсова робота · ЛП</div>
        `;
    }

    /* Завантаження */
    renderLoading() {
        this.main.innerHTML = `
            <div class="loading-wrap">
                <div class="loading-spinner"></div>
                <p class="loading-text">Виконання ітерацій…</p>
            </div>`;
    }

    /* Результат */
    renderResult(result, intResult, objective) {
        if (result.status !== 'success') {
            this.main.innerHTML = `
                <div class="error-wrap">
                    <div class="error-icon">!</div>
                    <p>Задача не має оптимального розв'язку.</p>
                </div>`;
            return;
        }

        const { optimalPlan, maxZ, history, numVars, numConstraints } = result;
        const obj = objective || [];

        let cardsHtml = `
            <div class="result-cards">
                <div class="rcard rcard--primary">
                    <div class="rcard-label">Максимум F (симплекс)</div>
                    <div class="rcard-value">${maxZ.toLocaleString('uk-UA')}</div>
                    <div class="rcard-hint">пасажирів</div>
                </div>
                ${Object.entries(optimalPlan).map(([key, val]) => `
                <div class="rcard">
                    <div class="rcard-label">${key}</div>
                    <div class="rcard-value">${val}</div>
                    <div class="rcard-hint">потягів</div>
                </div>`).join('')}
            </div>`;

        let intHtml = '';
        if (intResult && intResult.status === 'success') {
            const logLines = (intResult.branchLog || []).map(l => {
                const txt = typeof l === 'string' ? l : (l.msg || JSON.stringify(l));

                if (txt.includes('── Відсічення')) {
                    return `<div class="int-point-title">${txt}</div>`;
                }

                if (txt.startsWith('Оптимальний')) {
                    return `<div class="int-final">${txt}</div>`;
                }

                if (txt.startsWith('Обрано рядок')) {
                    return `<div class="int-fval">${txt}</div>`;
                }

                if (txt.startsWith('Двоїстий крок')) {
                    return `<div class="int-check int-ok">${txt}</div>`;
                }

                if (txt.includes('Всі базисні змінні цілі') || txt.includes('Розв\'язок знайдено')) {
                    return `<div class="int-final">${txt}</div>`;
                }

                if (txt.includes('не має цілочисельного')) {
                    return `<div class="int-fail-msg">${txt}</div>`;
                }
                return `<div class="int-log-line">${txt}</div>`;
            }).join('');

            // Рендер таблиць ітерацій Гоморі
            const gomorySteps = intResult.gomoryHistory || [];
            const gomoryTablesHtml = gomorySteps.length > 0
                ? gomorySteps.map((step, idx) =>
                    this._renderGomoryIteration(step, numVars, obj, idx === gomorySteps.length - 1)
                ).join('')
                : '';

            intHtml = `
            <div class="result-cards">
                <div class="rcard rcard--integer">
                    <div class="rcard-label">Максимум F (цілочисельний)</div>
                    <div class="rcard-value">${intResult.integerZ.toLocaleString('uk-UA')}</div>
                    <div class="rcard-hint">пасажирів</div>
                </div>
                ${Object.entries(intResult.integerPlan).map(([key, val]) => `
                <div class="rcard">
                    <div class="rcard-label">${key} (ціле)</div>
                    <div class="rcard-value">${val}</div>
                    <div class="rcard-hint">потягів</div>
                </div>`).join('')}
            </div>
            <div class="iter-section">
                <h2 class="iter-section-title">Метод Гоморі (правильні відсічення)</h2>
                <div class="iter-block" style="opacity:1;padding:16px 18px;">
                    ${logLines}
                </div>
                ${gomoryTablesHtml}
            </div>`;
        } else if (intResult && intResult.status === 'no_integer') {
            intHtml = `<div class="error-wrap" style="height:auto;padding:20px 28px;">
                <p>Цілочисельний розв'язок не знайдено (метод Гоморі).</p>
            </div>`;
        }

        const lastIdx = history.length - 1;
        const iterHtml = history
            .map((step, idx) => this._renderIteration(step, numVars, numConstraints, obj, idx === lastIdx))
            .join('');

        this.main.innerHTML = `
            <div class="results-header">
                <div class="results-title-row">
                    <h1 class="results-title">Оптимальний розв'язок</h1>
                    <span class="badge-optimal">Оптимально</span>
                </div>
                <p class="results-sub">Знайдено за ${history.length - 1} ітерац${this._iterSuffix(history.length - 1)}</p>
            </div>
            ${cardsHtml}
            ${intHtml}
            <div class="iter-section">
                <h2 class="iter-section-title">Хід симплекс-методу</h2>
                ${iterHtml}
            </div>`;

        requestAnimationFrame(() => {
            document.querySelectorAll('.rcard, .iter-block').forEach((el, i) => {
                if (el.style.opacity === '1') return;
                el.style.animationDelay = `${i * 60}ms`;
                el.classList.add('animate-in');
            });
        });
    }

    _iterSuffix(n) {
        if (n === 1) return 'ію';
        if (n >= 2 && n <= 4) return 'ії';
        return 'ій';
    }

    _renderIteration(step, numVars, numConstraints, objective, isLast) {
        const { iteration, tableau, basis, pivotRow, pivotCol, entering, leaving } = step;
        const n = numVars, m = numConstraints, cols = tableau[0].length;

        const varName = (idx) => `X${idx + 1}`;
        const cBasis = basis.map(b => b < n ? objective[b] : 0);

        const colHeaders = Array.from({ length: cols - 1 }, (_, i) => `A${i + 1}`);
        const cRow = Array.from({ length: cols - 1 }, (_, i) => i < n ? objective[i] : 0);

        const hasPivot = !isLast && pivotRow !== null && pivotCol !== null;

        const pivotInfoHtml = (entering && leaving)
            ? `<div class="pivot-info">
                   <span class="pi-label">Вводиться:</span>
                   <span class="pi-enter">${entering}</span>
                   <span class="pi-sep">→</span>
                   <span class="pi-label">Виводиться:</span>
                   <span class="pi-leave">${leaving}</span>
               </div>`
            : (isLast
                ? '<div class="pivot-info pi-initial">Оптимальна таблиця</div>'
                : '<div class="pivot-info pi-initial">Початкова таблиця</div>');

        const thCells = colHeaders.map(h => `<th>${h}</th>`).join('');
        const cCells = cRow.map(c => `<td class="tc tc--z">${c}</td>`).join('');

        const bodyRows = [];
        for (let ri = 0; ri < m; ri++) {
            const bIdx = basis[ri];
            const bName = `X${bIdx + 1}`;
            const cVal = bIdx < n ? objective[bIdx] : 0;
            const isOptBasis = isLast && bIdx < n;

            let cells = '';
            cells += `<td class="tc${isOptBasis ? ' tc--pivot' : ''}">${cVal}</td>`;
            cells += `<td class="tc tc--basis${isOptBasis ? ' tc--pivot' : ''}">${bName}</td>`;
            cells += `<td class="tc${isOptBasis ? ' tc--pivot' : ''} tc--rhs">${this._fmt(tableau[ri][cols - 1])}</td>`;

            for (let ci = 0; ci < cols - 1; ci++) {
                const isPE = hasPivot && ri === pivotRow && ci === pivotCol;
                const isPR = hasPivot && ri === pivotRow;
                const isPC = hasPivot && ci === pivotCol;
                let cls = 'tc';
                if (isPE) cls += ' tc--pivot';
                else if (isPR) cls += ' tc--prow';
                else if (isPC) cls += ' tc--pcol';
                cells += `<td class="${cls}">${this._fmt(tableau[ri][ci])}</td>`;
            }
            bodyRows.push(`<tr>${cells}</tr>`);
        }

        const zRow = tableau[m];
        let deltaRow = `<td class="tc tc--z"></td><td class="tc tc--z tc--basis">Δ</td>`;
        deltaRow += `<td class="tc tc--z tc--rhs">${this._fmt(zRow[cols - 1])}</td>`;
        for (let ci = 0; ci < cols - 1; ci++) {
            deltaRow += `<td class="tc tc--z">${this._fmt(zRow[ci])}</td>`;
        }
        bodyRows.push(`<tr class="tr--z">${deltaRow}</tr>`);

        return `
            <div class="iter-block">
                <div class="iter-header">
                    <div class="iter-badge">${iteration === 0 ? 'Початок' : `Ітерація ${iteration}`}</div>
                    ${pivotInfoHtml}
                </div>
                <div class="table-scroll-wrap">
                    <table class="stab">
                        <thead>
                            <tr>
                                <th></th><th>C</th><th>−</th>
                                ${cRow.map(c => `<th>${c}</th>`).join('')}
                            </tr>
                            <tr>
                                <th></th><th>B</th><th>A0</th>
                                ${colHeaders.map(h => `<th>${h}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>${bodyRows.join('')}</tbody>
                    </table>
                </div>
            </div>`;
    }

    // Рендер однієї ітерації таблиці Гоморі
    _renderGomoryIteration(step, numVars, objective, isLast) {
        const { iteration, tableau, basis, pivotRow, pivotCol, entering, leaving } = step;
        const n = numVars;
        const m = basis.length;
        const cols = tableau[0].length;

        const varName = (idx) => `X${idx + 1}`;

        const colHeaders = Array.from({ length: cols - 1 }, (_, i) => `A${i + 1}`);
        const cRow = Array.from({ length: cols - 1 }, (_, i) => i < n ? objective[i] : 0);

        const hasPivot = !isLast && pivotRow !== null && pivotCol !== null;

        const pivotInfoHtml = (entering && leaving)
            ? `<div class="pivot-info">
                   <span class="pi-label">Вводиться:</span>
                   <span class="pi-enter">${entering}</span>
                   <span class="pi-sep">→</span>
                   <span class="pi-label">Виводиться:</span>
                   <span class="pi-leave">${leaving}</span>
               </div>`
            : (isLast
                ? '<div class="pivot-info pi-initial">Оптимальна таблиця (ціла)</div>'
                : '<div class="pivot-info pi-initial">Таблиця Гоморі</div>');

        const bodyRows = [];
        for (let ri = 0; ri < m; ri++) {
            const bIdx = basis[ri];
            const bName = `X${bIdx + 1}`;
            const cVal = bIdx < n ? objective[bIdx] : 0;
            const isOptBasis = isLast && bIdx < n;

            let cells = '';
            cells += `<td class="tc${isOptBasis ? ' tc--pivot' : ''}">${cVal}</td>`;
            cells += `<td class="tc tc--basis${isOptBasis ? ' tc--pivot' : ''}">${bName}</td>`;
            cells += `<td class="tc${isOptBasis ? ' tc--pivot' : ''} tc--rhs">${this._fmt(tableau[ri][cols - 1])}</td>`;

            for (let ci = 0; ci < cols - 1; ci++) {
                const isPE = hasPivot && ri === pivotRow && ci === pivotCol;
                const isPR = hasPivot && ri === pivotRow;
                const isPC = hasPivot && ci === pivotCol;
                let cls = 'tc';
                if (isPE) cls += ' tc--pivot';
                else if (isPR) cls += ' tc--prow';
                else if (isPC) cls += ' tc--pcol';
                cells += `<td class="${cls}">${this._fmt(tableau[ri][ci])}</td>`;
            }
            bodyRows.push(`<tr>${cells}</tr>`);
        }

        // Рядок оцінок дельта
        const zRow = tableau[m];
        let deltaRow = `<td class="tc tc--z"></td><td class="tc tc--z tc--basis">Δ</td>`;
        deltaRow += `<td class="tc tc--z tc--rhs">${this._fmt(zRow[cols - 1])}</td>`;
        for (let ci = 0; ci < cols - 1; ci++) {
            deltaRow += `<td class="tc tc--z">${this._fmt(zRow[ci])}</td>`;
        }
        bodyRows.push(`<tr class="tr--z">${deltaRow}</tr>`);

        return `
            <div class="iter-block">
                <div class="iter-header">
                    <div class="iter-badge">${iteration}</div>
                    ${pivotInfoHtml}
                </div>
                <div class="table-scroll-wrap">
                    <table class="stab">
                        <thead>
                            <tr>
                                <th></th><th>C</th><th>−</th>
                                ${cRow.map(c => `<th>${c}</th>`).join('')}
                            </tr>
                            <tr>
                                <th></th><th>B</th><th>A0</th>
                                ${colHeaders.map(h => `<th>${h}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>${bodyRows.join('')}</tbody>
                    </table>
                </div>
            </div>`;
    }

    _fmt(val) {
        if (Math.abs(val) < 1e-9) return '0';
        const sign = val < 0 ? '−' : '';
        const absVal = Math.abs(val);
        if (Math.abs(absVal - Math.round(absVal)) < 1e-7) return (Math.round(val)).toString();
        for (const d of [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 16, 20]) {
            const numer = Math.round(absVal * d);
            if (Math.abs(numer / d - absVal) < 1e-7) {
                if (numer % d === 0) return (Math.round(val)).toString();
                return `${sign}${numer}/${d}`;
            }
        }
        return (Math.round(val * 100) / 100).toString();
    }

    /* історія */
    renderHistoryPanel(historyData, onClose, onClear, onLoad) {
        const old = document.querySelector('.history-overlay');
        if (old) old.remove();

        const overlay = document.createElement('div');
        overlay.className = 'history-overlay';

        let itemsHtml = '';
        if (historyData.length === 0) {
            itemsHtml = '<p style="color:#888;font-size:13px;">Історія порожня</p>';
        } else {
            itemsHtml = historyData.map((h, i) => {
                const d = new Date(h.timestamp);
                const dateStr = d.toLocaleString('uk-UA');
                const zStr = h.maxZ !== undefined ? `F = ${h.maxZ}` : '';
                const intStr = h.integerZ !== undefined ? ` | F(ціле) = ${h.integerZ}` : '';
                return `<div class="history-item" data-idx="${i}">
                    <div class="hi-date">${dateStr}</div>
                    <div class="hi-result">${zStr}${intStr}</div>
                </div>`;
            }).join('');
        }

        overlay.innerHTML = `
            <div class="history-panel">
                <h2>Історія обчислень</h2>
                ${itemsHtml}
                <div class="history-actions">
                    <button class="btn-clear-history" id="btnClearHist">Очистити</button>
                    <button class="btn-close-history" id="btnCloseHist">Закрити</button>
                </div>
            </div>`;

        document.body.appendChild(overlay);

        overlay.querySelector('#btnCloseHist').addEventListener('click', () => { overlay.remove(); if (onClose) onClose(); });
        overlay.querySelector('#btnClearHist').addEventListener('click', () => { if (onClear) onClear(); overlay.remove(); });
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

        overlay.querySelectorAll('.history-item').forEach(el => {
            el.addEventListener('click', () => { const idx = parseInt(el.dataset.idx); if (onLoad) onLoad(idx); overlay.remove(); });
        });
    }

    attachSolveListener(handler) {
        const btn = document.getElementById('solveBtn');
        if (btn) btn.addEventListener('click', handler);
    }
}