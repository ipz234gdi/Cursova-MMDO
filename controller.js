class SimplexController {
    constructor(view) {
        this.view = view;
        this.state = {
            trainTypes: ['Швидкий', 'Пасажирський'],
            wagonTypes: ['Багажний', 'Поштовий', 'Жорсткий', 'Купейний', "М'який"],
            tableData: [
                [1, 1],
                [1, 0],
                [5, 8],
                [6, 4],
                [4, 2],
            ],
            parkData: [12, 18, 89, 79, 35],
            objectiveCoeffs: [658, 688],
            constraintSigns: ['le', 'le', 'le', 'le', 'le'],
            extraConstraints: [],
            optimizationType: 'max',
            headerWagon: 'Вагон',
            headerPark: 'Парк',
        };
    }

    init() {
        this._render();
    }

    _render() {
        this.view.renderSidebar(this.state);
        this._attachEvents();
    }

    _attachEvents() {
        this.view.attachSolveListener(() => this._handleSolve());

        const optTypeSelect = document.getElementById('optType');
        if (optTypeSelect) optTypeSelect.addEventListener('change', () => {
            this.state.optimizationType = optTypeSelect.value;
        });

        const enforceNonNegative = (inp) => {
            let val = parseFloat(inp.value) || 0;
            if (val < 0) {
                val = 0;
                inp.value = 0;
                inp.classList.add('input-error-flash');
                setTimeout(() => inp.classList.remove('input-error-flash'), 500);
            }
            return val;
        };

        document.querySelectorAll('.inp-cell').forEach(inp => {
            inp.addEventListener('change', () => {
                const wi = +inp.dataset.wi, ti = +inp.dataset.ti;
                if (!this.state.tableData[wi]) this.state.tableData[wi] = [];
                this.state.tableData[wi][ti] = parseFloat(inp.value) || 0;
            });
        });

        document.querySelectorAll('.inp-park').forEach(inp => {
            inp.addEventListener('change', () => {
                this.state.parkData[+inp.dataset.wi] = parseFloat(inp.value) || 0;
            });
        });

        document.querySelectorAll('.inp-wagon-name').forEach(inp => {
            inp.addEventListener('change', () => {
                this.state.wagonTypes[+inp.dataset.wi] = inp.value;
            });
        });

        document.querySelectorAll('.inp-train-name').forEach(inp => {
            inp.addEventListener('change', () => {
                this.state.trainTypes[+inp.dataset.ti] = inp.value;
            });
        });

        document.querySelectorAll('.btn-del-row').forEach(btn => {
            btn.addEventListener('click', () => {
                const wi = +btn.dataset.wi;
                if (this.state.wagonTypes.length <= 1) return;
                this.state.wagonTypes.splice(wi, 1);
                this.state.tableData.splice(wi, 1);
                this.state.parkData.splice(wi, 1);
                this.state.constraintSigns.splice(wi, 1);
                this._render();
            });
        });

        document.querySelectorAll('.btn-del-col').forEach(btn => {
            btn.addEventListener('click', () => {
                const ti = +btn.dataset.col;
                if (this.state.trainTypes.length <= 1) return;
                this.state.trainTypes.splice(ti, 1);
                this.state.tableData.forEach(row => row.splice(ti, 1));
                this.state.objectiveCoeffs.splice(ti, 1);
                this._render();
            });
        });

        const btnAddW = document.getElementById('btnAddWagon');
        if (btnAddW) btnAddW.addEventListener('click', () => {
            this.state.wagonTypes.push('Новий');
            this.state.tableData.push(new Array(this.state.trainTypes.length).fill(0));
            this.state.parkData.push(0);
            this.state.constraintSigns.push('le');
            this._render();
        });

        const btnAddT = document.getElementById('btnAddTrain');
        if (btnAddT) btnAddT.addEventListener('click', () => {
            this.state.trainTypes.push(`Тип ${this.state.trainTypes.length + 1}`);
            this.state.tableData.forEach(row => row.push(0));
            this.state.objectiveCoeffs.push(0);
            this._render();
        });

        document.querySelectorAll('.ec-var').forEach(sel => {
            sel.addEventListener('change', () => {
                this.state.extraConstraints[+sel.dataset.idx].varIdx = +sel.value;
            });
        });
        document.querySelectorAll('.ec-sign').forEach(sel => {
            sel.addEventListener('change', () => {
                this.state.extraConstraints[+sel.dataset.idx].sign = sel.value;
            });
        });
        document.querySelectorAll('.ec-val').forEach(inp => {
            inp.addEventListener('change', () => {
                this.state.extraConstraints[+inp.dataset.idx].value = enforceNonNegative(inp);
            });
        });

        document.querySelectorAll('.btn-del-ec').forEach(btn => {
            btn.addEventListener('click', () => {
                this.state.extraConstraints.splice(+btn.dataset.idx, 1);
                this._render();
            });
        });

        const btnAddEC = document.getElementById('btnAddEC');
        if (btnAddEC) btnAddEC.addEventListener('click', () => {
            this.state.extraConstraints.push({ varIdx: 0, sign: 'le', value: 0 });
            this._render();
        });

        const btnHist = document.getElementById('btnHistory');
        if (btnHist) btnHist.addEventListener('click', () => this._showHistory());

        const inpHW = document.querySelector('.inp-header-wagon');
        if (inpHW) inpHW.addEventListener('change', () => {
            this.state.headerWagon = inpHW.value;
        });

        const inpHPrk = document.querySelector('.inp-header-park');
        if (inpHPrk) inpHPrk.addEventListener('change', () => {
            this.state.headerPark = inpHPrk.value;
        });

        document.querySelectorAll('.inp-obj-coeff').forEach(inp => {
            inp.addEventListener('change', () => {
                const ti = +inp.dataset.ti;
                const newCoeff = parseFloat(inp.value) || 0;
                this.state.objectiveCoeffs[ti] = newCoeff;
            });
        });

        document.querySelectorAll('.inp-sign').forEach(sel => {
            sel.addEventListener('change', () => {
                const wi = +sel.dataset.wi;
                this.state.constraintSigns[wi] = sel.value;
            });
        });
    }

    _buildObjective() {
        const n = this.state.trainTypes.length;
        const obj = new Array(n).fill(0);
        for (let t = 0; t < n; t++) {
            obj[t] = this.state.objectiveCoeffs[t] || 0;
        }
        return obj;
    }

    _buildConstraintsAndBounds() {
        const n = this.state.trainTypes.length;
        const constraints = [];
        const bounds = [];
        const signs = [...this.state.constraintSigns];

        for (let w = 0; w < this.state.wagonTypes.length; w++) {
            const row = new Array(n).fill(0);
            for (let t = 0; t < n; t++) {
                row[t] = (this.state.tableData[w] && this.state.tableData[w][t]) || 0;
            }
            constraints.push(row);
            bounds.push(this.state.parkData[w] || 0);
        }

        return { constraints, bounds, signs };
    }

    _handleSolve(skipHistorySave = false) {
        const btn = document.getElementById('solveBtn');
        if (btn) { btn.disabled = true; btn.classList.add('btn--running'); }
        this.view.renderLoading();

        setTimeout(() => {
            try {
                const objective = this._buildObjective();
                const { constraints, bounds, signs } = this._buildConstraintsAndBounds();
                const solveObjective = objective;
                console.log('Objective:', objective, this.state.optimizationType);
                console.log('Constraints:', constraints, 'Bounds:', bounds, 'Signs:', signs);

                let intResult = null;
                if (true) {
                    intResult = SimplexModel.solveInteger(solveObjective, constraints, bounds, signs, this.state.optimizationType);
                    console.log('Integer result:', intResult.status, intResult.integerPlan, 'Z=', intResult.integerZ);
                }

                const result = intResult.relaxedResult || intResult;

                this.view.renderResult(result, intResult, objective, this.state.optimizationType);

                if (result.status === 'success' && !skipHistorySave) {
                    SimplexModel.saveToHistory({
                        trainTypes: [...this.state.trainTypes],
                        wagonTypes: [...this.state.wagonTypes],
                        tableData: this.state.tableData.map(r => [...r]),
                        parkData: [...this.state.parkData],
                        constraintSigns: [...this.state.constraintSigns],
                        extraConstraints: JSON.parse(JSON.stringify(this.state.extraConstraints)),
                        objective,
                        optimizationType: this.state.optimizationType,
                        maxZ: result.maxZ,
                        optimalPlan: result.optimalPlan,
                        integerZ: intResult && intResult.status === 'success' ? intResult.integerZ : null,
                        integerPlan: intResult && intResult.status === 'success' ? intResult.integerPlan : null,
                    });
                }
            } catch (err) {
                console.error('Помилка:', err);
                this.view.main.innerHTML = `
                    <div class="error-wrap">
                        <div class="error-icon">⚠</div>
                        <p>Помилка: ${err.message}</p>
                    </div>`;
            } finally {
                const solveBtn = document.getElementById('solveBtn');
                if (solveBtn) { solveBtn.disabled = false; solveBtn.classList.remove('btn--running'); }
            }
        }, 350);
    }

    _showHistory() {
        const data = SimplexModel.loadHistory();
        this.view.renderHistoryPanel(
            data,
            null,
            () => { SimplexModel.clearHistory(); },
            (idx) => {
                const entry = data[idx];
                if (entry) {
                    if (entry.trainTypes) this.state.trainTypes = entry.trainTypes;
                    if (entry.wagonTypes) this.state.wagonTypes = entry.wagonTypes;
                    if (entry.tableData) this.state.tableData = entry.tableData;
                    if (entry.parkData) this.state.parkData = entry.parkData;
                    if (entry.objective) this.state.objectiveCoeffs = entry.objective;
                    if (entry.constraintSigns) this.state.constraintSigns = entry.constraintSigns;
                    if (entry.extraConstraints) this.state.extraConstraints = entry.extraConstraints;
                    if (entry.optimizationType) this.state.optimizationType = entry.optimizationType;
                }
                this._render();
                this._handleSolve(true);
            }
        );
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const view = new SimplexView();
    const controller = new SimplexController(view);
    controller.init();
});