import { db, ref, set, get, update, onValue } from "./firebase-config.js";

const state = {
    userId: localStorage.getItem('fq_uid') || 'user_' + Math.random().toString(36).substr(2, 9),
    gameId: null,
    playerName: '',
    joined: false,
    avatarEmojiIndex: 0,
    avatarColorIndex: 1
};
localStorage.setItem('fq_uid', state.userId);

const AVATAR_EMOJIS = ['😎', '👻', '🤠', '👽', '🤖', '💩', '🦄', '🐱', '🐶', '🦊', '🦁', '🐼', '🐯', '🐷', '🐸', '🐙', '💀', '🤡', '🎅', '🤶', '🦌', '⛄', '🎄', '🎁'];
const AVATAR_COLORS = ['bg-red-600', 'bg-blue-600', 'bg-green-600', 'bg-yellow-500', 'bg-purple-600', 'bg-pink-500', 'bg-orange-500', 'bg-teal-500'];

window.app = {
    goToAvatar: async () => {
        const pin = document.getElementById('player-input-pin').value;
        const name = document.getElementById('player-input-name').value;
        if (!pin || !name) return document.getElementById('player-login-error').classList.remove('hidden');

        try {
            if (!(await get(ref(db, `games/${pin}`))).exists()) throw new Error();
            state.gameId = pin; state.playerName = name;
            renderColorPicker(); updateAvatarPreview(); showScreen('screen-player-avatar');
        } catch (e) {
            const errEl = document.getElementById('player-login-error');
            errEl.textContent = "Sala no encontrada";
            errEl.classList.remove('hidden');
        }
    },
    cycleEmoji: (d) => { state.avatarEmojiIndex = (state.avatarEmojiIndex + d + AVATAR_EMOJIS.length) % AVATAR_EMOJIS.length; updateAvatarPreview(); },
    selectColor: (i) => { state.avatarColorIndex = i; updateAvatarPreview(); },
    confirmJoin: async () => {
        const avatarData = { emoji: AVATAR_EMOJIS[state.avatarEmojiIndex], color: AVATAR_COLORS[state.avatarColorIndex] };
        const payload = { name: state.playerName, avatar: avatarData };
        if (!state.joined) { payload.score = 0; payload.lastRoundPoints = 0; payload.currentAnswer = null; }
        await update(ref(db, `games/${state.gameId}/players/${state.userId}`), payload);
        state.joined = true; setupPlayerListener();
    },
    editAvatar: () => showScreen('screen-player-avatar'),
    submitAnswer: async (idx) => {
        await update(ref(db, `games/${state.gameId}/players/${state.userId}`), { currentAnswer: idx, answerTimestamp: Date.now() });
        showScreen('screen-player-answered');
    }
};

window.onload = () => {
    const pin = new URLSearchParams(window.location.search).get('pin');
    if (pin) { document.getElementById('player-input-pin').value = pin; }
    showScreen('screen-player-login');
};

const showScreen = (id) => {
    document.querySelectorAll('.screen').forEach(el => el.classList.add('hidden-screen'));
    document.getElementById(id).classList.remove('hidden-screen');
};

function updateAvatarPreview() {
    const c = document.getElementById('avatar-preview-container');
    c.className = `w-40 h-40 rounded-full flex items-center justify-center text-7xl shadow-xl border-4 border-white mb-8 transition-colors duration-300 ${AVATAR_COLORS[state.avatarColorIndex]}`;
    document.getElementById('avatar-preview-emoji').textContent = AVATAR_EMOJIS[state.avatarEmojiIndex];
    document.getElementById('avatar-emoji-display').textContent = AVATAR_EMOJIS[state.avatarEmojiIndex];
}

function renderColorPicker() {
    document.getElementById('color-picker').innerHTML = AVATAR_COLORS.map((c, i) => `<button onclick="app.selectColor(${i})" class="w-10 h-10 rounded-full ${c} border-2 border-white shadow-md hover:scale-110 transition-transform"></button>`).join('');
}

function setupPlayerListener() {
    onValue(ref(db, `games/${state.gameId}`), (snap) => {
        const data = snap.val();
        if (!data || !data.players[state.userId]) return;
        const myData = data.players[state.userId];

        document.getElementById('player-score').textContent = Math.round(myData.score);
        const gainEl = document.getElementById('player-points-gained');
        const posFeed = document.getElementById('player-feedback-positive');
        const negFeed = document.getElementById('player-feedback-negative');
        const lbScreen = document.getElementById('screen-player-leaderboard');

        if (myData.lastRoundPoints > 0) {
            gainEl.textContent = `+ ${Math.round(myData.lastRoundPoints)}`;
            posFeed.classList.remove('hidden'); negFeed.classList.add('hidden');
            lbScreen.classList.add('bg-green-600'); lbScreen.classList.remove('bg-slate-900');
        } else {
            posFeed.classList.add('hidden'); negFeed.classList.remove('hidden');
            lbScreen.classList.remove('bg-green-600'); lbScreen.classList.add('bg-slate-900');
        }

        const rank = Object.values(data.players).sort((a, b) => b.score - a.score).findIndex(p => p.name === myData.name) + 1;
        document.getElementById('player-rank').textContent = `${rank}º`;

        if (data.status === 'lobby') {
            document.getElementById('player-lobby-name').textContent = myData.name;
            const a = myData.avatar || { emoji: '😎', color: 'bg-gray-400' };
            document.getElementById('player-lobby-avatar').textContent = a.emoji;
            document.getElementById('player-lobby-avatar').className = `w-24 h-24 rounded-full flex items-center justify-center text-5xl shadow-lg border-2 border-white mb-4 ${a.color}`;
            showScreen('screen-player-lobby');
        } else if (data.status === 'preview') showScreen('screen-player-preview');
        else if (data.status === 'question') {
            if (data.optionsVisible) {
                if (myData.currentAnswer != null) showScreen('screen-player-answered');
                else showScreen('screen-player-game');
            } else showScreen('screen-player-wait');
        } else if (data.status === 'reveal') {
            const resIcon = document.getElementById('player-result-icon');
            const resText = document.getElementById('player-result-text');
            const resScreen = document.getElementById('screen-player-result');
            if (myData.lastRoundPoints > 0) {
                resIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
                resText.textContent = "CORRECT!";
                resScreen.className = "screen h-screen flex flex-col items-center justify-center p-6 text-white text-center fade-in bg-green-600";
            } else {
                resIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
                resText.textContent = "WRONG!";
                resScreen.className = "screen h-screen flex flex-col items-center justify-center p-6 text-white text-center fade-in bg-red-600";
            }
            showScreen('screen-player-result');
        } else if (data.status === 'leaderboard') showScreen('screen-player-leaderboard');
        else if (data.status === 'finished') { showScreen('screen-player-leaderboard'); document.getElementById('player-btn-exit').classList.remove('hidden'); }
    });
}
