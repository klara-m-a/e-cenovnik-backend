const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Directory to store market files
const marketFilesDir = path.join(__dirname, 'uploads', 'marketFiles');
if (!fs.existsSync(marketFilesDir)) {
  fs.mkdirSync(marketFilesDir, { recursive: true });
}

// Configure multer storage: file name will be based on market (and location if provided)
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, marketFilesDir);
  },
  filename: function(req, file, cb) {
    const market = req.query.market;
    const location = req.query.location;
    if (!market) {
      return cb(new Error("Market not specified"), null);
    }
    let filename = market;
    if (location) {
      filename += "_" + location;
    }
    const ext = path.extname(file.originalname);
    cb(null, `${filename}${ext}`);
  }
});
const upload = multer({ storage });

// In-memory storage for market products.
// For markets without locations:
//    marketProducts[market] = { products, fileName }
// For markets with locations:
//    marketProducts[market] = { [location]: { products, fileName } }
const marketProducts = {};

// Helper function to process an Excel file and extract products.
// Assumes data starts on row 6 (skipping first 5 rows) and uses:
//   Column B (index 1) for product name,
//   Column C (index 2) for measure ("Мера"),
//   Column E (index 4) for sales price.
function processExcelFile(filePath) {
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json(worksheet, { range: 5, header: 1, defval: "" });
  const products = rows.map(row => ({
    name: row[1] ? row[1].trim() : "",
    measure: row[2] ? row[2].trim() : "",
    price: row[4] ? row[4].trim() : ""
  })).filter(product => product.name || product.price);
  return products;
}

// Endpoint to upload/update file for a market (and optional location)
app.post('/upload', upload.single('file'), (req, res) => {
  const market = req.query.market;
  const location = req.query.location; // optional
  if (!market) {
    return res.status(400).json({ error: 'Market is required' });
  }
  try {
    const filePath = path.join(marketFilesDir, req.file.filename);
    const products = processExcelFile(filePath);
    if (location) {
      if (!marketProducts[market]) {
        marketProducts[market] = {};
      }
      marketProducts[market][location] = { products, fileName: req.file.filename };
    } else {
      marketProducts[market] = { products, fileName: req.file.filename };
    }
    res.json({ message: `Products for ${market}${location ? " ("+location+")" : ""} updated successfully`, products });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Failed to process file', details: err.message });
  }
});

// Endpoint to get products for a market (and optional location)
app.get('/products', (req, res) => {
  const market = req.query.market;
  const location = req.query.location;
  if (!market) {
    return res.status(400).json({ error: 'Market is required' });
  }
  if (location) {
    if (marketProducts[market] && marketProducts[market][location]) {
      res.json(marketProducts[market][location].products);
    } else {
      res.json([]);
    }
  } else {
    if (marketProducts[market] && marketProducts[market].products) {
      res.json(marketProducts[market].products);
    } else {
      res.json([]);
    }
  }
});

// Endpoint to list markets (for now we assume the admin-defined markets)
app.get('/markets', (req, res) => {
  // For simplicity, return static market list
  res.json([
    { name: "Raznopromet" },
    { name: "Market2", locations: ["lokacija1", "lokacija2"] },
    { name: "Market3" }
  ]);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
