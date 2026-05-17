class SimplexModel {
    constructor(objective, constraints, bounds) {
        this.objective = [...objective];
        this.constraints = constraints.map(r => [...r]);
        this.bounds = [...bounds];
        this.numVars = objective.length;
        this.numConstraints = constraints.length;
        this.tableau = [];
        this.basis = [];
        this.history = [];
    }

    getVarName(idx) {
        return `X${idx + 1}`;
    }

    _buildTableau() {
        const n = this.numVars, m = this.numConstraints;
        this.tableau = [];
        for (let i = 0; i < m; i++) {
            const row = new Array(n + m + 1).fill(0);
            for (let j = 0; j < n; j++) row[j] = this.constraints[i][j];
            row[n + i] = 1;
            row[n + m] = this.bounds[i];
            this.tableau.push(row);
        }
        const zRow = new Array(n + m + 1).fill(0);
        for (let j = 0; j < n; j++) zRow[j] = -this.objective[j];
        this.tableau.push(zRow);
        this.basis = Array.from({ length: m }, (_, i) => n + i);
    }

    _getPivotColumn() {
        const zRow = this.tableau[this.tableau.length - 1];
        let minVal = -1e-10, minIdx = -1;
        for (let j = 0; j < zRow.length - 1; j++) {
            if (zRow[j] < minVal) { minVal = zRow[j]; minIdx = j; }
        }
        return minIdx;
    }

    _getPivotRow(col) {
        const m = this.numConstraints, rhs = this.tableau[0].length - 1;
        let minRatio = Infinity, minIdx = -1;
        for (let i = 0; i < m; i++) {
            if (this.tableau[i][col] > 1e-10) {
                const ratio = this.tableau[i][rhs] / this.tableau[i][col];
                if (ratio < minRatio - 1e-10) { minRatio = ratio; minIdx = i; }
            }
        }
        return minIdx;
    }

    _pivot(pivotRow, pivotCol) {
        const m = this.numConstraints, cols = this.tableau[0].length;
        const pe = this.tableau[pivotRow][pivotCol];
        for (let j = 0; j < cols; j++) this.tableau[pivotRow][j] /= pe;
        for (let i = 0; i <= m; i++) {
            if (i === pivotRow) continue;
            const f = this.tableau[i][pivotCol];
            if (Math.abs(f) < 1e-12) continue;
            for (let j = 0; j < cols; j++) this.tableau[i][j] -= f * this.tableau[pivotRow][j];
        }
        this.basis[pivotRow] = pivotCol;
    }

    _snapshot({ iteration, pivotRow = null, pivotCol = null, entering = null, leaving = null } = {}) {
        return { iteration, tableau: this.tableau.map(r => [...r]), basis: [...this.basis], pivotRow, pivotCol, entering, leaving };
    }

    solve() {
        this._buildTableau();
        this.history = [this._snapshot({ iteration: 0 })];
        for (let iter = 1; iter <= 200; iter++) {
            const pc = this._getPivotColumn();
            if (pc === -1) break;
            const pr = this._getPivotRow(pc);
            if (pr === -1) return { status: 'unbounded' };
            const entering = this.getVarName(pc), leaving = this.getVarName(this.basis[pr]);

            this.history[this.history.length - 1].pivotRow = pr;
            this.history[this.history.length - 1].pivotCol = pc;
            this.history[this.history.length - 1].entering = entering;
            this.history[this.history.length - 1].leaving = leaving;

            this._pivot(pr, pc);
            this.history.push(this._snapshot({ iteration: iter }));
        }
        const n = this.numVars, m = this.numConstraints;
        const solution = new Array(n).fill(0);
        for (let i = 0; i < m; i++) {
            if (this.basis[i] < n) solution[this.basis[i]] = this.tableau[i][n + m];
        }
        const optimalPlan = {};
        solution.forEach((v, i) => { optimalPlan[`x${i + 1}`] = Math.round(v * 10000) / 10000; });
        return {
            status: 'success', optimalPlan,
            maxZ: Math.round(this.tableau[m][n + m] * 10000) / 10000,
            history: this.history, numVars: n, numConstraints: m,
        };
    }

    static solveInteger(objective, constraints, bounds) {
        const relaxed = new SimplexModel(objective, constraints, bounds);
        const relaxedResult = relaxed.solve();
        if (relaxedResult.status !== 'success') return { status: relaxedResult.status, relaxedResult };

        const n = objective.length;
        const isInt = v => Math.abs(v - Math.round(v)) < 1e-6;
        const allInt = plan => { for (let i = 1; i <= n; i++) if (!isInt(plan[`x${i}`] || 0)) return false; return true; };

        if (allInt(relaxedResult.optimalPlan)) {
            return { status: 'success', integerPlan: { ...relaxedResult.optimalPlan }, integerZ: relaxedResult.maxZ, relaxedResult, branchLog: ['Релаксований розв\'язок вже цілочисельний'] };
        }

        const branchLog = [];
        const relaxedVals = [];
        for (let j = 0; j < n; j++) relaxedVals.push(relaxedResult.optimalPlan[`x${j + 1}`] || 0);

        const relaxedStr = relaxedVals.map(v => v.toFixed(2)).join('; ');
        branchLog.push(`Неперервний оптимум: (${relaxedStr})`);
        branchLog.push(`Досліджуємо цілі точки в околі оптимуму:`);

        const floors = relaxedVals.map(v => Math.floor(v));
        const ceils = relaxedVals.map(v => Math.ceil(v));

        const combos = 1 << n;
        const candidates = [];
        for (let mask = 0; mask < combos; mask++) {
            const point = [];
            for (let j = 0; j < n; j++) {
                point.push((mask & (1 << j)) ? ceils[j] : floors[j]);
            }
            const key = point.join('; ');
            if (!candidates.some(c => c.join('; ') === key)) {
                candidates.push(point);
            }
        }

        let bestZ = -Infinity, bestPlan = null;

        for (const point of candidates) {
            const pointStr = point.map((v, j) => `x${j + 1}=${v}`).join(', ');
            branchLog.push(`Перевірка точки (${point.join('; ')}):`);

            let feasible = true;
            for (let i = 0; i < constraints.length; i++) {
                let sum = 0;
                const parts = [];
                for (let j = 0; j < n; j++) {
                    sum += constraints[i][j] * point[j];
                    if (constraints[i][j] !== 0) {
                        parts.push(`${constraints[i][j]}(${point[j]})`);
                    }
                }
                const ok = sum <= bounds[i] + 1e-9;
                branchLog.push(`  ${i + 1}. ${parts.join(' + ')} = ${sum} ≤ ${bounds[i]} — ${ok ? 'виконується' : 'НЕ виконується'}`);
                if (!ok) { feasible = false; break; }
            }

            if (feasible) {
                let z = 0;
                const fParts = [];
                for (let j = 0; j < n; j++) {
                    z += objective[j] * point[j];
                    fParts.push(`${objective[j]}(${point[j]})`);
                }
                branchLog.push(`  F = ${fParts.join(' + ')} = ${z}`);
                if (z > bestZ + 1e-9) {
                    bestZ = z;
                    bestPlan = {};
                    for (let j = 0; j < n; j++) bestPlan[`x${j + 1}`] = point[j];
                }
            } else {
                branchLog.push(`  Точка не задовольняє обмеження.`);
            }
        }

        if (!bestPlan) return { status: 'no_integer', relaxedResult, branchLog };
        const planStr = Object.entries(bestPlan).map(([k, v]) => `${k}=${v}`).join(', ');
        branchLog.push(`Оптимальний цілочисельний розв'язок: ${planStr}, F = ${bestZ}`);
        return { status: 'success', integerPlan: bestPlan, integerZ: Math.round(bestZ * 10000) / 10000, relaxedResult, branchLog };
    }

    static saveToHistory(entry) {
        const h = SimplexModel.loadHistory();
        entry.timestamp = new Date().toISOString();
        h.unshift(entry);
        if (h.length > 50) h.length = 50;
        try { localStorage.setItem('simplex_history', JSON.stringify(h)); } catch (e) { }
    }

    static loadHistory() {
        try { const d = localStorage.getItem('simplex_history'); return d ? JSON.parse(d) : []; } catch (e) { return []; }
    }

    static clearHistory() { localStorage.removeItem('simplex_history'); }
}