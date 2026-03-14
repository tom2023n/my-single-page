const STORAGE_KEY = "road-sign-study-state-v2";
const THEME_KEY = "road-sign-study-theme";

let appData = [];
let currentMode = "list";
let currentIndex = 0;
let filteredFlashcards = [];
let currentQuestion = null;
let questionTimer = null;

const state = {
    searchText: "",
    listFilter: "all",
    onlyStarred: false,
    flashcardRandom: true,
    flashcardOnlyStarred: false,
    flashcardCards: [],
    quizScore: 0,
    quizTotal: 0,
    quizUseMistakesOnly: false,
    theme: loadTheme(),
    lastSession: loadLastSession(),
    progress: loadProgress(),
};

document.addEventListener("DOMContentLoaded", async () => {
    bindNav();
    bindThemeToggle();
    applyTheme(state.theme);
    appData = await loadData();
    state.flashcardCards = buildFlashcardDeck();
    setMode("list", { remember: false });
    window.addEventListener("keydown", handleKeyboardShortcuts);
});

function bindNav() {
    document.querySelectorAll(".nav-btn").forEach((button) => {
        button.addEventListener("click", () => {
            setMode(button.dataset.mode);
        });
    });
}

function bindThemeToggle() {
    const button = document.getElementById("theme-toggle");
    if (!button) {
        return;
    }

    button.addEventListener("click", () => {
        const nextTheme = state.theme === "dark" ? "light" : "dark";
        applyTheme(nextTheme);
    });

    updateThemeToggle();
}

function loadTheme() {
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (savedTheme === "light" || savedTheme === "dark") {
        return savedTheme;
    }

    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme) {
    state.theme = theme;
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
    updateThemeToggle();
}

function updateThemeToggle() {
    const button = document.getElementById("theme-toggle");
    if (!button) {
        return;
    }

    const icon = button.querySelector(".theme-toggle__icon");
    const text = button.querySelector(".theme-toggle__text");
    const isDark = state.theme === "dark";

    button.setAttribute("aria-pressed", String(isDark));
    if (icon) {
        icon.textContent = isDark ? "☾" : "☀";
    }
    if (text) {
        text.textContent = isDark ? "白天模式" : "夜晚模式";
    }
}

async function loadData() {
    if (typeof appDataRaw !== "undefined" && Array.isArray(appDataRaw)) {
        return appDataRaw;
    }

    try {
        const response = await fetch("data.json");
        return await response.json();
    } catch (error) {
        console.error("Error loading data:", error);
        return [];
    }
}

function loadProgress() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return {
                learned: {},
                starred: {},
                mistakes: {},
            };
        }

        const parsed = JSON.parse(raw);
        return {
            learned: parsed.learned || {},
            starred: parsed.starred || {},
            mistakes: parsed.mistakes || {},
        };
    } catch (error) {
        console.warn("Failed to parse study state:", error);
        return {
            learned: {},
            starred: {},
            mistakes: {},
        };
    }
}

function loadLastSession() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return createDefaultLastSession();
        }

        const parsed = JSON.parse(raw);
        return {
            ...createDefaultLastSession(),
            ...(parsed.lastSession || {}),
        };
    } catch (error) {
        return createDefaultLastSession();
    }
}

function createDefaultLastSession() {
    return {
        mode: "list",
        flashcardIndex: 0,
        savedAt: null,
    };
}

function saveProgress() {
    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
            ...state.progress,
            lastSession: state.lastSession,
        })
    );
}

function saveLastSession(overrides = {}) {
    state.lastSession = {
        ...state.lastSession,
        mode: currentMode,
        flashcardIndex: currentIndex,
        savedAt: new Date().toISOString(),
        ...overrides,
    };
    saveProgress();
}

