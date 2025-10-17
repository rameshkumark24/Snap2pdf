// ========== SNAP2PDF CORE SCRIPT ==========
// all operations happen client-side — no upload, no storage!

let pdfDoc = null;
let canvas = null;
let fabricCanvas = null;

// ---------- CAMERA TO PDF ----------
const video = document.getElementById('videoInput');
const snapBtn = document.getElementById('snapBtn');
const downloadBtn = document.getElementById('downloadBtn');
const uploadInput = document.getElementById('uploadInput');
const mergeBtn = document.getElementById('mergeBtn');
const editBtn = document.getElementById('editBtn');
const saveEditedBtn = document.getElementById('saveEditedBtn');
const pdfPreview = document.getElementById('pdfPreview');
const editorContainer = document.getElementById('editorContainer');

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
  } catch (err) {
    alert("Camera access denied or not available!");
  }
}

// Capture image and convert to PDF
snapBtn.addEventListener('click', async () => {
  startCamera();
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = video.videoWidth;
  tempCanvas.height = video.videoHeight;
  const ctx = tempCanvas.getContext('2d');
  ctx.drawImage(video, 0, 0);
  const imageData = tempCanvas.toDataURL('image/jpeg', 1.0);

  const pdf = new jspdf.jsPDF();
  const imgProps = pdf.getImageProperties(imageData);
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
  pdf.addImage(imageData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
  pdf.save('snap2pdf.pdf');
});

// ---------- PDF MERGE ----------
mergeBtn.addEventListener('click', async () => {
  const files = uploadInput.files;
  if (files.length < 2) {
    alert('Select at least two PDFs to merge!');
    return;
  }

  const mergedPdf = await PDFLib.PDFDocument.create();

  for (let i = 0; i < files.length; i++) {
    const bytes = await files[i].arrayBuffer();
    const pdf = await PDFLib.PDFDocument.load(bytes);
    const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
    copiedPages.forEach((p) => mergedPdf.addPage(p));
  }

  const mergedBytes = await mergedPdf.save();
  downloadFile(mergedBytes, 'merged.pdf');
});

// ---------- PDF EDITOR ----------
editBtn.addEventListener('click', async () => {
  const file = uploadInput.files[0];
  if (!file) {
    alert('Upload a PDF to edit!');
    return;
  }

  const pdfData = await file.arrayBuffer();
  pdfDoc = await pdfjsLib.getDocument({ data: pdfData }).promise;
  const page = await pdfDoc.getPage(1);
  const viewport = page.getViewport({ scale: 1.5 });

  const canvasEl = document.createElement('canvas');
  const context = canvasEl.getContext('2d');
  canvasEl.height = viewport.height;
  canvasEl.width = viewport.width;

  await page.render({ canvasContext: context, viewport: viewport }).promise;

  editorContainer.innerHTML = '';
  editorContainer.appendChild(canvasEl);

  // Initialize fabric.js for text editing
  fabricCanvas = new fabric.Canvas(canvasEl);
  fabricCanvas.setWidth(canvasEl.width);
  fabricCanvas.setHeight(canvasEl.height);

  fabricCanvas.on('mouse:dblclick', function (opt) {
    const pointer = fabricCanvas.getPointer(opt.e);
    const text = new fabric.IText('Edit Me', {
      left: pointer.x,
      top: pointer.y,
      fill: 'black',
      fontSize: 18,
    });
    fabricCanvas.add(text);
  });

  saveEditedBtn.style.display = 'block';
});

saveEditedBtn.addEventListener('click', async () => {
  const editedImage = fabricCanvas.toDataURL({
    format: 'jpeg',
    quality: 1,
  });

  const pdf = new jspdf.jsPDF();
  const imgProps = pdf.getImageProperties(editedImage);
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
  pdf.addImage(editedImage, 'JPEG', 0, 0, pdfWidth, pdfHeight);
  pdf.save('edited.pdf');
});

// ---------- HELPER ----------
function downloadFile(byteArray, filename) {
  const blob = new Blob([byteArray], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
