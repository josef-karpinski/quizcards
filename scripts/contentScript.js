(()=>{
    chrome.runtime.onMessage.addListener((obj, sender, response) => {
        if (obj.type === "GET_FLASHCARDS"){
            let allFlashcards = []
            allFlashcards = getFlashcards();
            let titleElement = document.getElementsByClassName("tp6mz3n")[0]
            let title = titleElement ? ("QuizCards - " + titleElement.textContent) : "QuizCards";
            response({
                flashcardTerms: allFlashcards, 
                pageTitle: title
            });
        }
    })
})();

const getFlashcards = () => {
    // Initialize result array, represents a list of lists, with each inner list being a flashcard
    let result = [];

    // Get the DOM objects of all flashcard containers
    let flashcardContainers = document.getElementsByClassName("SetPageTerms-term");
    
    // Iterate through each of the flashcard containers
    for (let i = 0; i < flashcardContainers.length; i++){
        let flashcardSides = flashcardContainers[i].getElementsByClassName('TermText');
        if (flashcardSides.length !== 2){
            // This will skip flashcards where one of the terms has no text (image only)
            continue;
        }
        let flashcard = [flashcardSides[0].textContent, flashcardSides[1].textContent];
        result.push(flashcard);
    }
    return result;
}