function setMode(mode, options = {}) {
    const { resume = false, remember = true } = options;
    currentMode = mode;

    document.querySelectorAll(".nav-btn").forEach((button) => {
        const isActive = button.dataset.mode === mode;
        button.classList.toggle("active", isActive);
        button.setAttribute("aria-pressed", String(isActive));
    });

    if (mode === "flashcard") {
        state.flashcardCards = buildFlashcardDeck();
        currentIndex = resume
            ? Math.min(state.lastSession.flashcardIndex || 0, Math.max(0, state.flashcardCards.length - 1))
            : 0;
    }

    if (mode === "quiz") {
        state.quizScore = 0;
        state.quizTotal = 0;
        currentQuestion = null;
    }

    clearQuestionTimer();
    if (remember) {
        saveLastSession({ mode, flashcardIndex: currentIndex });
    }
    renderApp();
}

function renderApp() {
    const app = document.getElementById("app");
    app.innerHTML = "";

    if (!appData.length) {
        app.appendChild(renderEmptyState("词库还没有加载成功", "请确认 data.js 或 data.json 是否存在，并刷新页面重试。"));
        return;
    }

    if (currentMode === "list") {
        renderList(app);
        return;
    }

    if (currentMode === "flashcard") {
        renderFlashcard(app);
        return;
    }

    renderQuiz(app);
}

function getItemKey(item) {
    return item.en;
}

function isLearned(item) {
    return Boolean(state.progress.learned[getItemKey(item)]);
}

function isStarred(item) {
    return Boolean(state.progress.starred[getItemKey(item)]);
}

function getMistakeCount(item) {
    return state.progress.mistakes[getItemKey(item)] || 0;
}

function markLearned(item, learned = !isLearned(item), shouldRender = true) {
    const key = getItemKey(item);

    if (learned) {
        state.progress.learned[key] = true;
    } else {
        delete state.progress.learned[key];
    }

    saveProgress();
    if (currentMode === "flashcard") {
        state.flashcardCards = buildFlashcardDeck();
        currentIndex = Math.min(currentIndex, Math.max(0, state.flashcardCards.length - 1));
    }
    if (shouldRender) {
        renderApp();
    }
}

function toggleStar(item) {
    const key = getItemKey(item);

    if (state.progress.starred[key]) {
        delete state.progress.starred[key];
    } else {
        state.progress.starred[key] = true;
    }

    saveProgress();
    if (currentMode === "flashcard") {
        state.flashcardCards = buildFlashcardDeck();
        currentIndex = Math.min(currentIndex, Math.max(0, state.flashcardCards.length - 1));
    }
    renderApp();
}

function registerMistake(item) {
    const key = getItemKey(item);
    state.progress.mistakes[key] = (state.progress.mistakes[key] || 0) + 1;
    saveProgress();
}

function clearMistakes() {
    state.progress.mistakes = {};
    saveProgress();
    if (currentMode === "quiz") {
        renderApp();
    }
}

function playAudio(text) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 0.92;
    window.speechSynthesis.speak(utterance);
}

function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) {
        element.className = className;
    }
    if (text !== undefined) {
        element.textContent = text;
    }
    return element;
}

