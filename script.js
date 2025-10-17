document.addEventListener('DOMContentLoaded', () => {
    // --- UI ELEMENT SELECTORS ---
    const loader = document.getElementById('loader');
    const video = document.getElementById('camera');
    const captureBtn = document.getElementById('captureBtn');
    const mergeInput = document.getElementById('mergeInput');
    const mergeBtn = document.getElementById('mergeBtn');
    const splitInput = document.getElementById('splitInput');
    const pageNumInput = document.getElementById('pageNum');
    const splitBtn = document.getElementById('splitBtn');
    const extractInput = document.getElementById('extractInput');
    const extractBtn = document.getElementById('extractBtn');
    const textOutput = document.getElementById('textOutput');
    const editInput = document.getElementById('editInput');
    const editCanvas = document.getElementById('editCanvas');
    const saveEditBtn = document.getElementById('saveEditBtn');

    // --- GLOBAL VARIABLES ---
    let fabricCanvas = null;
    let currentEditFile = null;
    let cameraStream = null;

    // IMPORTANT: Set PDF.js worker source for text extraction and editing
    if (window.pdfjsLib) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = `./libs/pdf.worker.js`;
    } else {
        console.error("pdf.js library not loaded. Text extraction and editing will fail.");
    }

    // --- HELPER FUNCTIONS ---
    const showLoader = () => loader.classList.remove('hidden');
    const hideLoader = () => loader.classList.add('hidden');

    const downloadFile = (byteArray, fileName) => {
        const blob = new Blob([byteArray], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // --- FEATURE IMPLEMENTATIONS ---

    // 1. Camera to PDF
    async function startCamera() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            video.srcObject = stream;
            cameraStream = stream;
            return true;
        } catch (err) {
            alert("Camera access denied. Please allow camera permissions in your browser settings.");
            console.error("Camera Error:", err);
            return false;
        }
    }
    captureBtn.addEventListener('click', async () => {
        if (!cameraStream || !cameraStream.active) {
            showLoader();
            const success = await startCamera();
            hideLoader();
            if (success) {
                captureBtn.textContent = 'Capture & Convert';
                captureBtn.classList.remove('bg-purple-600', 'hover:bg-purple-700');
                captureBtn.classList.add('bg-red-600', 'hover:bg-red-700');
            }
            return;
        }
        showLoader();
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        if (canvas.width === 0) {
            hideLoader();
            return alert("Camera is not ready. Please wait a moment.");
        }
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = canvas.toDataURL('image/jpeg', 0.9);
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF();
        const imgProps = pdf.getImageProperties(imageData);
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
        pdf.addImage(imageData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
        pdf.save('snap2pdf_capture.pdf');
        cameraStream.getTracks().forEach(track => track.stop());
        video.srcObject = null;
        cameraStream = null;
        captureBtn.textContent = 'Start Camera';
        captureBtn.classList.remove('bg-red-600', 'hover:bg-red-700');
        captureBtn.classList.add('bg-purple-600', 'hover:bg-purple-700');
        hideLoader();
    });

    // 2. Merge PDFs
    mergeBtn.addEventListener('click', async () => {
        const files = mergeInput.files;
        if (files.length < 2) {
            return alert('Please select at least two PDF files to merge.');
        }
        showLoader();
        try {
            const mergedPdf = await PDFLib.PDFDocument.create();
            for (const file of files) {
                const fileBytes = await file.arrayBuffer();
                const pdf = await PDFLib.PDFDocument.load(fileBytes);
                const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
                copiedPages.forEach(page => mergedPdf.addPage(page));
            }
            const mergedBytes = await mergedPdf.save();
            downloadFile(mergedBytes, 'snap2pdf_merged.pdf');
        } catch (error) {
            alert('An error occurred while merging PDFs. Check the console for details.');
            console.error("Merge Error:", error);
        } finally {
            hideLoader();
        }
    });

    // 3. Split PDF
    splitBtn.addEventListener('click', async () => {
        const file = splitInput.files[0];
        const pageNum = parseInt(pageNumInput.value, 10);
        if (!file || isNaN(pageNum) || pageNum <= 0) {
            return alert('Please select a PDF and enter a valid page number.');
        }
        showLoader();
        try {
            const fileBytes = await file.arrayBuffer();
            const pdf = await PDFLib.PDFDocument.load(fileBytes);
            if (pageNum > pdf.getPageCount()) {
                return alert(`Invalid page number. The PDF has only ${pdf.getPageCount()} pages.`);
            }
            const newPdf = await PDFLib.PDFDocument.create();
            const [copiedPage] = await newPdf.copyPages(pdf, [pageNum - 1]);
            newPdf.addPage(copiedPage);
            const newPdfBytes = await newPdf.save();
            downloadFile(newPdfBytes, `snap2pdf_page_${pageNum}.pdf`);
        } catch (error) {
            alert('An error occurred while splitting the PDF. Check the console for details.');
            console.error("Split Error:", error);
        } finally {
            hideLoader();
        }
    });

    // 4. PDF to Text
    extractBtn.addEventListener('click', async () => {
        const file = extractInput.files[0];
        if (!file) {
            return alert('Please select a PDF file to extract text from.');
        }
        showLoader();
        try {
            const fileBytes = await file.arrayBuffer();
            const loadingTask = pdfjsLib.getDocument(fileBytes);
            const pdf = await loadingTask.promise;
            let fullText = '';
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                fullText += textContent.items.map(item => item.str).join(' ') + '\n\n';
            }
            textOutput.value = fullText.trim();
        } catch (error) {
            alert('An error occurred during text extraction. Check the console for details.');
            console.error("Text Extraction Error:", error);
        } finally {
            hideLoader();
        }
    });

    // 5. Inline PDF Editor
    editInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        currentEditFile = file;
        showLoader();
        try {
            const fileBytes = await file.arrayBuffer();
            const loadingTask = pdfjsLib.getDocument(fileBytes);
            const pdf = await loadingTask.promise;
            const page = await pdf.getPage(1);
            const viewport = page.getViewport({ scale: 1.5 });
            const canvasContext = editCanvas.getContext('2d');
            editCanvas.height = viewport.height;
            editCanvas.width = viewport.width;
            await page.render({ canvasContext, viewport }).promise;
            fabricCanvas = new fabric.Canvas(editCanvas, { isDrawingMode: false });
            const bgImage = new fabric.Image(editCanvas);
            fabricCanvas.setBackgroundImage(bgImage, fabricCanvas.renderAll.bind(fabricCanvas));
            canvasContext.clearRect(0, 0, editCanvas.width, editCanvas.height);
            fabricCanvas.on('mouse:dblclick', function(opt) {
                const pointer = fabricCanvas.getPointer(opt.e);
                const text = new fabric.IText('Type here...', {
                    left: pointer.x, top: pointer.y, fill: 'red', fontSize: 20,
                    fontFamily: 'Arial', originX: 'center', originY: 'center',
                });
                fabricCanvas.add(text).setActiveObject(text);
            });
        } catch (error) {
            alert('Failed to load PDF for editing. The file might be corrupted. Check console for details.');
            console.error("PDF Load for Edit Error:", error);
        } finally {
            hideLoader();
        }
    });
    
    saveEditBtn.addEventListener('click', async () => {
        if (!fabricCanvas || !currentEditFile) {
            return alert('Please load a PDF to edit first.');
        }
        showLoader();
        try {
            const pdfBytes = await currentEditFile.arrayBuffer();
            const pdfDoc = await PDFLib.PDFDocument.load(pdfBytes);
            const firstPage = pdfDoc.getPages()[0];
            const fabricImageBytes = await fetch(fabricCanvas.toDataURL({ format: 'png' })).then(res => res.arrayBuffer());
            const embeddedImage = await pdfDoc.embedPng(fabricImageBytes);
            firstPage.drawImage(embeddedImage, {
                x: 0, y: 0,
                width: firstPage.getWidth(),
                height: firstPage.getHeight(),
            });
            const modifiedPdfBytes = await pdfDoc.save();
            downloadFile(modifiedPdfBytes, 'snap2pdf_edited.pdf');
        } catch (error) {
            alert('Failed to save the edited PDF. Check the console for details.');
            console.error("Save Edit Error:", error);
        } finally {
            hideLoader();
        }
    });
});
