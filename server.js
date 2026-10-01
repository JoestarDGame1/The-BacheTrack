require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const path = require("path");

const db = require("./database");
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "login.html"));
});

app.post("/register", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      message: "Email y contraseña requeridos"
    });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  db.run(
    "INSERT INTO users(email, password) VALUES(?, ?)",
    [email, hashedPassword],
    function (err) {
      if (err) {
        return res.status(500).json({
          error: err.message
        });
      }

      res.json({
        success: true,
        userId: this.lastID
      });
    }
  );
});

app.post("/login", (req, res) => {
  const { email, password } = req.body;

  db.get(
    "SELECT * FROM users WHERE email = ?",
    [email],
    async (err, user) => {
      if (err) {
        return res.status(500).json(err);
      }

      if (!user) {
        return res.status(404).json({
          message: "Usuario no encontrado"
        });
      }

      const validPassword = await bcrypt.compare(password, user.password);

      if (!validPassword) {
        return res.status(401).json({
          message: "Contraseña incorrecta"
        });
      }

      res.json({
        success: true,
        userId: user.id,
        email: user.email
      });
    }
  );
});

const PORT = 3000;

app.listen(PORT, () => {
  console.log(`Servidor iniciado en puerto ${PORT}`);
});