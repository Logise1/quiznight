import { db, ref, set, get, update, onValue } from "./firebase-config.js";

const AUDIO_URLS = {
    bgm1: 'https://logise1.github.io/quiznight/bgm1.mp3',
    bgm2: 'https://logise1.github.io/quiznight/bgm2.mp3',
    gong: 'https://logise1.github.io/quiznight/gong.mp3'
};

const state = {
    userId: localStorage.getItem('fq_host_uid') || 'host_' + Math.random().toString(36).substr(2, 9),
    gameId: null, players: {}, questions: [], currentQIndex: 0,
    soundEnabled: true, hostTimer: null, roundDuration: 20
};
localStorage.setItem('fq_host_uid', state.userId);

const audio = { bgm1: new Audio(AUDIO_URLS.bgm1), bgm2: new Audio(AUDIO_URLS.bgm2), gong: new Audio(AUDIO_URLS.gong) };
audio.bgm1.loop = true; audio.bgm2.loop = true;

const stopAllAudio = () => { Object.values(audio).forEach(a => { a.pause(); a.currentTime = 0; }); };
const playTrack = (track) => {
    if (!state.soundEnabled) return;
    if (track !== 'gong' && !audio[track].paused) return;
    if (track === 'bgm1') { audio.bgm2.pause(); audio.gong.pause(); }
    if (track === 'bgm2') { audio.bgm1.pause(); audio.gong.pause(); }
    if (track === 'gong') { audio.bgm1.pause(); audio.bgm2.pause(); }
    audio[track].volume = track === 'gong' ? 1.0 : 0.5;
    audio[track].play().catch(e => console.log("Audio", e));
};

window.app = {
    toggleSound: () => { state.soundEnabled = !state.soundEnabled; updateSoundIcon(); if (!state.soundEnabled) stopAllAudio(); },
    toggleFullscreen: () => {
        try {
            const elem = document.documentElement;
            if (elem.requestFullscreen) elem.requestFullscreen().catch(() => { });
            else if (elem.webkitRequestFullscreen) elem.webkitRequestFullscreen();
        } catch (e) { }
    },
    startHostGame: async () => { await update(ref(db, `games/${state.gameId}`), { status: 'preview', currentQuestion: 0 }); runQuestionSequence(0); },
    nextQuestion: async () => {
        if (state.currentQIndex + 1 < state.questions.length) {
            const nextIdx = state.currentQIndex + 1; state.currentQIndex = nextIdx;
            await update(ref(db, `games/${state.gameId}`), { currentQuestion: nextIdx }); runQuestionSequence(nextIdx);
        } else { await update(ref(db, `games/${state.gameId}`), { status: 'finished' }); }
    },
    createGame: () => initHost()
};

const updateSoundIcon = () => {
    const btn = document.getElementById('btn-sound');
    if (btn) btn.innerHTML = state.soundEnabled ?
        `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>` :
        `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" x2="17" y1="9" y2="15"/><line x1="17" x2="23" y1="9" y2="15"/></svg>`;
};

const showScreen = (id) => {
    document.querySelectorAll('.screen').forEach(el => el.classList.add('hidden-screen'));
    document.getElementById(id).classList.remove('hidden-screen');
};

