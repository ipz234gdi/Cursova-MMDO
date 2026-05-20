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

    // стовпець з найменшим від'ємним
    _getPivotColumn() {
        const zRow = this.tableau[this.tableau.length - 1];
        let minVal = -1e-10, minIdx = -1;

        for (let j = 0; j < zRow.length - 1; j++) {
            if (zRow[j] < minVal) { minVal = zRow[j]; minIdx = j; }
        }

        return minIdx;
    }

    // правило мінімального відношення
    _getPivotRow(col) {
        const m = this.basis.length;
        const rhs = this.tableau[0].length - 1;
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
        const m = this.basis.length;
        const cols = this.tableau[0].length;
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

        const n = this.numVars, m = this.basis.length;
        const rhsIdx = this.tableau[0].length - 1;
        const solution = new Array(n).fill(0);

        for (let i = 0; i < m; i++) {
            if (this.basis[i] < n) solution[this.basis[i]] = this.tableau[i][rhsIdx];
        }

        const optimalPlan = {};
        solution.forEach((v, i) => { optimalPlan[`x${i + 1}`] = Math.round(v * 10000) / 10000; });
        
        return {
            status: 'success', optimalPlan,
            maxZ: Math.round(this.tableau[m][rhsIdx] * 10000) / 10000,
            history: this.history, numVars: n, numConstraints: this.numConstraints,
        };
    }


    static solveInteger(objective, constraints, bounds) {
        const EPS = 1e-7;

        const frac = (a) => {
            const fl = Math.floor(a + EPS);
            let f = a - fl;
            if (f < EPS) f = 0;
            if (f > 1 - EPS) f = 0;
            return f;
        };

        const isInt = (v) => Math.abs(v - Math.round(v)) < EPS;

        const model = new SimplexModel(objective, constraints, bounds);
        const relaxedResult = model.solve();

        if (relaxedResult.status !== 'success') {
            return { status: relaxedResult.status, relaxedResult };
        }

        const n = objective.length;

        const allIntPlan = (plan) => {
            for (let i = 1; i <= n; i++) {
                if (!isInt(plan[`x${i}`] || 0)) return false;
            }
            return true;
        };

        if (allIntPlan(relaxedResult.optimalPlan)) {
            return {
                status: 'success',
                integerPlan: { ...relaxedResult.optimalPlan },
                integerZ: relaxedResult.maxZ,
                relaxedResult,
                branchLog: ['Релаксований розв\'язок вже цілочисельний'],
                gomoryHistory: []
            };
        }

        let tableau = model.tableau.map(r => [...r]);
        let basis = [...model.basis];
        let m = basis.length;

        const branchLog = [];
        const gomoryHistory = [];
        let cutIteration = 0;

        const relaxedVals = [];

        for (let j = 0; j < n; j++) relaxedVals.push(relaxedResult.optimalPlan[`x${j + 1}`] || 0);
        
        branchLog.push(`Неперервний оптимум: (${relaxedVals.map(v => v.toFixed(4)).join('; ')})`);
        branchLog.push(`F = ${relaxedResult.maxZ}`);

        gomoryHistory.push({
            iteration: 'Початкова (оптимальна симплекс-таблиця)',
            tableau: tableau.map(r => [...r]),
            basis: [...basis],
            pivotRow: null, pivotCol: null, entering: null, leaving: null
        });

        const MAX_CUTS = 100;

        for (let cutNum = 1; cutNum <= MAX_CUTS; cutNum++) {
            const cols = tableau[0].length;
            const rhsIdx = cols - 1;

            let maxFrac = 0;
            let cutRow = -1;
            for (let i = 0; i < m; i++) {
                const rhsVal = tableau[i][rhsIdx];
                const f = frac(rhsVal);
                if (f > EPS && basis[i] < n) {
                    if (f > maxFrac) { maxFrac = f; cutRow = i; }
                }
            }

            if (cutRow === -1) {
                for (let i = 0; i < m; i++) {
                    const rhsVal = tableau[i][rhsIdx];
                    const f = frac(rhsVal);
                    if (f > EPS) {
                        if (f > maxFrac) { maxFrac = f; cutRow = i; }
                    }
                }
            }

            if (cutRow === -1) {
                branchLog.push(`\nВсі базисні змінні цілі. Розв'язок знайдено за ${cutNum - 1} відсічень.`);
                break;
            }

            const basisVarName = `X${basis[cutRow] + 1}`;
            const rhsValue = tableau[cutRow][rhsIdx];
            branchLog.push(`\nВідсічення #${cutNum}`);
            branchLog.push(`Обрано рядок: ${basisVarName} = ${rhsValue.toFixed(4)}, дробова частина = ${maxFrac.toFixed(4)}`);

            const newSlackIdx = cols - 1;

            for (let i = 0; i <= m; i++) {
                const rhs = tableau[i][rhsIdx];
                tableau[i][rhsIdx] = 0;
                tableau[i].push(rhs);
            }

            const newCols = tableau[0].length;
            const newRhsIdx = newCols - 1;

            // рядок відсічення
            const cutRowData = new Array(newCols).fill(0);
            for (let j = 0; j < newCols; j++) {
                if (j === newSlackIdx) {
                    cutRowData[j] = 1;
                } else {
                    cutRowData[j] = -frac(tableau[cutRow][j]);
                }
            }

            const zRow = tableau.pop();
            tableau.push(cutRowData);
            tableau.push(zRow);
            basis.push(newSlackIdx);
            m = basis.length;

            branchLog.push(`Додано рядок відсічення та балансову змінну X${newSlackIdx + 1}`);

            gomoryHistory.push({
                iteration: `Відсічення #${cutNum} (до двоїстого симплексу)`,
                tableau: tableau.map(r => [...r]),
                basis: [...basis],
                pivotRow: null, pivotCol: null, entering: null, leaving: null
            });

            // двоїстий симплекс
            let dualIter = 0;
            const MAX_DUAL_ITERS = 200;

            while (dualIter < MAX_DUAL_ITERS) {
                dualIter++;
                const currentCols = tableau[0].length;
                const currentRhs = currentCols - 1;

                let pivotRow = -1;
                let minRhs = -EPS;
                for (let i = 0; i < m; i++) {
                    if (tableau[i][currentRhs] < minRhs) {
                        minRhs = tableau[i][currentRhs];
                        pivotRow = i;
                    }
                }

                if (pivotRow === -1) break;

                const zRowCurrent = tableau[m];
                let pivotCol = -1;
                let minRatio = Infinity;

                for (let j = 0; j < currentCols - 1; j++) {
                    if (tableau[pivotRow][j] < -EPS) {
                        const delta = zRowCurrent[j];
                        if (delta >= -EPS) {
                            const ratio = Math.abs(delta) / Math.abs(tableau[pivotRow][j]);
                            if (ratio < minRatio - EPS) { minRatio = ratio; pivotCol = j; }
                        }
                    }
                }

                if (pivotCol === -1) {
                    branchLog.push(`Двоїстий симплекс: не знайдено допустимого стовпця. Задача не має цілочисельного розв'язку.`);
                    return { status: 'no_integer', relaxedResult, branchLog, gomoryHistory };
                }

                const entering = `X${pivotCol + 1}`;
                const leaving = `X${basis[pivotRow] + 1}`;
                branchLog.push(`Двоїстий крок: ведучий елемент [${pivotRow}, ${pivotCol}] = ${tableau[pivotRow][pivotCol].toFixed(4)}, ${entering} ↔ ${leaving}`);

                gomoryHistory[gomoryHistory.length - 1].pivotRow = pivotRow;
                gomoryHistory[gomoryHistory.length - 1].pivotCol = pivotCol;
                gomoryHistory[gomoryHistory.length - 1].entering = entering;
                gomoryHistory[gomoryHistory.length - 1].leaving = leaving;

                const pe = tableau[pivotRow][pivotCol];
                for (let j = 0; j < currentCols; j++) tableau[pivotRow][j] /= pe;
                for (let i = 0; i <= m; i++) {
                    if (i === pivotRow) continue;
                    const f = tableau[i][pivotCol];
                    if (Math.abs(f) < 1e-12) continue;
                    for (let j = 0; j < currentCols; j++) tableau[i][j] -= f * tableau[pivotRow][j];
                }
                basis[pivotRow] = pivotCol;

                gomoryHistory.push({
                    iteration: `Відсічення #${cutNum}, двоїстий крок ${dualIter}`,
                    tableau: tableau.map(r => [...r]),
                    basis: [...basis],
                    pivotRow: null, pivotCol: null, entering: null, leaving: null
                });
            }
        }

        const finalCols = tableau[0].length;
        const finalRhs = finalCols - 1;
        const intSolution = new Array(n).fill(0);
        for (let i = 0; i < m; i++) {
            if (basis[i] < n) {
                intSolution[basis[i]] = Math.round(tableau[i][finalRhs]);
            }
        }

        const integerPlan = {};
        for (let j = 0; j < n; j++) {
            integerPlan[`x${j + 1}`] = intSolution[j];
        }

        let integerZ = 0;
        for (let j = 0; j < n; j++) {
            integerZ += objective[j] * intSolution[j];
        }

        const planStr = Object.entries(integerPlan).map(([k, v]) => `${k} = ${v}`).join(', ');
        branchLog.push(`\nОптимальний цілочисельний розв'язок: ${planStr}, F = ${integerZ}`);

        return {
            status: 'success',
            integerPlan,
            integerZ: Math.round(integerZ * 10000) / 10000,
            relaxedResult,
            branchLog,
            gomoryHistory
        };
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