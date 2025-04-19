// server.js
const express = require("express")
const multer = require("multer")
const xlsx = require("xlsx")
const fs = require("fs")
const path = require("path")
const cors = require("cors")

const app = express()
app.use(cors())
app.use(express.json())

// At the top of your server.js file
const adminCredentials = require('./config');

// Then replace your login endpoint with this simple version
app.post(["/admin/login", "/api/admin/login"], (req, res) => {
  const { username, password } = req.body;
  
  // Simple credential check
  if (username === adminCredentials.username && password === adminCredentials.password) {
    return res.json({ success: true });
  }
  
  res.status(401).json({ error: "Invalid credentials" });
});


// Directory to store market files permanently
const marketFilesDir = path.join(__dirname, "uploads", "marketFiles")
if (!fs.existsSync(marketFilesDir)) {
  fs.mkdirSync(marketFilesDir, { recursive: true })
}

// Configure multer storage – ignore original filename and use market (and location) with a timestamp
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, marketFilesDir)
  },
  filename: (req, file, cb) => {
    const market = req.query.market
    const location = req.query.location
    if (!market) {
      return cb(new Error("Market not specified"), null)
    }
    let filename = market
    if (location) {
      filename += "_" + location
    }
    // Append a timestamp for uniqueness
    const timestamp = Date.now()
    const ext = path.extname(file.originalname)
    cb(null, `${filename}_${timestamp}${ext}`)
  },
})
const upload = multer({ storage })

// In-memory storage for market products.
// For markets without locations:
//   marketProducts[market] = { products, fileName, updateInfo }
// For markets with locations:
//   marketProducts[market] = { [location]: { products, fileName, updateInfo } }
const marketProducts = {}

// 0: (ignored), 1: Назив, 2: Продажна цена, 3: Единечна цена,
// 4: Опис, 5: Достапност, 6: Редовна цена, 7: Цена со попуст,
// 8: Вид на попуст, 9: Времетраење на попуст
function processExcelFile(filePath) {
  try {
    const workbook = xlsx.readFile(filePath)
    const sheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[sheetName]

    // pull the raw cell values (could be number or Date or string)
    const rawDate = worksheet["B1"]?.v
    const rawTime = worksheet["C1"]?.v

    // 1) convert the Excel serial date (if number) into a JS Date
    let datePart = ""
    if (rawDate instanceof Date) {
      datePart = rawDate.toLocaleDateString()
    } else if (typeof rawDate === "number") {
      // Excel stores days since 1899‑12‑31; 25569 is days to 1970‑01‑01
      const jsTime = (rawDate - 25569) * 86400 * 1000
      const dt = new Date(jsTime)
      datePart = dt.toLocaleDateString()
    } else {
      datePart = String(rawDate || "").trim()
    }

    // 2) convert the Excel fractional‑day time into HH:MM
    let timePart = ""
    if (typeof rawTime === "number") {
      const totalSeconds = Math.round(rawTime * 86400)
      const hours = Math.floor(totalSeconds / 3600)
      const mins = Math.floor((totalSeconds % 3600) / 60)
      timePart = String(hours).padStart(2, "0") + ":" + String(mins).padStart(2, "0")
    } else {
      timePart = String(rawTime || "").trim()
    }

    const updateInfo = {
      date: datePart,
      time: timePart,
      formatted: [datePart, timePart].filter(Boolean).join(" "),
    }

    // now read all rows, skip header row 1
    const allRows = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: "" })
    const products = allRows
      .slice(1)
      .map((row) => ({
        naziv: String(row[0] || "").trim(),
        prodazhnaCena: String(row[1] || "").trim(),
        edinichnaCena: String(row[2] || "").trim(),
        opis: String(row[3] || "").trim(),
        dostapnost: String(row[4] || "").trim(),
        redovnaCena: String(row[5] || "").trim(),
        cenaSoPopust: String(row[6] || "").trim(),
        vidNaPopust: String(row[7] || "").trim(),
        vremetraenjeNaPopust: String(row[8] || "").trim(),
      }))
      .filter((p) => p.naziv || p.prodazhnaCena)

    return { products, updateInfo }
  } catch (error) {
    console.error("Error processing Excel file:", error)
    throw error
  }
}

