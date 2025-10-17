document.addEventListener('DOMContentLoaded', () => {
    // --- UI ELEMENT SELECTORS ---
    const loader = document.getElementById('loader');

    // Feature: Camera to PDF
    const video = document.getElementById('camera');
    const captureBtn = document.getElementById('captureBtn');

    // Feature: Merge PDFs
    const mergeInput = document.getElementById('mergeInput');
    const mergeBtn = document.getElementById('mergeBtn');

    // Feature: Split PDF
    const splitInput = document.getElementById('splitInput');
    const pageNumInput = document.getElementById('pageNum');
    const splitBtn = document.getElementById('splitBtn');

    // Feature: PDF to Text
    const extractInput = document.getElementById('extractInput');
    const extractBtn = document.getElementById('extractBtn');
    const textOutput = document.getElementById('textOutput');

    // Feature: Inline PDF Editor
    const editInput = document.getElementById('editInput');
    const editCanvas = document.getElementById('editCanvas');
    const saveEditBtn = document.getElementById('saveEditBtn');

    // --- GLOBAL VARIABLES ---
    let fabricCanvas = null;
    let currentEditFile = null;

    // Set PDF.js worker source
    if (window.pdfjsLib) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = `libs/pdf.worker.js`;
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
            video.play();
        } catch (err) {
            alert("Camera access denied or not available. Please allow camera permissions.");
            console.error("Camera Error:", err);
        }
    }
    startCamera(); // Initialize camera on load

    captureBtn.addEventListener('click', async () => {
        if (!video.srcObject) {
            alert("Camera not ready. Please grant permission and try again.");
            return;
        }
        showLoader();
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
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
        hideLoader();
    });


    // 2. Merge PDFs
    mergeBtn.addEventListener('click', async () => {
        const files = mergeInput.files;
        if (files.length < 2) {
            alert('Please select at least two PDF files to merge.');
            return;
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
            alert('An error occurred while merging PDFs.');
            console.error(error);
        } finally {
            hideLoader();
        }
    });

    // 3. Split PDF
    splitBtn.addEventListener('click', async () => {
        const file = splitInput.files[0];
        const pageNum = parseInt(pageNumInput.value, 10);
        if (!file || isNaN(pageNum) || pageNum <= 0) {
            alert('Please select a PDF and enter a valid page number.');
            return;
        }
        showLoader();
        try {
            const fileBytes = await file.arrayBuffer();
            const pdf = await PDFLib.PDFDocument.load(fileBytes);
            if (pageNum > pdf.getPageCount()) {
                alert(`Invalid page number. The PDF has only ${pdf.getPageCount()} pages.`);
                return;
            }
            const newPdf = await PDFLib.PDFDocument.create();
            const [copiedPage] = await newPdf.copyPages(pdf, [pageNum - 1]);
            newPdf.addPage(copiedPage);
            const newPdfBytes = await newPdf.save();
            downloadFile(newPdfBytes, `snap2pdf_page_${pageNum}.pdf`);
        } catch (error) {
            alert('An error occurred while splitting the PDF.');
            console.error(error);
        } finally {
            hideLoader();
        }
    });

    // 4. PDF to Text
    extractBtn.addEventListener('click', async () => {
        const file = extractInput.files[0];
        if (!file) {
            alert('Please select a PDF file to extract text from.');
            return;
        }
        showLoader();
        try {
            const fileReader = new FileReader();
            fileReader.onload = async function() {
                const typedarray = new Uint8Array(this.result);
                const pdf = await pdfjsLib.getDocument(typedarray).promise;
                let fullText = '';
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    fullText += textContent.items.map(item => item.str).join(' ') + '\n\n';
                }
                textOutput.value = fullText.trim();
            };
            fileReader.readAsArrayBuffer(file);
        } catch (error) {
            alert('An error occurred during text extraction.');
            console.error(error);
        } finally {
            hideLoader();
        }
    });

    // 5. Inline PDF Editor
    editInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        currentEditFile = file; // Store the original file for saving
        showLoader();

        const fileReader = new FileReader();
        fileReader.onload = async function() {
            const typedarray = new Uint8Array(this.result);
            const pdf = await pdfjsLib.getDocument(typedarray).promise;
            const page = await pdf.getPage(1);
            const viewport = page.getViewport({ scale: 1.5 });
            
            // Prepare canvas
            const canvasContext = editCanvas.getContext('2d');
            editCanvas.height = viewport.height;
            editCanvas.width = viewport.width;

            await page.render({ canvasContext, viewport }).promise;

            // Initialize Fabric.js
            fabricCanvas = new fabric.Canvas(editCanvas, {
                isDrawingMode: false,
            });
            
            // Set PDF page as background
            const bgImage = new fabric.Image(editCanvas, {
                selectable: false,
                evented: false,
            });
            fabricCanvas.setBackgroundImage(bgImage, fabricCanvas.renderAll.bind(fabricCanvas));

            // Clear the static canvas context now that it's in Fabric
            canvasContext.clearRect(0, 0, editCanvas.width, editCanvas.height);


            // Double-click to add text
            fabricCanvas.on('mouse:dblclick', function(opt) {
                const pointer = fabricCanvas.getPointer(opt.e);
                const text = new fabric.IText('Type here...', {
                    left: pointer.x,
                    top: pointer.y,
                    fill: 'red',
                    fontSize: 20,
                    fontFamily: 'Arial',
                    originX: 'center',
                    originY: 'center',
                });
                fabricCanvas.add(text).setActiveObject(text);
            });

            hideLoader();
        };
        fileReader.readAsArrayBuffer(file);
    });

    saveEditBtn.addEventListener('click', async () => {
        if (!fabricCanvas || !currentEditFile) {
            alert('Please load a PDF to edit first.');
            return;
        }
        showLoader();
        try {
            // Load the original PDF with pdf-lib
            const pdfBytes = await currentEditFile.arrayBuffer();
            const pdfDoc = await PDFLib.PDFDocument.load(pdfBytes);
            const firstPage = pdfDoc.getPages()[0];
            
            // Get the annotations from Fabric.js as a PNG image
            const fabricImageBytes = await fetch(fabricCanvas.toDataURL({ format: 'png' })).then(res => res.arrayBuffer());
            const embeddedImage = await pdfDoc.embedPng(fabricImageBytes);

            // Overlay the annotations on the first page
            firstPage.drawImage(embeddedImage, {
                x: 0,
                y: 0,
                width: firstPage.getWidth(),
                height: firstPage.getHeight(),
            });
            
            // Save the modified PDF
            const modifiedPdfBytes = await pdfDoc.save();
            downloadFile(modifiedPdfBytes, 'snap2pdf_edited.pdf');
        } catch (error) {
            alert('Failed to save the edited PDF.');
            console.error(error);
        } finally {
            hideLoader();
        }
    });
});
