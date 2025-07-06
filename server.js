import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import cors from "cors";
import { fileURLToPath } from "url";

const app = express();
const PORT = 3001;

app.use(cors());

// Ensure uploads directory exists
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}
const upload = multer({ dest: uploadDir });

// __dirname workaround for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.post("/upload-graph", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }
  const targetPath = path.join(__dirname, "src", "graph.yaml");
  fs.rename(req.file.path, targetPath, err => {
    if (err) {
      return res.status(500).json({ error: "Failed to save file" });
    }
    // Clean up any remaining files in uploads
    fs.readdir(uploadDir, (err, files) => {
      if (!err) {
        files.forEach(f => {
          if (f !== path.basename(targetPath)) {
            fs.unlink(path.join(uploadDir, f), () => {});
          }
        });
      }
    });
    res.json({ success: true });
  });
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
