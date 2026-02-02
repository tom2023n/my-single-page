let appData = [];
let currentMode = 'list';
let currentIndex = 0;
let quizScore = 0;
let quizTotal = 0;

document.addEventListener('DOMContentLoaded', () => {
    // Check if data is available via global variable (from data.js)
    if (typeof appDataRaw !== 'undefined') {
        appData = appDataRaw;
        setMode('list');
    } else {
        // Fallback for server mode if data.js is not used
        fetch('data.json')
            .then(response => response.json())
            .then(data => {
                appData = data;
                setMode('list');
            })
            .catch(err => console.error('Error loading data:', err));
    }
});

function setMode(mode) {
    currentMode = mode;
    
    // Update nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`btn-${mode}`).classList.add('active');
    
    const app = document.getElementById('app');
    app.innerHTML = ''; // Clear content
    
    if (mode === 'list') {
        renderList(app);
    } else if (mode === 'flashcard') {
        currentIndex = 0;
        renderFlashcard(app);
    } else if (mode === 'quiz') {
        quizScore = 0;
        quizTotal = 0;
        renderQuiz(app);
    }
}

function playAudio(text) {
    window.speechSynthesis.cancel();
    let m = new SpeechSynthesisUtterance(text);
    m.lang = 'en-US';
    m.rate = 0.9;
    window.speechSynthesis.speak(m);
}

// --- List Mode ---
function renderList(container) {
    const searchDiv = document.createElement('div');
    searchDiv.style.marginBottom = '20px';
    searchDiv.innerHTML = `
        <input type="text" id="searchInput" placeholder="搜索 Search..." 
        style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid #ddd; box-sizing: border-box;">
    `;
    container.appendChild(searchDiv);

    const grid = document.createElement('div');
    grid.className = 'grid-container';
    container.appendChild(grid);

    function renderItems(filterText = '') {
        grid.innerHTML = '';
        const lowerFilter = filterText.toLowerCase();
        
        appData.forEach(item => {
            if (item.en.toLowerCase().includes(lowerFilter) || item.zh.includes(lowerFilter)) {
                const card = document.createElement('div');
                card.className = 'card';
                card.innerHTML = `
                    <div class="img-box">
                        <img src="${item.img}" class="sign-img" alt="${item.en}">
                    </div>
                    <div class="info">
                        <div class="en-text">
                            ${item.en}
                            <button class="audio-btn" onclick="playAudio('${item.en.replace(/'/g, "\\'")}')">🔊</button>
                        </div>
                        <div class="ipa-text">${item.ipa}</div>
                        <div class="zh-text">${item.zh}</div>
                    </div>
                `;
                grid.appendChild(card);
            }
        });
    }

    renderItems();

    document.getElementById('searchInput').addEventListener('input', (e) => {
        renderItems(e.target.value);
    });
}

// --- Flashcard Mode ---
function renderFlashcard(container) {
    const wrapper = document.createElement('div');
    
    // Progress
    const progress = document.createElement('div');
    progress.style.textAlign = 'center';
    progress.id = 'fc-progress';
    progress.innerText = `Card ${currentIndex + 1} / ${appData.length}`;
    wrapper.appendChild(progress);

    // Card Container
    const cardContainer = document.createElement('div');
    cardContainer.className = 'flashcard-container';
    cardContainer.onclick = function() {
        this.querySelector('.flashcard').classList.toggle('flipped');
    };
    
    cardContainer.innerHTML = `
        <div class="flashcard" id="current-flashcard">
            <!-- Front and Back will be set by updateFlashcard -->
        </div>
    `;
    wrapper.appendChild(cardContainer);

    // Controls
    const controls = document.createElement('div');
    controls.className = 'controls';
    controls.innerHTML = `
        <button class="control-btn" onclick="prevCard()">Previous</button>
        <button class="control-btn" onclick="nextCard()">Next</button>
    `;
    wrapper.appendChild(controls);

    container.appendChild(wrapper);
    updateFlashcard();
}

