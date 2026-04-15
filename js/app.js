const { createFFmpeg, fetchFile } = FFmpeg;

// GitHub Pages ve Localhost uyumlu dinamik kök dizin
const BASE_PATH = window.location.origin + window.location.pathname.replace('index.html', '').replace(/\/$/, '');

const statusDisplay = document.getElementById('status');
const progressBar = document.getElementById('progress');

// FFmpeg Nesnesi ve Progress Dinleyicisi
const ffmpeg = createFFmpeg({
    log: true,
    // ÖNEMLİ: v=... parametresini kaldırdık ki tarayıcı hafızasını (cache) kullansın
    corePath: `${BASE_PATH}/js/ffmpeg-core.js`,
    progress: ({ ratio }) => {
        if (ratio >= 0 && ratio <= 1) {
            const percentage = Math.round(ratio * 100);
            progressBar.value = percentage;
            statusDisplay.innerText = `⚡ Processing: %${percentage}`;
            statusDisplay.style.color = "#0969da";
        }
    }
});

// UI Elementleri
const fileInput = document.getElementById('video-upload');
const fileNameDisplay = document.getElementById('file-name-display');
const previewVideo = document.getElementById('video-preview');
const githubBadge = document.getElementById('github-badge');
const statsArea = document.getElementById('stats-area');
const downloadArea = document.getElementById('download-area');

const btns = {
    github: document.getElementById('btn-github'),
    high: document.getElementById('id-high'),
    balanced: document.getElementById('id-balanced'),
    quality: document.getElementById('id-quality')
};

let isWasmLoaded = false;

// Video Süresini Hesaplama
const getVideoDuration = (file) => new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
        window.URL.revokeObjectURL(video.src);
        resolve(video.duration);
    };
    video.src = URL.createObjectURL(file);
});

function setButtonsState(disabled) {
    const shouldDisable = disabled || !isWasmLoaded || !fileInput.files[0];
    Object.values(btns).forEach(btn => btn.disabled = shouldDisable);
}

// Dosya Seçimi
fileInput.addEventListener('change', function(e) {
    if(e.target.files[0]) {
        fileNameDisplay.innerText = e.target.files[0].name;
        setButtonsState(false);
    } else {
        fileNameDisplay.innerText = 'No file selected';
    }
    statsArea.style.display = 'none';
    githubBadge.style.display = 'none';
    previewVideo.style.display = 'none';
    downloadArea.innerHTML = '';
});

// Başlatma (Init)
async function init() {
    try {
        statusDisplay.innerText = "⚡ Loading engine... (This takes 1-2 mins for the first time)";
        await ffmpeg.load();
        isWasmLoaded = true;
        statusDisplay.innerText = "✅ System ready. Select a video.";
        statusDisplay.style.color = "#2da44e";
        setButtonsState(false);
    } catch (err) {
        console.error("Init Error:", err);
        statusDisplay.innerText = "❌ Initialization failed. Refresh page.";
    }
}

// Video İşleme Fonksiyonu
async function processVideo(mode) {
    const videoFile = fileInput.files[0];
    if (!videoFile) return;

    const inputSizeMB = videoFile.size / (1024 * 1024);
    setButtonsState(true);
    githubBadge.style.display = "none";
    statsArea.style.display = "none";
    progressBar.style.display = "block";
    progressBar.value = 0;
    statusDisplay.innerText = "⚡ Preparing video...";

    try {
        const duration = await getVideoDuration(videoFile);
        ffmpeg.FS('writeFile', 'input.mp4', await fetchFile(videoFile));
        
        let args = ['-i', 'input.mp4'];

        if (mode === 'smart_github') {
            const targetMB = 9.5; 
            const targetKbits = targetMB * 8192;
            const audioKbps = 128;
            let videoKbps = Math.floor((targetKbits / duration) - audioKbps);
            if (videoKbps < 150) videoKbps = 150; 

            let scale = videoKbps < 500 ? "scale='min(854,iw)':-2" : "scale='min(1280,iw)':-2";

            args.push(
                '-vf', scale,
                '-c:v', 'libx264',
                '-b:v', `${videoKbps}k`,
                '-maxrate', `${videoKbps}k`,
                '-bufsize', `${videoKbps * 2}k`,
                '-preset', 'ultrafast',
                '-pix_fmt', 'yuv420p'
            );
        } else if (mode === 'high_compression') {
            args.push('-vf', "scale='min(854,iw)':-2", '-c:v', 'libx264', '-crf', '30', '-preset', 'ultrafast');
        } else if (mode === 'balanced') {
            args.push('-vf', "scale='min(1280,iw)':-2", '-c:v', 'libx264', '-crf', '26', '-preset', 'ultrafast');
        } else if (mode === 'high_quality') {
            args.push('-c:v', 'libx264', '-crf', '22', '-preset', 'ultrafast');
        }

        args.push('output.mp4');
        const startTime = Date.now();
        
        await ffmpeg.run(...args);
        
        const processTime = ((Date.now() - startTime) / 1000).toFixed(1);
        const data = ffmpeg.FS('readFile', 'output.mp4');
        const outputSizeMB = data.length / (1024 * 1024);
        const reductionPercent = (((inputSizeMB - outputSizeMB) / inputSizeMB) * 100).toFixed(0);
        
        const videoURL = URL.createObjectURL(new Blob([data.buffer], { type: 'video/mp4' }));

        statusDisplay.innerText = `✨ Done in ${processTime}s`;
        document.getElementById('stat-before').innerText = `${inputSizeMB.toFixed(1)} MB`;
        document.getElementById('stat-after').innerText = `${outputSizeMB.toFixed(1)} MB`;
        document.getElementById('stat-reduction').innerText = `%${reductionPercent}`;
        statsArea.style.display = "flex";
        
        previewVideo.src = videoURL;
        previewVideo.style.display = "block";
        
        if (outputSizeMB <= 10.2) githubBadge.style.display = "block";
        
        downloadArea.innerHTML = `
            <a href="${videoURL}" download="gitshrink_compressed.mp4" class="btn-primary" style="display:inline-block; text-decoration:none; margin-top:15px; border-radius:6px; font-weight:600;">
                💾 Download MP4
            </a>`;

    } catch (err) {
        statusDisplay.innerText = "❌ Error during processing.";
        console.error(err);
    } finally {
        try {
            ffmpeg.FS('unlink', 'input.mp4');
            ffmpeg.FS('unlink', 'output.mp4');
        } catch (e) {}
        setButtonsState(false);
        progressBar.style.display = "none";
    }
}

// Buton Atamaları
btns.github.onclick = () => processVideo('smart_github');
btns.high.onclick = () => processVideo('high_compression');
btns.balanced.onclick = () => processVideo('balanced');
btns.quality.onclick = () => processVideo('high_quality');

init();
