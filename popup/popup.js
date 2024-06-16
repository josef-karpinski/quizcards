import {getActiveTabURL} from "../scripts/utils.js"
const { PDFDocument, StandardFonts, rgb } = PDFLib


document.getElementById("create-pdf-button").addEventListener("click", async () => {
    const activeTab = await getActiveTabURL();

    if (parseInt(document.getElementById("num-cols").value) > parseInt(document.getElementById("num-cols").max) ||
        parseInt(document.getElementById("num-rows").value) > parseInt(document.getElementById("num-rows").max) ||
        parseInt(document.getElementById("num-cols").value) < parseInt(document.getElementById("num-cols").min) ||
        parseInt(document.getElementById("num-rows").value) < parseInt(document.getElementById("num-rows").min))
        {
            alert("Invalid Input.");
        }
    else{
        if (activeTab.url.includes("quizlet.com")){
            chrome.tabs.sendMessage(activeTab.id, {type: "GET_FLASHCARDS"})
                .then((resp) => {
                    const {flashcardTerms, pageTitle} = resp;
                    if (flashcardTerms.length > 0){
                        let numCols = parseInt(document.getElementById("num-cols").value);
                        let numRows = parseInt(document.getElementById("num-rows").value);
                        let termFont = document.getElementById("term-font").value;
                        let definitionFont = document.getElementById("definition-font").value;
                        createPdf(flashcardTerms, numRows, numCols, termFont, definitionFont, pageTitle);
                    }
                    else{
                        alert("We did not find terms on this page.\nPlease make sure you are on a valid quizlet flashcard set webpage.")
                    }
                })
                .catch(error => {
                    alert("There was an error fetching terms from Quizlet.\nPlease reload the webpage and try again.");
                });    
        }
        else{
            alert("This is not a Quizlet website.");
        }
    }
    
});

//////////////////////////
//PDF Creation Functions
async function createPdf(flashcardTerms, termRows, termCols, termFont, definitionFont, pageTitle) {
    // Create a new PDFDocument
    const arrayBuffer = await fetch("./../assets/instructions_page.pdf").then(res => res.arrayBuffer())
    const pdfDoc = await PDFDocument.load(arrayBuffer)

    // Embed fonts for the terms and definitions
    const termEmbeddedFont = await embedFontFromSettings(pdfDoc, termFont);
    const defEmbeddedFont = await embedFontFromSettings(pdfDoc, definitionFont);

    // Initialize variables for term boxes
    const termsPerPage = termRows * termCols;

    // Get the width and height of the page
    const { width, height } = pdfDoc.getPages()[0].getSize();

    const heightPerTerm = height / termRows;
    const widthPerTerm = width / termCols;

    for (let i = 0; i < flashcardTerms.length; i += termsPerPage){
        const frontPage = pdfDoc.addPage([width, height]);
        const backPage = pdfDoc.addPage([width, height]);

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
    download(pdfBytes, pageTitle + ".pdf", "application/pdf");
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

async function embedFontFromSettings(doc, fontToEmbed){
    let embeddedFont;
    // These are the only normal fonts available with PDF-Lib
    switch (fontToEmbed) {
        case "Courier":
            embeddedFont = await doc.embedFont(StandardFonts.Courier);
            break;
        case "CourierBold":
            embeddedFont = await doc.embedFont(StandardFonts.CourierBold);
            break;
        case "CourierOblique":
            embeddedFont = await doc.embedFont(StandardFonts.CourierOblique);
            break;
        case "CourierBoldOblique":
            embeddedFont = await doc.embedFont(StandardFonts.CourierBoldOblique);
            break;
        case "Helvetica":
            embeddedFont = await doc.embedFont(StandardFonts.Helvetica);
            break;
        case "HelveticaBold":
            embeddedFont = await doc.embedFont(StandardFonts.HelveticaBold);
            break;
        case "HelveticaOblique":
            embeddedFont = await doc.embedFont(StandardFonts.HelveticaOblique);
            break;
        case "HelveticaBoldOblique":
            embeddedFont = await doc.embedFont(StandardFonts.HelveticaBoldOblique);
            break;
        case "TimesRoman":
            embeddedFont = await doc.embedFont(StandardFonts.TimesRoman);
            break;
        case "TimesRomanBold":
            embeddedFont = await doc.embedFont(StandardFonts.TimesRomanBold);
            break;
        case "TimesRomanItalic":
            embeddedFont = await doc.embedFont(StandardFonts.TimesRomanItalic);
            break;
        case "TimesRomanBoldItalic":
            embeddedFont = await doc.embedFont(StandardFonts.TimesRomanBoldItalic);
            break;
        default:
            embeddedFont = await doc.embedFont(StandardFonts.Courier);
    }
    return embeddedFont;
}
//End of PDF Creation Functions
//////////////////////////


// Load settings from storage
document.addEventListener("DOMContentLoaded", async (e) => {
    let savedSettings = await chrome.storage.sync.get("settings");
    if (savedSettings.settings === undefined){
        await setDefaultSettings();
    }
    savedSettings = await chrome.storage.sync.get("settings");
    document.getElementById('num-rows').value = savedSettings.settings["numRows"];
    document.getElementById('num-cols').value = savedSettings.settings["numCols"];
    document.getElementById('term-font').value = savedSettings.settings["termFont"];
    document.getElementById('definition-font').value = savedSettings.settings["definitionFont"];
});

// Save settings button
document.getElementById("settings-form").addEventListener("submit", async (e) => {
    e.preventDefault(); // prevents default action (for DOMContentLoaded)

    let settings = {
        "numRows": document.getElementById("num-rows").value,
        "numCols": document.getElementById("num-cols").value,
        "termFont": document.getElementById("term-font").value,
        "definitionFont": document.getElementById("definition-font").value,
    }
    // TODO: Data validation
    //
    await chrome.storage.sync.set({"settings": settings});
});

// Reset settings button
document.getElementById("reset-settings-button").addEventListener("click", async (e) => {
    e.preventDefault(); // prevents default action (for DOMContentLoaded)

    await setDefaultSettings();
    const savedSettings = await chrome.storage.sync.get("settings");
    document.getElementById('num-rows').value = savedSettings.settings["numRows"];
    document.getElementById('num-cols').value = savedSettings.settings["numCols"];
    document.getElementById('term-font').value = savedSettings.settings["termFont"];
    document.getElementById('definition-font').value = savedSettings.settings["definitionFont"];
});



async function setDefaultSettings(){
    const settings = {
        "numRows": 5,
        "numCols": 2,
        "termFont": "CourierBoldOblique",
        "definitionFont": "CourierOblique",
    };
    await chrome.storage.sync.set({"settings": settings});
}