(function() {
  const mmToPx = 3.7795275591;
  const sizes = {
    A5: { width: 148, height: 210 },
    A4: { width: 210, height: 297 },
    A3: { width: 297, height: 420 }
  };
  const sizeSelect = document.getElementById('sizeSelect');
  const customSize = document.getElementById('customSizeInputs');
  const customWidthInput = document.getElementById('customWidth');
  const customHeightInput = document.getElementById('customHeight');
  const rotatePage = document.getElementById('rotatePage');
  const marginWidthInput = document.getElementById('marginWidth');
  const marginHeightInput = document.getElementById('marginHeight');
  const fileInput = document.getElementById('fileInput');
  const uploadBtn = document.getElementById('uploadBtn');
  const exportBtn = document.getElementById('exportBtn');
  const recenterBtn = document.getElementById('recenterBtn');
  const workArea = document.getElementById('workArea');
  const frame = document.getElementById('paperFrame');
  const photoWrapper = document.getElementById('photoWrapper');
  const photo = document.getElementById('photo');
  const ruler = document.getElementById('ruler');
  const rulerScale = document.getElementById('rulerScale');
  const rulerLabels = document.getElementById('rulerLabels');
  const rulerRotateBtn = document.getElementById('rulerRotateBtn');
  const rulerResize = document.getElementById('rulerResize');
  const RULER_THICKNESS = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ruler-thickness')) || 40;
  const PREFERENCES_KEY = 'imageScalerPreferences';
  const defaultPreferences = {
    size: 'A4',
    rotate: false,
    customWidth: 210,
    customHeight: 297,
    marginWidth: 5,
    marginHeight: 5
  };

  function loadPreferences() {
    try {
      const stored = localStorage.getItem(PREFERENCES_KEY);
      if (stored) {
        return { ...defaultPreferences, ...JSON.parse(stored) };
      }
    } catch (err) {}
    return { ...defaultPreferences };
  }

  function savePreferences() {
    try {
      localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
    } catch (err) {}
  }

  const preferences = loadPreferences();

  function ensureSizeOption(value) {
    const options = Array.from(sizeSelect.options).map((opt) => opt.value);
    return options.includes(value) ? value : defaultPreferences.size;
  }

  const rawMarginWidth = preferences.marginWidth;
  const rawMarginHeight = preferences.marginHeight;
  let shouldPersistPreferences = false;

  sizeSelect.value = ensureSizeOption(preferences.size);
  if (preferences.size !== sizeSelect.value) {
    preferences.size = sizeSelect.value;
    shouldPersistPreferences = true;
  }
  rotatePage.checked = Boolean(preferences.rotate);
  customWidthInput.value = preferences.customWidth;
  customHeightInput.value = preferences.customHeight;

  const initialMarginWidth = Math.max(0, Number(rawMarginWidth) || 0);
  const initialMarginHeight = Math.max(0, Number(rawMarginHeight) || 0);
  if (rawMarginWidth !== initialMarginWidth) {
    preferences.marginWidth = initialMarginWidth;
    shouldPersistPreferences = true;
  } else {
    preferences.marginWidth = rawMarginWidth;
  }
  if (rawMarginHeight !== initialMarginHeight) {
    preferences.marginHeight = initialMarginHeight;
    shouldPersistPreferences = true;
  } else {
    preferences.marginHeight = rawMarginHeight;
  }
  marginWidthInput.value = preferences.marginWidth;
  marginHeightInput.value = preferences.marginHeight;

  if (shouldPersistPreferences) {
    savePreferences();
  }

  let frameWidthMM = 210;
  let frameHeightMM = 297;
  let frameScale = 1;
  let pxPerMm = mmToPx;
  let photoState = { x: 0, y: 0, width: 0, height: 0 };
  let photoNatural = { width: 0, height: 0 };
  let rulerState = {
    x: 0,
    y: 0,
    lengthMm: 150,
    vertical: false
  };
  let gestureStart = null;
  let shiftScaleSession = null;
  let uploadedFileBase = '';
  const defaultExportFormat = { type: 'image/png', extension: 'png', quality: undefined };
  let exportFormat = { ...defaultExportFormat };

  const mimeToExtension = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/bmp': 'bmp',
    'image/tiff': 'tiff'
  };
  const extensionToMime = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    bmp: 'image/bmp',
    tif: 'image/tiff',
    tiff: 'image/tiff'
  };
  const mimeSupportCache = {};
  const supportCanvas = document.createElement('canvas');

  function inferExtensionFromName(name) {
    if (!name) return '';
    const dotIndex = name.lastIndexOf('.');
    if (dotIndex === -1) return '';
    return name.slice(dotIndex + 1).trim().toLowerCase();
  }

  function isMimeSupported(type) {
    if (!type) return false;
    if (mimeSupportCache[type] !== undefined) {
      return mimeSupportCache[type];
    }
    let supported = false;
    try {
      supported = supportCanvas.toDataURL(type).startsWith(`data:${type}`);
    } catch (error) {
      supported = false;
    }
    mimeSupportCache[type] = supported;
    return supported;
  }

  function buildExportFormat(type, extension) {
    const resolvedType = isMimeSupported(type) ? type : defaultExportFormat.type;
    const resolvedExtension = extension || mimeToExtension[resolvedType] || defaultExportFormat.extension;
    const needsQuality = resolvedType === 'image/jpeg' || resolvedType === 'image/webp';
    return {
      type: resolvedType,
      extension: resolvedExtension,
      quality: needsQuality ? 1 : undefined
    };
  }

  function resolveExportFormat(file) {
    if (!file) {
      return { ...defaultExportFormat };
    }
    const normalizedType = (file.type || '').toLowerCase();
    const extensionFromName = inferExtensionFromName(file.name);
    if (normalizedType && isMimeSupported(normalizedType)) {
      const hintedExtension = extensionFromName || mimeToExtension[normalizedType];
      return buildExportFormat(normalizedType, hintedExtension);
    }
    if (extensionFromName && extensionToMime[extensionFromName]) {
      return buildExportFormat(extensionToMime[extensionFromName], extensionFromName);
    }
    return { ...defaultExportFormat };
  }

  function getMarginValues() {
    const horizontal = Math.max(0, parseFloat(marginWidthInput.value) || 0);
    const vertical = Math.max(0, parseFloat(marginHeightInput.value) || 0);
    return { horizontal, vertical };
  }

  function updateFrameDimensions() {
    const selectedSize = sizeSelect.value;
    const { horizontal, vertical } = getMarginValues();
    let widthMM;
    let heightMM;
    if (selectedSize === 'custom') {
      customSize.style.display = 'flex';
      widthMM = Math.max(30, parseFloat(customWidthInput.value) || 210);
      heightMM = Math.max(30, parseFloat(customHeightInput.value) || 297);
    } else {
      customSize.style.display = 'none';
      ({ width: widthMM, height: heightMM } = sizes[selectedSize]);
    }

    if (rotatePage.checked) {
      [widthMM, heightMM] = [heightMM, widthMM];
    }

    frameWidthMM = widthMM - horizontal * 2;
    frameHeightMM = heightMM - vertical * 2;

    const workRect = workArea.getBoundingClientRect();
    const availableWidth = workRect.width - 40;
    const availableHeight = workRect.height - 40;
    const widthPx = frameWidthMM * mmToPx;
    const heightPx = frameHeightMM * mmToPx;
    frameScale = Math.min(availableWidth / widthPx, availableHeight / heightPx, 1);
    frame.style.width = `${widthPx * frameScale}px`;
    frame.style.height = `${heightPx * frameScale}px`;
    pxPerMm = (widthPx * frameScale) / frameWidthMM;

    applyMargins(horizontal, vertical);
    fitPhotoToFrame(false);
    updateRulerGraphics();
    updateRulerPosition();
  }

  function applyMargins(horizontal, vertical) {
    frame.style.setProperty('--margin-horizontal', `${horizontal}px`);
    frame.style.setProperty('--margin-vertical', `${vertical}px`);
  }

  function fitPhotoToFrame(center = true) {
    if (!photoNatural.width || !photoNatural.height) return;
    const frameRect = frame.getBoundingClientRect();
    const scale = Math.min(frameRect.width / photoNatural.width, frameRect.height / photoNatural.height);
    const width = photoNatural.width * scale;
    const height = photoNatural.height * scale;
    photoState.width = width;
    photoState.height = height;
    if (center) {
      photoState.x = (frameRect.width - width) / 2;
      photoState.y = (frameRect.height - height) / 2;
    }
    applyPhotoState();
  }

  function applyPhotoState() {
    photoWrapper.style.transform = `translate(${photoState.x}px, ${photoState.y}px)`;
    photoWrapper.style.width = `${photoState.width}px`;
    photoWrapper.style.height = `${photoState.height}px`;
  }

  function clampRuler(frameWidth, frameHeight) {
    const lengthPx = rulerState.lengthMm * pxPerMm;
    const halfLength = lengthPx / 2;
    const halfThickness = RULER_THICKNESS / 2;

    if (rulerState.vertical) {
      rulerState.x = Math.min(frameWidth - halfThickness, Math.max(halfThickness, rulerState.x));
      rulerState.y = Math.min(frameHeight - halfLength, Math.max(halfLength, rulerState.y));
    } else {
      rulerState.x = Math.min(frameWidth - halfLength, Math.max(halfLength, rulerState.x));
      rulerState.y = Math.min(frameHeight - halfThickness, Math.max(halfThickness, rulerState.y));
    }
  }

  function updateRulerPosition() {
    const lengthPx = rulerState.lengthMm * pxPerMm;
    ruler.style.width = rulerState.vertical ? `${RULER_THICKNESS}px` : `${lengthPx}px`;
    ruler.style.height = rulerState.vertical ? `${lengthPx}px` : `${RULER_THICKNESS}px`;
    ruler.style.transform = `translate(${rulerState.x - (rulerState.vertical ? RULER_THICKNESS / 2 : lengthPx / 2)}px, ${rulerState.y - (rulerState.vertical ? lengthPx / 2 : RULER_THICKNESS / 2)}px)`;
    ruler.classList.toggle('vertical', rulerState.vertical);
  }

  function updateRulerGraphics({ startEdgePx, requestedLengthPx } = {}) {
    const frameRect = frame.getBoundingClientRect();
    const availableWidth = frameRect.width;
    const availableHeight = frameRect.height;
    const maxLengthPx = rulerState.vertical ? availableHeight - 20 : availableWidth - 20;
    let lengthPx = requestedLengthPx || rulerState.lengthMm * pxPerMm;
    lengthPx = Math.max(RULER_THICKNESS, Math.min(lengthPx, maxLengthPx));
    rulerState.lengthMm = lengthPx / pxPerMm;

    if (startEdgePx !== undefined) {
      if (rulerState.vertical) {
        const centerY = startEdgePx + lengthPx / 2;
        rulerState.y = Math.min(availableHeight - lengthPx / 2, Math.max(lengthPx / 2, centerY));
      } else {
        const centerX = startEdgePx + lengthPx / 2;
        rulerState.x = Math.min(availableWidth - lengthPx / 2, Math.max(lengthPx / 2, centerX));
      }
    }

    const mmInPx = pxPerMm;
    const cmGap = 10 * mmInPx;
    const mmGap = mmInPx;
    const mmColor = 'rgba(15,23,42,0.4)';
    const cmColor = 'rgba(15,23,42,0.9)';
    const mmTickThickness = 1;
    const cmTickThickness = 2;
    const gradient = rulerState.vertical
      ? `repeating-linear-gradient(180deg, transparent 0, transparent ${cmGap}px, ${cmColor} ${cmGap}px, ${cmColor} ${cmGap + cmTickThickness}px)`
      : `repeating-linear-gradient(90deg, transparent 0, transparent ${mmGap}px, ${mmColor} ${mmGap}px, ${mmColor} ${mmGap + mmTickThickness}px), repeating-linear-gradient(90deg, transparent 0, transparent ${cmGap}px, ${cmColor} ${cmGap}px, ${cmColor} ${cmGap + cmTickThickness}px)`;
    rulerScale.style.backgroundImage = gradient;

    rulerLabels.innerHTML = '';
    const cmCount = Math.floor(rulerState.lengthMm / 10);
    const startLabel = rulerState.vertical ? 1 : 0;
    for (let i = startLabel; i <= cmCount; i++) {
      const span = document.createElement('span');
      span.textContent = i.toString();
      if (rulerState.vertical) {
        span.style.top = `${i * 10 * pxPerMm - 8}px`;
      } else {
        span.style.left = `${i * 10 * pxPerMm + 4}px`;
      }
      rulerLabels.appendChild(span);
    }
    clampRuler(frameRect.width, frameRect.height);
  }

  function resetRuler() {
    rulerState.x = 0;
    rulerState.y = 0;
    rulerState.lengthMm = frameWidthMM * 0.6;
    rulerState.vertical = false;
    ruler.classList.remove('hidden');
    updateRulerGraphics();
  }

  function handleFile(file) {
    if (!file) return;
    if (file.name) {
      const dotIndex = file.name.lastIndexOf('.');
      const rawName = dotIndex > 0 ? file.name.slice(0, dotIndex) : file.name;
      uploadedFileBase = rawName.trim().replace(/\s+/g, '_');
    } else {
      uploadedFileBase = '';
    }
    exportFormat = resolveExportFormat(file);
    exportBtn.disabled = true;
    recenterBtn.disabled = true;
    const reader = new FileReader();
    reader.onload = (e) => {
      photo.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function getFormatLabel() {
    if (sizeSelect.value === 'custom') {
      const width = Math.round(parseFloat(customWidthInput.value) || frameWidthMM);
      const height = Math.round(parseFloat(customHeightInput.value) || frameHeightMM);
      return `${width}x${height}`;
    }
    return sizeSelect.value;
  }

  photo.addEventListener('load', () => {
    photoNatural.width = photo.naturalWidth;
    photoNatural.height = photo.naturalHeight;
    photoWrapper.classList.remove('hidden');
    fitPhotoToFrame();
    exportBtn.disabled = false;
    recenterBtn.disabled = false;
    ruler.classList.remove('hidden');
    resetRuler();
  });

  uploadBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => handleFile(e.target.files[0]));
  recenterBtn.addEventListener('click', () => {
    if (!photoWrapper.classList.contains('hidden')) {
      fitPhotoToFrame();
    }
  });

  sizeSelect.addEventListener('change', () => {
    preferences.size = sizeSelect.value;
    savePreferences();
    updateFrameDimensions();
  });
  rotatePage.addEventListener('change', () => {
    preferences.rotate = rotatePage.checked;
    savePreferences();
    updateFrameDimensions();
  });
  customWidthInput.addEventListener('input', () => {
    preferences.customWidth = parseFloat(customWidthInput.value) || defaultPreferences.customWidth;
    savePreferences();
    updateFrameDimensions();
  });
  customHeightInput.addEventListener('input', () => {
    preferences.customHeight = parseFloat(customHeightInput.value) || defaultPreferences.customHeight;
    savePreferences();
    updateFrameDimensions();
  });
  marginWidthInput.addEventListener('input', () => {
    preferences.marginWidth = Math.max(0, parseFloat(marginWidthInput.value) || 0);
    savePreferences();
    updateFrameDimensions();
  });
  marginHeightInput.addEventListener('input', () => {
    preferences.marginHeight = Math.max(0, parseFloat(marginHeightInput.value) || 0);
    savePreferences();
    updateFrameDimensions();
  });
  window.addEventListener('resize', updateFrameDimensions);

  function startShiftScale(event) {
    const frameRect = frame.getBoundingClientRect();
    const centerX = frameRect.width / 2;
    const centerY = frameRect.height / 2;
    const pointerX = event.clientX - frameRect.left;
    const pointerY = event.clientY - frameRect.top;
    const distance = Math.max(10, Math.hypot(pointerX - centerX, pointerY - centerY));
    shiftScaleSession = {
      width: photoState.width,
      height: photoState.height,
      x: photoState.x,
      y: photoState.y,
      anchorX: centerX,
      anchorY: centerY,
      pointerDist: distance
    };
  }

  function applyShiftScale(event) {
    if (!shiftScaleSession) return false;
    const frameRect = frame.getBoundingClientRect();
    const centerX = shiftScaleSession.anchorX;
    const centerY = shiftScaleSession.anchorY;
    const pointerX = event.clientX - frameRect.left;
    const pointerY = event.clientY - frameRect.top;
    const distance = Math.max(1, Math.hypot(pointerX - centerX, pointerY - centerY));
    let factor = distance / shiftScaleSession.pointerDist;
    if (!isFinite(factor) || factor <= 0) {
      factor = 1;
    }
    let newWidth = Math.max(50, shiftScaleSession.width * factor);
    const appliedFactor = newWidth / shiftScaleSession.width;
    const newHeight = shiftScaleSession.height * appliedFactor;
    photoState.width = newWidth;
    photoState.height = newHeight;
    const offsetX = centerX - shiftScaleSession.x;
    const offsetY = centerY - shiftScaleSession.y;
    photoState.x = centerX - offsetX * appliedFactor;
    photoState.y = centerY - offsetY * appliedFactor;
    applyPhotoState();
    return true;
  }

  interact(photoWrapper)
    .draggable({
      listeners: {
        start(event) {
          if (event.shiftKey) {
            startShiftScale(event);
          }
        },
        move(event) {
          if (event.shiftKey && !shiftScaleSession) {
            startShiftScale(event);
          }
          if (event.shiftKey && shiftScaleSession) {
            applyShiftScale(event);
            return;
          }
          shiftScaleSession = null;
          photoState.x += event.dx;
          photoState.y += event.dy;
          applyPhotoState();
        },
        end() {
          shiftScaleSession = null;
        }
      }
    })
    .resizable({
      edges: { top: true, left: true, bottom: true, right: true },
      margin: 12,
      modifiers: [
        interact.modifiers.aspectRatio({ ratio: 'preserve' }),
        interact.modifiers.restrictSize({ min: { width: 50, height: 50 } })
      ],
      listeners: {
        move(event) {
          photoState.x += event.deltaRect.left;
          photoState.y += event.deltaRect.top;
          photoState.width = event.rect.width;
          photoState.height = event.rect.height;
          applyPhotoState();
        }
      }
    })
    .gesturable({
      listeners: {
        start(event) {
          gestureStart = { width: photoState.width, height: photoState.height };
        },
        move(event) {
          if (!gestureStart) return;
          const newWidth = Math.max(50, gestureStart.width * event.scale);
          const newHeight = newWidth * (gestureStart.height / gestureStart.width);
          const dx = (newWidth - photoState.width) / 2;
          const dy = (newHeight - photoState.height) / 2;
          photoState.width = newWidth;
          photoState.height = newHeight;
          photoState.x -= dx;
          photoState.y -= dy;
          applyPhotoState();
        },
        end() { gestureStart = null; }
      }
    });

  let dragStart = null;
  ruler.addEventListener('pointerdown', (event) => {
    if (event.target === rulerResize || event.target === rulerRotateBtn) return;
    event.preventDefault();
    ruler.setPointerCapture(event.pointerId);
    dragStart = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      stateX: rulerState.x,
      stateY: rulerState.y
    };
  });
  ruler.addEventListener('pointermove', (event) => {
    if (!dragStart || dragStart.pointerId !== event.pointerId) return;
    const frameRect = frame.getBoundingClientRect();
    rulerState.x = dragStart.stateX + event.clientX - dragStart.x;
    rulerState.y = dragStart.stateY + event.clientY - dragStart.y;
    clampRuler(frameRect.width, frameRect.height);
    updateRulerPosition();
  });
  ruler.addEventListener('pointerup', resetRulerDrag);
  ruler.addEventListener('pointercancel', resetRulerDrag);

  function resetRulerDrag(event) {
    if (!dragStart || (event && dragStart.pointerId !== event.pointerId)) return;
    ruler.releasePointerCapture(dragStart.pointerId);
    dragStart = null;
  }

  rulerResize.addEventListener('pointerdown', (event) => {
    event.stopPropagation();
    event.preventDefault();
    const currentLengthPx = rulerState.lengthMm * pxPerMm;
    const startEdgePx = rulerState.vertical
      ? rulerState.y - currentLengthPx / 2
      : rulerState.x - currentLengthPx / 2;
    const start = {
      pointerId: event.pointerId,
      startPos: rulerState.vertical ? event.clientY : event.clientX,
      requestedLengthPx: currentLengthPx,
      startEdgePx
    };
    rulerResize.setPointerCapture(event.pointerId);
    const move = (ev) => {
      if (ev.pointerId !== start.pointerId) return;
      const pointerPos = rulerState.vertical ? ev.clientY : ev.clientX;
      const deltaPx = pointerPos - start.startPos;
      const nextLengthPx = Math.max(20, start.requestedLengthPx + deltaPx);
      updateRulerGraphics({ startEdgePx: start.startEdgePx, requestedLengthPx: nextLengthPx });
    };
    const up = (ev) => {
      if (ev.pointerId !== start.pointerId) return;
      rulerResize.releasePointerCapture(start.pointerId);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  });

  rulerRotateBtn.addEventListener('click', () => {
    rulerState.vertical = !rulerState.vertical;
    rulerResize.textContent = rulerState.vertical ? '⇕' : '⇔';
    updateRulerGraphics();
  });

  async function exportImage() {
    if (photoWrapper.classList.contains('hidden')) return;
    const frameRect = frame.getBoundingClientRect();
    const ratio = photoNatural.width / photoState.width;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(frameRect.width * ratio));
    canvas.height = Math.max(1, Math.round(frameRect.height * ratio));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const visibleWidth = Math.max(0, Math.min(frameRect.width, photoState.x + photoState.width) - Math.max(0, photoState.x));
    const visibleHeight = Math.max(0, Math.min(frameRect.height, photoState.y + photoState.height) - Math.max(0, photoState.y));
    if (visibleWidth > 0 && visibleHeight > 0) {
      const sourceX = Math.max(0, -photoState.x) * ratio;
      const sourceY = Math.max(0, -photoState.y) * ratio;
      const destX = Math.max(0, photoState.x) * ratio;
      const destY = Math.max(0, photoState.y) * ratio;
      const drawWidth = visibleWidth * ratio;
      const drawHeight = visibleHeight * ratio;
      ctx.drawImage(photo, sourceX, sourceY, drawWidth, drawHeight, destX, destY, drawWidth, drawHeight);
    }

    const { type, extension, quality } = exportFormat;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const link = document.createElement('a');
      const formatLabel = getFormatLabel();
      const downloadBase = uploadedFileBase || 'scaled-photo';
      link.download = `${downloadBase}_${formatLabel}.${extension}`;
      link.href = URL.createObjectURL(blob);
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    }, type, quality);
  }

  exportBtn.addEventListener('click', exportImage);

  updateFrameDimensions();
})();
