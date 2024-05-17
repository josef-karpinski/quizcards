import {getActiveTabURL} from "./utils.js"
const { PDFDocument, StandardFonts, rgb } = PDFLib


document.getElementById("create-pdf-button").addEventListener("click", async () => {
    const activeTab = await getActiveTabURL();

    if (activeTab.url.includes("quizlet.com")){
        let flashcardTerms;
        chrome.tabs.sendMessage(activeTab.id, {type: "GET_FLASHCARDS"})
            .then((resp) => {
                flashcardTerms = resp;
                if (flashcardTerms.length > 0){
                    // Add PDF functionality and download functionality
                    createPdf(flashcardTerms, 5, 2);
                    alert(flashcardTerms[0])
                }
                else{
                    alert("We did not find terms on this page, please make sure you are on a valid quizlet flashcard set webpage.")
                }
            })
            .catch(error => {
                alert("Error fetching terms from Quizlet, please reload the webpage and try again.");
            });

        
        
    }
    else{
        alert("This is not a quizlet domain website.");
    }
    
});

async function createPdf(flashcardTerms, termRows, termCols) {
    // Create a new PDFDocument
    const pdfDoc = await PDFDocument.create()

    // Embed fonts for the terms and definitions
    const termEmbeddedFont = await pdfDoc.embedFont(StandardFonts.CourierBoldOblique);
    const defEmbeddedFont = await pdfDoc.embedFont(StandardFonts.CourierOblique);

    // Initialize variables for term boxes
    //const termRows = 5;
    //const termCols = 2;
    const termsPerPage = termRows * termCols;

    // Add a blank page to the document
    const instrPage = pdfDoc.addPage()
    pdfDoc.addPage() // Add another Page for double sided

    // Get the width and height of the page
    const { width, height } = instrPage.getSize()

    const heightPerTerm = height / termRows;
    const widthPerTerm = width / termCols;

    // Draw a string of text toward the top of the page
    const fontSize = 30
    instrPage.drawText("Intructions Page", {
        x: 50,
        y: height - 4 * fontSize,
        size: fontSize,
        font: termEmbeddedFont,
        color: rgb(0, 0.53, 0.71),
    });

    instrPage.drawLine({
        start: { x: 0, y: 0 },
        end: { x: width/2, y: height/2},
        thickness: 0.5,
        color: rgb(0, 0, 0),
        opacity: 0,
        dashPhase: 10,
    });

    for (let i = 0; i < flashcardTerms.length; i += termsPerPage){
        const frontPage = pdfDoc.addPage();
        const backPage = pdfDoc.addPage();

        // Add lines
        for(let c = 1; c < termCols; c++){
            drawDashedLine(frontPage, c * (width / termCols), height, c * (width / termCols), 0, 5);
            drawDashedLine(backPage, c * (width / termCols), height, c * (width / termCols), 0, 5);
        }

        for(let r = 1; r < termRows; r++){
            drawDashedLine(frontPage, width, r * (height / termRows), 0, r * (height / termRows), 5);
            drawDashedLine(backPage, width, r * (height / termRows), 0, r * (height / termRows), 5);
        }

        // Add Terms & Definitions
        for(let r = 0; r < termRows; r++){
            let minY = (termRows - r - 1) * heightPerTerm;
            let maxY = (termRows - r) * heightPerTerm;
            // Front Page (go left to right)
            for (let c = 0; c < termCols; c++) {
                if (i + r * termCols + c < flashcardTerms.length) {
                    let termText = flashcardTerms[i + r * termCols + c][0];
                    let minX = c * widthPerTerm;
                    let maxX = (c + 1) * widthPerTerm;
                    dynamicTextBox(frontPage, termText, termEmbeddedFont, minX+10, maxX-10, minY+10, maxY-10);
                }
            }

            // Back Page (go right to left)
            for (let c = termCols - 1; c >= 0; c--) {
                if (i + r * termCols + (termCols - 1 - c) < flashcardTerms.length) {
                    let defText = flashcardTerms[i + r * termCols + (termCols - 1 - c)][1];
                    let minX = c * widthPerTerm;
                    let maxX = (c + 1) * widthPerTerm;
                    dynamicTextBox(backPage, defText, defEmbeddedFont, minX+10, maxX-10, minY+10, maxY-10);
                }
            }
        }
    }



    // Serialize the PDFDocument to bytes (a Uint8Array)
    const pdfBytes = await pdfDoc.save()

    // Trigger the browser to download the PDF document
    download(pdfBytes, "quizcards.pdf", "application/pdf");
}

function dynamicTextBox(page, text, embeddedFont, minX, maxX, minY, maxY){
    const boxWidth = maxX - minX;
    const boxHeight = maxY - minY;

    const xCenter = (maxX + minX)/2;
    const yCenter = (maxY + minY)/2;

    const maxFontSize = embeddedFont.sizeAtHeight(boxHeight)

    for(let fontSize = Math.floor(maxFontSize * 0.45); fontSize >=0; fontSize--){
        const fontHeight = embeddedFont.heightAtSize(fontSize);
        const maxLines = Math.floor(boxHeight/fontHeight) - 1;

        const textWidth = embeddedFont.widthOfTextAtSize(text, fontSize);

        const textSplit = splitTextAtWidth(text, embeddedFont, fontSize, boxWidth);

        const reqLines = Math.ceil(textWidth / boxWidth);

        if (textSplit.length < maxLines && reqLines < maxLines){
            let contBool = false;
            for(let line = 0; line < textSplit.length; line++){
                if (embeddedFont.widthOfTextAtSize(textSplit[line], fontSize) > boxWidth){
                    contBool = true;
                    break;
                }
            }
            if (contBool){
                continue;
            }
            // Calculate the starting y position to center the text block vertically
            let y = maxY - (boxHeight/(textSplit.length+1)) - fontHeight/2;

            textSplit.forEach(line => {
                const lineWidth = embeddedFont.widthOfTextAtSize(line, fontSize);
                const x = xCenter - lineWidth / 2;
                page.drawText(line, { x, y, size: fontSize, font: embeddedFont });
                
                y -= (fontHeight + fontHeight * 0.1);
            });
            break;
        }




    }


}

function splitTextAtWidth(text, embeddedFont, fontSize, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';

    words.forEach(word => {
        const testLine = currentLine.length === 0 ? word : `${currentLine} ${word}`;
        const testLineWidth = embeddedFont.widthOfTextAtSize(testLine, fontSize);

        if (testLineWidth <= maxWidth) {
            currentLine = testLine;
        } else {
            lines.push(currentLine);
            currentLine = word;
        }
    });

    if (currentLine.length > 0) {
        lines.push(currentLine);
    }

    return lines;
}

function drawDashedLine(page, startX, startY, endX, endY, segmentLength) {
    const totalLength = Math.sqrt((endX - startX) ** 2 + (endY - startY) ** 2);
    const dashCount = Math.floor(totalLength / segmentLength);
    const deltaX = (endX - startX) / dashCount;
    const deltaY = (endY - startY) / dashCount;

    for (let i = 0; i < dashCount; i += 2) {
        const x1 = startX + i * deltaX;
        const y1 = startY + i * deltaY;
        const x2 = startX + (i + 1) * deltaX;
        const y2 = startY + (i + 1) * deltaY;

        page.drawLine({
            start: { x: x1, y: y1 },
            end: { x: x2, y: y2 },
            thickness: 0.5,
            color: rgb(0, 0, 0),
        });
    }
}