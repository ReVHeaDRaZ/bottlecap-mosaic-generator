const fileInput = document.getElementById('fileInput');
const canvas = document.getElementById('canvasOutput');
const ctx = canvas.getContext('2d');
const mosaicCanvas = document.createElement('canvas');
const mosaicCtx = mosaicCanvas.getContext('2d');
const bottleCaps = [];
const MAX_CAPS = 40000;
const MAX_CANVAS_EDGE = 8192;
const MAX_PREVIEW_PIXELS = 24000000;
const MAX_PRINT_PIXELS = 60000000;

let uploadedImage = null;
let mosaicGenerated = false;
let sampledColors = [];
let capColumns = 0;
let capRows = 0;
let renderTimer;
let imageObjectUrl = null;

const controls = {
    gridSize: document.getElementById('gridSize'),
    capSize: document.getElementById('capSize'),
    mosaicShape: document.getElementById('mosaicShape'),
    capShape: document.getElementById('capShape'),
    capSpacing: document.getElementById('capSpacing'),
    backgroundColor: document.getElementById('backgroundColor'),
    showInputImage: document.getElementById('showInputImage')
};

function formatName(filename) {
    return filename
        .replace(/\.[^/.]+$/, '')
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

function setStatus(message, isError = false) {
    const status = document.getElementById('generationStatus');
    status.textContent = message;
    status.classList.toggle('error', isError);
}

function getSelectedCaps() {
    return bottleCaps.filter((cap) => cap.selected);
}

function getAverageColor(data) {
    let red = 0;
    let green = 0;
    let blue = 0;
    let weight = 0;

    for (let index = 0; index < data.length; index += 4) {
        const alpha = data[index + 3] / 255;
        red += data[index] * alpha;
        green += data[index + 1] * alpha;
        blue += data[index + 2] * alpha;
        weight += alpha;
    }

    if (weight === 0) return { r: 0, g: 0, b: 0 };
    return { r: red / weight, g: green / weight, b: blue / weight };
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`Could not load ${src}`));
        image.src = src;
    });
}

async function loadBottleCaps() {
    const response = await fetch('./bottle-caps/bottle_caps.json');
    if (!response.ok) throw new Error(`Cap collection request failed (${response.status})`);
    const filenames = await response.json();
    if (!Array.isArray(filenames) || filenames.length === 0) {
        throw new Error('The cap collection is empty or unavailable.');
    }

    const loadedCaps = await Promise.all(filenames.map(async (filename) => {
        const image = await loadImage(`./bottle-caps/${filename}`);
        const sample = document.createElement('canvas');
        sample.width = image.naturalWidth;
        sample.height = image.naturalHeight;
        const sampleContext = sample.getContext('2d', { willReadFrequently: true });
        sampleContext.drawImage(image, 0, 0);
        const averageColor = getAverageColor(
            sampleContext.getImageData(0, 0, sample.width, sample.height).data
        );

        return {
            filename,
            name: formatName(filename),
            image,
            averageColor,
            selected: true
        };
    }));
    bottleCaps.push(...loadedCaps);
    renderCapInventory();
}

function renderCapInventory() {
    const inventory = document.getElementById('capInventory');
    inventory.replaceChildren();

    bottleCaps.forEach((cap, index) => {
        const label = document.createElement('label');
        label.className = 'cap-option';
        label.title = cap.name;

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = cap.selected;
        checkbox.value = cap.filename;
        checkbox.setAttribute('aria-label', cap.name);
        checkbox.addEventListener('change', () => {
            cap.selected = checkbox.checked;
            updateSelectionSummary();
            scheduleRender();
        });

        const image = document.createElement('img');
        image.src = `./bottle-caps/${cap.filename}`;
        image.alt = '';
        image.loading = index > 15 ? 'lazy' : 'eager';

        const name = document.createElement('span');
        name.className = 'cap-option-name';
        name.textContent = cap.name;

        label.append(checkbox, image, name);
        inventory.append(label);
    });

    document.getElementById('inventoryCount').textContent = `${bottleCaps.length} caps in the collection`;
    updateSelectionSummary();
}