function renderDashboard() {
    const learnedCount = appData.filter(isLearned).length;
    const starredCount = appData.filter(isStarred).length;
    const mistakesCount = Object.values(state.progress.mistakes).reduce((sum, count) => sum + count, 0);
    const masteryRate = Math.round((learnedCount / appData.length) * 100);

    const dashboard = createElement("section", "dashboard");

    const heroPanel = createElement("div", "panel dashboard-hero");
    heroPanel.appendChild(createElement("div", "section-kicker", "学习概览"));
    heroPanel.appendChild(createElement("h2", "dashboard-title", "从这里开始你的爱尔兰路标复习"));
    heroPanel.appendChild(
        createElement(
            "p",
            "dashboard-copy",
            "先扫词建立识别感，再用翻卡做主动回忆，最后把错题留给测验模式集中击破。这样更接近真实备考节奏。"
        )
    );

    const heroMeta = createElement("div", "hero-meta");
    heroMeta.appendChild(createMetaPill("当前模式", getModeLabel(currentMode)));
    heroMeta.appendChild(createMetaPill("主题", state.theme === "dark" ? "夜晚" : "白天"));
    heroMeta.appendChild(createMetaPill("学习状态", masteryRate >= 70 ? "进入冲刺" : "持续积累"));
    heroPanel.appendChild(heroMeta);

    const resumeCard = renderResumeCard();
    if (resumeCard) {
        heroPanel.appendChild(resumeCard);
    }

    const sidePanel = createElement("div", "panel dashboard-journey");
    sidePanel.appendChild(createElement("div", "section-kicker", "Recommended flow"));
    sidePanel.appendChild(createElement("h3", "journey-title", "今日学习路径"));
    sidePanel.appendChild(renderJourneyList());

    const statsPanel = createElement("div", "panel compact-stats-panel stats-grid--full");
    statsPanel.appendChild(createElement("div", "section-kicker", "Quick stats"));
    const statsGrid = createElement("div", "stats-grid stats-grid--compact");
    statsGrid.appendChild(renderStatCard("总词条", String(appData.length)));
    statsGrid.appendChild(renderStatCard("已掌握", String(learnedCount)));
    statsGrid.appendChild(renderStatCard("收藏词", String(starredCount)));
    statsGrid.appendChild(renderStatCard("错题次数", String(mistakesCount)));
    statsGrid.appendChild(renderStatCard("掌握率", `${masteryRate}%`));
    statsGrid.appendChild(renderStatCard("今日建议", masteryRate >= 70 ? "多刷错题" : "先翻卡再测验"));
    statsPanel.appendChild(statsGrid);

    dashboard.appendChild(heroPanel);
    dashboard.appendChild(sidePanel);
    dashboard.appendChild(statsPanel);
    return dashboard;
}

function renderStatCard(label, value) {
    const card = createElement("div", "stat-card");
    card.appendChild(createElement("div", "stat-label", label));
    card.appendChild(createElement("div", "stat-value", value));
    return card;
}

function renderJourneyList() {
    const list = createElement("div", "journey-list");
    [
        ["01", "列表扫词", "先建立图形和英文的第一印象。"],
        ["02", "翻卡回忆", "遮住答案，训练主动提取。"],
        ["03", "测验巩固", "用错题回放查漏补缺。"],
    ].forEach(([step, title, text]) => {
        const item = createElement("div", "journey-item");
        item.appendChild(createElement("div", "journey-step", step));
        const body = createElement("div", "journey-body");
        body.appendChild(createElement("div", "journey-name", title));
        body.appendChild(createElement("div", "journey-copy", text));
        item.appendChild(body);
        list.appendChild(item);
    });
    return list;
}

function renderResumeCard() {
    if (!state.lastSession?.savedAt) {
        return null;
    }

    const card = createElement("div", "resume-card");
    card.appendChild(createElement("div", "section-kicker", "Resume"));
    card.appendChild(createElement("div", "resume-card__title", "继续上次学习"));
    card.appendChild(
        createElement(
            "p",
            "resume-card__copy",
            `你上次停留在${getModeLabel(state.lastSession.mode)}，${formatLastSessionDetail()}` 
        )
    );

    const button = createElement("button", "primary-btn resume-card__button", "继续学习");
    button.type = "button";
    button.addEventListener("click", () => resumeLastSession());
    card.appendChild(button);
    return card;
}

function formatLastSessionDetail() {
    if (state.lastSession.mode === "flashcard") {
        return `大约第 ${state.lastSession.flashcardIndex + 1} 张卡片。`;
    }

    if (state.lastSession.mode === "quiz") {
        return "可以直接回到测验模式继续练习。";
    }

    return "可以直接回到词库继续浏览。";
}

function resumeLastSession() {
    setMode(state.lastSession.mode || "list", { resume: true });
}

