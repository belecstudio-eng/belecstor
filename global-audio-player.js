(function () {
    const audio = new Audio();
    let ui = null;
    let currentTrack = null;
    let currentStateHandler = null;
    let isSeeking = false;

    function formatTime(seconds) {
        if (!Number.isFinite(seconds) || seconds < 0) {
            return '0:00';
        }

        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60).toString().padStart(2, '0');
        return `${minutes}:${remainingSeconds}`;
    }

    function ensureUI() {
        if (ui) {
            return ui;
        }

        const wrapper = document.createElement('div');
        wrapper.id = 'globalAudioBar';
        wrapper.className = 'global-audio-bar';
        wrapper.innerHTML = `
            <div class="global-audio-shell">
                <button class="global-audio-toggle" id="globalAudioToggle" type="button" aria-label="Lire ou mettre en pause">
                    <i class="fas fa-play"></i>
                </button>
                <div class="global-audio-meta">
                    <div class="global-audio-cover" id="globalAudioCover"></div>
                    <div class="global-audio-copy">
                        <strong id="globalAudioTitle">Lecture en cours</strong>
                        <span id="globalAudioSubtitle">Aucun titre sélectionné</span>
                    </div>
                </div>
                <div class="global-audio-progress-wrap">
                    <span class="global-audio-time" id="globalAudioCurrent">0:00</span>
                    <input class="global-audio-progress" id="globalAudioProgress" type="range" min="0" max="100" value="0" step="0.1" aria-label="Progression de lecture">
                    <span class="global-audio-time" id="globalAudioDuration">0:00</span>
                </div>
            </div>
        `;

        document.body.appendChild(wrapper);

        ui = {
            wrapper,
            toggle: wrapper.querySelector('#globalAudioToggle'),
            toggleIcon: wrapper.querySelector('#globalAudioToggle i'),
            cover: wrapper.querySelector('#globalAudioCover'),
            title: wrapper.querySelector('#globalAudioTitle'),
            subtitle: wrapper.querySelector('#globalAudioSubtitle'),
            current: wrapper.querySelector('#globalAudioCurrent'),
            duration: wrapper.querySelector('#globalAudioDuration'),
            progress: wrapper.querySelector('#globalAudioProgress')
        };

        ui.toggle.addEventListener('click', () => {
            if (!currentTrack) {
                return;
            }

            if (audio.paused) {
                audio.play().catch(() => undefined);
                return;
            }

            audio.pause();
        });

        ui.progress.addEventListener('input', () => {
            isSeeking = true;
            if (!audio.duration) {
                return;
            }

            const nextTime = (Number(ui.progress.value) / 100) * audio.duration;
            ui.current.textContent = formatTime(nextTime);
        });

        ui.progress.addEventListener('change', () => {
            if (audio.duration) {
                audio.currentTime = (Number(ui.progress.value) / 100) * audio.duration;
            }
            isSeeking = false;
        });

        return ui;
    }

    function setPlayingState(isPlaying) {
        ensureUI();
        ui.wrapper.classList.toggle('is-active', Boolean(currentTrack));
        document.body.classList.toggle('has-global-audio', Boolean(currentTrack));
        ui.toggleIcon.classList.toggle('fa-play', !isPlaying);
        ui.toggleIcon.classList.toggle('fa-pause', isPlaying);

        if (typeof currentStateHandler === 'function') {
            currentStateHandler(isPlaying);
        }
    }

    function setTrackMeta(track) {
        ensureUI();
        ui.title.textContent = track.title || 'Lecture en cours';
        ui.subtitle.textContent = track.subtitle || '';
        ui.current.textContent = '0:00';
        ui.duration.textContent = '0:00';
        ui.progress.value = '0';

        if (track.cover) {
            ui.cover.style.backgroundImage = `url("${track.cover}")`;
            ui.cover.classList.add('has-cover');
            return;
        }

        ui.cover.style.backgroundImage = '';
        ui.cover.classList.remove('has-cover');
    }

    audio.addEventListener('timeupdate', () => {
        ensureUI();
        if (!isSeeking && audio.duration) {
            ui.progress.value = String((audio.currentTime / audio.duration) * 100);
            ui.current.textContent = formatTime(audio.currentTime);
        }
    });

    audio.addEventListener('loadedmetadata', () => {
        ensureUI();
        ui.duration.textContent = formatTime(audio.duration);
    });

    audio.addEventListener('play', () => {
        setPlayingState(true);
    });

    audio.addEventListener('pause', () => {
        setPlayingState(false);
    });

    audio.addEventListener('ended', () => {
        audio.currentTime = 0;
        setPlayingState(false);
    });

    audio.addEventListener('error', () => {
        setPlayingState(false);
    });

    window.GlobalAudioPlayer = {
        playTrack(track) {
            if (!track || !track.src) {
                return;
            }

            ensureUI();

            const isSameTrack = currentTrack && currentTrack.src === track.src;
            if (isSameTrack) {
                currentStateHandler = track.onStateChange || currentStateHandler;

                if (audio.paused) {
                    audio.play().catch(() => undefined);
                } else {
                    audio.pause();
                }
                return;
            }

            if (typeof currentStateHandler === 'function') {
                currentStateHandler(false);
            }

            currentTrack = track;
            currentStateHandler = track.onStateChange || null;
            setTrackMeta(track);
            audio.src = track.src;
            audio.currentTime = 0;
            audio.play().catch(() => {
                setPlayingState(false);
            });
        },
        stop() {
            if (!currentTrack) {
                return;
            }

            audio.pause();
            audio.currentTime = 0;
            if (typeof currentStateHandler === 'function') {
                currentStateHandler(false);
            }
            currentTrack = null;
            currentStateHandler = null;
            ensureUI();
            ui.wrapper.classList.remove('is-active');
            document.body.classList.remove('has-global-audio');
            ui.progress.value = '0';
            ui.current.textContent = '0:00';
            ui.duration.textContent = '0:00';
        }
    };
})();