async function initHost() {
    app.toggleFullscreen();
    try {
        const res = await fetch('https://logise1.github.io/quiznight/q.json');
        const data = await res.json();
        const balas = data.filter(q => q.type === 'bala').sort(() => 0.5 - Math.random()).slice(0, 6);
        const culturas = data.filter(q => !q.type || q.type === 'cultura').sort(() => 0.5 - Math.random()).slice(0, 15);
        const refranes = data.filter(q => q.type === 'refran').sort(() => 0.5 - Math.random()).slice(0, 7);
        const logicas = data.filter(q => q.type === 'logica').sort(() => 0.5 - Math.random()).slice(0, 7);

        let mixedQuestions = [...balas, ...culturas, ...logicas, ...refranes].sort(() => 0.5 - Math.random());

        state.questions = mixedQuestions.map(q => {
            const correctText = q.options[q.correct];
            const newOptions = [...q.options].sort(() => 0.5 - Math.random());
            const newCorrectIndex = newOptions.indexOf(correctText);
            return { ...q, options: newOptions, correct: newCorrectIndex };
        });

    } catch (e) { state.questions = [{ question: "Error loading questions", options: ["A", "B", "C", "D"], correct: 0, type: "bala" }]; }

    const id = Math.floor(1000 + Math.random() * 9000).toString();
    state.gameId = id;
    await set(ref(db, `games/${id}`), { hostId: state.userId, status: 'lobby', currentQuestion: 0, players: {}, startTime: null, optionsVisible: false });

    document.getElementById('host-game-id').textContent = id;
    updateSoundIcon(); playTrack('bgm2'); showScreen('screen-host-lobby');

    // Generate QR
    const baseUrl = window.location.href.split('?')[0];
    const playerUrl = new URL('play.html', baseUrl).href + '?pin=' + id;
    new QRCode(document.getElementById('qrcode'), { text: playerUrl, width: 200, height: 200, colorDark: "#000000", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.H });

    onValue(ref(db, `games/${id}`), (snap) => { if (snap.val()) { state.players = snap.val().players || {}; updateHostUI(snap.val()); } });
}

function updateHostUI(data) {
    if (data.status === 'lobby') {
        const pList = Object.values(state.players);
        document.getElementById('host-player-count').textContent = pList.length;
        document.getElementById('btn-start-game').disabled = pList.length === 0;
        document.getElementById('host-player-list').innerHTML = pList.map(p => {
            const a = p.avatar || { emoji: '😀', color: 'bg-gray-400' };
            return `<div class="player-card flex flex-col items-center animate-bounce"><div class="w-24 h-24 rounded-full flex items-center justify-center text-5xl shadow-lg border-4 border-white mb-2 ${a.color}">${a.emoji}</div><div class="bg-white/10 backdrop-blur text-white px-3 py-1 rounded-lg font-bold truncate w-full text-center border border-white/20">${p.name}</div></div>`;
        }).join('');
    } else if (data.status === 'leaderboard') renderLeaderboard(data.players);
    else if (data.status === 'finished') renderFinished(data.players);
    else if (data.status === 'question') {
        if (data.optionsVisible) {
            renderHostQuestion(state.currentQIndex, true);
            showScreen('screen-host-game');
            const pIds = Object.keys(state.players);
            if (pIds.length > 0 && pIds.every(pid => state.players[pid].currentAnswer != null)) {
                if (state.hostTimer) clearInterval(state.hostTimer); calculateScores();
            }
        }
    } else if (data.status === 'reveal') {
        renderHostQuestion(state.currentQIndex, true);
        Array.from(document.getElementById('host-options-grid').children).forEach((el, idx) => {
            if (idx !== state.questions[state.currentQIndex].correct) el.classList.add('opacity-20'); else el.classList.add('ring-4', 'ring-gold', 'scale-105');
        });
        showScreen('screen-host-game');
    }

    // Audio logic
    if (data.status === 'preview') { const isEven = state.currentQIndex % 2 === 0; if (!isEven) playTrack('bgm2'); }
    else if (data.status === 'question') { const isEven = state.currentQIndex % 2 === 0; if (isEven) playTrack('bgm1'); }
    else if (data.status === 'leaderboard' || data.status === 'finished') playTrack('gong');
}

function runQuestionSequence(idx) {
    stopAllAudio();
    update(ref(db, `games/${state.gameId}`), { status: 'preview', optionsVisible: false });
    renderHostQuestion(idx, false);
    showScreen('screen-host-game');
    let countdown = 5;
    document.getElementById('host-timer').textContent = countdown;
    if (state.hostTimer) clearInterval(state.hostTimer);
    state.hostTimer = setInterval(() => {
        countdown--; document.getElementById('host-timer').textContent = countdown;
        if (countdown <= 0) { clearInterval(state.hostTimer); startAnsweringPhase(idx); }
    }, 1000);
}