function createMetaPill(label, value) {
    const pill = createElement("div", "meta-pill");
    pill.appendChild(createElement("span", "meta-pill__label", label));
    pill.appendChild(createElement("strong", "meta-pill__value", value));
    return pill;
}

function getModeLabel(mode) {
    if (mode === "flashcard") {
        return "翻卡记忆";
    }
    if (mode === "quiz") {
        return "测验练习";
    }
    return "列表学习";
}

function renderModeHero(title, description, accent, metaItems) {
    const section = createElement("section", `mode-hero mode-hero--${accent}`);
    const body = createElement("div", "mode-hero__body");
    body.appendChild(createElement("div", "section-kicker", "Learning mode"));
    body.appendChild(createElement("h2", "mode-hero__title", title));
    body.appendChild(createElement("p", "mode-hero__copy", description));
    section.appendChild(body);

    const meta = createElement("div", "mode-hero__meta");
    metaItems.forEach((item) => meta.appendChild(createMetaPill(item.label, item.value)));
    section.appendChild(meta);
    return section;
}

function renderList(container) {
    container.appendChild(renderDashboard());
    container.appendChild(
        renderModeHero(
            "词库总览",
            "适合先快速扫一遍爱尔兰路考高频路标，建立图形、英文和中文释义之间的连接。",
            "list",
            [
                { label: "模式定位", value: "快速识别" },
                { label: "当前筛选", value: state.listFilter === "all" ? "全部词条" : state.listFilter },
                { label: "收藏开关", value: state.onlyStarred ? "仅收藏" : "全部可见" },
            ]
        )
    );

    const toolbar = createElement("section", "panel");
    const toolbarGrid = createElement("div", "toolbar");

    const searchInput = createElement("input", "search-field");
    searchInput.type = "search";
    searchInput.placeholder = "搜索英文、中文或音标";
    searchInput.value = state.searchText;
    searchInput.addEventListener("input", (event) => {
        state.searchText = event.target.value.trim();
        renderApp();
    });

    const filterSelect = createElement("select", "select-field");
    [
        { value: "all", label: "全部词条" },
        { value: "learned", label: "只看已掌握" },
        { value: "unlearned", label: "只看未掌握" },
        { value: "mistakes", label: "只看错题" },
    ].forEach((option) => {
        const element = createElement("option", "", option.label);
        element.value = option.value;
        element.selected = state.listFilter === option.value;
        filterSelect.appendChild(element);
    });
    filterSelect.addEventListener("change", (event) => {
        state.listFilter = event.target.value;
        renderApp();
    });

    const starredButton = createToggleChip("只看收藏", state.onlyStarred, () => {
        state.onlyStarred = !state.onlyStarred;
        renderApp();
    });

    const resetButton = createElement("button", "ghost-btn", "重置筛选");
    resetButton.type = "button";
    resetButton.addEventListener("click", () => {
        state.searchText = "";
        state.listFilter = "all";
        state.onlyStarred = false;
        renderApp();
    });

    toolbarGrid.append(searchInput, filterSelect, starredButton, resetButton);
    toolbar.appendChild(toolbarGrid);

    const filteredItems = getFilteredListItems();

    const subToolbar = createElement("div", "sub-toolbar");
    const summary = createElement(
        "div",
        "",
        `当前显示 ${filteredItems.length} / ${appData.length} 个词条${state.searchText ? `，关键词：“${state.searchText}”` : ""}`
    );
    const chipRow = createElement("div", "chip-row");
    chipRow.appendChild(createSummaryChip(`已掌握 ${appData.filter(isLearned).length}`));
    chipRow.appendChild(createSummaryChip(`收藏 ${appData.filter(isStarred).length}`));
    chipRow.appendChild(createSummaryChip(`错题 ${Object.keys(state.progress.mistakes).length}`));
    subToolbar.append(summary, chipRow);
    toolbar.appendChild(subToolbar);

    container.appendChild(toolbar);

    if (!filteredItems.length) {
        container.appendChild(renderEmptyState("没有找到匹配词条", "可以换个关键词，或取消“只看收藏 / 错题”等筛选条件。"));
        return;
    }

    const grid = createElement("section", "grid-container");
    filteredItems.forEach((item) => {
        grid.appendChild(renderListCard(item));
    });
    container.appendChild(grid);
}

