const db = require("./database");
const bcrypt = require("bcrypt");

require("dotenv").config();
const express = require("express");
const Razorpay = require("razorpay");
const path = require("path");
const session = require("express-session");

const app = express();
const PRODUCTS = {
    "Dripclient Nonroot Safe": {
        "1 Hour": 15,
        "6 Hours": 40,
        "13 Hours": 60
    },

    "XYZ CHEATS IOS IPHONE PANEL": {
        "1 Day": 50,
        "3 Days": 70,
        "7 Days": 135,
        "15 Days": 260
    }
};

app.use(express.json());
app.set("trust proxy", 1);
app.use(session({
    secret: process.env.SESSION_SECRET || "saif-bhai-secret",
    resave: false,
    saveUninitialized: true,
    cookie: {
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        secure: false,
        sameSite: "lax"
    }
}));
app.use(express.static(path.join(__dirname)));

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

app.post("/create-order", async (req, res) => {
  try {
    const amount = Number(req.body.amount);

    if (!Number.isInteger(amount) || amount <= 0) {
      return res.status(400).json({
        error: "Invalid amount"
      });
    }

    const order = await razorpay.orders.create({
      amount: amount * 100,
      currency: "INR",
      receipt: "order_" + Date.now()
    });

    res.json(order);

  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Unable to create order"
    });
  }
});
app.post("/verify-payment", (req, res) => {
    try {
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature
        } = req.body;

        const body =
            razorpay_order_id + "|" + razorpay_payment_id;

        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(body)
            .digest("hex");

        if (expectedSignature !== razorpay_signature) {
            return res.status(400).json({
                success: false,
                message: "Payment verification failed"
            });
        }

        res.json({
            success: true,
            message: "Payment verified successfully"
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: "Verification error"
        });
    }
});
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});
app.post("/register", async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "All fields are required"
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 6 characters"
            });
        }

        const existingUser = db
            .prepare("SELECT id FROM users WHERE email = ?")
            .get(email);

        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: "Email already registered"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        db.prepare(`
            INSERT INTO users (name, email, password)
            VALUES (?, ?, ?)
        `).run(name, email, hashedPassword);

        res.json({
            success: true,
            message: "Registration successful"
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: "Registration failed"
        });
    }
});
app.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required"
            });
        }

        const user = db
            .prepare("SELECT * FROM users WHERE email = ?")
            .get(email);

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password"
            });
        }

        const passwordMatch = await bcrypt.compare(
            password,
            user.password
        );

        if (!passwordMatch) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password"
            });
        }
        req.session.user = {
    id: user.id,
    name: user.name,
    email: user.email
};

req.session.save((err) => {
        if (err) {
            console.error("Session save error:", err);
            return res.status(500).json({
                success: false,
                message: "Session save failed"
            });
        }

        res.json({
            success: true,
            message: "Login successful",
            user: {
                id: user.id,
                name: user.name,
                email: user.email
            }
        });
    });

} catch (error) {
    console.error(error);

    res.status(500).json({
        success: false,
        message: "Login failed"
    });
}

});

app.post("/logout", (req, res) => {

    req.session.destroy((error) => {

        if (error) {
            console.error(error);

            return res.status(500).json({
                success: false,
                message: "Logout failed"
            });
        }

        res.json({
            success: true,
            message: "Logout successful"
        });

    });

});
app.get("/me", (req, res) => {

    if (req.session.user) {

        res.json({
            loggedIn: true,
            user: req.session.user
        });

    } else {

        res.json({
            loggedIn: false
        });

    }

});
app.post("/create-order-record", (req, res) => {

    try {

        if (!req.session.user) {
            return res.status(401).json({
                success: false,
                message: "Please login first"
            });
        }

        const { product, duration, amount } = req.body;

        if (!product || !duration || !amount) {
            return res.status(400).json({
                success: false,
                message: "Order details are required"
            });
        }

        const order = db.prepare(`
            INSERT INTO orders
            (user_id, product, duration, amount, status)
            VALUES (?, ?, ?, ?, ?)
        `).run(
            req.session.user.id,
            product,
            duration,
            amount,
            "pending"
        );

        res.json({
            success: true,
            orderId: order.lastInsertRowid
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            success: false,
            message: "Unable to create order"
        });

    }

});
app.get("/my-orders", (req, res) => {

    try {

        if (!req.session.user) {
            return res.status(401).json({
                success: false,
                message: "Please login first"
            });
        }

        const orders = db.prepare(`
            SELECT id, product, duration, amount, status, created_at
            FROM orders
            WHERE user_id = ?
            ORDER BY id DESC
        `).all(req.session.user.id);

        res.json({
            success: true,
            orders: orders
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            success: false,
            message: "Unable to load orders"
        });

    }

});

const PORT = 3000;

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});