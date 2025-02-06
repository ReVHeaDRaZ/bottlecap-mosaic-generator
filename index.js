let inputElement = document.getElementById('fileInput');
const canvas = document.getElementById('canvasOutput');
const ctx = canvas.getContext('2d');
const bottleCapImages = [];
const capColors = []; // Store average colors of bottle caps
const capUsage = {}; // Track bottle cap usage
let capCount = 0;
let uploadedImage = null;
let mosaicCanvas = document.createElement('canvas'); // Store the generated mosaic
let mosaicGenerated = false; // Flag to track if the mosaic is generated

// Load bottle cap images dynamically from a directory
async function loadBottleCapImages() {
    const response = await fetch('./bottle-caps/bottle_caps.json');
    const imageFiles = await response.json();
    return new Promise((resolve) => {
        let loadedCount = 0;
        imageFiles.forEach((filename) => {
            const bottleCap = new Image();
            bottleCap.src = `./bottle-caps/${filename}`;
            bottleCap.onload = function () {
                let tempCanvas = document.createElement('canvas');
                let tempCtx = tempCanvas.getContext('2d');
                tempCanvas.width = bottleCap.width;
                tempCanvas.height = bottleCap.height;
                tempCtx.drawImage(bottleCap, 0, 0);
                
                let imageData = tempCtx.getImageData(0, 0, bottleCap.width, bottleCap.height);
                let avgColor = getAverageColor(imageData.data);
                
                bottleCapImages.push({ image: tempCanvas, name: filename.replace(/\.[^/.]+$/, "") });
                capColors.push(avgColor);
                capUsage[filename.replace(/\.[^/.]+$/, "")] = 0;
                
                loadedCount++;
                if (loadedCount === imageFiles.length) resolve();
            };
        });
    });
}

// Get average color of an image data array
function getAverageColor(imageData) {
    let r = 0, g = 0, b = 0, count = 0;
    for (let i = 0; i < imageData.length; i += 4) {
        r += imageData[i];
        g += imageData[i + 1];
        b += imageData[i + 2];
        count++;
    }
    return { r: r / count, g: g / count, b: b / count };
}

// Find the closest matching bottle cap
function findClosestBottleCap(color) {
    let bestMatchIndex = 0;
    let smallestDiff = Infinity;
    capColors.forEach((capColor, index) => {
        let diff = Math.abs(capColor.r - color.r) + Math.abs(capColor.g - color.g) + Math.abs(capColor.b - color.b);
        if (diff < smallestDiff) {
            smallestDiff = diff;
            bestMatchIndex = index;
        }
    });
    capUsage[bottleCapImages[bestMatchIndex].name]++;
    return bottleCapImages[bestMatchIndex].image;
}

// Update cap usage display
function updateCapUsageDisplay() {
    const capDetailsElement = document.getElementById('capDetails');
    capDetailsElement.innerHTML = '';
    for (const [capName, count] of Object.entries(capUsage)) {
        if (count > 0) {
            const listItem = document.createElement('li');
            listItem.innerHTML = `<img src="./bottle-caps/${capName}.png"> ${capName}: ${count}`;
            capDetailsElement.appendChild(listItem);
        }
    }
}

function updateMosaicDimensions() {
    let gridSize = parseInt(document.getElementById('gridSize').value);
    let capsWide = Math.floor(uploadedImage.width / gridSize);
    let capsHigh = Math.floor(uploadedImage.height / gridSize);

    let widthMM = capsWide * 29; 
    let heightMM = capsHigh * 29;
    
    let widthCM = (widthMM / 10).toFixed(1);  
    let heightCM = (heightMM / 10).toFixed(1);  
    
    let widthIN = (widthMM / 25.4).toFixed(1);  
    let heightIN = (heightMM / 25.4).toFixed(1);

    document.getElementById('mosaicDimensions').innerHTML = 
        `Approx. Size: ${widthCM}cm × ${heightCM}cm (${widthIN}in × ${heightIN}in)`;
}