function getFilteredListItems() {
    const query = state.searchText.toLowerCase();

    return appData.filter((item) => {
        const matchesText =
            !query ||
            item.en.toLowerCase().includes(query) ||
            item.zh.toLowerCase().includes(query) ||
            String(item.ipa || "").toLowerCase().includes(query);

        if (!matchesText) {
            return false;
        }

        if (state.onlyStarred && !isStarred(item)) {
            return false;
        }

        if (state.listFilter === "learned" && !isLearned(item)) {
            return false;
        }

        if (state.listFilter === "unlearned" && isLearned(item)) {
            return false;
        }

        if (state.listFilter === "mistakes" && getMistakeCount(item) === 0) {
            return false;
        }

        return true;
    });
}

function renderListCard(item) {
    const card = createElement("article", "card");

    const cardTop = createElement("div", "card-top");
    const left = createElement("div", "");
    left.appendChild(createElement("div", "tag", isLearned(item) ? "已掌握" : "待复习"));
    if (getMistakeCount(item) > 0) {
        left.appendChild(createElement("div", "tag muted", `错题 ${getMistakeCount(item)} 次`));
    }

    const actions = createElement("div", "card-actions");
    const audioBtn = createIconButton("🔊", "朗读英文", () => playAudio(item.en));
    const starBtn = createIconButton(isStarred(item) ? "★" : "☆", "收藏词条", () => toggleStar(item), isStarred(item));
    const learnedBtn = createIconButton(isLearned(item) ? "✓" : "○", "标记掌握", () => markLearned(item), isLearned(item));
    actions.append(audioBtn, starBtn, learnedBtn);
    cardTop.append(left, actions);

    const imageBox = createElement("div", "img-box");
    const image = createElement("img", "sign-img");
    image.src = item.img;
    image.alt = `${item.en} 路标`;
    image.loading = "lazy";
    imageBox.appendChild(image);

    const info = createElement("div", "info");
    info.appendChild(createElement("div", "en-text", item.en));
    info.appendChild(createElement("div", "ipa-text", item.ipa || "暂无音标"));
    info.appendChild(createElement("div", "zh-text", item.zh));

    card.append(cardTop, imageBox, info);
    return card;
}

function buildFlashcardDeck() {
    const base = state.flashcardOnlyStarred ? appData.filter(isStarred) : [...appData];
    const deck = [...base];

    if (state.flashcardRandom) {
        shuffle(deck);
    }

    return deck;
}