function updateSelectionSummary() {
    const selectedCount = getSelectedCaps().length;
    document.getElementById('capSelectionSummary').textContent =
        `${selectedCount} of ${bottleCaps.length} caps selected`;
    const selectAllButton = document.getElementById('selectAllCaps');
    selectAllButton.textContent = selectedCount === bottleCaps.length ? 'Clear all' : 'Select all';

    if (uploadedImage && selectedCount === 0) {
        mosaicGenerated = false;
        document.getElementById('downloadMosaic').disabled = true;
        document.getElementById('downloadHighResButton').disabled = true;
        canvas.hidden = true;
        document.getElementById('emptyState').hidden = false;
        document.getElementById('previewHeading').textContent = 'Choose at least one cap';
        setStatus('Select a cap to build your mosaic', true);
    }
}

function updateRangeLabels() {
    document.getElementById('gridSizeValue').textContent = controls.gridSize.value;
    document.getElementById('capSizeValue').textContent = controls.capSize.value;
    document.getElementById('capSpacingValue').textContent = controls.capSpacing.value;
    document.getElementById('shapeNote').hidden = controls.mosaicShape.value !== 'circle';
}

function scheduleRender() {
    updateRangeLabels();
    window.clearTimeout(renderTimer);
    renderTimer = window.setTimeout(() => {
        if (uploadedImage) processImage();
    }, 90);
}

function findClosestBottleCap(color, selectedCaps) {
    let bestMatch = selectedCaps[0];
    let smallestDifference = Infinity;

    for (const cap of selectedCaps) {
        const difference =
            Math.abs(cap.averageColor.r - color.r) +
            Math.abs(cap.averageColor.g - color.g) +
            Math.abs(cap.averageColor.b - color.b);
        if (difference < smallestDifference) {
            smallestDifference = difference;
            bestMatch = cap;
        }
    }

    return bestMatch;
}

function drawCap(context, cap, x, y, size, shape) {
    context.save();
    context.beginPath();

    if (shape === 'circle') {
        context.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    } else if (shape === 'hexagon') {
        for (let point = 0; point < 6; point++) {
            const angle = (Math.PI / 3) * point - Math.PI / 6;
            const pointX = x + size / 2 + Math.cos(angle) * size / 2;
            const pointY = y + size / 2 + Math.sin(angle) * size / 2;
            if (point === 0) context.moveTo(pointX, pointY);
            else context.lineTo(pointX, pointY);
        }
        context.closePath();
    } else {
        context.rect(x, y, size, size);
    }

    context.clip();
    context.drawImage(cap.image, x, y, size, size);
    context.restore();

    context.save();
    context.beginPath();
    if (shape === 'circle') {
        context.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    } else if (shape === 'hexagon') {
        for (let point = 0; point < 6; point++) {
            const angle = (Math.PI / 3) * point - Math.PI / 6;
            const pointX = x + size / 2 + Math.cos(angle) * size / 2;
            const pointY = y + size / 2 + Math.sin(angle) * size / 2;
            if (point === 0) context.moveTo(pointX, pointY);
            else context.lineTo(pointX, pointY);
        }
        context.closePath();
    } else {
        context.rect(x, y, size, size);
    }
    context.strokeStyle = 'rgba(24, 28, 24, 0.16)';
    context.lineWidth = Math.max(0.6, size * 0.018);
    context.stroke();
    context.restore();
}

function getCanvasSize(capSize, spacing) {
    const pitch = capSize * (1 + spacing);
    const layout = {
        pitch,
        width: Math.ceil((capColumns - 1) * pitch + capSize),
        height: Math.ceil((capRows - 1) * pitch + capSize)
    };
    if (controls.mosaicShape.value === 'circle') {
        layout.width = Math.max(layout.width, layout.height);
        layout.height = layout.width;
    }
    return layout;
}

function getIncludedCells(capSize, pitch, width, height) {
    const cellIndices = [];
    const isCircle = controls.mosaicShape.value === 'circle';
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 2;

    for (let row = 0; row < capRows; row++) {
        for (let column = 0; column < capColumns; column++) {
            if (isCircle) {
                const x = column * pitch + capSize / 2;
                const y = row * pitch + capSize / 2;
                if (Math.hypot(x - centerX, y - centerY) > radius) continue;
            }
            cellIndices.push(row * capColumns + column);
        }
    }
    return cellIndices;
}