// POST /upload: Upload or update file for a market (and optional location)
app.post("/upload", upload.single("file"), (req, res) => {
  const market = req.query.market
  const location = req.query.location // optional
  if (!market) {
    return res.status(400).json({ error: "Market is required" })
  }
  if (!req.file) {
    return res.status(400).json({ error: "File not provided or upload failed" })
  }

  try {
    // Construct a market key (e.g., "Разнопромет" or "Market2_Центар")
    const marketKey = market + (location ? "_" + location : "")

    // Delete any existing files that start with this marketKey, except for the new file.
    const existingFiles = fs
      .readdirSync(marketFilesDir)
      .filter((file) => file.startsWith(marketKey) && file !== req.file.filename)
    existingFiles.forEach((file) => {
      const filePathToDelete = path.join(marketFilesDir, file)
      console.log(`Deleting old file: ${filePathToDelete}`)
      fs.unlinkSync(filePathToDelete)
    })

    // New file is saved by multer with a unique timestamp in its name.
    const newFileName = req.file.filename
    const filePath = path.join(marketFilesDir, newFileName)
    console.log(`New file saved as: ${filePath}`)

    // Process the new file to extract products and update info.
    const { products, updateInfo } = processExcelFile(filePath)
    console.log(`Parsed products for ${market}${location ? " (" + location + ")" : ""}:`, products)
    console.log(`Update info: ${updateInfo.formatted}`)

    // Update in-memory storage with the new file info, product data, and update info.
    if (location) {
      if (!marketProducts[market]) {
        marketProducts[market] = {}
      }
      marketProducts[market][location] = { products, fileName: newFileName, updateInfo }
    } else {
      marketProducts[market] = { products, fileName: newFileName, updateInfo }
    }

    res.json({
      message: `Products for ${market}${location ? " (" + location + ")" : ""} updated successfully`,
      products,
      updateInfo,
    })
  } catch (err) {
    console.error("Upload error:", err)
    res.status(500).json({ error: "Failed to process file", details: err.message })
  }
})

// GET /products: Return products for a market (and optional location)
// If not in memory (e.g. after restart), reload from disk.
app.get("/products", (req, res) => {
  const market = req.query.market
  const location = req.query.location
  if (!market) {
    return res.status(400).json({ error: "Market is required" })
  }
  if (location) {
    if (marketProducts[market] && marketProducts[market][location]) {
      return res.json({
        products: marketProducts[market][location].products,
        updateInfo: marketProducts[market][location].updateInfo,
      })
    } else {
      // Attempt to load from disk
      const files = fs.readdirSync(marketFilesDir)
      const fileName = files.find((name) => name.startsWith(`${market}_${location}`))
      if (fileName) {
        const filePath = path.join(marketFilesDir, fileName)
        const { products, updateInfo } = processExcelFile(filePath)
        if (!marketProducts[market]) {
          marketProducts[market] = {}
        }
        marketProducts[market][location] = { products, fileName, updateInfo }
        return res.json({ products, updateInfo })
      } else {
        return res.json({
          products: [],
          updateInfo: { date: "", time: "", formatted: "" },
        })
      }
    }
  } else {
    if (marketProducts[market] && marketProducts[market].products) {
      return res.json({
        products: marketProducts[market].products,
        updateInfo: marketProducts[market].updateInfo,
      })
    } else {
      // Attempt to load from disk for market without location
      const files = fs.readdirSync(marketFilesDir)
      const fileName = files.find((name) => name.startsWith(`${market}`) && !name.includes("_"))
      if (fileName) {
        const filePath = path.join(marketFilesDir, fileName)
        const { products, updateInfo } = processExcelFile(filePath)
        marketProducts[market] = { products, fileName, updateInfo }
        return res.json({ products, updateInfo })
      } else {
        return res.json({
          products: [],
          updateInfo: { date: "", time: "", formatted: "" },
        })
      }
    }
  }
})

// Simple default route for testing
app.get("/", (req, res) => {
  res.send("Backend is running.")
})

const PORT = process.env.PORT || 8080
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