function renderFlashcard(container) {
    const deck = state.flashcardCards;
    container.appendChild(renderDashboard());
    container.appendChild(
        renderModeHero(
            "翻卡记忆",
            "先看图再回忆答案，让每张卡片都变成一次主动提取训练。这个模式最适合考前反复刷。",
            "flashcard",
            [
                { label: "当前进度", value: `${Math.min(currentIndex + 1, Math.max(deck.length, 1))}/${deck.length || 0}` },
                { label: "顺序", value: state.flashcardRandom ? "随机" : "顺序" },
                { label: "范围", value: state.flashcardOnlyStarred ? "仅收藏" : "全部卡片" },
            ]
        )
    );

    if (!deck.length) {
        container.appendChild(renderEmptyState("翻卡模式暂时没有卡片", "如果你开启了“只练收藏”，先回列表页收藏几个高频路标。"));
        return;
    }

    const item = deck[currentIndex];
    const shell = createElement("section", "flashcard-shell");

    const header = createElement("div", "flashcard-header");
    const left = createElement("div", "");
    left.appendChild(createElement("h2", "", "翻卡记忆"));
    left.appendChild(createElement("div", "hint-text", "空格键翻面，左右方向键切换卡片。"));

    const right = createElement("div", "chip-row");
    right.appendChild(createSummaryChip(`第 ${currentIndex + 1} / ${deck.length} 张`));
    right.appendChild(createToggleChip("随机顺序", state.flashcardRandom, () => {
        state.flashcardRandom = !state.flashcardRandom;
        state.flashcardCards = buildFlashcardDeck();
        currentIndex = 0;
        renderApp();
    }));
    right.appendChild(createToggleChip("只练收藏", state.flashcardOnlyStarred, () => {
        state.flashcardOnlyStarred = !state.flashcardOnlyStarred;
        state.flashcardCards = buildFlashcardDeck();
        currentIndex = 0;
        renderApp();
    }));
    header.append(left, right);
    shell.appendChild(header);

    const stage = createElement("div", "flashcard-stage");
    const cardButton = createElement("button", "flashcard");
    cardButton.type = "button";
    cardButton.setAttribute("aria-label", "翻转卡片");
    cardButton.dataset.flipped = "false";
    cardButton.addEventListener("click", () => toggleFlashcard(cardButton));

    const front = createElement("div", "flashcard-face flashcard-front");
    const frontImageBox = createElement("div", "flashcard-image-box");
    const frontImage = createElement("img", "");
    frontImage.src = item.img;
    frontImage.alt = `${item.en} 路标`;
    frontImageBox.appendChild(frontImage);
    front.appendChild(frontImageBox);
    front.appendChild(createElement("p", "hint-text", "先看图，尝试回忆英文和中文，再点一下翻面。"));

    const back = createElement("div", "flashcard-face flashcard-back");
    back.appendChild(createElement("div", "tag", isLearned(item) ? "已掌握" : "待复习"));
    back.appendChild(createElement("h2", "", item.en));
    back.appendChild(createElement("div", "ipa-text", item.ipa || "暂无音标"));
    back.appendChild(createElement("div", "flashcard-meaning", item.zh));
    back.appendChild(createElement("p", "hint-text", getMistakeCount(item) ? `这个词目前累计答错 ${getMistakeCount(item)} 次。` : "这个词目前还没有错题记录。"));

    const backActions = createElement("div", "controls");
    backActions.appendChild(createElement("button", "secondary-btn", isStarred(item) ? "取消收藏" : "加入收藏"));
    backActions.appendChild(createElement("button", "primary-btn", isLearned(item) ? "取消掌握" : "标记掌握"));
    backActions.appendChild(createElement("button", "ghost-btn", "朗读英文"));

    backActions.children[0].addEventListener("click", (event) => {
        event.stopPropagation();
        toggleStar(item);
    });
    backActions.children[1].addEventListener("click", (event) => {
        event.stopPropagation();
        markLearned(item);
    });
    backActions.children[2].addEventListener("click", (event) => {
        event.stopPropagation();
        playAudio(item.en);
    });
    back.appendChild(backActions);

    cardButton.append(front, back);
    stage.appendChild(cardButton);
    shell.appendChild(stage);

    const controls = createElement("div", "controls");
    const prevBtn = createElement("button", "control-btn", "上一张");
    prevBtn.type = "button";
    prevBtn.disabled = currentIndex === 0;
    prevBtn.addEventListener("click", () => changeFlashcard(-1));

    const nextBtn = createElement("button", "control-btn", "下一张");
    nextBtn.type = "button";
    nextBtn.disabled = currentIndex >= deck.length - 1;
    nextBtn.addEventListener("click", () => changeFlashcard(1));

    const restartBtn = createElement("button", "ghost-btn", "重新洗牌");
    restartBtn.type = "button";
    restartBtn.addEventListener("click", () => {
        state.flashcardCards = buildFlashcardDeck();
        currentIndex = 0;
        renderApp();
    });

    controls.append(prevBtn, nextBtn, restartBtn);
    shell.appendChild(controls);

    const progressLine = createElement("div", "progress-line");
    const progressFill = createElement("div", "progress-fill");
    progressFill.style.width = `${((currentIndex + 1) / deck.length) * 100}%`;
    progressLine.appendChild(progressFill);
    shell.appendChild(progressLine);

    container.appendChild(shell);
}