function drawImageInLayout(context, image, width, height) {
    if (controls.mosaicShape.value !== 'circle') {
        context.drawImage(image, 0, 0, width, height);
        return;
    }

    const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
    const sourceX = (image.naturalWidth - sourceSize) / 2;
    const sourceY = (image.naturalHeight - sourceSize) / 2;
    const radius = Math.min(width, height) / 2;
    context.save();
    context.beginPath();
    context.arc(width / 2, height / 2, radius, 0, Math.PI * 2);
    context.clip();
    if (controls.backgroundColor.value !== 'transparent') {
        context.fillStyle = controls.backgroundColor.value;
        context.fillRect(0, 0, width, height);
    }
    context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, width, height);
    context.restore();
}

function paintMosaic(targetCanvas, targetContext, capSize, selectedCaps) {
    const spacing = Number(controls.capSpacing.value) / 100;
    const { pitch, width, height } = getCanvasSize(capSize, spacing);
    targetCanvas.width = width;
    targetCanvas.height = height;
    targetContext.clearRect(0, 0, width, height);

    if (controls.mosaicShape.value === 'circle') {
        targetContext.save();
        targetContext.beginPath();
        targetContext.arc(width / 2, height / 2, Math.min(width, height) / 2, 0, Math.PI * 2);
        targetContext.clip();
    }

    if (controls.backgroundColor.value !== 'transparent') {
        targetContext.fillStyle = controls.backgroundColor.value;
        targetContext.fillRect(0, 0, width, height);
    }

    const capShape = controls.capShape.value;
    const usage = new Map(selectedCaps.map((cap) => [cap.filename, 0]));
    const cells = getIncludedCells(capSize, pitch, width, height);
    for (const index of cells) {
        const color = sampledColors[index];
        const cap = findClosestBottleCap(color, selectedCaps);
        usage.set(cap.filename, usage.get(cap.filename) + 1);
        const column = index % capColumns;
        const row = Math.floor(index / capColumns);
        drawCap(targetContext, cap, column * pitch, row * pitch, capSize, capShape);
    }

    if (controls.mosaicShape.value === 'circle') targetContext.restore();
    return { usage, capCount: cells.length };
}

function getPhysicalDimensions() {
    const diameter = Number(controls.capSize.value);
    const spacing = Number(controls.capSpacing.value) / 100;
    if (controls.mosaicShape.value === 'circle') {
        const width = (capColumns * diameter + (capColumns - 1) * diameter * spacing) / 10;
        return { width, height: width };
    }
    return {
        width: (capColumns * diameter + (capColumns - 1) * diameter * spacing) / 10,
        height: (capRows * diameter + (capRows - 1) * diameter * spacing) / 10
    };
}

function formatDimensions(width, height) {
    const inchesWide = width / 2.54;
    const inchesHigh = height / 2.54;
    return `${width.toFixed(1)} × ${height.toFixed(1)} cm · ${inchesWide.toFixed(1)} × ${inchesHigh.toFixed(1)} in`;
}

function updateDimensions() {
    const { width, height } = getPhysicalDimensions();
    const isCircle = controls.mosaicShape.value === 'circle';
    const formatted = isCircle
        ? `Ø ${width.toFixed(1)} cm · ${((width / 2.54)).toFixed(1)} in diameter`
        : formatDimensions(width, height);
    document.getElementById('mosaicDimensions').textContent = `Approx. size: ${formatted}`;
    document.getElementById('summaryDimensions').textContent =
        isCircle ? `Ø ${width.toFixed(1)} cm` : `${width.toFixed(1)} × ${height.toFixed(1)} cm`;
    document.querySelector('.preview-stage').dataset.shape = isCircle ? 'circle' : 'rectangle';
}

