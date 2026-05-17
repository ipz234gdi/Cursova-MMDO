window.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('bgCanvas');
    const ctx = canvas.getContext('2d', { alpha: false });

    const config = {
        cellSize: 28,
        padding: 1,
        bgColor: '#ffffff',
        shapeBend: 0.9,

        palette: ['#000000', '#00a2ff', '#34e65a', '#f7e81e', '#f75110'],
        waterColor: '#ffffff',

        defaultMapScale: 0.0007,
        zoomOutAdd: 0.0009,
        maxZoomOutScale: 0.003,
        waterThreshold: 12,
        mapMaxBrightness: 100,

        elevationCurve: 0.99,
        noiseAmount: 0.08,

        dynamicSize: true,
        minSizeRatio: 0.9,
        dynamicBend: true,
        minBend: 0.0,
        maxBend: 0.9,

        colorUpdateInterval: 10,
        colorTransitionSpeed: 0.8,
        colorSteps: 15,
        alphaSteps: 3,
        minAlpha: 0.6,
        maxAlpha: 1.0,
        waterAlpha: 0.3,

        moveDuration: 15000,
        idleDuration: 20000,
        wobbleSpeed: 0.0001,
        wobbleRadius: 0.002,

        pointsOfInterest: [
            { name: "Київ, Україна", lon: 30.52, lat: 50.45, scale: 0.0007 },
            { name: "Гора Еверест", lon: 86.92, lat: 27.98 },
            { name: "Гранд-Каньйон", lon: -112.11, lat: 36.10 },
            { name: "Гора Фудзіяма", lon: 138.72, lat: 35.36 },
            { name: "Альпи", lon: 10.45, lat: 46.43 },
            { name: "Амазонські ліси", lon: -60.00, lat: -15.00 },
            { name: "Мадагаскар", lon: 46.86, lat: -18.76 },
            { name: "Ісландія", lon: -19.02, lat: 64.96 },
            { name: "Нова Зеландія", lon: 174.88, lat: -40.90 },
            { name: "Японія", lon: 135.25, lat: 36.20, scale: 0.0007 },
        ]
    };

    // ─── УТИЛІТИ ──────────────────────────────────────────────────────────────

    function hexToRgb(hex) {
        const n = parseInt(hex.slice(1), 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }

    const parsedPalette = config.palette.map(hexToRgb);
    const [wR, wG, wB] = hexToRgb(config.waterColor);
    const waterSameAsBg = config.waterColor.toLowerCase() === config.bgColor.toLowerCase();

    const CS = Math.max(1, config.colorSteps);
    const CLR = new Uint8Array(CS), CLG = new Uint8Array(CS), CLB = new Uint8Array(CS);
    {
        const pmx = parsedPalette.length - 1;
        for (let s = 0; s < CS; s++) {
            const t = (CS > 1 ? s / (CS - 1) : 0) * pmx;
            const i1 = t | 0, i2 = Math.min(i1 + 1, pmx), f = t - i1;
            const p1 = parsedPalette[i1], p2 = parsedPalette[i2];
            CLR[s] = (p1[0] + (p2[0] - p1[0]) * f + 0.5) | 0;
            CLG[s] = (p1[1] + (p2[1] - p1[1]) * f + 0.5) | 0;
            CLB[s] = (p1[2] + (p2[2] - p1[2]) * f + 0.5) | 0;
        }
    }
    const AS = Math.max(1, config.alphaSteps);
    const ALUT = new Float32Array(AS);
    for (let s = 0; s < AS; s++)
        ALUT[s] = config.minAlpha + (AS > 1 ? s / (AS - 1) : 0) * (config.maxAlpha - config.minAlpha);

    const TS = config.colorTransitionSpeed;
    const ITS = 1 - TS;
    const wA = config.waterAlpha;
    const EC = config.elevationCurve;
    const CI = config.colorUpdateInterval;


    const CACHE_STEPS = 20;
    const CS1 = CACHE_STEPS - 1;
    let shapeCaches = [];
    const spriteCache = new Map();
    let currentCellSize = config.cellSize;
    let currentMapScale = config.defaultMapScale;
    const hasOffscreen = typeof OffscreenCanvas !== 'undefined';

    function buildShapePath() {
        shapeCaches = [];
        for (let i = 0; i < CACHE_STEPS; i++) {
            const elev = i / CS1;
            const p = new Path2D();
            const sizeRatio = config.dynamicSize
                ? config.minSizeRatio + (1 - config.minSizeRatio) * elev : 1;
            const r = Math.max(1, (currentCellSize * sizeRatio - config.padding)) / 2;
            const bend = config.dynamicBend
                ? config.minBend + (config.maxBend - config.minBend) * elev
                : config.shapeBend;
            p.moveTo(0, -r);
            p.quadraticCurveTo(r * bend, -r * bend, r, 0);
            p.quadraticCurveTo(r * bend, r * bend, 0, r);
            p.quadraticCurveTo(-r * bend, r * bend, -r, 0);
            p.quadraticCurveTo(-r * bend, -r * bend, 0, -r);
            p.closePath();
            shapeCaches.push(p);
        }
    }

    function getSprite(r, g, b, alpha, si) {
        const rq = r & 0xF8, gq = g & 0xF8, bq = b & 0xF8;
        const aq = (alpha * 10 + 0.5) | 0;
        const key = ((rq >> 3) << 14) | ((gq >> 3) << 9) | ((bq >> 3) << 4) | aq;

        let sub = spriteCache.get(key);
        if (!sub) { sub = new Array(CACHE_STEPS); spriteCache.set(key, sub); }

        let sprite = sub[si];
        if (!sprite) {
            const sz = (currentCellSize + 2.5) | 0;
            let oc, octx;
            if (hasOffscreen) {
                oc = new OffscreenCanvas(sz, sz);
                octx = oc.getContext('2d');
            } else {
                oc = document.createElement('canvas');
                oc.width = oc.height = sz;
                octx = oc.getContext('2d');
            }
            octx.fillStyle = `rgba(${rq},${gq},${bq},${aq / 10})`;
            octx.translate(sz / 2, sz / 2);
            octx.fill(shapeCaches[si]);
            sub[si] = sprite = oc;
        }
        return sprite;
    }

    const STRIDE = 13;
    const I_CX = 0, I_CY = 1,
        I_CR = 2, I_CG = 3, I_CB = 4, I_CA = 5,
        I_TR = 6, I_TG = 7, I_TB = 8, I_TA = 9,
        I_EL = 10, I_NO = 11, I_LU = 12;

    let gridData = null, gridCols = 0, gridRows = 0;

    function initGrid() {
        gridCols = Math.ceil(window.innerWidth / currentCellSize);
        gridRows = Math.ceil(window.innerHeight / currentCellSize);
        gridData = new Float32Array(gridCols * gridRows * STRIDE);
        const half = currentCellSize / 2;
        const noiseAmt = config.noiseAmount;
        for (let row = 0; row < gridRows; row++) {
            const cy = row * currentCellSize + half;
            for (let col = 0; col < gridCols; col++) {
                const b = (row * gridCols + col) * STRIDE;
                gridData[b + I_CX] = col * currentCellSize + half;
                gridData[b + I_CY] = cy;
                gridData[b + I_CR] = gridData[b + I_TR] = wR;
                gridData[b + I_CG] = gridData[b + I_TG] = wG;
                gridData[b + I_CB] = gridData[b + I_TB] = wB;
                gridData[b + I_CA] = gridData[b + I_TA] = wA;
                gridData[b + I_EL] = 0;
                gridData[b + I_NO] = (Math.random() - 0.5) * noiseAmt;
                gridData[b + I_LU] = Math.random() * CI;
            }
        }
    }

    function resize() {
        currentCellSize = Math.max(3, config.cellSize * window.innerWidth / 1920);
        spriteCache.clear();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = window.innerWidth * dpr;
        canvas.height = window.innerHeight * dpr;
        canvas.style.cssText = `width:${window.innerWidth}px;height:${window.innerHeight}px`;
        buildShapePath();
        initGrid();
    }
    window.addEventListener('resize', resize);
    resize();

    const EarthModule = (() => {
        let sat = null;
        let iW = 0, iH = 0, loaded = false;
        const wt = config.waterThreshold, mb = config.mapMaxBrightness;

        function sat2D(x1, y1, x2, y2) {
            x1 = Math.max(0, Math.min(iW - 1, (x1 + 0.5) | 0));
            y1 = Math.max(0, Math.min(iH - 1, (y1 + 0.5) | 0));
            x2 = Math.max(0, Math.min(iW - 1, (x2 + 0.5) | 0));
            y2 = Math.max(0, Math.min(iH - 1, (y2 + 0.5) | 0));
            if (x1 > x2) { const t = x1; x1 = x2; x2 = t; }
            if (y1 > y2) { const t = y1; y1 = y2; y2 = t; }
            return sat[y2 * iW + x2]
                - (x1 > 0 ? sat[y2 * iW + x1 - 1] : 0)
                - (y1 > 0 ? sat[(y1 - 1) * iW + x2] : 0)
                + (x1 > 0 && y1 > 0 ? sat[(y1 - 1) * iW + x1 - 1] : 0);
        }

        return {
            load(url, cb) {
                const img = new Image();
                img.crossOrigin = 'Anonymous';
                img.onload = () => {
                    const oc = document.createElement('canvas');
                    oc.width = img.width; oc.height = img.height;
                    const octx = oc.getContext('2d', { willReadFrequently: true });
                    octx.drawImage(img, 0, 0);
                    const px = octx.getImageData(0, 0, img.width, img.height).data;
                    iW = img.width; iH = img.height;
                    sat = new Float64Array(iW * iH);
                    for (let y = 0; y < iH; y++) {
                        for (let x = 0; x < iW; x++) {
                            const i = y * iW + x;
                            let v = px[i * 4];
                            if (x > 0) v += sat[i - 1];
                            if (y > 0) v += sat[i - iW];
                            if (x > 0 && y > 0) v -= sat[i - iW - 1];
                            sat[i] = v;
                        }
                    }
                    loaded = true;
                    if (cb) cb();
                };
                img.onerror = () => {
                    const el = document.getElementById('loading');
                    if (el) { el.style.color = '#f00'; el.innerHTML = `Не вдалося завантажити карту: <b>${url}</b>`; }
                };
                img.src = url;
            },
            getAspect() { return loaded && iW ? iH / iW : 0.5; },
            isReady() { return loaded; },

            getElevation(x, y) {
                if (!loaded) return 0;
                let nx = x - (x | 0); if (nx < 0) nx += 1;
                const fp = Math.max(1, (currentMapScale * iW + 0.5) | 0);
                const rx = (nx * iW + 0.5) | 0;
                const ry = (y * iW + 0.5) | 0;
                const sx = rx - (fp >> 1);
                const sy = ry - (fp >> 1);
                const iy2 = Math.min(iH - 1, sy + fp - 1);
                const ix1 = ((sx % iW) + iW) % iW;
                const rx2 = ix1 + fp - 1;
                const area = fp * fp;
                const sum = rx2 >= iW
                    ? sat2D(ix1, sy, iW - 1, iy2) + sat2D(0, sy, rx2 - iW, iy2)
                    : sat2D(ix1, sy, rx2, iy2);
                const bright = sum / area;
                if (bright <= wt) return 0;
                return Math.max(0, Math.min(1, (bright - wt) / (mb - wt)));
            }
        };
    })();

    // ─── КАМЕРА ───────────────────────────────────────────────────────────────

    let camState = 'INIT', stateStartTime = 0, isInitialFly = true, currentTargetIndex = 0;
    let baseCamX = 0, baseCamY = 0, startCamX = 0, startCamY = 0;
    let targetCamX = 0, targetCamY = 0;
    let startScale = config.defaultMapScale, targetScale = config.defaultMapScale;

    function lonLatToXY(lon, lat, aspect) {
        return { x: (lon + 180) / 360, y: (90 - lat) / 180 * aspect };
    }

    function easeInOutCubic(x) {
        return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(2 - 2 * x, 3) / 2;
    }

    function pickNextTarget(aspect) {
        const pts = config.pointsOfInterest;
        if (!pts.length) {
            targetCamX = Math.random(); targetCamY = Math.random() * aspect;
            targetScale = config.defaultMapScale; return;
        }
        let ni;
        do { ni = (Math.random() * pts.length) | 0; } while (ni === currentTargetIndex && pts.length > 1);
        currentTargetIndex = ni;
        const pt = pts[ni];
        console.log(`→ ${pt.name}`);
        const c = lonLatToXY(pt.lon, pt.lat, aspect);
        targetCamX = c.x; targetCamY = c.y;
        targetScale = pt.scale || config.defaultMapScale;
        const dx = targetCamX - baseCamX;
        if (dx > 0.5) targetCamX -= 1;
        else if (dx < -0.5) targetCamX += 1;
    }

    // ─── ГОЛОВНИЙ ЦИКЛ ────────────────────────────────────────────────────────

    function animate(ts) {
        if (!ts) ts = 0;
        const W = window.innerWidth, H = window.innerHeight;
        const dpr = window.devicePixelRatio || 1;
        const aspect = EarthModule.getAspect();

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = config.bgColor;
        ctx.fillRect(0, 0, W, H);

        if (camState === 'INIT') {
            if (EarthModule.isReady()) {
                currentTargetIndex = 0;
                const sp = config.pointsOfInterest[0] || { lon: 30, lat: 50 };
                const c = lonLatToXY(sp.lon, sp.lat, aspect);
                baseCamX = startCamX = targetCamX = c.x;
                baseCamY = startCamY = targetCamY = c.y;
                startScale = config.maxZoomOutScale;
                targetScale = sp.scale || config.defaultMapScale;
                currentMapScale = startScale;
                isInitialFly = true;
                camState = 'MOVING';
                stateStartTime = ts;
            }
        } else {
            const dt = ts - stateStartTime;
            if (camState === 'MOVING') {
                let p = Math.min(1, dt / config.moveDuration);
                if (p >= 1) {
                    camState = 'IDLE'; stateStartTime = ts;
                    baseCamX = targetCamX; baseCamY = targetCamY;
                    currentMapScale = targetScale; isInitialFly = false;
                } else {
                    const ease = easeInOutCubic(p);
                    baseCamX = startCamX + (targetCamX - startCamX) * ease;
                    baseCamY = startCamY + (targetCamY - startCamY) * ease;
                    const bz = startScale + (targetScale - startScale) * ease;
                    currentMapScale = isInitialFly ? bz : bz + Math.sin(p * Math.PI) * config.zoomOutAdd;
                }
            } else if (camState === 'IDLE' && config.pointsOfInterest.length !== 1 && dt >= config.idleDuration) {
                camState = 'MOVING'; stateStartTime = ts;
                baseCamX -= Math.floor(baseCamX);
                startCamX = baseCamX; startCamY = baseCamY; startScale = currentMapScale;
                pickNextTarget(aspect);
            }
        }

        let finalCamX = baseCamX + Math.sin(ts * config.wobbleSpeed) * config.wobbleRadius;
        let finalCamY = baseCamY + Math.cos(ts * config.wobbleSpeed * 0.8) * config.wobbleRadius;

        const visY = gridRows * currentMapScale;
        if (visY > aspect) finalCamY = (aspect - visY) * 0.5;
        else finalCamY = Math.max(0, Math.min(aspect - visY, finalCamY));

        const gcm = currentMapScale;
        const halfCX = gridCols * gcm * 0.5;
        const halfCY = gridRows * gcm * 0.5;
        const earthOK = EarthModule.isReady();
        const sprSz = (currentCellSize + 2.5) | 0;
        const sprHalf = sprSz * 0.5;

        for (let row = 0; row < gridRows; row++) {
            const mapY = row * gcm + finalCamY - halfCY;
            const rowOff = row * gridCols;

            for (let col = 0; col < gridCols; col++) {
                const b = (rowOff + col) * STRIDE;

                if (earthOK && ts - gridData[b + I_LU] > CI) {
                    const raw = EarthModule.getElevation(col * gcm + finalCamX - halfCX, mapY);
                    if (raw === 0) {
                        gridData[b + I_TR] = wR; gridData[b + I_TG] = wG; gridData[b + I_TB] = wB;
                        gridData[b + I_TA] = wA; gridData[b + I_EL] = 0;
                    } else {
                        let e = Math.pow(raw, EC);
                        e = Math.max(0.01, Math.min(1, e + gridData[b + I_NO]));
                        gridData[b + I_EL] = e;
                        const si = Math.min((e * CS + 0.5) | 0, CS - 1);
                        gridData[b + I_TR] = CLR[si]; gridData[b + I_TG] = CLG[si]; gridData[b + I_TB] = CLB[si];
                        const ai = Math.min((e * AS + 0.5) | 0, AS - 1);
                        gridData[b + I_TA] = ALUT[ai];
                    }
                    gridData[b + I_LU] = ts;
                }

                const cR = gridData[b + I_CR] = gridData[b + I_CR] * ITS + gridData[b + I_TR] * TS;
                const cG = gridData[b + I_CG] = gridData[b + I_CG] * ITS + gridData[b + I_TG] * TS;
                const cB = gridData[b + I_CB] = gridData[b + I_CB] * ITS + gridData[b + I_TB] * TS;
                const cA = gridData[b + I_CA] = gridData[b + I_CA] * ITS + gridData[b + I_TA] * TS;

                if (waterSameAsBg) {
                    const dr = cR - wR, dg = cG - wG, db = cB - wB;
                    if (dr * dr + dg * dg + db * db < 400 && Math.abs(cA - wA) < 0.08) continue;
                }

                const elev = gridData[b + I_EL];
                const si = elev > 0 ? Math.max(0, Math.min(CS1, (elev * CS1 + 0.5) | 0)) : 0;
                ctx.drawImage(
                    getSprite(cR | 0, cG | 0, cB | 0, cA, si),
                    (gridData[b + I_CX] - sprHalf + 0.5) | 0,
                    (gridData[b + I_CY] - sprHalf + 0.5) | 0
                );
            }
        }

        requestAnimationFrame(animate);
    }

    EarthModule.load('./assets/earth_map_v2.jpg', () => {
        const el = document.getElementById('loading');
        if (el) { el.style.opacity = '0'; setTimeout(() => el.style.display = 'none', 500); }
        requestAnimationFrame(animate);
    });
});