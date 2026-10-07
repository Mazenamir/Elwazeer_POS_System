const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const config = require('../config/env');

// Allowed image formats
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      fs.mkdirSync(config.PRODUCT_UPLOADS_DIR, { recursive: true });
      cb(null, config.PRODUCT_UPLOADS_DIR);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = ALLOWED_EXTENSIONS.has(ext) ? ext : '.jpg';
    const randomHash = crypto.randomBytes(6).toString('hex');
    const uniqueName = `product_${Date.now()}_${randomHash}${safeExt}`;
    cb(null, uniqueName);
  },
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(file.mimetype) || !ALLOWED_EXTENSIONS.has(ext)) {
    const err = new Error('نوع الملف غير صالح. يُسمح فقط بالصور بصيغ JPG و PNG و WEBP');
    err.statusCode = 400;
    return cb(err, false);
  }
  cb(null, true);
};

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
  fileFilter,
});

function productUploadMiddleware(req, res, next) {
  if (!req.is('multipart/form-data')) {
    return next();
  }

  const uploadSingle = upload.single('image');
  uploadSingle(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'حجم الصورة كبير جداً. الحد الأقصى المسموح به هو 10 ميجابايت' });
      }
      return res.status(err.statusCode || 400).json({ error: err.message || 'فشل في معالجة الصورة المرفوعة' });
    }
    next();
  });
}

function removeUploadedFile(filePath) {
  if (!filePath) return;
  try {
    const fullPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(config.UPLOADS_DIR, filePath.replace(/^\/?uploads\/?/, ''));
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  } catch (e) {
    console.warn('Failed to cleanup file:', e.message);
  }
}

module.exports = {
  productUploadMiddleware,
  removeUploadedFile,
};