function updateCapUsageDisplay(usage) {
    const details = document.getElementById('capDetails');
    details.replaceChildren();
    const usedCaps = bottleCaps.filter((cap) => (usage.get(cap.filename) || 0) > 0)
        .sort((first, second) => usage.get(second.filename) - usage.get(first.filename));

    for (const cap of usedCaps) {
        const item = document.createElement('li');
        const nameContainer = document.createElement('span');
        nameContainer.className = 'usage-cap-name';
        const image = document.createElement('img');
        image.src = `./bottle-caps/${cap.filename}`;
        image.alt = '';
        const name = document.createElement('span');
        name.textContent = cap.name;
        const count = document.createElement('strong');
        count.textContent = `${usage.get(cap.filename).toLocaleString()} caps`;
        nameContainer.append(image, name);
        item.append(nameContainer, count);
        details.append(item);
    }

    document.getElementById('usageSummary').textContent =
        `${usedCaps.length} ${usedCaps.length === 1 ? 'type' : 'types'} used`;
}

async function processImage() {
    if (!uploadedImage) return;
    const selectedCaps = getSelectedCaps();
    if (selectedCaps.length === 0) {
        updateSelectionSummary();
        return;
    }

    const sampleSize = Number(controls.gridSize.value);
    if (controls.mosaicShape.value === 'circle') {
        capColumns = Math.ceil(Math.max(uploadedImage.naturalWidth, uploadedImage.naturalHeight) / sampleSize);
        capRows = capColumns;
    } else {
        capColumns = Math.ceil(uploadedImage.naturalWidth / sampleSize);
        capRows = Math.ceil(uploadedImage.naturalHeight / sampleSize);
    }
    const maximumCellCount = capColumns * capRows;
    if (maximumCellCount > MAX_CAPS || Math.max(capColumns, capRows) > MAX_CANVAS_EDGE) {
        mosaicGenerated = false;
        document.getElementById('downloadMosaic').disabled = true;
        document.getElementById('downloadHighResButton').disabled = true;
        setStatus('Too many caps to preview. Increase image detail size.', true);
        document.getElementById('previewHeading').textContent = 'Simplify your mosaic';
        return;
    }

    setStatus('Building your mosaic…');
    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = capColumns;
    sampleCanvas.height = capRows;
    const sampleContext = sampleCanvas.getContext('2d', { willReadFrequently: true });
    sampleContext.imageSmoothingEnabled = true;
    sampleContext.imageSmoothingQuality = 'high';
    drawImageInLayout(sampleContext, uploadedImage, capColumns, capRows);
    const imageData = sampleContext.getImageData(0, 0, capColumns, capRows).data;
    sampledColors = new Array(capColumns * capRows);
    for (let pixel = 0; pixel < sampledColors.length; pixel++) {
        const offset = pixel * 4;
        sampledColors[pixel] = getAverageColor(imageData.subarray(offset, offset + 4));
    }

    const spacing = Number(controls.capSpacing.value) / 100;
    const previewSize = Math.max(1, Math.min(
        28,
        Math.floor(Math.sqrt(MAX_PREVIEW_PIXELS / maximumCellCount)),
        Math.floor(MAX_CANVAS_EDGE / (Math.max(capColumns, capRows) * (1 + spacing)))
    ));
    const { usage, capCount } = paintMosaic(mosaicCanvas, mosaicCtx, previewSize, selectedCaps);
    mosaicGenerated = true;
    document.getElementById('capCount').textContent = capCount.toLocaleString();
    document.getElementById('previewHeading').textContent = controls.mosaicShape.value === 'circle'
        ? 'Your round barrel-top preview'
        : 'Here’s your cap-by-cap preview';
    document.getElementById('emptyState').hidden = true;
    canvas.hidden = false;
    document.getElementById('downloadMosaic').disabled = false;
    document.getElementById('downloadHighResButton').disabled = false;
    updateCapUsageDisplay(usage);
    updateDimensions();
    updateCanvasDisplay();
    setStatus(`${capCount.toLocaleString()} caps mapped to your image`);
}

function updateCanvasDisplay() {
    if (!mosaicGenerated) return;
    canvas.width = mosaicCanvas.width;
    canvas.height = mosaicCanvas.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (controls.showInputImage.checked) {
        drawImageInLayout(ctx, uploadedImage, canvas.width, canvas.height);
    } else {
        ctx.drawImage(mosaicCanvas, 0, 0);
    }
}