// Process image and generate mosaic
async function processImage() {
    if (!uploadedImage) return;
    canvas.width = uploadedImage.width;
    canvas.height = uploadedImage.height;
    
    ctx.drawImage(uploadedImage, 0, 0); // Ensure the image is drawn before processing
    
    await loadBottleCapImages();

    capCount = 0;
    Object.keys(capUsage).forEach(key => capUsage[key] = 0);
    let gridSize = parseInt(document.getElementById('gridSize').value);
    
    mosaicCanvas.width = uploadedImage.width;
    mosaicCanvas.height = uploadedImage.height;
    let mosaicCtx = mosaicCanvas.getContext('2d');
    
    for (let y = 0; y < uploadedImage.height; y += gridSize) {
        for (let x = 0; x < uploadedImage.width; x += gridSize) {
            let blockData = ctx.getImageData(x, y, gridSize, gridSize).data;
            let avgColor = getAverageColor(blockData);
            let bestCap = findClosestBottleCap(avgColor);
            mosaicCtx.drawImage(bestCap, x, y, gridSize, gridSize);
            capCount++;
        }
    }
    mosaicGenerated = true;
    document.getElementById('capCount').textContent = `Bottle Caps Used: ${capCount}`;
    updateCapUsageDisplay();
    updateCanvasDisplay();
    updateMosaicDimensions();
}

// Toggle between input image and mosaic
function updateCanvasDisplay() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!document.getElementById('showInputImage').checked) {
        if (mosaicGenerated) {
            ctx.drawImage(mosaicCanvas, 0, 0);
        }
    } else {
        ctx.drawImage(uploadedImage, 0, 0);
    }
}

// Handle file upload
inputElement.addEventListener('change', async (e) => {
    uploadedImage = new Image();
    uploadedImage.src = URL.createObjectURL(e.target.files[0]);
    uploadedImage.onload = () => {
        ctx.drawImage(uploadedImage, 0, 0); // Ensure image is visible immediately
        mosaicGenerated = false;
        processImage();
    };
});

// Reprocess image when grid size changes
document.getElementById('gridSize').addEventListener('change', processImage);
// Toggle input image or mosaic
document.getElementById('showInputImage').addEventListener('change', updateCanvasDisplay);

document.getElementById('downloadMosaic').addEventListener('click', function () {
    if (!mosaicGenerated) {
        alert("Generate the mosaic first!");
        return;
    }
    const link = document.createElement('a');
    link.download = 'bottlecap_mosaic.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
});

function downloadHighResMosaic() {
    if (!mosaicGenerated) {
        alert("Generate the mosaic first!");
        return;
    }

    let gridSize = parseInt(document.getElementById('gridSize').value);
    let capsWide = Math.floor(uploadedImage.width / gridSize);
    let capsHigh = Math.floor(uploadedImage.height / gridSize);

    let maxDimension = 8192; // Max safe canvas size
    let baseCapSize = 300;
    let scaledCapSize = Math.min(100, Math.floor(maxDimension / Math.max(capsWide, capsHigh) * baseCapSize));

    let finalWidth = capsWide * scaledCapSize;
    let finalHeight = capsHigh * scaledCapSize;

    let highResCanvas = document.createElement('canvas');
    highResCanvas.width = finalWidth;
    highResCanvas.height = finalHeight;
    let highResCtx = highResCanvas.getContext('2d');

    for (let y = 0; y < capsHigh; y++) {
        for (let x = 0; x < capsWide; x++) {
            let blockData = ctx.getImageData(x * gridSize, y * gridSize, gridSize, gridSize).data;
            let avgColor = getAverageColor(blockData);
            let bestCap = findClosestBottleCap(avgColor);
            highResCtx.drawImage(bestCap, x * scaledCapSize, y * scaledCapSize, scaledCapSize, scaledCapSize);
        }
    }

    highResCanvas.toBlob(function(blob) {
        let link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = "bottlecap_mosaic.png";
        link.click();
    }, "image/png");
}

document.getElementById('downloadHighResButton').addEventListener('click', downloadHighResMosaic);