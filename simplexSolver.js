class SimplexModel {
    constructor(objective, constraints, bounds, signs, optType = 'max') {
        this.objective = [...objective];
        this.constraints = constraints.map(r => [...r]);
        this.bounds = [...bounds];
        this.signs = signs ? [...signs] : new Array(bounds.length).fill('le');
        this.numVars = objective.length;
        this.numConstraints = constraints.length;
        this.tableau = [];
        this.basis = [];
        this.history = [];
        this.optType = optType;
        this.M = 1000000;
    }

    getVarName(idx) {
        return `X${idx + 1}`;
    }

    _compare(x, y) {
        if (Math.abs(x[1] - y[1]) > 1e-9) {
            return x[1] - y[1];
        }
        return x[0] - y[0];
    }

    _buildTableau() {
        const n = this.numVars, m = this.numConstraints;
        const A = this.constraints.map(r => [...r]);
        const b = [...this.bounds];
        const s = [...this.signs];

        for (let i = 0; i < m; i++) {
            if (b[i] < 0) {
                b[i] = -b[i];
                for (let j = 0; j < n; j++) A[i][j] = -A[i][j];
                if (s[i] === 'le') s[i] = 'ge';
                else if (s[i] === 'ge') s[i] = 'le';
            }
        }

        let maxVal = 1;
        for (let i = 0; i < m; i++) {
            for (let j = 0; j < n; j++) {
                maxVal = Math.max(maxVal, Math.abs(A[i][j]));
            }
            maxVal = Math.max(maxVal, Math.abs(b[i]));
        }
        for (let j = 0; j < n; j++) {
            maxVal = Math.max(maxVal, Math.abs(this.objective[j]));
        }
        this.M = maxVal * 10000;

        let numSlack = 0;
        let numArtificial = 0;
        for (let i = 0; i < m; i++) {
            if (s[i] === 'le') {
                numSlack++;
            } else if (s[i] === 'ge') {
                numSlack++;
                numArtificial++;
            } else if (s[i] === 'eq') {
                numArtificial++;
            }
        }

        const totalCols = n + numSlack + numArtificial + 1;
        this.tableau = [];
        this.basis = [];

        let slackCount = 0;
        let artCount = 0;
        const artVarIdxOfRow = new Array(m).fill(-1);

        for (let i = 0; i < m; i++) {
            const row = Array.from({ length: totalCols }, () => [0, 0]);
            for (let j = 0; j < n; j++) {
                row[j] = [A[i][j], 0];
            }

            if (s[i] === 'le') {
                row[n + slackCount] = [1, 0];
                this.basis.push(n + slackCount);
                slackCount++;
            } else if (s[i] === 'ge') {
                row[n + slackCount] = [-1, 0];
                row[n + numSlack + artCount] = [1, 0];
                artVarIdxOfRow[i] = n + numSlack + artCount;
                this.basis.push(n + numSlack + artCount);
                slackCount++;
                artCount++;
            } else if (s[i] === 'eq') {
                row[n + numSlack + artCount] = [1, 0];
                artVarIdxOfRow[i] = n + numSlack + artCount;
                this.basis.push(n + numSlack + artCount);
                artCount++;
            }

            row[totalCols - 1] = [b[i], 0];
            this.tableau.push(row);
        }

        const zRow = Array.from({ length: totalCols }, () => [0, 0]);
        for (let j = 0; j < n; j++) {
            zRow[j] = [-this.objective[j], 0];
        }

        const penaltySign = this.optType === 'max' ? 1 : -1;
        for (let k = 0; k < numArtificial; k++) {
            zRow[n + numSlack + k] = [0, penaltySign];
        }

        for (let i = 0; i < m; i++) {
            const aIdx = artVarIdxOfRow[i];
            if (aIdx !== -1) {
                const coef = zRow[aIdx];
                for (let j = 0; j < totalCols; j++) {
                    zRow[j] = [
                        zRow[j][0] - coef[0] * this.tableau[i][j][0],
                        zRow[j][1] - coef[1] * this.tableau[i][j][0]
                    ];
                }
            }
        }

        this.tableau.push(zRow);
    }

    _getPivotColumn() {
        const zRow = this.tableau[this.tableau.length - 1];
        if (this.optType === 'min') {
            let maxVal = [1e-10, 0], maxIdx = -1;
            for (let j = 0; j < zRow.length - 1; j++) {
                if (this._compare(zRow[j], maxVal) > 0) { maxVal = zRow[j]; maxIdx = j; }
            }
            return maxIdx;
        } else {
            let minVal = [-1e-10, 0], minIdx = -1;
            for (let j = 0; j < zRow.length - 1; j++) {
                if (this._compare(zRow[j], minVal) < 0) { minVal = zRow[j]; minIdx = j; }
            }
            return minIdx;
        }
    }

    _getPivotRow(col) {
        const m = this.basis.length;
        const rhs = this.tableau[0].length - 1;
        let minRatio = Infinity, minIdx = -1;

        for (let i = 0; i < m; i++) {
            if (this.tableau[i][col][0] > 1e-10) {
                const ratio = this.tableau[i][rhs][0] / this.tableau[i][col][0];
                if (ratio < minRatio - 1e-10) { minRatio = ratio; minIdx = i; }
            }
        }

        return minIdx;
    }

    _pivot(pivotRow, pivotCol) {
        const m = this.basis.length;
        const cols = this.tableau[0].length;
        const pe = this.tableau[pivotRow][pivotCol][0];

        for (let j = 0; j < cols; j++) {
            this.tableau[pivotRow][j] = [this.tableau[pivotRow][j][0] / pe, this.tableau[pivotRow][j][1] / pe];
        }

        for (let i = 0; i <= m; i++) {
            if (i === pivotRow) continue;
            const f = this.tableau[i][pivotCol];
            if (Math.abs(f[0]) < 1e-12 && Math.abs(f[1]) < 1e-12) continue;
            for (let j = 0; j < cols; j++) {
                this.tableau[i][j] = [
                    this.tableau[i][j][0] - f[0] * this.tableau[pivotRow][j][0],
                    this.tableau[i][j][1] - f[0] * this.tableau[pivotRow][j][1] - f[1] * this.tableau[pivotRow][j][0]
                ];
            }
        }

        this.basis[pivotRow] = pivotCol;
    }

    _snapshot({ iteration, pivotRow = null, pivotCol = null, entering = null, leaving = null } = {}) {
        return { iteration, tableau: this.tableau.map(r => r.map(c => [...c])), basis: [...this.basis], pivotRow, pivotCol, entering, leaving };
    }

    solve() {
        this._buildTableau();
        this.history = [this._snapshot({ iteration: 0 })];
        const n = this.numVars, m = this.numConstraints;
        const cols = this.tableau[0].length;
        const rhsIdx = cols - 1;

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

        let numSlack = 0;
        let numArtificial = 0;
        const s = [...this.signs];
        for (let i = 0; i < m; i++) {
            const signVal = s[i] || 'le';
            if (signVal === 'le') numSlack++;
            else if (signVal === 'ge') { numSlack++; numArtificial++; }
            else if (signVal === 'eq') numArtificial++;
        }

        for (let i = 0; i < m; i++) {
            const bVar = this.basis[i];
            if (bVar >= n + numSlack) {
                if (Math.abs(this.tableau[i][rhsIdx][0]) > 1e-5) {
                    return { status: 'infeasible' };
                }
            }
        }

        const solution = new Array(n).fill(0);
        for (let i = 0; i < m; i++) {
            if (this.basis[i] < n) {
                solution[this.basis[i]] = this.tableau[i][rhsIdx][0];
            }
        }

        const optimalPlan = {};
        solution.forEach((v, i) => { optimalPlan[`x${i + 1}`] = v; });

        return {
            status: 'success', optimalPlan,
            maxZ: this.tableau[m][rhsIdx][0],
            history: this.history, numVars: n, numConstraints: this.numConstraints,
            M: this.M
        };
    }


    static _toFrac(val) {
        if (Math.abs(val) < 1e-9) return '0';
        const sign = val < 0 ? '-' : '';
        const absVal = Math.abs(val);
        if (Math.abs(absVal - Math.round(absVal)) < 1e-7) return (Math.round(val)).toString();
        for (const d of [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 16, 20]) {
            const numer = Math.round(absVal * d);
            if (Math.abs(numer / d - absVal) < 1e-7) {
                if (numer % d === 0) return (Math.round(val)).toString();
                return `${sign}${numer}/${d}`;
            }
        }
        return (Math.round(val * 10000) / 10000).toString();
    }

    static solveInteger(objective, constraints, bounds, signs, optType = 'max') {
        const EPS = 1e-7;

        const frac = (a) => {
            const val = a;
            const fl = Math.floor(val + EPS);
            let f = val - fl;
            if (f < EPS) f = 0;
            if (f > 1 - EPS) f = 0;
            return f;
        };

        const isInt = (v) => Math.abs(v - Math.round(v)) < EPS;

        const model = new SimplexModel(objective, constraints, bounds, signs, optType);
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

        let tableau = model.tableau.map(r => r.map(c => [...c]));
        let basis = [...model.basis];
        let m = basis.length;

        const branchLog = [];
        const gomoryHistory = [];

        const relaxedVals = [];
        for (let j = 0; j < n; j++) relaxedVals.push(relaxedResult.optimalPlan[`x${j + 1}`] || 0);
        
        branchLog.push(`Неперервний оптимум: (${relaxedVals.map(v => SimplexModel._toFrac(v)).join('; ')})`);
        branchLog.push(`F = ${SimplexModel._toFrac(relaxedResult.maxZ)}`);

        gomoryHistory.push({
            iteration: 'Початкова (оптимальна симплекс-таблиця)',
            tableau: tableau.map(r => r.map(c => [...c])),
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
                const rhsVal = tableau[i][rhsIdx][0];
                const f = frac(rhsVal);
                if (f > EPS && basis[i] < n) {
                    if (f > maxFrac) { maxFrac = f; cutRow = i; }
                }
            }

            if (cutRow === -1) {
                for (let i = 0; i < m; i++) {
                    const rhsVal = tableau[i][rhsIdx][0];
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
            const rhsValue = tableau[cutRow][rhsIdx][0];
            branchLog.push(`\nВідсічення #${cutNum}`);
            branchLog.push(`Обрано рядок: ${basisVarName} = ${SimplexModel._toFrac(rhsValue)}, дробова частина = ${SimplexModel._toFrac(maxFrac)}`);

            const newSlackIdx = cols - 1;

            for (let i = 0; i <= m; i++) {
                const rhs = tableau[i][rhsIdx];
                tableau[i][rhsIdx] = [0, 0];
                tableau[i].push(rhs);
            }

            const newCols = tableau[0].length;
            const newRhsIdx = newCols - 1;

            const cutRowData = [];
            for (let j = 0; j < newCols; j++) {
                if (j === newSlackIdx) {
                    cutRowData.push([1, 0]);
                } else {
                    cutRowData.push([-frac(tableau[cutRow][j][0]), 0]);
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
                tableau: tableau.map(r => r.map(c => [...c])),
                basis: [...basis],
                pivotRow: null, pivotCol: null, entering: null, leaving: null
            });

            let dualIter = 0;
            const MAX_DUAL_ITERS = 200;

            while (dualIter < MAX_DUAL_ITERS) {
                dualIter++;
                const currentCols = tableau[0].length;
                const currentRhs = currentCols - 1;

                let pivotRow = -1;
                let minRhs = -EPS;
                for (let i = 0; i < m; i++) {
                    if (tableau[i][currentRhs][0] < minRhs) {
                        minRhs = tableau[i][currentRhs][0];
                        pivotRow = i;
                    }
                }

                if (pivotRow === -1) break;

                const zRowCurrent = tableau[m];
                let pivotCol = -1;
                let minRatio = Infinity;

                for (let j = 0; j < currentCols - 1; j++) {
                    if (tableau[pivotRow][j][0] < -EPS) {
                        const delta = zRowCurrent[j];
                        if (delta[0] >= -EPS) {
                            const ratio = Math.abs(delta[0]) / Math.abs(tableau[pivotRow][j][0]);
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
                branchLog.push(`Двоїстий крок: ведучий елемент [${pivotRow}, ${pivotCol}] = ${SimplexModel._toFrac(tableau[pivotRow][pivotCol][0])}, ${entering} ↔ ${leaving}`);

                gomoryHistory[gomoryHistory.length - 1].pivotRow = pivotRow;
                gomoryHistory[gomoryHistory.length - 1].pivotCol = pivotCol;
                gomoryHistory[gomoryHistory.length - 1].entering = entering;
                gomoryHistory[gomoryHistory.length - 1].leaving = leaving;

                const pe = tableau[pivotRow][pivotCol][0];
                for (let j = 0; j < currentCols; j++) {
                    tableau[pivotRow][j] = [tableau[pivotRow][j][0] / pe, tableau[pivotRow][j][1] / pe];
                }
                for (let i = 0; i <= m; i++) {
                    if (i === pivotRow) continue;
                    const f = tableau[i][pivotCol];
                    if (Math.abs(f[0]) < 1e-12 && Math.abs(f[1]) < 1e-12) continue;
                    for (let j = 0; j < currentCols; j++) {
                        tableau[i][j] = [
                            tableau[i][j][0] - f[0] * tableau[pivotRow][j][0],
                            tableau[i][j][1] - f[0] * tableau[pivotRow][j][1] - f[1] * tableau[pivotRow][j][0]
                        ];
                    }
                }
                basis[pivotRow] = pivotCol;

                gomoryHistory.push({
                    iteration: `Відсічення #${cutNum}, двоїстий крок ${dualIter}`,
                    tableau: tableau.map(r => r.map(c => [...c])),
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
                intSolution[basis[i]] = Math.round(tableau[i][finalRhs][0]);
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

        relaxedResult.M = model.M;

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