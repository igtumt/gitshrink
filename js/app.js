// FFmpeg 0.11.6 kütüphanesinden gerekli fonksiyonları alıyoruz
const { createFFmpeg, fetchFile } = FFmpeg;

// FFmpeg nesnesini oluşturuyoruz
const ffmpeg = createFFmpeg({
    log: true,
    // GitHub Pages'ta en güvenli yol budur:
    corePath: 'https://igtumt.github.io/gitshrink/js/ffmpeg-core.js'
});


// UI Elementleri
const fileInput = document.getElementById('video-upload');
const fileNameDisplay = document.getElementById('file-name-display');
const statusDisplay = document.getElementById('status');
const progressBar = document.getElementById('progress');
const previewVideo = document.getElementById('video-preview');
const githubBadge = document.getElementById('github-badge');
const statsArea = document.getElementById('stats-area');
const downloadArea = document.getElementById('download-area');

const btns = {
    github: document.getElementById('btn-github'),
    high: document.getElementById('btn-high'),
    balanced: document.getElementById('btn-balanced'),
    quality: document.getElementById('btn-quality')
};

let isWasmLoaded = false;

// Yardımcı: Video süresini ölçer (Bitrate hesabı için)
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

// Dosya seçildiğinde
fileInput.addEventListener('change', function(e) {
    fileNameDisplay.innerText = e.target.files[0] ? e.target.files[0].name : 'No file selected';
    setButtonsState(false);
    statsArea.style.display = 'none';
    githubBadge.style.display = 'none';
    previewVideo.style.display = 'none';
    downloadArea.innerHTML = '';
});

// ADIM 1: Sistemi Başlatma
async function init() {
    try {
        statusDisplay.innerText = "⚡ Loading secure engine (v0.11.6)...";
        
        // FFmpeg 0.11.x yükleme başlatma
        await ffmpeg.load();

        isWasmLoaded = true;
        statusDisplay.innerText = "✅ System ready. Select a video.";
        statusDisplay.style.color = "#2da44e";
        setButtonsState(false);
    } catch (err) {
        statusDisplay.innerText = "❌ Initialization failed.";
        console.error("FFmpeg v0.11 Load Error:", err);
    }
}

// ADIM 2: Video İşleme Mantığı
async function processVideo(mode) {
    const videoFile = fileInput.files[0];
    if (!videoFile) return alert('Please select a video file!');

    const inputSizeMB = videoFile.size / (1024 * 1024);
    setButtonsState(true);
    githubBadge.style.display = "none";
    statsArea.style.display = "none";
    progressBar.style.display = "block";
    statusDisplay.innerText = "⚡ Preparing video...";

    try {
        const duration = await getVideoDuration(videoFile);
        
        // Dosyayı sanal sisteme yazıyoruz
        ffmpeg.FS('writeFile', 'input.mp4', await fetchFile(videoFile));
        
        let args = ['-i', 'input.mp4'];

        if (mode === 'smart_github') {
            const targetMB = 9.5;
            const targetKbits = targetMB * 8192;
            const audioKbps = 128;
            let videoKbps = Math.floor((targetKbits / duration) - audioKbps);
            if (videoKbps < 50) videoKbps = 50;

            let scale = videoKbps < 400 ? "scale='min(854,iw)':-2" : "scale='min(1280,iw)':-2";

            args.push(
                '-vf', scale,
                '-c:v', 'libx264',
                '-b:v', `${videoKbps}k`,
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
        // FFmpeg komutunu çalıştır
        await ffmpeg.run(...args);
        const processTime = ((Date.now() - startTime) / 1000).toFixed(1);

        // Çıktıyı oku
        const data = ffmpeg.FS('readFile', 'output.mp4');
        const outputSizeMB = data.length / (1024 * 1024);
        const reductionPercent = (((inputSizeMB - outputSizeMB) / inputSizeMB) * 100).toFixed(0);
        
        const videoURL = URL.createObjectURL(new Blob([data.buffer], { type: 'video/mp4' }));

        // UI Güncelle
        statusDisplay.innerText = `✨ Done in ${processTime}s`;
        document.getElementById('stat-before').innerText = `${inputSizeMB.toFixed(1)} MB`;
        document.getElementById('stat-after').innerText = `${outputSizeMB.toFixed(1)} MB`;
        document.getElementById('stat-reduction').innerText = `%${reductionPercent}`;
        statsArea.style.display = "flex";
        
        previewVideo.src = videoURL;
        previewVideo.style.display = "block";
        
        if (outputSizeMB <= 10.2) githubBadge.style.display = "block";
        
        downloadArea.innerHTML = `
            <a href="${videoURL}" download="gitshrink_compressed.mp4" class="btn-primary" style="display:inline-block; text-decoration:none; margin-top:15px;">
                💾 Download MP4
            </a>`;

    } catch (err) {
        statusDisplay.innerText = "❌ Processing error.";
        console.error(err);
    } finally {
        // Bellek temizliği
        try {
            ffmpeg.FS('unlink', 'input.mp4');
            ffmpeg.FS('unlink', 'output.mp4');
        } catch (e) {}
        setButtonsState(false);
        progressBar.style.display = "none";
    }
}

// Buton bağlamaları
btns.github.onclick = () => processVideo('smart_github');
btns.high.onclick = () => processVideo('high_compression');
btns.balanced.onclick = () => processVideo('balanced');
btns.quality.onclick = () => processVideo('high_quality');

// Başlat
init();
