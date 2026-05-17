window.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('bgCanvas');
    const ctx = canvas.getContext('2d');

    const config = {
        cellSize: 24,        // Розмір клітинки
        padding: 1,          // Відступ між зірками
        bgColor: '#ffffff',  // Глибокий колір фону
        shapeBend: 0.9,      // Впуклість ромба (0.0 = зірка, 0.9 = коло)

        // --- НАЛАШТУВАННЯ КАРТИ ТА ПАЛІТРИ ---
        palette: ['#000000', '#00a2ff', '#34e65a', '#f7e81e', '#f75110'], // Палітра висот
        waterColor: '#ffffff', // Колір для океанів

        defaultMapScale: 0.0007, // Стандартний масштаб, якщо не вказаний для країни
        zoomOutAdd: 0.0009,       // GTA-ефект: наскільки сильно віддалятись під час перельоту
        maxZoomOutScale: 0.003,   // Масштаб при першому старті сайту (найбільше віддалення)
        waterThreshold: 12,      // Поріг рівня моря (0-255). Зменшено, щоб не зрізати низовини

        mapMaxBrightness: 120,

        // --- НОВІ ФІЧІ (ДЕТАЛІЗАЦІЯ ТА ДИНАМІКА СУШІ) ---
        elevationCurve: 0.9,    // Логарифмічний розподіл (менше 1.0 = виділяє більше кольорів для низовин)
        noiseAmount: 0.08,      // Мікро-шум/Мозаїка (0.0 до 0.2)

        dynamicSize: true,      // Чи змінювати розмір від висоти
        minSizeRatio: 0.8,      // Розмір найнижчої точки суші (20% від розміру клітинки)

        dynamicBend: true,      // Чи змінювати форму від висоти
        minBend: 0.0,           // Форма низовини (0.9 = коло)
        maxBend: 0.9,           // Форма гір (0.0 = гостра зірка)

        // --- НАЛАШТУВАННЯ ЗГЛАДЖУВАННЯ ТА ОПТИМІЗАЦІЇ ---
        smoothingLevel: 2,          // Параметр збережено, але двигун тепер використовує SAT (ідеальне згладжування O(1))

        colorUpdateInterval: 30,     // Як часто зірка "дивиться" на карту (в мілісекундах).
        colorTransitionSpeed: 0.1,   // Швидкість плавного перетікання кольору (від 0.01 до 1.0)

        // --- СТУПЕНІ ЗМІНИ КОЛЬОРУ (Квантування) ---
        colorSteps: 50,       // Ступені зміни кольору (0 = плавний градієнт)
        alphaSteps: 3,       // Ступені зміни прозорості

        minAlpha: 0.6,       // Прозорість найнижчої точки суші (низовини)
        maxAlpha: 1.0,       // Прозорість найвищої точки (гори)
        waterAlpha: 0.3,     // Прозорість зірок води

        // --- РОЗУМНЕ ПЕРЕМІЩЕННЯ КАМЕРИ (АВТОПІЛОТ) ---
        moveDuration: 15000,     // Час перельоту між містами (15 сек)
        idleDuration: 30000,     // Час зупинки на локації (30 сек)
        wobbleSpeed: 0.0001,    // Швидкість мікро-руху ("дихання") під час зупинки
        wobbleRadius: 0.002,     // Радіус цього мікро-руху

        // Цікаві локації для автопілота (довгота, широта, масштаб)
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

    let currentCellSize = config.cellSize;
    let currentMapScale = config.defaultMapScale;

    const CACHE_STEPS = 20;
    let shapeCaches = [];
    let spriteCache = new Map();

    function hexToRgb(hex) {
        let r = 0, g = 0, b = 0;
        if (hex.length === 4) {
            r = parseInt(hex[1] + hex[1], 16); g = parseInt(hex[2] + hex[2], 16); b = parseInt(hex[3] + hex[3], 16);
        } else if (hex.length === 7) {
            r = parseInt(hex.substring(1, 3), 16); g = parseInt(hex.substring(3, 5), 16); b = parseInt(hex.substring(5, 7), 16);
        }
        return [r, g, b];
    }

    const parsedPalette = config.palette.map(hexToRgb);
    const parsedWaterColor = hexToRgb(config.waterColor);

    function lerp(start, end, amt) {
        return (1 - amt) * start + amt * end;
    }

    function interpolateColorRGB(color1, color2, factor) {
        return [
            Math.round(lerp(color1[0], color2[0], factor)),
            Math.round(lerp(color1[1], color2[1], factor)),
            Math.round(lerp(color1[2], color2[2], factor))
        ];
    }

    const EarthModule = (function () {
        let imageData = null;
        let sumAreaTable = null;
        let imgWidth = 0;
        let imgHeight = 0;
        let isLoaded = false;

        function getSum(x1, y1, x2, y2) {
            x1 = Math.max(0, Math.min(imgWidth - 1, Math.round(x1)));
            y1 = Math.max(0, Math.min(imgHeight - 1, Math.round(y1)));
            x2 = Math.max(0, Math.min(imgWidth - 1, Math.round(x2)));
            y2 = Math.max(0, Math.min(imgHeight - 1, Math.round(y2)));

            if (x1 > x2) { let t = x1; x1 = x2; x2 = t; }
            if (y1 > y2) { let t = y1; y1 = y2; y2 = t; }

            let a = sumAreaTable[y2 * imgWidth + x2];
            let b = (x1 > 0) ? sumAreaTable[y2 * imgWidth + (x1 - 1)] : 0;
            let c = (y1 > 0) ? sumAreaTable[(y1 - 1) * imgWidth + x2] : 0;
            let d = (x1 > 0 && y1 > 0) ? sumAreaTable[(y1 - 1) * imgWidth + (x1 - 1)] : 0;

            return a - b - c + d;
        }

        function getWrappedAreaSum(x1, y1, w, h) {
            let ix1 = Math.round(x1);
            let iy1 = Math.round(y1);
            let iw = Math.max(1, Math.round(w));
            let ih = Math.max(1, Math.round(h));

            let iy2 = iy1 + ih - 1;

            ix1 = ((ix1 % imgWidth) + imgWidth) % imgWidth;
            let rx2 = ix1 + iw - 1;

            if (rx2 >= imgWidth) {
                let sum1 = getSum(ix1, iy1, imgWidth - 1, iy2);
                let sum2 = getSum(0, iy1, rx2 - imgWidth, iy2);
                return { sum: sum1 + sum2, area: iw * ih };
            } else {
                return { sum: getSum(ix1, iy1, rx2, iy2), area: iw * ih };
            }
        }

        return {
            load: function (url, callback) {
                const img = new Image();
                img.crossOrigin = "Anonymous";

                img.onload = function () {
                    const offscreen = document.createElement('canvas');
                    offscreen.width = img.width;
                    offscreen.height = img.height;
                    const offCtx = offscreen.getContext('2d', { willReadFrequently: true });
                    offCtx.drawImage(img, 0, 0);

                    imageData = offCtx.getImageData(0, 0, img.width, img.height).data;
                    imgWidth = img.width;
                    imgHeight = img.height;

                    sumAreaTable = new Float64Array(imgWidth * imgHeight);
                    for (let y = 0; y < imgHeight; y++) {
                        for (let x = 0; x < imgWidth; x++) {
                            let val = imageData[(y * imgWidth + x) * 4];
                            let sum = val;
                            if (x > 0) sum += sumAreaTable[y * imgWidth + (x - 1)];
                            if (y > 0) sum += sumAreaTable[(y - 1) * imgWidth + x];
                            if (x > 0 && y > 0) sum -= sumAreaTable[(y - 1) * imgWidth + (x - 1)];
                            sumAreaTable[y * imgWidth + x] = sum;
                        }
                    }

                    isLoaded = true;
                    if (callback) callback();
                };

                img.onerror = function () {
                    const loadingScreen = document.getElementById('loading');
                    if (loadingScreen) {
                        loadingScreen.style.color = '#ff0000';
                        loadingScreen.innerHTML = `Не вдалося завантажити карту.<br>Переконайтеся, що файл з назвою <b>${url}</b> знаходиться у тій самій папці.`;
                    }
                };

                img.src = url;
            },
            getAspect: function () {
                if (!isLoaded || imgWidth === 0) return 0.5;
                return imgHeight / imgWidth;
            },
            isReady: function () { return isLoaded; },

            getElevation: function (x, y) {
                if (!isLoaded) return 0;

                let nx = x - Math.floor(x);
                if (nx < 0) nx += 1.0;

                let realX = nx * imgWidth;
                let realY = y * imgWidth;

                let footprint = currentMapScale * imgWidth;
                let startX = realX - footprint / 2;
                let startY = realY - footprint / 2;

                let { sum, area } = getWrappedAreaSum(startX, startY, footprint, footprint);
                let finalBrightness = area > 0 ? sum / area : 0;

                if (finalBrightness <= config.waterThreshold) return 0;

                let mapped = (finalBrightness - config.waterThreshold) / (config.mapMaxBrightness - config.waterThreshold);
                return Math.max(0, Math.min(1, mapped));
            }
        };
    })();

    let grid = [];
    let gridCols = 0;
    let gridRows = 0;

    function buildShapePath() {
        shapeCaches = [];
        for (let i = 0; i < CACHE_STEPS; i++) {
            let elev = i / (CACHE_STEPS - 1);
            let p = new Path2D();

            let sizeRatio = config.dynamicSize ? lerp(config.minSizeRatio, 1.0, elev) : 1.0;
            let currentRadius = Math.max(1, (currentCellSize * sizeRatio - config.padding)) / 2;

            let bend = config.dynamicBend ? lerp(config.minBend, config.maxBend, elev) : config.shapeBend;

            p.moveTo(0, -currentRadius);
            p.quadraticCurveTo(currentRadius * bend, -currentRadius * bend, currentRadius, 0);
            p.quadraticCurveTo(currentRadius * bend, currentRadius * bend, 0, currentRadius);
            p.quadraticCurveTo(-currentRadius * bend, currentRadius * bend, -currentRadius, 0);
            p.quadraticCurveTo(-currentRadius * bend, -currentRadius * bend, 0, -currentRadius);
            p.closePath();

            shapeCaches.push(p);
        }
    }

    function getSprite(r, g, b, alpha, shapeIndex) {
        let rq = r & 0xF8;
        let gq = g & 0xF8;
        let bq = b & 0xF8;
        let aq = Math.round(alpha * 10);

        let key = (rq << 20) | (gq << 12) | (bq << 4) | aq;
        let subCache = spriteCache.get(key);

        if (!subCache) {
            subCache = new Array(CACHE_STEPS);
            spriteCache.set(key, subCache);
        }

        if (!subCache[shapeIndex]) {
            const off = document.createElement('canvas');
            off.width = Math.ceil(currentCellSize) + 2;
            off.height = Math.ceil(currentCellSize) + 2;
            const octx = off.getContext('2d', { alpha: true });

            octx.fillStyle = `rgba(${rq},${gq},${bq},${aq / 10})`;
            octx.translate(off.width / 2, off.height / 2);
            octx.fill(shapeCaches[shapeIndex]);

            subCache[shapeIndex] = off;
        }
        return subCache[shapeIndex];
    }

    function initGrid() {
        gridCols = Math.ceil(window.innerWidth / currentCellSize);
        gridRows = Math.ceil(window.innerHeight / currentCellSize);
        grid = [];

        for (let row = 0; row < gridRows; row++) {
            let rArray = [];
            for (let col = 0; col < gridCols; col++) {
                rArray.push({
                    cx: col * currentCellSize + currentCellSize / 2,
                    cy: row * currentCellSize + currentCellSize / 2,
                    currentColor: [...parsedWaterColor],
                    targetColor: [...parsedWaterColor],
                    currentAlpha: config.waterAlpha,
                    targetAlpha: config.waterAlpha,

                    processedElev: 0,
                    baseNoise: (Math.random() - 0.5) * config.noiseAmount,
                    lastUpdate: Math.random() * config.colorUpdateInterval
                });
            }
            grid.push(rArray);
        }
    }

    function resize() {
        const dpr = window.devicePixelRatio || 1;
        const referenceWidth = 1920;
        const scaleFactor = window.innerWidth / referenceWidth;

        currentCellSize = Math.max(3, config.cellSize * scaleFactor);
        spriteCache.clear();

        canvas.width = window.innerWidth * dpr;
        canvas.height = window.innerHeight * dpr;

        canvas.style.width = `${window.innerWidth}px`;
        canvas.style.height = `${window.innerHeight}px`;

        buildShapePath();
        initGrid();
    }

    window.addEventListener('resize', resize);
    resize();

    let camState = 'INIT';
    let stateStartTime = 0;
    let isInitialFly = true;
    let currentTargetIndex = 0;

    let baseCamX = 0, baseCamY = 0;
    let startCamX = 0, startCamY = 0;
    let targetCamX = 0, targetCamY = 0;

    let startScale = config.defaultMapScale;
    let targetScale = config.defaultMapScale;

    let finalCamX = 0, finalCamY = 0;
    let lastLogTime = 0;
    let lastCountry = null;

    function getCoordsFromLonLat(lon, lat, aspect) {
        let x = (lon + 180) / 360;
        let y = (90 - lat) / 180 * aspect;
        return { x, y };
    }

    function pickNextTarget(aspect) {
        const pts = config.pointsOfInterest;

        if (pts.length > 1) {
            let nextIndex;
            do {
                nextIndex = Math.floor(Math.random() * pts.length);
            } while (nextIndex === currentTargetIndex);

            currentTargetIndex = nextIndex;
            const pt = pts[currentTargetIndex];

            console.log(`Зміна курсу! Наступна зупинка: ${pt.name}`);
            const coords = getCoordsFromLonLat(pt.lon, pt.lat, aspect);
            targetCamX = coords.x;
            targetCamY = coords.y;
            targetScale = pt.scale || config.defaultMapScale;

        } else if (pts.length === 0) {
            targetCamX = Math.random();
            targetCamY = Math.random() * aspect;
            targetScale = config.defaultMapScale;
        }

        let diffX = targetCamX - baseCamX;
        if (diffX > 0.5) targetCamX -= 1.0;
        if (diffX < -0.5) targetCamX += 1.0;
    }

    function easeInOutCubic(x) {
        return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    }

    function animate(timestamp) {
        if (!timestamp) timestamp = 0;
        const w = window.innerWidth;
        const h = window.innerHeight;
        const dpr = window.devicePixelRatio || 1;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = config.bgColor;
        ctx.fillRect(0, 0, w, h);

        const aspect = EarthModule.getAspect();

        if (camState === 'INIT') {
            if (EarthModule.isReady()) {
                currentTargetIndex = 0;
                let startPoint = config.pointsOfInterest.length > 0 ? config.pointsOfInterest[0] : { lon: 30, lat: 50, scale: config.defaultMapScale };
                let coords = getCoordsFromLonLat(startPoint.lon, startPoint.lat, aspect);

                baseCamX = coords.x;
                baseCamY = coords.y;
                startCamX = coords.x;
                startCamY = coords.y;
                targetCamX = coords.x;
                targetCamY = coords.y;

                startScale = config.maxZoomOutScale;
                targetScale = startPoint.scale || config.defaultMapScale;
                currentMapScale = startScale;

                isInitialFly = true;
                camState = 'MOVING';
                stateStartTime = timestamp;
            }
        } else {
            let timeInState = timestamp - stateStartTime;

            if (camState === 'MOVING') {
                let progress = timeInState / config.moveDuration;
                if (progress >= 1.0) {
                    progress = 1.0;
                    camState = 'IDLE';
                    stateStartTime = timestamp;
                    baseCamX = targetCamX;
                    baseCamY = targetCamY;
                    currentMapScale = targetScale;
                    isInitialFly = false;
                }

                let ease = easeInOutCubic(progress);

                baseCamX = startCamX + (targetCamX - startCamX) * ease;
                baseCamY = startCamY + (targetCamY - startCamY) * ease;

                let baseZoom = lerp(startScale, targetScale, ease);

                if (isInitialFly) {
                    currentMapScale = baseZoom;
                } else {
                    let zoomOutFactor = Math.sin(progress * Math.PI);
                    currentMapScale = baseZoom + (zoomOutFactor * config.zoomOutAdd);
                }

            } else if (camState === 'IDLE') {
                if (config.pointsOfInterest.length > 1 || config.pointsOfInterest.length === 0) {
                    if (timeInState >= config.idleDuration) {
                        camState = 'MOVING';
                        stateStartTime = timestamp;

                        baseCamX = baseCamX - Math.floor(baseCamX);
                        startCamX = baseCamX;
                        startCamY = baseCamY;
                        startScale = currentMapScale;

                        pickNextTarget(aspect);
                    }
                }
            }
        }

        finalCamX = baseCamX + Math.sin(timestamp * config.wobbleSpeed) * config.wobbleRadius;
        finalCamY = baseCamY + Math.cos(timestamp * config.wobbleSpeed * 0.8) * config.wobbleRadius;

        const visibleY = gridRows * currentMapScale;
        if (visibleY > aspect) {
            finalCamY = (aspect - visibleY) / 2;
        } else {
            if (finalCamY < 0) finalCamY = 0;
            if (finalCamY + visibleY > aspect) finalCamY = aspect - visibleY;
        }

        for (let row = 0; row < gridRows; row++) {
            for (let col = 0; col < gridCols; col++) {
                const cell = grid[row][col];

                if (EarthModule.isReady() && (timestamp - cell.lastUpdate > config.colorUpdateInterval)) {
                    const mapX = (col * currentMapScale) + finalCamX - (gridCols * currentMapScale) / 2;
                    const mapY = (row * currentMapScale) + finalCamY - (gridRows * currentMapScale) / 2;

                    let rawElevation = EarthModule.getElevation(mapX, mapY);

                    if (rawElevation === 0) {
                        cell.targetColor = [...parsedWaterColor];
                        cell.targetAlpha = config.waterAlpha;
                        cell.processedElev = 0;
                    } else {
                        let elev = Math.pow(rawElevation, config.elevationCurve);
                        elev = Math.max(0.01, Math.min(1.0, elev + cell.baseNoise));
                        cell.processedElev = elev;

                        let colorElev = elev;
                        if (config.colorSteps > 0) {
                            colorElev = Math.min(Math.floor(colorElev * config.colorSteps), config.colorSteps - 1) / (config.colorSteps > 1 ? config.colorSteps - 1 : 1);
                        }

                        const maxIdx = parsedPalette.length - 1;
                        const scaledProgress = colorElev * maxIdx;
                        const index1 = Math.floor(scaledProgress);
                        const index2 = Math.min(index1 + 1, maxIdx);
                        const factor = scaledProgress - index1;

                        cell.targetColor = interpolateColorRGB(parsedPalette[index1], parsedPalette[index2], factor);

                        let alphaElev = elev;
                        if (config.alphaSteps > 0) {
                            alphaElev = Math.min(Math.floor(alphaElev * config.alphaSteps), config.alphaSteps - 1) / (config.alphaSteps > 1 ? config.alphaSteps - 1 : 1);
                        }
                        cell.targetAlpha = config.minAlpha + (alphaElev * (config.maxAlpha - config.minAlpha));
                    }
                    cell.lastUpdate = timestamp;
                }

                cell.currentColor[0] = lerp(cell.currentColor[0], cell.targetColor[0], config.colorTransitionSpeed);
                cell.currentColor[1] = lerp(cell.currentColor[1], cell.targetColor[1], config.colorTransitionSpeed);
                cell.currentColor[2] = lerp(cell.currentColor[2], cell.targetColor[2], config.colorTransitionSpeed);
                cell.currentAlpha = lerp(cell.currentAlpha, cell.targetAlpha, config.colorTransitionSpeed);

                let shapeIndex = 0;
                if (cell.processedElev > 0) {
                    shapeIndex = Math.round(cell.processedElev * (CACHE_STEPS - 1));
                    shapeIndex = Math.max(0, Math.min(CACHE_STEPS - 1, shapeIndex));
                }

                let sprite = getSprite(
                    cell.currentColor[0],
                    cell.currentColor[1],
                    cell.currentColor[2],
                    cell.currentAlpha,
                    shapeIndex
                );

                let drawX = Math.round(cell.cx - sprite.width / 2);
                let drawY = Math.round(cell.cy - sprite.height / 2);

                ctx.drawImage(sprite, drawX, drawY);
            }
        }

        // if (EarthModule.isReady() && timestamp - lastLogTime > 5000 && camState === 'IDLE') {
        //     lastLogTime = timestamp;

        //     let normX = finalCamX - Math.floor(finalCamX);
        //     if (normX < 0) normX += 1.0;
        //     const lon = normX * 360 - 180;

        //     let lat = 90 - (finalCamY / aspect) * 180;
        //     lat = Math.max(-90, Math.min(90, lat));

        //     fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=3&accept-language=uk`)
        //         .then(res => res.json())
        //         .then(data => {
        //             if (data && data.address && data.address.country) {
        //                 if (lastCountry !== data.address.country) {
        //                     console.log(`Зависли над: %c${data.address.country}`, 'color: #ff0000; font-weight: bold;');
        //                     lastCountry = data.address.country;
        //                 }
        //             }
        //         })
        //         .catch(err => { });
        // }

        requestAnimationFrame(animate);
    }

    const localMapFile = './earth_map.png';

    EarthModule.load(localMapFile, function () {
        const loadingScreen = document.getElementById('loading');
        if (loadingScreen) {
            loadingScreen.style.opacity = '0';
            setTimeout(() => loadingScreen.style.display = 'none', 500);
        }

        requestAnimationFrame(animate);
    });
});