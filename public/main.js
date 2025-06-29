// Initialize i18n system
document.addEventListener('DOMContentLoaded', async () => {
    await window.i18n.init();
});

// Clear any stored game data when on main page
localStorage.removeItem('slfgame_data');

document.querySelector('#create').addEventListener('click', () => {
    location.href = '/create';
});

document.querySelector('#join').addEventListener('click', () => {
    location.href = '/join';
});

/* document.querySelector('#moderate-play').addEventListener('click', () => {
    location.href = '/moderate-play';
}); */