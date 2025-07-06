import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import cors from "cors";
import { fileURLToPath } from "url";

const app = express();
const PORT = 3001;

app.use(cors());

const upload = multer({ dest: "uploads/" });

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
    res.json({ success: true });
  });
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
