const multer = require('multer');
const path = require('path');
const fs = require('fs');

const audioUploadDir = path.join(__dirname, '../uploads/audio_notes');
if (!fs.existsSync(audioUploadDir)) {
    fs.mkdirSync(audioUploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, audioUploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E6);
        const ext = path.extname(file.originalname) || '.m4a';
        cb(null, `audio-${uniqueSuffix}${ext.toLowerCase()}`);
    }
});

const fileFilter = (req, file, cb) => {
    const allowedMimes = [
        'audio/m4a',
        'audio/x-m4a',
        'audio/mp4',
        'audio/mpeg',
        'audio/mp3',
        'audio/wav',
        'audio/x-wav',
        'audio/aac',
        'audio/ogg',
        'audio/webm',
        'audio/3gpp',
        'audio/amr'
    ];

    const allowedExtensions = ['.m4a', '.mp3', '.wav', '.aac', '.ogg', '.webm', '.3gp', '.amr'];
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowedMimes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error('Solo se permiten archivos de audio (.m4a, .mp3, .wav, .aac, .ogg, .webm, .3gp)'), false);
    }
};

const audioUpload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 25 * 1024 * 1024 // 25 MB max
    }
});

module.exports = audioUpload;
