const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();
const readline = require("readline");

// CONFIGURACIÓN - Ajusta estos nombres si es necesario
const CSV_PATH = "./lichess_db_puzzle_1_reduced.csv";
const DB_PATH = "./puzzles_v2.db"; 

console.log("📄 Buscando CSV en:", CSV_PATH);

if (!fs.existsSync(CSV_PATH)) {
  console.error("❌ ERROR: No se encontró el archivo CSV en la ruta especificada.");
  process.exit(1);
}

// Borrar DB anterior si existe para empezar de cero en el PC
if (fs.existsSync(DB_PATH)) {
  fs.unlinkSync(DB_PATH);
}

const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  // 1. Crear tabla
  db.run(`
    CREATE TABLE puzzles (
      id TEXT PRIMARY KEY,
      fen TEXT NOT NULL,
      solution TEXT NOT NULL,
      rating INTEGER NOT NULL,
      themes TEXT
    )
  `);

  // 2. INICIAR TRANSACCIÓN (Crucial para velocidad y seguridad)
  db.run("BEGIN TRANSACTION");

  const stmt = db.prepare(`
    INSERT INTO puzzles (id, fen, solution, rating, themes)
    VALUES (?, ?, ?, ?, ?)
  `);

  const rl = readline.createInterface({
    input: fs.createReadStream(CSV_PATH),
    crlfDelay: Infinity
  });

  let isFirstLine = true;
  let count = 0;

  rl.on("line", (line) => {
    // Saltar cabecera
    if (isFirstLine) {
      isFirstLine = false;
      return;
    }

    // Dividir por punto y coma
    const parts = line.split(";");

    if (parts.length < 4) {
      return; // Ignorar líneas vacías o incompletas
    }

    // Limpiar espacios en blanco de cada columna
    const id = parts[0]?.trim();
    const fen = parts[1]?.trim();
    const solution = parts[2]?.trim();
    const rating = parseInt(parts[3]?.trim()) || 0;
    const themes = parts[4]?.trim() || "";

    stmt.run(id, fen, solution, rating, themes, (err) => {
      if (err && err.code !== "SQLITE_CONSTRAINT") {
        console.error("Error al insertar ID " + id + ":", err.message);
      }
    });

    count++;
    if (count % 10000 === 0) {
      console.log(`✔️ Procesando... ${count} puzzles leídos`);
    }
  });

  rl.on("close", () => {
    stmt.finalize();
    
    // 3. FINALIZAR TRANSACCIÓN (Guarda todo en el disco)
    db.run("COMMIT", (err) => {
      if (err) {
        console.error("❌ Error al cerrar transacción:", err);
      } else {
        console.log("\n-----------------------------------------");
        console.log("🎉 Base de datos generada con éxito");
        console.log(`📦 Archivo creado: ${DB_PATH}`);
        console.log(`✅ Total insertados: ${count}`);
        console.log("-----------------------------------------\n");
      }
      db.close();
    });
  });
});