async function startAnsweringPhase(idx) {
    const q = state.questions[idx];
    let finalQ = { ...q };
    const isBala = q.type === 'bala';
    const isLogica = q.type === 'logica';
    const isRefran = q.type === 'refran';
    state.roundDuration = isBala ? 10 : (isLogica || isRefran ? 25 : 20);

    await update(ref(db, `games/${state.gameId}`), { status: 'question', optionsVisible: true, questionStartTime: Date.now(), roundDuration: state.roundDuration, dynamicQ: finalQ });

    renderHostQuestion(idx, true);
    let countdown = state.roundDuration;
    document.getElementById('host-timer').textContent = countdown;
    if (state.hostTimer) clearInterval(state.hostTimer);
    state.hostTimer = setInterval(() => {
        countdown--;
        document.getElementById('host-timer').textContent = countdown;
        if (countdown <= 5) document.getElementById('host-timer').classList.add('text-red-500', 'scale-110');
        if (countdown <= 0) { clearInterval(state.hostTimer); calculateScores(); }
    }, 1000);
}

function renderHostQuestion(idx, showOptions) {
    const q = state.questions[idx];
    const isBala = q.type === 'bala';
    const isLogica = q.type === 'logica';
    const isRefran = q.type === 'refran';

    const badge = document.getElementById('host-type-badge');

    if (isBala) badge.innerHTML = `<div class="bg-red-600 text-white px-4 py-2 rounded-xl shadow-lg font-bold flex items-center animate-pulse">⚡ SPEED</div>`;
    else if (isLogica) badge.innerHTML = `<div class="bg-purple-600 text-white px-4 py-2 rounded-xl shadow-lg font-bold flex items-center">💡 LOGIC</div>`;
    else if (isRefran) badge.innerHTML = `<div class="bg-orange-600 text-white px-4 py-2 rounded-xl shadow-lg font-bold flex items-center">📜 QUOTE</div>`;
    else badge.innerHTML = `<div class="bg-blue-600 text-white px-4 py-2 rounded-xl shadow-lg font-bold flex items-center">🧠 TRIVIA</div>`;

    document.getElementById('host-q-counter').textContent = `${idx + 1} / ${state.questions.length}`;
    document.getElementById('host-q-text').textContent = q.question;

    const grid = document.getElementById('host-options-grid');
    const previewMsg = document.getElementById('host-preview-msg');

    if (showOptions) {
        const colors = ['bg-red-600', 'bg-blue-600', 'bg-purple-600', 'bg-green-600'];
        const shapes = ['▲', '◆', '●', '■'];
        grid.innerHTML = q.options.map((opt, i) => `
            <div class="${colors[i]} rounded-2xl flex items-center p-6 shadow-xl transition-all border-2 border-white/10 answer-card">
                <div class="bg-black/20 w-16 h-16 rounded-xl flex items-center justify-center text-3xl mr-6 text-white font-black shadow-inner">${shapes[i]}</div>
                <span class="text-3xl font-bold text-white drop-shadow-md leading-tight">${opt}</span>
            </div>
        `).join('');
        grid.classList.remove('opacity-0'); previewMsg.classList.add('hidden');
    } else {
        grid.classList.add('opacity-0'); previewMsg.classList.remove('hidden');
        document.getElementById('host-preview-text').textContent = isBala ? "GET READY!" : "READ CAREFULLY";
    }
}