function handleSelectedFile(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
        setStatus('Choose a valid image file to continue.', true);
        return;
    }

    if (imageObjectUrl) URL.revokeObjectURL(imageObjectUrl);
    imageObjectUrl = URL.createObjectURL(file);
    fileInput.value = '';
    const image = new Image();
    image.onload = () => {
        uploadedImage = image;
        document.getElementById('uploadTitle').textContent = file.name;
        document.getElementById('uploadHint').textContent =
            `${image.naturalWidth.toLocaleString()} × ${image.naturalHeight.toLocaleString()} px · Click to change`;
        document.getElementById('previewHeading').textContent = 'Here’s your cap-by-cap preview';
        document.getElementById('emptyState').hidden = true;
        canvas.hidden = false;
        controls.showInputImage.checked = false;
        scheduleRender();
    };
    image.onerror = () => setStatus('This image could not be opened. Try a different file.', true);
    image.src = imageObjectUrl;
}

function downloadCanvas(sourceCanvas, filename) {
    return new Promise((resolve, reject) => {
        sourceCanvas.toBlob((blob) => {
            if (!blob) {
                reject(new Error('The browser could not create the image file.'));
                return;
            }
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            link.click();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
            resolve();
        }, 'image/png');
    });
}

async function downloadMosaic(highResolution) {
    if (!mosaicGenerated) return;
    const selectedCaps = getSelectedCaps();
    try {
        let downloadCanvasElement = mosaicCanvas;
        if (highResolution) {
            setStatus('Preparing your print-ready file…');
            const numberOfCaps = capColumns * capRows;
            const spacing = Number(controls.capSpacing.value) / 100;
            const printSize = Math.max(1, Math.min(
                300,
                Math.floor(Math.sqrt(MAX_PRINT_PIXELS / numberOfCaps)),
                Math.floor(MAX_CANVAS_EDGE / (Math.max(capColumns, capRows) * (1 + spacing)))
            ));
            downloadCanvasElement = document.createElement('canvas');
            const downloadContext = downloadCanvasElement.getContext('2d');
            paintMosaic(downloadCanvasElement, downloadContext, printSize, selectedCaps);
        }

        await downloadCanvas(downloadCanvasElement, highResolution
            ? 'bottlecap-mosaic-print.png'
            : 'bottlecap-mosaic.png');
        setStatus(highResolution ? 'Print-ready mosaic downloaded' : 'Mosaic downloaded');
    } catch (error) {
        setStatus(error.message || 'Could not create the download.', true);
    }
}

fileInput.addEventListener('change', (event) => handleSelectedFile(event.target.files[0]));

for (const control of [controls.gridSize, controls.capSize, controls.capSpacing]) {
    control.addEventListener('input', scheduleRender);
}
for (const control of [controls.mosaicShape, controls.capShape, controls.backgroundColor]) {
    control.addEventListener('change', scheduleRender);
}
controls.showInputImage.addEventListener('change', updateCanvasDisplay);

document.getElementById('selectAllCaps').addEventListener('click', () => {
    const selectAll = getSelectedCaps().length !== bottleCaps.length;
    for (const cap of bottleCaps) cap.selected = selectAll;
    document.querySelectorAll('#capInventory input[type="checkbox"]').forEach((checkbox) => {
        checkbox.checked = selectAll;
    });
    updateSelectionSummary();
    scheduleRender();
});

document.getElementById('downloadMosaic').addEventListener('click', () => downloadMosaic(false));
document.getElementById('downloadHighResButton').addEventListener('click', () => downloadMosaic(true));

const uploadZone = document.getElementById('uploadZone');
uploadZone.addEventListener('dragover', (event) => {
    event.preventDefault();
    uploadZone.classList.add('drag-over');
});
uploadZone.addEventListener('dragleave', (event) => {
    if (!uploadZone.contains(event.relatedTarget)) uploadZone.classList.remove('drag-over');
});
uploadZone.addEventListener('drop', (event) => {
    event.preventDefault();
    uploadZone.classList.remove('drag-over');
    handleSelectedFile(event.dataTransfer.files[0]);
});

updateRangeLabels();
loadBottleCaps().catch((error) => {
    document.getElementById('inventoryCount').textContent = 'Collection could not be loaded';
    setStatus(error.message || 'Bottle cap images could not be loaded.', true);
});