function updateFlashcard() {
    const item = appData[currentIndex];
    const fc = document.getElementById('current-flashcard');
    const progress = document.getElementById('fc-progress');
    
    // Remove flipped class to reset state when changing cards
    fc.classList.remove('flipped');
    
    // Front: Image
    // Back: English, IPA, Chinese, Audio
    
    // We need to wait a tiny bit for the flip reset if we want it smooth, 
    // but for simplicity we just update content.
    
    fc.innerHTML = `
        <div class="flashcard-front">
            <div class="img-box" style="height: 200px; width: 100%; background: transparent;">
                <img src="${item.img}" style="max-height: 100%; max-width: 100%;">
            </div>
            <p style="color: #666; margin-top: 20px;">(Click to flip)</p>
        </div>
        <div class="flashcard-back">
            <h2>${item.en}</h2>
            <p class="ipa-text">${item.ipa}</p>
            <h3>${item.zh}</h3>
            <button class="audio-btn" style="font-size: 2rem; margin-top: 10px;" onclick="event.stopPropagation(); playAudio('${item.en.replace(/'/g, "\\'")}')">🔊</button>
        </div>
    `;
    
    progress.innerText = `Card ${currentIndex + 1} / ${appData.length}`;
}

function nextCard() {
    if (currentIndex < appData.length - 1) {
        currentIndex++;
        updateFlashcard();
    }
}

function prevCard() {
    if (currentIndex > 0) {
        currentIndex--;
        updateFlashcard();
    }
}

// --- Quiz Mode ---
function renderQuiz(container) {
    // Pick a random item
    const questionIndex = Math.floor(Math.random() * appData.length);
    const correctItem = appData[questionIndex];
    
    // Pick 3 distractors
    let distractors = [];
    while (distractors.length < 3) {
        let idx = Math.floor(Math.random() * appData.length);
        if (idx !== questionIndex && !distractors.includes(idx)) {
            distractors.push(idx);
        }
    }
    
    // Combine and shuffle options
    let options = [questionIndex, ...distractors];
    options.sort(() => Math.random() - 0.5); // Simple shuffle
    
    const wrapper = document.createElement('div');
    wrapper.className = 'quiz-container';
    
    wrapper.innerHTML = `
        <h2>What is this sign?</h2>
        <div class="img-box" style="height: 200px; margin-bottom: 20px;">
            <img src="${correctItem.img}" style="max-height: 100%; max-width: 100%;">
        </div>
        <div class="options-grid" id="options-grid">
            <!-- Options injected here -->
        </div>
        <div class="score-board">
            Score: ${quizScore} / ${quizTotal}
        </div>
    `;
    
    const optionsGrid = wrapper.querySelector('#options-grid');
    options.forEach(idx => {
        const item = appData[idx];
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.innerText = item.en;
        btn.onclick = () => handleQuizAnswer(idx === questionIndex, btn, correctItem);
        optionsGrid.appendChild(btn);
    });
    
    container.appendChild(wrapper);
}

function handleQuizAnswer(isCorrect, btn, item) {
    if (btn.disabled) return;
    
    // Disable all buttons
    const btns = document.querySelectorAll('.option-btn');
    btns.forEach(b => b.disabled = true);
    
    quizTotal++;
    
    if (isCorrect) {
        btn.classList.add('correct');
        quizScore++;
        playAudio("Correct");
    } else {
        btn.classList.add('wrong');
        // Highlight correct one
        btns.forEach(b => {
            if (b.innerText === item.en) b.classList.add('correct');
        });
        playAudio("Wrong");
    }
    
    // Update score display
    document.querySelector('.score-board').innerText = `Score: ${quizScore} / ${quizTotal}`;
    
    // Next question after delay
    setTimeout(() => {
        const app = document.getElementById('app');
        app.innerHTML = '';
        renderQuiz(app);
    }, 1500);
}