function toggleFlashcard(cardButton) {
    const isFlipped = cardButton.dataset.flipped === "true";
    cardButton.dataset.flipped = String(!isFlipped);
    cardButton.classList.toggle("flipped", !isFlipped);
}

function changeFlashcard(step) {
    const nextIndex = currentIndex + step;
    if (nextIndex < 0 || nextIndex >= state.flashcardCards.length) {
        return;
    }

    currentIndex = nextIndex;
    saveLastSession({ flashcardIndex: currentIndex, mode: "flashcard" });
    renderApp();
}

function renderQuiz(container) {
    container.appendChild(renderDashboard());
    container.appendChild(
        renderModeHero(
            "测验练习",
            "用真实选择题的节奏巩固记忆，把答错的路标自动沉淀到错题池里，方便后续集中复习。",
            "quiz",
            [
                { label: "练习范围", value: state.quizUseMistakesOnly ? "错题复习" : "全量题库" },
                { label: "当前得分", value: `${state.quizScore}/${state.quizTotal}` },
                { label: "错题词条", value: String(Object.keys(state.progress.mistakes).length) },
            ]
        )
    );

    const shell = createElement("section", "quiz-shell");
    const header = createElement("div", "quiz-header");
    const left = createElement("div", "");
    left.appendChild(createElement("h2", "", "测验练习"));
    left.appendChild(createElement("div", "hint-text", "做完一题会自动切到下一题。错过的题会进入错题记录。"));

    const right = createElement("div", "chip-row");
    right.appendChild(createToggleChip("只刷错题", state.quizUseMistakesOnly, () => {
        state.quizUseMistakesOnly = !state.quizUseMistakesOnly;
        currentQuestion = null;
        renderApp();
    }));

    const clearMistakeBtn = createElement("button", "ghost-btn", "清空错题");
    clearMistakeBtn.type = "button";
    clearMistakeBtn.addEventListener("click", clearMistakes);
    right.appendChild(clearMistakeBtn);
    header.append(left, right);
    shell.appendChild(header);

    const pool = getQuizPool();
    if (!pool.length) {
        shell.appendChild(renderEmptyState("当前没有可练习的题目", "如果你开启了“只刷错题”，先做几题普通测验再回来复习。"));
        container.appendChild(shell);
        return;
    }

    const question = currentQuestion || buildQuestion(pool);
    currentQuestion = question;

    const quizCard = createElement("div", "quiz-card");
    const leftSide = createElement("div", "");
    const imageBox = createElement("div", "img-box quiz-image");
    const image = createElement("img", "sign-img");
    image.src = question.correctItem.img;
    image.alt = `${question.correctItem.en} 路标`;
    imageBox.appendChild(image);
    leftSide.appendChild(imageBox);
    leftSide.appendChild(createElement("p", "hint-text", "先看路标图，再从右侧 4 个选项中选出正确英文。"));

    const rightSide = createElement("div", "");
    rightSide.appendChild(createElement("h3", "", "这个路标英文是什么？"));
    rightSide.appendChild(createElement("div", "hint-text", `题库范围：${state.quizUseMistakesOnly ? "错题复习" : "全部词条"}`));

    const optionsGrid = createElement("div", "options-grid");
    question.options.forEach((option) => {
        const button = createElement("button", "option-btn", option.en);
        button.type = "button";
        button.addEventListener("click", () => handleQuizAnswer(button, option, question.correctItem));
        optionsGrid.appendChild(button);
    });
    rightSide.appendChild(optionsGrid);

    const scoreBoard = createElement("div", "score-board");
    scoreBoard.appendChild(createElement("div", "score-pill", `得分 ${state.quizScore} / ${state.quizTotal}`));
    scoreBoard.appendChild(createElement("div", "score-pill", `错题词条 ${Object.keys(state.progress.mistakes).length}`));
    scoreBoard.appendChild(createElement("div", "score-pill", `当前池 ${pool.length}`));
    rightSide.appendChild(scoreBoard);

    quizCard.append(leftSide, rightSide);
    shell.appendChild(quizCard);
    container.appendChild(shell);
}