async function calculateScores() {
    const gameSnap = await get(ref(db, `games/${state.gameId}`));
    const data = gameSnap.val();
    const currentQ = state.questions[state.currentQIndex];
    const updatedPlayers = { ...data.players };
    Object.keys(updatedPlayers).forEach(pid => {
        const p = updatedPlayers[pid];
        p.lastRoundPoints = 0;
        p.lastTimeTaken = null;

        if (p.currentAnswer === currentQ.correct) {
            const timeTaken = (p.answerTimestamp - data.questionStartTime) / 1000;
            const speedBonus = Math.max(0, Math.floor(500 * (1 - (timeTaken / state.roundDuration))));
            const points = 500 + speedBonus;
            p.score = (p.score || 0) + points;
            p.lastRoundPoints = points;
            p.lastTimeTaken = timeTaken.toFixed(2);
        } else if (p.currentAnswer !== null && p.currentAnswer !== undefined && p.answerTimestamp) {
            const timeTaken = (p.answerTimestamp - data.questionStartTime) / 1000;
            p.lastTimeTaken = timeTaken.toFixed(2);
        }
        p.currentAnswer = null; p.answerTimestamp = null;
    });

    if (currentQ.type === 'bala') {
        await update(ref(db, `games/${state.gameId}`), { players: updatedPlayers, status: 'leaderboard' });
        renderLeaderboard(updatedPlayers); showScreen('screen-host-leaderboard');
    } else {
        await update(ref(db, `games/${state.gameId}`), { players: updatedPlayers, status: 'reveal' });
        setTimeout(() => { update(ref(db, `games/${state.gameId}`), { status: 'leaderboard' }); }, 4000);
    }
}

function renderLeaderboard(playersData) {
    const sorted = Object.values(playersData).sort((a, b) => b.score - a.score);
    document.getElementById('host-leaderboard-list').innerHTML = sorted.map((p, i) => {
        const isCorrect = p.lastRoundPoints > 0;
        const cardBg = isCorrect ? 'bg-green-900/80 border-green-500' : 'bg-white/10 border-white/10';
        const colors = ['text-yellow-400', 'text-gray-300', 'text-orange-400', 'text-slate-400'];
        const rankColor = i < 3 ? colors[i] : colors[3];
        const gain = isCorrect ? `<div class="text-green-400 font-bold flex items-center mt-1 text-lg">¡+${Math.round(p.lastRoundPoints)}!</div>` : '';
        const timeDisplay = p.lastTimeTaken ? `<span class="text-sm font-mono text-slate-400 ml-2">⏱️ ${p.lastTimeTaken}s</span>` : '';
        const a = p.avatar || { emoji: '🙂', color: 'bg-gray-400' };

        return `
        <div class="flex items-center ${cardBg} text-white p-4 rounded-2xl shadow-lg border-2 transform transition-all mb-3 backdrop-blur-sm">
            <div class="w-10 h-10 flex items-center justify-center rounded-xl font-black text-xl mr-4 ${rankColor} bg-black/30">${i + 1}</div>
            <div class="mr-4 w-12 h-12 rounded-full ${a.color} flex items-center justify-center text-2xl border-2 border-white shadow-sm">${a.emoji}</div>
            <div class="flex-1">
                <div class="flex items-center">
                    <div class="text-2xl font-bold mr-2">${p.name}</div>
                    ${timeDisplay}
                </div>
                ${gain}
            </div>
            <div class="text-4xl font-black text-gold tabular-nums">${Math.round(p.score)}</div>
        </div>`;
    }).join('');
    if (state.isHost) showScreen('screen-host-leaderboard');
}

function renderFinished(playersData) {
    const w = Object.values(playersData).sort((a, b) => b.score - a.score)[0];
    const a = w?.avatar || { emoji: '😎', color: 'bg-white' };
    document.getElementById('winner-name').textContent = w ? w.name : 'Nadie';
    document.getElementById('winner-score').textContent = (w ? Math.round(w.score) : 0) + ' Puntos';
    document.getElementById('winner-avatar').textContent = a.emoji;
    showScreen('screen-host-finished');
}