function getQuizPool() {
    if (!state.quizUseMistakesOnly) {
        return [...appData];
    }

    return appData.filter((item) => getMistakeCount(item) > 0);
}

function buildQuestion(pool) {
    const safePool = pool.length >= 4 ? pool : [...appData];
    const correctItem = safePool[Math.floor(Math.random() * safePool.length)];

    const distractorPool = appData.filter((item) => item.en !== correctItem.en);
    const distractorCount = Math.min(3, distractorPool.length);
    const distractors = shuffle([...distractorPool]).slice(0, distractorCount);
    const options = shuffle([correctItem, ...distractors]);

    return { correctItem, options };
}

function handleQuizAnswer(button, selectedItem, correctItem) {
    if (button.disabled) {
        return;
    }

    const isCorrect = selectedItem.en === correctItem.en;
    const buttons = Array.from(document.querySelectorAll(".option-btn"));
    buttons.forEach((item) => {
        item.disabled = true;
        if (item.textContent === correctItem.en) {
            item.classList.add("correct");
        }
    });

    state.quizTotal += 1;

    if (isCorrect) {
        state.quizScore += 1;
        button.classList.add("correct");
        markLearned(correctItem, true, false);
        playAudio("Correct");
    } else {
        button.classList.add("wrong");
        registerMistake(correctItem);
        playAudio("Try again");
    }

    updateQuizScoreboard();
    clearQuestionTimer();
    questionTimer = window.setTimeout(() => {
        currentQuestion = null;
        renderApp();
    }, 1400);
}

function updateQuizScoreboard() {
    const pills = document.querySelectorAll(".score-pill");
    if (pills[0]) {
        pills[0].textContent = `得分 ${state.quizScore} / ${state.quizTotal}`;
    }
    if (pills[1]) {
        pills[1].textContent = `错题词条 ${Object.keys(state.progress.mistakes).length}`;
    }
}

function clearQuestionTimer() {
    if (questionTimer) {
        window.clearTimeout(questionTimer);
        questionTimer = null;
    }
}

function createIconButton(text, label, handler, active = false) {
    const button = createElement("button", "icon-btn", text);
    button.type = "button";
    button.setAttribute("aria-label", label);
    if (active) {
        button.classList.add("active");
    }
    button.addEventListener("click", handler);
    return button;
}

function createSummaryChip(text) {
    return createElement("div", "chip", text);
}

function createToggleChip(text, active, handler) {
    const button = createElement("button", `chip${active ? " active" : ""}`, text);
    button.type = "button";
    button.addEventListener("click", handler);
    return button;
}

function renderEmptyState(title, description) {
    const box = createElement("section", "empty-state");
    box.appendChild(createElement("h3", "", title));
    box.appendChild(createElement("p", "", description));
    return box;
}

function handleKeyboardShortcuts(event) {
    if (currentMode === "flashcard") {
        const card = document.querySelector(".flashcard");
        if (event.code === "Space" && card) {
            event.preventDefault();
            toggleFlashcard(card);
        }

        if (event.key === "ArrowRight") {
            changeFlashcard(1);
        }

        if (event.key === "ArrowLeft") {
            changeFlashcard(-1);
        }
    }
}

function shuffle(array) {
    for (let index = array.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [array[index], array[swapIndex]] = [array[swapIndex], array[index]];
    }
    return array;
}
